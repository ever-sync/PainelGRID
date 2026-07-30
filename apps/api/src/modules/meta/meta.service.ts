import { InjectQueue } from '@nestjs/bullmq';
import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import { ConversationChannel, Prisma, SenderType } from '@prisma/client';
import { createHmac, randomUUID, timingSafeEqual } from 'crypto';
import { normalizeBrazilianPhone, phoneDigits } from '../../common/phone.util';
import { Role } from '../../common/types';
import { withTimeout } from '../../common/utils/with-timeout';
import { PrismaService } from '../../config/prisma.service';
import { RedisService } from '../../config/redis.service';
import { AuthenticatedUser } from '../auth/auth.types';
import { ClientWebhookService } from '../crm/client-webhook.service';
import { RealtimeEventsService } from '../realtime/realtime-events.service';
import { DisconnectMetaDto } from './dto/disconnect-meta.dto';
import { ImportMetaLeadsDto } from './dto/import-meta-leads.dto';
import { ListMetaBusinessesQueryDto } from './dto/list-meta-businesses-query.dto';
import { MetaCallbackQueryDto } from './dto/meta-callback-query.dto';
import { SelectMetaAssetsDto } from './dto/select-meta-assets.dto';
import { StartMetaConnectDto } from './dto/start-meta-connect.dto';
import { TriggerMetaSyncDto } from './dto/trigger-meta-sync.dto';
import {
  type GraphErrorPayload,
  type GraphListResponse,
  type InitialSyncResult,
  type MetaAdAccountSummary,
  type MetaAdPayload,
  type MetaAdSetPayload,
  type MetaBusinessSummary,
  type MetaCampaignPayload,
  type MetaCreativePayload,
  type MetaInsightLevel,
  type MetaInsightPayload,
  type MetaLeadFormSummary,
  type MetaLeadPayload,
  type MetaOauthSessionCache,
  type MetaOauthStateCache,
  type MetaPageSummary,
  type MetaPhoneNumberSummary,
  type MetaSelectionSession,
  type MetaWhatsappBusinessSummary,
  type StringMap,
  type WhatsappExtractedMessagePayload,
  type WhatsappSendMessageResponse,
  type WhatsappUploadMediaResponse,
} from './meta.types';
import { assertMetaGraphUrl, assertMetaMediaUrl } from './meta-url.util';

@Injectable()
export class MetaService implements OnModuleInit {
  private readonly logger = new Logger(MetaService.name);
  private readonly oauthStateTtlSeconds = 60 * 10;
  private readonly oauthSessionTtlSeconds = 60 * 30;
  /** Teto de paginas da Graph API por listagem — evita varredura infinita e trunca de forma observavel. */
  private readonly maxGraphPages = 100;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly configService: ConfigService,
    private readonly realtimeEvents: RealtimeEventsService,
    private readonly clientWebhook: ClientWebhookService,
    @InjectQueue('meta-sync') private readonly metaSyncQueue: Queue,
  ) {}

  onModuleInit() {
    withTimeout(
      this.metaSyncQueue.add(
        'token-refresh',
        { thresholdDays: 7 },
        {
          repeat: { pattern: '0 4 * * *' },
          removeOnComplete: true,
          removeOnFail: false,
          jobId: 'meta-token-refresh-daily',
        },
      ),
      5000,
      'Agendamento de renovacao de tokens Meta',
    )
      .then(() => this.logger.log('Renovacao diaria de tokens Meta agendada (cron 04:00)'))
      .catch((err) =>
        this.logger.warn(
          `Nao foi possivel agendar renovacao de tokens Meta: ${this.getErrorMessage(err)}`,
        ),
      );
  }

  /**
   * Acesso direto ao Prisma para módulos Meta. Mantemos um getter dedicado
   * para isolar o ponto único caso troquemos o cliente no futuro
   * (mocks de teste, sharding, etc.).
   */
  private get db(): PrismaService {
    return this.prisma;
  }

  async startConnect(user: AuthenticatedUser, dto: StartMetaConnectDto) {
    if (user.role === Role.GESTOR) {
      throw new BadRequestException(
        'Gestores conectam a Meta uma vez no dashboard. Depois escolha a BM em cada cliente (token do gestor).',
      );
    }

    await this.getClientOrThrow(dto.client_id);
    if (user.role === Role.CLIENTE && user.client_id && user.client_id !== dto.client_id) {
      throw new ForbiddenException('Voce nao pode conectar a Meta para outro cliente');
    }

    const appId = this.getMetaAppId();
    const redirectUri = this.getMetaRedirectUri();
    const state = randomUUID();
    const scopes = this.getMetaScopes();
    const statePayload: MetaOauthStateCache = {
      kind: 'client',
      clientId: dto.client_id,
      createdAt: new Date().toISOString(),
    };

    await this.redis.client.set(
      this.getOauthStateKey(state),
      JSON.stringify(statePayload),
      'EX',
      this.oauthStateTtlSeconds,
    );

    return {
      client_id: dto.client_id,
      state,
      auth_url: this.buildAuthUrl(appId, redirectUri, state, scopes),
      expires_in_seconds: this.oauthStateTtlSeconds,
    };
  }

  async startGestorConnect(user: AuthenticatedUser) {
    if (user.role !== Role.GESTOR) {
      throw new ForbiddenException('Apenas gestores podem conectar a conta Meta do gestor');
    }

    const appId = this.getMetaAppId();
    const redirectUri = this.getMetaRedirectUri();
    const state = randomUUID();
    const scopes = this.getMetaScopes();
    const statePayload: MetaOauthStateCache = {
      kind: 'gestor',
      gestorId: user.sub,
      createdAt: new Date().toISOString(),
    };

    await this.redis.client.set(
      this.getOauthStateKey(state),
      JSON.stringify(statePayload),
      'EX',
      this.oauthStateTtlSeconds,
    );

    return {
      gestor_id: user.sub,
      state,
      auth_url: this.buildAuthUrl(appId, redirectUri, state, scopes),
      expires_in_seconds: this.oauthStateTtlSeconds,
      flow: 'gestor' as const,
    };
  }

  async getGestorMetaStatus(user: AuthenticatedUser) {
    if (user.role !== Role.GESTOR) {
      throw new ForbiddenException('Apenas gestores');
    }

    const row = await this.db.user.findUnique({
      where: { id: user.sub },
      select: {
        meta_gestor_access_token: true,
        meta_gestor_token_expires_at: true,
        meta_gestor_connected_at: true,
        meta_gestor_scopes: true,
      },
    });

    const connected = Boolean(row?.meta_gestor_access_token);
    return {
      gestor_id: user.sub,
      connected,
      token_expires_at: row?.meta_gestor_token_expires_at?.toISOString() ?? null,
      connected_at: row?.meta_gestor_connected_at?.toISOString() ?? null,
      scopes: row?.meta_gestor_scopes ?? [],
    };
  }

  async disconnectGestor(user: AuthenticatedUser) {
    if (user.role !== Role.GESTOR) {
      throw new ForbiddenException('Apenas gestores');
    }

    await this.db.user.update({
      where: { id: user.sub },
      data: {
        meta_gestor_access_token: null,
        meta_gestor_token_expires_at: null,
        meta_gestor_scopes: [],
        meta_gestor_connected_at: null,
      },
    });

    return { gestor_id: user.sub, disconnected: true };
  }

  async handleCallback(query: MetaCallbackQueryDto) {
    if (query.error) {
      throw new BadRequestException(query.error_description ?? 'Autorizacao Meta recusada');
    }

    if (!query.code || !query.state) {
      throw new BadRequestException('Callback Meta incompleto');
    }

    const rawState = await this.redis.client.get(this.getOauthStateKey(query.state));
    if (!rawState) {
      throw new BadRequestException('Estado OAuth expirado ou invalido');
    }

    const statePayload = this.parseJson<MetaOauthStateCache>(rawState, 'Estado OAuth invalido');
    const redirectUri = this.getMetaRedirectUri();
    const appId = this.getMetaAppId();
    const appSecret = this.getMetaAppSecret();

    const shortLivedResponse = await this.exchangeCodeForToken({
      code: query.code,
      redirectUri,
      appId,
      appSecret,
    });

    const tokenResponse = await this.exchangeForLongLivedToken({
      shortLivedToken: shortLivedResponse.access_token,
      appId,
      appSecret,
    });

    const expiresIn = this.parseInteger(tokenResponse.expires_in);
    const scopes = this.getMetaScopes();
    const tokenExpiresAt = expiresIn ? new Date(Date.now() + expiresIn * 1000) : null;

    const flowKind: 'client' | 'gestor' =
      statePayload.kind === 'gestor' || (!statePayload.clientId && statePayload.gestorId)
        ? 'gestor'
        : statePayload.kind === 'client' || statePayload.clientId
          ? 'client'
          : (() => {
              throw new BadRequestException('Estado OAuth invalido');
            })();

    await this.redis.client.del(this.getOauthStateKey(query.state));

    if (flowKind === 'gestor') {
      const gestorId = statePayload.gestorId;
      if (!gestorId) {
        throw new BadRequestException('Estado OAuth do gestor invalido');
      }

      const gestorUser = await this.db.user.findUnique({ where: { id: gestorId } });
      if (!gestorUser || gestorUser.role !== Role.GESTOR) {
        throw new ForbiddenException('Usuario gestor invalido para este fluxo');
      }

      await this.db.user.update({
        where: { id: gestorId },
        data: {
          meta_gestor_access_token: tokenResponse.access_token,
          meta_gestor_token_expires_at: tokenExpiresAt,
          meta_gestor_scopes: scopes,
          meta_gestor_connected_at: new Date(),
        },
      });

      let businesses: MetaBusinessSummary[] = [];
      try {
        businesses = await this.fetchBusinesses(tokenResponse.access_token);
      } catch (error) {
        this.logger.warn(
          `Conta Meta do gestor conectada, mas falhou ao listar BMs no callback: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }

      return {
        kind: 'gestor_connected' as const,
        gestor_id: gestorId,
        businesses,
      };
    }

    const clientId = statePayload.clientId;
    if (!clientId) {
      throw new BadRequestException('Estado OAuth do cliente invalido');
    }

    const businesses = await this.fetchBusinesses(tokenResponse.access_token);
    const oauthSessionId = randomUUID();
    const session: MetaOauthSessionCache = {
      id: oauthSessionId,
      clientId,
      state: query.state,
      accessToken: tokenResponse.access_token,
      tokenType: tokenResponse.token_type,
      expiresIn,
      tokenExpiresAt: tokenExpiresAt?.toISOString(),
      scopes,
      businesses,
      createdAt: new Date().toISOString(),
    };

    await this.redis.client.set(
      this.getOauthSessionKey(oauthSessionId),
      JSON.stringify(session),
      'EX',
      this.oauthSessionTtlSeconds,
    );

    return {
      client_id: clientId,
      oauth_session_id: oauthSessionId,
      businesses,
      expires_in_seconds: this.oauthSessionTtlSeconds,
    };
  }

  async listBusinesses(user: AuthenticatedUser, query: ListMetaBusinessesQueryDto) {
    await this.assertMetaClientAccess(user, query.client_id);

    if (query.gestor_token) {
      if (user.role !== Role.GESTOR) {
        throw new ForbiddenException('gestor_token so pode ser usado por gestores');
      }

      const selection = await this.getGestorMetaSelectionSessionOrThrow(user.sub);
      const businesses = await this.enrichBusinessesForAccessToken(
        selection.accessToken,
        selection.businesses,
      );

      return {
        client_id: query.client_id,
        oauth_session_id: null,
        gestor_token: true,
        businesses,
      };
    }

    if (!query.oauth_session_id) {
      throw new BadRequestException('Informe oauth_session_id ou gestor_token=true');
    }

    const session = await this.loadOauthSession(query.oauth_session_id);

    if (session.clientId !== query.client_id) {
      throw new ForbiddenException('Sessao OAuth nao pertence a este cliente');
    }

    if (user.role === Role.CLIENTE && user.client_id !== query.client_id) {
      throw new ForbiddenException('Sessao OAuth nao pertence a este cliente');
    }

    const businesses = await this.enrichBusinessesForAccessToken(
      session.accessToken,
      session.businesses,
    );

    return {
      client_id: query.client_id,
      oauth_session_id: query.oauth_session_id,
      businesses,
    };
  }

  async selectAssets(user: AuthenticatedUser, dto: SelectMetaAssetsDto) {
    await this.assertMetaClientAccess(user, dto.client_id);
    await this.getClientOrThrow(dto.client_id);

    let selection: MetaSelectionSession;
    let oauthSessionIdToDelete: string | null = null;

    if (dto.gestor_token) {
      if (user.role !== Role.GESTOR) {
        throw new ForbiddenException('gestor_token so pode ser usado por gestores');
      }
      selection = await this.getGestorMetaSelectionSessionOrThrow(user.sub);
    } else {
      if (!dto.oauth_session_id) {
        throw new BadRequestException('Informe oauth_session_id ou gestor_token=true');
      }
      const session = await this.loadOauthSession(dto.oauth_session_id);
      if (session.clientId !== dto.client_id) {
        throw new ForbiddenException('Sessao OAuth nao pertence a este cliente');
      }
      if (user.role === Role.CLIENTE && user.client_id !== dto.client_id) {
        throw new ForbiddenException('Sessao OAuth nao pertence a este cliente');
      }
      oauthSessionIdToDelete = dto.oauth_session_id;
      selection = {
        accessToken: session.accessToken,
        scopes: session.scopes,
        tokenExpiresAt: session.tokenExpiresAt,
        state: session.state,
        businesses: session.businesses,
      };
    }

    const allBusinesses = selection.businesses;
    const selectedBusiness =
      allBusinesses.find((business) => business.id === dto.business_id) ??
      (await this.fetchBusinessById(dto.business_id, selection.accessToken));

    if (!selectedBusiness) {
      throw new NotFoundException('Business Manager selecionada nao encontrada');
    }

    const businessAdAccounts = await this.fetchBusinessAdAccounts(
      dto.business_id,
      selection.accessToken,
    );
    const businessPages = await this.fetchBusinessPages(dto.business_id, selection.accessToken);
    const businessForms = await this.fetchLeadForms(
      businessPages.map((page) => page.id),
      selection.accessToken,
    );

    const selectedAdAccountIds = this.resolveSelectedIds(
      businessAdAccounts.map((account) => this.normalizeAdAccountId(account)),
      dto.ad_account_ids,
    );
    const selectedPageIds = this.resolveSelectedIds(
      businessPages.map((page) => page.id),
      dto.page_ids,
    );
    const selectedFormIds = this.resolveSelectedIds(
      businessForms.map((form) => form.id),
      dto.form_ids,
    );
    const selectedWabaId = dto.waba_id?.trim() || undefined;
    const selectedPhoneNumberId =
      dto.phone_number_id?.trim() ||
      (selectedWabaId
        ? (await this.fetchWabaPhoneNumbers(selectedWabaId, selection.accessToken))[0]?.id
        : undefined);

    const selectedAdAccounts = businessAdAccounts.filter((account) =>
      selectedAdAccountIds.includes(this.normalizeAdAccountId(account)),
    );
    const selectedPages = businessPages.filter((page) => selectedPageIds.includes(page.id));
    const selectedForms = businessForms.filter((form) => selectedFormIds.includes(form.id));
    const primaryPageId = selectedPages[0]?.id ?? selectedForms[0]?.page_id ?? null;
    const tokenExpiresAt = selection.tokenExpiresAt ? new Date(selection.tokenExpiresAt) : null;

    if (selectedWabaId) {
      if (!selectedPhoneNumberId) {
        throw new BadRequestException(
          'WABA selecionada sem phone_number_id. Verifique se o numero esta ativo no WhatsApp Manager.',
        );
      }
      await this.subscribeWabaToWebhook(selectedWabaId, selection.accessToken);
    }

    // Subscreve as paginas selecionadas ao Webhook do App para receber eventos de leadgen
    for (const page of selectedPages) {
      const pageAccessToken = await this.fetchPageAccessToken(page.id, selection.accessToken);
      if (pageAccessToken) {
        await this.subscribePageToWebhook(page.id, pageAccessToken);
      }
    }

    const existingConnection = await this.db.metaConnection.findFirst({
      where: {
        client_id: dto.client_id,
        business_id: dto.business_id,
      },
    });

    const connection = existingConnection
      ? await this.db.metaConnection.update({
          where: { id: existingConnection.id },
          data: {
            business_name: selectedBusiness.name ?? `BM ${dto.business_id}`,
            access_token: selection.accessToken,
            token_expires_at: tokenExpiresAt,
            scopes: selection.scopes,
            status: 'connected',
            oauth_state: selection.state,
          },
        })
      : await this.db.metaConnection.create({
          data: {
            client_id: dto.client_id,
            business_id: dto.business_id,
            business_name: selectedBusiness.name ?? `BM ${dto.business_id}`,
            access_token: selection.accessToken,
            token_expires_at: tokenExpiresAt,
            scopes: selection.scopes,
            status: 'connected',
            oauth_state: selection.state,
          },
        });

    await this.db.metaAssetSelection.deleteMany({
      where: { meta_connection_id: connection.id },
    });

    const assetRows = this.buildAssetSelectionRows({
      metaConnectionId: connection.id,
      selectedAdAccounts,
      selectedPages,
      selectedForms,
      selectedWabaId,
      phoneNumberId: selectedPhoneNumberId,
    });

    for (const assetRow of assetRows) {
      // assetRow é construído dinamicamente; usamos `unchecked` create
      // (não exige relação aninhada `meta_connection`).
      await this.db.metaAssetSelection.create({
        data: assetRow as unknown as Prisma.MetaAssetSelectionUncheckedCreateInput,
      });
    }

    await this.db.client.update({
      where: { id: dto.client_id },
      data: {
        facebook_page_id: primaryPageId,
        facebook_access_token: selection.accessToken,
      },
    });

    await this.db.facebookAdAccount.deleteMany({
      where: { client_id: dto.client_id },
    });

    if (primaryPageId && selectedAdAccounts.length > 0) {
      await this.db.facebookAdAccount.createMany({
        data: selectedAdAccounts.map((account) => ({
          client_id: dto.client_id,
          ad_account_id: this.normalizeAdAccountId(account),
          access_token: selection.accessToken,
          page_id: primaryPageId,
          status: 'active',
        })),
      });
    }

    const syncJob = await this.db.metaSyncJob.create({
      data: {
        client_id: dto.client_id,
        meta_connection_id: connection.id,
        job_type: 'initial_full_sync',
        status: 'pending',
        context: this.toJsonValue({
          business_id: dto.business_id,
          selected_ad_account_ids: selectedAdAccountIds,
          selected_page_ids: selectedPageIds,
          selected_form_ids: selectedFormIds,
          selected_waba_id: selectedWabaId,
          selected_phone_number_id: selectedPhoneNumberId,
        }),
      },
    });

    const initialSync: InitialSyncResult = await this.enqueueFullSync(connection.id, syncJob.id);

    if (oauthSessionIdToDelete) {
      await this.redis.client.del(this.getOauthSessionKey(oauthSessionIdToDelete));
    }

    return {
      client_id: dto.client_id,
      meta_connection_id: connection.id,
      business: {
        id: selectedBusiness.id,
        name: selectedBusiness.name ?? `BM ${selectedBusiness.id}`,
      },
      selected_assets: {
        ad_accounts: selectedAdAccounts.map((account) => ({
          id: this.normalizeAdAccountId(account),
          name: account.name ?? this.normalizeAdAccountId(account),
        })),
        pages: selectedPages,
        forms: selectedForms.map((form) => ({
          id: form.id,
          page_id: form.page_id,
          name: form.name ?? form.id,
        })),
        waba_id: selectedWabaId ?? null,
        phone_number_id: selectedPhoneNumberId ?? null,
      },
      sync_job_id: syncJob.id,
      initial_sync: initialSync,
    };
  }

  async getStatus(user: AuthenticatedUser, clientId: string) {
    await this.assertMetaClientAccess(user, clientId);

    const connection = await this.db.metaConnection.findFirst({
      where: { client_id: clientId },
      include: {
        selected_assets: true,
        sync_jobs: {
          orderBy: { created_at: 'desc' },
          take: 5,
        },
      },
      orderBy: { updated_at: 'desc' },
    });

    return {
      client_id: clientId,
      connected: Boolean(connection),
      connection,
    };
  }

  async getSummary(user: AuthenticatedUser, clientId: string) {
    await this.assertMetaClientAccess(user, clientId);

    const connection = await this.db.metaConnection.findFirst({
      where: {
        client_id: clientId,
        status: {
          in: ['connected', 'expired', 'pending'],
        },
      },
      orderBy: { updated_at: 'desc' },
    });

    if (!connection) {
      return {
        client_id: clientId,
        connected: false,
        summary: {
          campaigns: 0,
          ad_sets: 0,
          ads: 0,
          leads_imported: 0,
          spend_today: 0,
          daily_budget: 0,
          top_forms: [],
          top_utm_campaigns: [],
          top_utm_contents: [],
          top_utm_terms: [],
        },
      };
    }

    let campaigns = 0;
    let adSets = 0;
    let ads = 0;
    let leadsImported = 0;
    let campaignBudget: { _sum: { daily_budget: Prisma.Decimal | number | null } } = {
      _sum: { daily_budget: null },
    };
    let topFormCounts: Array<{ meta_form_id?: string | null; _count: { _all: number } }> = [];
    let topUtmCampaignCounts: Array<{ utm_campaign?: string | null; _count: { _all: number } }> =
      [];
    let topUtmContentCounts: Array<{ utm_content?: string | null; _count: { _all: number } }> = [];
    let topUtmTermCounts: Array<{ utm_term?: string | null; _count: { _all: number } }> = [];

    try {
      const results = await Promise.all([
        this.db.metaCampaign.count({ where: { meta_connection_id: connection.id } }),
        this.db.metaAdSet.count({ where: { meta_connection_id: connection.id } }),
        this.db.metaAd.count({ where: { meta_connection_id: connection.id } }),
        this.db.metaLeadImport.count({ where: { meta_connection_id: connection.id } }),
        this.db.metaCampaign.aggregate({
          where: { meta_connection_id: connection.id },
          _sum: { daily_budget: true },
        }),
        this.db.metaLeadImport.groupBy({
          by: ['meta_form_id'],
          where: {
            meta_connection_id: connection.id,
            meta_form_id: { not: null },
          },
          _count: { _all: true },
          orderBy: { _count: { id: 'desc' } },
          take: 5,
        }),
        this.db.metaLeadImport.groupBy({
          by: ['utm_campaign'],
          where: {
            meta_connection_id: connection.id,
            utm_campaign: { not: null },
          },
          _count: { _all: true },
          orderBy: { _count: { id: 'desc' } },
          take: 5,
        }),
        this.db.metaLeadImport.groupBy({
          by: ['utm_content'],
          where: {
            meta_connection_id: connection.id,
            utm_content: { not: null },
          },
          _count: { _all: true },
          orderBy: { _count: { id: 'desc' } },
          take: 5,
        }),
        this.db.metaLeadImport.groupBy({
          by: ['utm_term'],
          where: {
            meta_connection_id: connection.id,
            utm_term: { not: null },
          },
          _count: { _all: true },
          orderBy: { _count: { id: 'desc' } },
          take: 5,
        }),
      ]);
      campaigns = results[0];
      adSets = results[1];
      ads = results[2];
      leadsImported = results[3];
      campaignBudget = results[4] as { _sum: { daily_budget: Prisma.Decimal | number | null } };
      topFormCounts = results[5] as Array<{
        meta_form_id?: string | null;
        _count: { _all: number };
      }>;
      topUtmCampaignCounts = results[6] as Array<{
        utm_campaign?: string | null;
        _count: { _all: number };
      }>;
      topUtmContentCounts = results[7] as Array<{
        utm_content?: string | null;
        _count: { _all: number };
      }>;
      topUtmTermCounts = results[8] as Array<{
        utm_term?: string | null;
        _count: { _all: number };
      }>;
    } catch (error) {
      this.logger.warn(
        `Meta summary fallback for client ${clientId}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    const latestInsight = await this.db.metaDailyInsight.findFirst({
      where: { meta_connection_id: connection.id },
      orderBy: { date: 'desc' },
      select: { date: true },
    });

    let spendToday = 0;
    if (latestInsight?.date) {
      const start = new Date(latestInsight.date);
      start.setHours(0, 0, 0, 0);
      const end = new Date(start);
      end.setDate(end.getDate() + 1);

      const spendAggregate = await this.db.metaDailyInsight.aggregate({
        where: {
          meta_connection_id: connection.id,
          date: {
            gte: start,
            lt: end,
          },
        },
        _sum: {
          spend: true,
        },
      });

      spendToday = Number(spendAggregate._sum.spend ?? 0);
    }

    const dailyBudget = Number(campaignBudget._sum.daily_budget ?? 0);

    const formIds = topFormCounts
      .map((item: { meta_form_id?: string | null }) => item.meta_form_id)
      .filter((value: string | null | undefined): value is string => Boolean(value));
    const metaForms = formIds.length
      ? await this.db.metaLeadForm.findMany({
          where: {
            meta_connection_id: connection.id,
            meta_form_id: {
              in: formIds,
            },
          },
          select: {
            meta_form_id: true,
            name: true,
          },
        })
      : [];
    const formNameMap = new Map(
      metaForms.map((form: { meta_form_id: string; name: string }) => [
        form.meta_form_id,
        form.name,
      ]),
    );

    const topForms = topFormCounts
      .map((item: { meta_form_id?: string | null; _count: { _all: number } }) => {
        if (!item.meta_form_id) return null;
        return {
          id: item.meta_form_id,
          name: String(formNameMap.get(item.meta_form_id) ?? item.meta_form_id),
          leads: item._count._all,
        };
      })
      .filter(
        (
          item: { id: string; name: string; leads: number } | null,
        ): item is { id: string; name: string; leads: number } => Boolean(item),
      );

    const topUtmCampaigns = topUtmCampaignCounts
      .map((item: { utm_campaign?: string | null; _count: { _all: number } }) => {
        if (!item.utm_campaign) return null;
        return {
          value: item.utm_campaign,
          leads: item._count._all,
        };
      })
      .filter(
        (item: { value: string; leads: number } | null): item is { value: string; leads: number } =>
          Boolean(item),
      );

    const topUtmContents = topUtmContentCounts
      .map((item: { utm_content?: string | null; _count: { _all: number } }) => {
        if (!item.utm_content) return null;
        return {
          value: item.utm_content,
          leads: item._count._all,
        };
      })
      .filter(
        (item: { value: string; leads: number } | null): item is { value: string; leads: number } =>
          Boolean(item),
      );

    const topUtmTerms = topUtmTermCounts
      .map((item: { utm_term?: string | null; _count: { _all: number } }) => {
        if (!item.utm_term) return null;
        return {
          value: item.utm_term,
          leads: item._count._all,
        };
      })
      .filter(
        (item: { value: string; leads: number } | null): item is { value: string; leads: number } =>
          Boolean(item),
      );

    return {
      client_id: clientId,
      connected: true,
      summary: {
        campaigns,
        ad_sets: adSets,
        ads,
        leads_imported: leadsImported,
        spend_today: spendToday,
        daily_budget: dailyBudget,
        remaining_budget: Math.max(dailyBudget - spendToday, 0),
        insight_date: latestInsight?.date ?? null,
        top_forms: topForms,
        top_utm_campaigns: topUtmCampaigns,
        top_utm_contents: topUtmContents,
        top_utm_terms: topUtmTerms,
      },
    };
  }

  /** Relatorio hierarquico Campanha -> Conjunto de anuncios -> Anuncio, com metricas agregadas. */
  async getCampaignsReport(user: AuthenticatedUser, clientId: string) {
    await this.assertMetaClientAccess(user, clientId);

    const connection = await this.db.metaConnection.findFirst({
      where: {
        client_id: clientId,
        status: { in: ['connected', 'expired', 'pending'] },
      },
      orderBy: { updated_at: 'desc' },
    });

    if (!connection) {
      return { client_id: clientId, connected: false, campaigns: [] };
    }

    const [campaigns, adSets, ads, insights] = await Promise.all([
      this.db.metaCampaign.findMany({ where: { meta_connection_id: connection.id } }),
      this.db.metaAdSet.findMany({ where: { meta_connection_id: connection.id } }),
      this.db.metaAd.findMany({ where: { meta_connection_id: connection.id } }),
      this.db.metaDailyInsight.findMany({
        where: { meta_connection_id: connection.id },
        select: {
          level: true,
          entity_id: true,
          spend: true,
          impressions: true,
          leads: true,
          reach: true,
          raw_payload: true,
        },
      }),
    ]);

    type EntityMetrics = {
      spend: number;
      leads: number;
      impressions: number;
      reach: number;
      conversations: number;
    };

    const metricsByEntity = new Map<string, EntityMetrics>();

    for (const row of insights) {
      const key = `${row.level}:${row.entity_id}`;
      const current = metricsByEntity.get(key) ?? {
        spend: 0,
        leads: 0,
        impressions: 0,
        reach: 0,
        conversations: 0,
      };
      current.spend += Number(row.spend ?? 0);
      current.leads += row.leads ?? 0;
      current.impressions += row.impressions ?? 0;
      current.reach += row.reach ?? 0;
      const rawActions = (
        row.raw_payload as { actions?: Array<{ action_type?: string; value?: string }> } | null
      )?.actions;
      current.conversations += this.extractConversationCount(rawActions) ?? 0;
      metricsByEntity.set(key, current);
    }

    const round2 = (value: number) => Math.round(value * 100) / 100;

    const buildRow = (id: string, name: string, level: MetaInsightLevel) => {
      const m = metricsByEntity.get(`${level}:${id}`) ?? {
        spend: 0,
        leads: 0,
        impressions: 0,
        reach: 0,
        conversations: 0,
      };
      return {
        id,
        name,
        spend: round2(m.spend),
        leads: m.leads,
        cost_per_lead: m.leads > 0 ? round2(m.spend / m.leads) : 0,
        impressions: m.impressions,
        conversations: m.conversations,
        cost_per_conversation:
          m.conversations > 0 ? round2(m.spend / m.conversations) : 0,
        reach: m.reach,
      };
    };

    const adsByAdSetId = new Map<string, typeof ads>();
    for (const ad of ads) {
      const key = ad.meta_ad_set_id ?? '';
      const list = adsByAdSetId.get(key) ?? [];
      list.push(ad);
      adsByAdSetId.set(key, list);
    }

    const adSetsByCampaignId = new Map<string, typeof adSets>();
    for (const adSet of adSets) {
      const key = adSet.meta_campaign_id ?? '';
      const list = adSetsByCampaignId.get(key) ?? [];
      list.push(adSet);
      adSetsByCampaignId.set(key, list);
    }

    const report = campaigns.map((campaign) => ({
      ...buildRow(campaign.meta_campaign_id, campaign.name, 'campaign'),
      status: campaign.status,
      ad_sets: (adSetsByCampaignId.get(campaign.meta_campaign_id) ?? []).map((adSet) => ({
        ...buildRow(adSet.meta_ad_set_id, adSet.name, 'adset'),
        status: adSet.status,
        ads: (adsByAdSetId.get(adSet.meta_ad_set_id) ?? []).map((ad) => ({
          ...buildRow(ad.meta_ad_id, ad.name, 'ad'),
          status: ad.status,
        })),
      })),
    }));

    return { client_id: clientId, connected: true, campaigns: report };
  }

  async syncFull(user: AuthenticatedUser, dto: TriggerMetaSyncDto) {
    await this.assertMetaClientAccess(user, dto.client_id);

    const connection = await this.db.metaConnection.findFirst({
      where: {
        client_id: dto.client_id,
        status: 'connected',
      },
      orderBy: { updated_at: 'desc' },
    });

    if (!connection) {
      throw new NotFoundException('Nenhuma conexao Meta ativa encontrada para este cliente');
    }

    const syncJob = await this.db.metaSyncJob.create({
      data: {
        client_id: dto.client_id,
        meta_connection_id: connection.id,
        job_type: 'full_sync',
        status: 'pending',
      },
    });

    const enqueued = await this.enqueueFullSync(connection.id, syncJob.id);

    return {
      client_id: dto.client_id,
      meta_connection_id: connection.id,
      sync_job_id: syncJob.id,
      status: enqueued.status,
      summary: {},
    };
  }

  async importHistoricalLeads(user: AuthenticatedUser, dto: ImportMetaLeadsDto) {
    await this.assertMetaClientAccess(user, dto.client_id);

    const connection = await this.db.metaConnection.findFirst({
      where: {
        client_id: dto.client_id,
        status: 'connected',
      },
      orderBy: { updated_at: 'desc' },
    });

    if (!connection) {
      throw new NotFoundException('Nenhuma conexao Meta ativa encontrada para este cliente');
    }

    // Valida sincronamente para devolver 400 imediato; a importacao em si roda no worker.
    const requestedFormIds = dto.form_ids?.map((id) => id.trim()).filter(Boolean) ?? [];
    const uniqueForms = await this.resolveHistoricalLeadForms(connection.id, requestedFormIds);

    if (uniqueForms.length === 0) {
      throw new BadRequestException(
        requestedFormIds.length > 0
          ? 'Nenhum formulario informado foi encontrado para importar leads'
          : 'Nenhum formulario selecionado foi encontrado para importar leads',
      );
    }

    const syncJob = await this.db.metaSyncJob.create({
      data: {
        client_id: dto.client_id,
        meta_connection_id: connection.id,
        job_type: 'historical_lead_import',
        status: 'pending',
      },
    });

    const enqueued = await this.enqueueJob('historical-leads', syncJob.id, {
      metaConnectionId: connection.id,
      jobId: syncJob.id,
      formIds: requestedFormIds,
    });

    return {
      client_id: dto.client_id,
      meta_connection_id: connection.id,
      sync_job_id: syncJob.id,
      status: enqueued.status,
      summary: {},
    };
  }

  private async resolveHistoricalLeadForms(
    metaConnectionId: string,
    requestedFormIds: string[],
  ): Promise<Array<{ id: string; name: string; page_id?: string }>> {
    const selectedForms = await this.db.metaAssetSelection.findMany({
      where: {
        meta_connection_id: metaConnectionId,
        form_id: { not: null },
      },
      select: {
        form_id: true,
        form_name: true,
        page_id: true,
      },
    });

    const normalizedForms: Array<{ id: string; name: string; page_id?: string }> = [];
    for (const form of selectedForms) {
      const formId = form.form_id?.trim();
      if (!formId) {
        continue;
      }

      if (requestedFormIds.length > 0 && !requestedFormIds.includes(formId)) {
        continue;
      }

      normalizedForms.push({
        id: formId,
        name: form.form_name?.trim() || formId,
        page_id: form.page_id ?? undefined,
      });
    }

    return this.uniqueBy(normalizedForms, (form) => form.id);
  }

  /** Executado pelo worker (meta-sync). NAO chamar direto de um request HTTP. */
  async runHistoricalLeadImport(
    metaConnectionId: string,
    jobId: string,
    requestedFormIds: string[],
  ) {
    const connection = await this.db.metaConnection.findUnique({
      where: { id: metaConnectionId },
    });

    if (!connection) {
      throw new NotFoundException('Conexao Meta nao encontrada');
    }

    const uniqueForms = await this.resolveHistoricalLeadForms(metaConnectionId, requestedFormIds);

    await this.db.metaSyncJob.update({
      where: { id: jobId },
      data: {
        status: 'running',
        started_at: new Date(),
        error_message: null,
      },
    });

    try {
      let importedLeads = 0;

      for (const form of uniqueForms) {
        const pageAccessToken = form.page_id
          ? ((await this.fetchPageAccessToken(form.page_id, connection.access_token)) ??
            connection.access_token)
          : connection.access_token;
        const leads = await this.fetchLeadFormLeads(form.id, pageAccessToken);

        for (const leadPayload of leads) {
          await this.importLeadPayload(connection, leadPayload, {
            form_id: form.id,
            page_id: form.page_id ?? null,
            source: 'historical_meta_import',
          });
          importedLeads += 1;
        }
      }

      const finishedAt = new Date();
      const summary = {
        forms: uniqueForms.length,
        leads_imported: importedLeads,
      };

      await this.db.metaConnection.update({
        where: { id: connection.id },
        data: {
          last_sync_at: finishedAt,
          status: 'connected',
        },
      });

      await this.db.metaSyncJob.update({
        where: { id: jobId },
        data: {
          status: 'completed',
          finished_at: finishedAt,
          context: this.toJsonValue(summary),
        },
      });

      return summary;
    } catch (error) {
      const message = this.getErrorMessage(error);

      await this.db.metaSyncJob.update({
        where: { id: jobId },
        data: {
          status: 'failed',
          finished_at: new Date(),
          error_message: message,
        },
      });

      if (message.toLowerCase().includes('token')) {
        await this.db.metaConnection.update({
          where: { id: connection.id },
          data: { status: 'expired' },
        });
      }

      throw error;
    }
  }

  /** Enfileira o full sync e marca o job como falho se a fila estiver indisponivel. */
  private async enqueueFullSync(
    metaConnectionId: string,
    jobId: string,
  ): Promise<InitialSyncResult> {
    return this.enqueueJob('full-sync', jobId, { metaConnectionId, jobId });
  }

  private async enqueueJob(
    jobName: 'full-sync' | 'historical-leads',
    jobId: string,
    data: Record<string, unknown>,
  ): Promise<InitialSyncResult> {
    try {
      await this.metaSyncQueue.add(jobName, data, {
        removeOnComplete: true,
        removeOnFail: false,
        attempts: 3,
        backoff: { type: 'exponential', delay: 30_000 },
      });
      return { status: 'queued' };
    } catch (error) {
      const message = `Fila Meta indisponivel (Redis): ${this.getErrorMessage(error)}`;
      this.logger.error(message);
      await this.db.metaSyncJob
        .update({
          where: { id: jobId },
          data: { status: 'failed', finished_at: new Date(), error_message: message },
        })
        .catch(() => undefined);
      return { status: 'failed', message };
    }
  }

  /**
   * Renova tokens Meta proximos do vencimento (executado pelo worker, cron diario).
   * O fb_exchange_token tambem estende um token de longa duracao ainda valido.
   */
  async refreshExpiringMetaTokens(thresholdDays = 7) {
    let appId: string;
    let appSecret: string;
    try {
      appId = this.getMetaAppId();
      appSecret = this.getMetaAppSecret();
    } catch (error) {
      this.logger.warn(`Renovacao de tokens Meta ignorada: ${this.getErrorMessage(error)}`);
      return { gestors: 0, connections: 0 };
    }

    const threshold = new Date(Date.now() + thresholdDays * 24 * 60 * 60 * 1000);

    const gestors = await this.db.user.findMany({
      where: {
        meta_gestor_access_token: { not: null },
        meta_gestor_token_expires_at: { not: null, lte: threshold },
      },
      select: { id: true, meta_gestor_access_token: true },
    });

    let refreshedGestors = 0;
    for (const gestor of gestors) {
      if (!gestor.meta_gestor_access_token) {
        continue;
      }
      const res = await this.exchangeForLongLivedToken({
        shortLivedToken: gestor.meta_gestor_access_token,
        appId,
        appSecret,
      });
      const expiresIn = this.parseInteger(res.expires_in);
      if (res.access_token === gestor.meta_gestor_access_token && !expiresIn) {
        continue; // troca falhou (fallback devolveu o token antigo)
      }
      await this.db.user.update({
        where: { id: gestor.id },
        data: {
          meta_gestor_access_token: res.access_token,
          meta_gestor_token_expires_at: expiresIn ? new Date(Date.now() + expiresIn * 1000) : null,
        },
      });
      refreshedGestors += 1;
    }

    const connections = await this.db.metaConnection.findMany({
      where: {
        status: 'connected',
        token_expires_at: { not: null, lte: threshold },
      },
      select: { id: true, access_token: true },
    });

    let refreshedConnections = 0;
    for (const connection of connections) {
      const res = await this.exchangeForLongLivedToken({
        shortLivedToken: connection.access_token,
        appId,
        appSecret,
      });
      const expiresIn = this.parseInteger(res.expires_in);
      if (res.access_token === connection.access_token && !expiresIn) {
        continue;
      }
      await this.db.metaConnection.update({
        where: { id: connection.id },
        data: {
          access_token: res.access_token,
          token_expires_at: expiresIn ? new Date(Date.now() + expiresIn * 1000) : null,
        },
      });
      refreshedConnections += 1;
    }

    this.logger.log(
      `Renovacao tokens Meta: ${refreshedGestors} gestor(es), ${refreshedConnections} conexao(oes)`,
    );
    return { gestors: refreshedGestors, connections: refreshedConnections };
  }

  async disconnect(user: AuthenticatedUser, dto: DisconnectMetaDto) {
    await this.assertMetaClientAccess(user, dto.client_id);

    const connection = await this.db.metaConnection.findFirst({
      where: {
        client_id: dto.client_id,
        status: {
          in: ['connected', 'expired', 'pending'],
        },
      },
      orderBy: { updated_at: 'desc' },
    });

    if (!connection) {
      return {
        client_id: dto.client_id,
        disconnected: false,
        message: 'Nenhuma conexão Meta ativa encontrada para este cliente.',
      };
    }

    await this.db.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.metaConnection.update({
        where: { id: connection.id },
        data: {
          status: 'disconnected',
          oauth_state: null,
          scopes: [],
        },
      });

      await tx.metaAssetSelection.deleteMany({
        where: { meta_connection_id: connection.id },
      });

      await tx.facebookAdAccount.deleteMany({
        where: { client_id: dto.client_id },
      });

      await tx.client.update({
        where: { id: dto.client_id },
        data: {
          facebook_access_token: null,
          facebook_page_id: null,
        },
      });
    });

    return {
      client_id: dto.client_id,
      disconnected: true,
      meta_connection_id: connection.id,
      disconnected_at: new Date().toISOString(),
    };
  }

  verifyWebhook(mode?: string, verifyToken?: string, challenge?: string) {
    const acceptedTokens = [
      this.configService.get<string>('META_WEBHOOK_VERIFY_TOKEN'),
      this.configService.get<string>('FACEBOOK_WEBHOOK_VERIFY_TOKEN'),
      this.configService.get<string>('META_WHATSAPP_WEBHOOK_VERIFY_TOKEN'),
    ].filter((value): value is string => Boolean(value));

    if (
      mode === 'subscribe' &&
      verifyToken &&
      acceptedTokens.length > 0 &&
      acceptedTokens.includes(verifyToken)
    ) {
      return challenge ?? '';
    }

    throw new ForbiddenException('Webhook Meta nao autorizado');
  }

  async receiveWebhook(
    payload: Record<string, unknown>,
    signatureHeader?: string,
    rawBody?: Buffer,
  ) {
    this.assertWebhookSignature(signatureHeader, rawBody);

    const entries = this.readArray<Record<string, unknown>>(payload.entry);

    let processedLeadEvents = 0;
    let processedWhatsappEvents = 0;

    for (const entry of entries) {
      const changes = this.readArray<Record<string, unknown>>(entry.changes);
      for (const change of changes) {
        const field = this.readString(change.field);
        const value = this.readRecord(change.value);

        if (field === 'leadgen' && value) {
          const imported = await this.processLeadgenWebhook(value);
          processedLeadEvents += imported ? 1 : 0;
        }

        if (field === 'messages' && value) {
          const tracked = await this.processWhatsappCloudMessagesWebhook(value);
          processedWhatsappEvents += tracked ? 1 : 0;
        }
      }

      const messagingItems = this.readArray<Record<string, unknown>>(entry.messaging);
      for (const messageEvent of messagingItems) {
        const tracked = await this.processWhatsappWebhook(messageEvent);
        processedWhatsappEvents += tracked ? 1 : 0;
      }
    }

    return {
      received: true,
      processed_lead_events: processedLeadEvents,
      processed_whatsapp_events: processedWhatsappEvents,
    };
  }

  async sendClientWhatsappMessage(
    clientId: string,
    to: string,
    content: string,
  ): Promise<string | null> {
    const targetPhone = this.normalizePhone(to);
    if (!targetPhone) {
      throw new BadRequestException('Lead sem telefone valido para envio via WhatsApp.');
    }

    const selectedAsset = await this.getClientPrimaryWhatsappChannel(clientId);

    const response = await this.graphPost<WhatsappSendMessageResponse>(
      `${selectedAsset.phone_number_id}/messages`,
      selectedAsset.meta_connection.access_token,
      {
        messaging_product: 'whatsapp',
        to: targetPhone,
        type: 'text',
        text: { body: content },
      },
    );

    return response.messages?.[0]?.id ?? null;
  }

  async sendClientWhatsappMediaMessage(args: {
    clientId: string;
    to: string;
    fileBuffer: Buffer;
    filename: string;
    mimeType: string;
    caption?: string;
  }): Promise<{
    wamid: string | null;
    mediaId: string;
    mediaUrl: string | null;
    contentLabel: string;
  }> {
    const targetPhone = this.normalizePhone(args.to);
    if (!targetPhone) {
      throw new BadRequestException('Lead sem telefone valido para envio via WhatsApp.');
    }

    const selectedAsset = await this.getClientPrimaryWhatsappChannel(args.clientId);
    const mediaKind = this.resolveWhatsappMediaKind(args.mimeType);
    if (!mediaKind) {
      throw new BadRequestException(
        'Tipo de arquivo nao suportado para envio WhatsApp. Use imagem, video, audio ou documento.',
      );
    }

    const form = new FormData();
    form.append('messaging_product', 'whatsapp');
    form.append('type', args.mimeType);
    form.append('file', new Blob([args.fileBuffer], { type: args.mimeType }), args.filename);

    const upload = await this.graphPostForm<WhatsappUploadMediaResponse>(
      `${selectedAsset.phone_number_id}/media`,
      selectedAsset.meta_connection.access_token,
      form,
    );

    const mediaId = upload.id;
    if (!mediaId) {
      throw new BadRequestException('Upload de midia no WhatsApp falhou: media id ausente.');
    }

    const trimmedCaption = args.caption?.trim();
    const messagePayload: Record<string, unknown> = {
      messaging_product: 'whatsapp',
      to: targetPhone,
      type: mediaKind,
      [mediaKind]:
        mediaKind === 'document'
          ? {
              id: mediaId,
              caption: trimmedCaption || undefined,
              filename: args.filename,
            }
          : {
              id: mediaId,
              caption: trimmedCaption || undefined,
            },
    };

    const response = await this.graphPost<WhatsappSendMessageResponse>(
      `${selectedAsset.phone_number_id}/messages`,
      selectedAsset.meta_connection.access_token,
      messagePayload,
    );

    const mediaUrl = await this.fetchWhatsappMediaUrl(
      mediaId,
      selectedAsset.meta_connection.access_token,
    );

    return {
      wamid: response.messages?.[0]?.id ?? null,
      mediaId,
      mediaUrl,
      contentLabel: this.buildOutgoingMediaLabel(mediaKind, args.filename, trimmedCaption),
    };
  }

  async downloadClientWhatsappMedia(
    clientId: string,
    media: { mediaId?: string | null; mediaUrl?: string | null },
  ): Promise<{ buffer: Buffer; contentType: string; filename: string }> {
    const selectedAsset = await this.getClientPrimaryWhatsappChannel(clientId);
    const accessToken = selectedAsset.meta_connection.access_token;
    const mediaUrl = media.mediaId
      ? await this.fetchWhatsappMediaUrl(media.mediaId, accessToken)
      : media.mediaUrl;

    if (!mediaUrl) {
      throw new NotFoundException('Midia nao encontrada ou expirada.');
    }

    const safeMediaUrl = assertMetaMediaUrl(mediaUrl);
    const response = await fetch(safeMediaUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
      redirect: 'error',
      signal: AbortSignal.timeout(15_000),
    });

    if (!response.ok) {
      throw new BadRequestException(`Falha ao baixar midia WhatsApp (${response.status}).`);
    }

    const contentDisposition = response.headers.get('content-disposition') ?? '';
    const filenameMatch = /filename="?([^";]+)"?/i.exec(contentDisposition);

    return {
      buffer: Buffer.from(await response.arrayBuffer()),
      contentType: response.headers.get('content-type') ?? 'application/octet-stream',
      filename: filenameMatch?.[1] ?? `${media.mediaId ?? 'whatsapp-media'}`,
    };
  }

  private assertWebhookSignature(
    signatureHeader: string | undefined,
    rawBody: Buffer | undefined,
  ) {
    const secrets = [
      this.configService.get<string>('META_APP_SECRET'),
      this.configService.get<string>('FACEBOOK_APP_SECRET'),
    ]
      .map((value) => value?.trim())
      .filter((value): value is string => Boolean(value));

    if (secrets.length === 0) {
      throw new ServiceUnavailableException(
        'META_APP_SECRET/FACEBOOK_APP_SECRET nao configurados para validar assinatura do webhook.',
      );
    }

    const signature = signatureHeader?.trim();
    if (!signature) {
      throw new ForbiddenException('Assinatura X-Hub-Signature-256 ausente.');
    }

    if (!signature.startsWith('sha256=')) {
      throw new ForbiddenException('Formato de assinatura invalido.');
    }

    if (!rawBody) {
      throw new ForbiddenException('Corpo bruto do webhook indisponivel.');
    }

    const isValid = secrets.some((secret) => {
      const expected = `sha256=${createHmac('sha256', secret).update(rawBody).digest('hex')}`;
      return this.safeEqual(expected, signature);
    });

    if (!isValid) {
      throw new ForbiddenException('Assinatura do webhook invalida.');
    }
  }

  private safeEqual(a: string, b: string) {
    const left = Buffer.from(a, 'utf8');
    const right = Buffer.from(b, 'utf8');
    if (left.length !== right.length) {
      return false;
    }
    return timingSafeEqual(left, right);
  }

  /** Executado pelo worker (meta-sync). NAO chamar direto de um request HTTP. */
  async runFullSyncForConnection(metaConnectionId: string, jobId: string) {
    const connection = await this.db.metaConnection.findUnique({
      where: { id: metaConnectionId },
    });

    if (!connection) {
      throw new NotFoundException('Conexao Meta nao encontrada');
    }

    await this.db.metaSyncJob.update({
      where: { id: jobId },
      data: {
        status: 'running',
        started_at: new Date(),
        error_message: null,
      },
    });

    try {
      const selectedAssets = await this.db.metaAssetSelection.findMany({
        where: { meta_connection_id: metaConnectionId },
      });

      const adAccountIds = this.uniqueStrings(
        selectedAssets.map((asset: { ad_account_id?: string | null }) => asset.ad_account_id),
      );
      const pageIds = this.uniqueStrings(
        selectedAssets.map((asset: { page_id?: string | null }) => asset.page_id),
      );
      const selectedFormIds = this.uniqueStrings(
        selectedAssets.map((asset: { form_id?: string | null }) => asset.form_id),
      );

      const summary = {
        ad_accounts: adAccountIds.length,
        pages: pageIds.length,
        forms: 0,
        campaigns: 0,
        ad_sets: 0,
        ads: 0,
        creatives: 0,
        insight_rows: 0,
        imported_leads: 0,
      };

      for (const adAccountId of adAccountIds) {
        const campaigns = await this.fetchCampaignsForAccount(adAccountId, connection.access_token);
        summary.campaigns += await this.syncCampaigns(connection, campaigns);

        const adSets = await this.fetchAdSetsForAccount(adAccountId, connection.access_token);
        summary.ad_sets += await this.syncAdSets(connection, adSets);

        const ads = await this.fetchAdsForAccount(adAccountId, connection.access_token);
        const adsSummary = await this.syncAdsAndCreatives(connection, ads);
        summary.ads += adsSummary.ads;
        summary.creatives += adsSummary.creatives;

        const campaignInsights = await this.fetchInsightsForAccount(
          adAccountId,
          connection.access_token,
          'campaign',
        );
        summary.insight_rows += await this.syncInsights(
          connection,
          campaignInsights,
          'campaign',
        );

        const adSetInsights = await this.fetchInsightsForAccount(
          adAccountId,
          connection.access_token,
          'adset',
        );
        summary.insight_rows += await this.syncInsights(connection, adSetInsights, 'adset');

        const adInsights = await this.fetchInsightsForAccount(
          adAccountId,
          connection.access_token,
          'ad',
        );
        summary.insight_rows += await this.syncInsights(connection, adInsights, 'ad');
      }

      const forms = await this.fetchLeadForms(pageIds, connection.access_token);
      const filteredForms =
        selectedFormIds.length > 0
          ? forms.filter((form) => selectedFormIds.includes(form.id))
          : forms;
      summary.forms = await this.syncLeadForms(connection, filteredForms);

      const existingLeadImports = await this.db.metaLeadImport.count({
        where: {
          client_id: connection.client_id,
          meta_connection_id: connection.id,
        },
      });
      summary.imported_leads = existingLeadImports;

      const finishedAt = new Date();

      await this.db.metaConnection.update({
        where: { id: connection.id },
        data: {
          last_sync_at: finishedAt,
          status: 'connected',
        },
      });

      await this.db.metaSyncJob.update({
        where: { id: jobId },
        data: {
          status: 'completed',
          finished_at: finishedAt,
          context: this.toJsonValue(summary),
        },
      });

      return summary;
    } catch (error) {
      const message = this.getErrorMessage(error);

      await this.db.metaSyncJob.update({
        where: { id: jobId },
        data: {
          status: 'failed',
          finished_at: new Date(),
          error_message: message,
        },
      });

      if (message.toLowerCase().includes('token')) {
        await this.db.metaConnection.update({
          where: { id: metaConnectionId },
          data: { status: 'expired' },
        });
      }

      throw error;
    }
  }

  private async syncCampaigns(
    connection: { id: string; client_id: string },
    campaigns: MetaCampaignPayload[],
  ) {
    let synced = 0;

    for (const campaign of campaigns) {
      const existing = await this.db.metaCampaign.findFirst({
        where: {
          meta_connection_id: connection.id,
          meta_campaign_id: campaign.id,
        },
      });

      const data = {
        client_id: connection.client_id,
        meta_connection_id: connection.id,
        meta_campaign_id: campaign.id,
        name: campaign.name ?? `Campaign ${campaign.id}`,
        status: campaign.status ?? null,
        objective: campaign.objective ?? null,
        daily_budget: this.toDecimalValue(campaign.daily_budget),
        lifetime_budget: this.toDecimalValue(campaign.lifetime_budget),
        start_time: this.toDate(campaign.start_time),
        stop_time: this.toDate(campaign.stop_time),
        raw_payload: this.toJsonValue(campaign),
      };

      if (existing) {
        await this.db.metaCampaign.update({
          where: { id: existing.id },
          data,
        });
      } else {
        await this.db.metaCampaign.create({ data });
      }

      synced += 1;
    }

    return synced;
  }

  private async syncAdSets(
    connection: { id: string; client_id: string },
    adSets: MetaAdSetPayload[],
  ) {
    let synced = 0;

    for (const adSet of adSets) {
      const existing = await this.db.metaAdSet.findFirst({
        where: {
          meta_connection_id: connection.id,
          meta_ad_set_id: adSet.id,
        },
      });

      const data = {
        client_id: connection.client_id,
        meta_connection_id: connection.id,
        meta_campaign_id: adSet.campaign_id ?? null,
        meta_ad_set_id: adSet.id,
        name: adSet.name ?? `AdSet ${adSet.id}`,
        status: adSet.status ?? null,
        daily_budget: this.toDecimalValue(adSet.daily_budget),
        lifetime_budget: this.toDecimalValue(adSet.lifetime_budget),
        raw_payload: this.toJsonValue(adSet),
      };

      if (existing) {
        await this.db.metaAdSet.update({
          where: { id: existing.id },
          data,
        });
      } else {
        await this.db.metaAdSet.create({ data });
      }

      synced += 1;
    }

    return synced;
  }

  private async syncAdsAndCreatives(
    connection: { id: string; client_id: string; access_token: string },
    ads: MetaAdPayload[],
  ) {
    let syncedAds = 0;
    let syncedCreatives = 0;
    const syncedCreativeIds = new Set<string>();

    for (const ad of ads) {
      const existing = await this.db.metaAd.findFirst({
        where: {
          meta_connection_id: connection.id,
          meta_ad_id: ad.id,
        },
      });

      const data = {
        client_id: connection.client_id,
        meta_connection_id: connection.id,
        meta_campaign_id: ad.campaign_id ?? null,
        meta_ad_set_id: ad.adset_id ?? null,
        meta_ad_id: ad.id,
        meta_creative_id: ad.creative?.id ?? null,
        name: ad.name ?? `Ad ${ad.id}`,
        status: ad.status ?? null,
        effective_status: ad.effective_status ?? null,
        raw_payload: this.toJsonValue(ad),
      };

      if (existing) {
        await this.db.metaAd.update({
          where: { id: existing.id },
          data,
        });
      } else {
        await this.db.metaAd.create({ data });
      }

      syncedAds += 1;

      const creativeId = ad.creative?.id;
      if (creativeId && !syncedCreativeIds.has(creativeId)) {
        const creative = await this.fetchCreative(creativeId, connection.access_token);
        if (creative) {
          const creativeExisting = await this.db.metaCreative.findFirst({
            where: {
              meta_connection_id: connection.id,
              meta_creative_id: creative.id,
            },
          });

          const creativeData = {
            client_id: connection.client_id,
            meta_connection_id: connection.id,
            meta_creative_id: creative.id,
            name: creative.name ?? null,
            title: creative.title ?? null,
            body: creative.body ?? null,
            image_url: creative.image_url ?? null,
            video_id: creative.video_id ?? null,
            url_tags: creative.url_tags ?? null,
            object_story_id: creative.object_story_id ?? null,
            raw_payload: this.toJsonValue(creative),
          };

          if (creativeExisting) {
            await this.db.metaCreative.update({
              where: { id: creativeExisting.id },
              data: creativeData,
            });
          } else {
            await this.db.metaCreative.create({
              data: creativeData,
            });
          }

          syncedCreativeIds.add(creative.id);
          syncedCreatives += 1;
        }
      }
    }

    return {
      ads: syncedAds,
      creatives: syncedCreatives,
    };
  }

  private async syncLeadForms(
    connection: { id: string; client_id: string },
    forms: MetaLeadFormSummary[],
  ) {
    let synced = 0;

    for (const form of forms) {
      const existing = await this.db.metaLeadForm.findFirst({
        where: {
          meta_connection_id: connection.id,
          meta_form_id: form.id,
        },
      });

      const data = {
        client_id: connection.client_id,
        meta_connection_id: connection.id,
        page_id: form.page_id ?? null,
        meta_form_id: form.id,
        name: form.name ?? `Formulario ${form.id}`,
        status: form.status ?? null,
        questions_payload: this.toJsonValue(form.questions ?? []),
        raw_payload: this.toJsonValue(form),
      };

      if (existing) {
        await this.db.metaLeadForm.update({
          where: { id: existing.id },
          data,
        });
      } else {
        await this.db.metaLeadForm.create({ data });
      }

      synced += 1;
    }

    return synced;
  }

  private async syncInsights(
    connection: { id: string; client_id: string },
    insights: MetaInsightPayload[],
    level: MetaInsightLevel = 'campaign',
  ) {
    let synced = 0;

    for (const insight of insights) {
      const date = this.toDate(insight.date_start);
      const entityId =
        level === 'ad'
          ? insight.ad_id
          : level === 'adset'
            ? insight.adset_id
            : insight.campaign_id;
      const entityName =
        level === 'ad'
          ? insight.ad_name
          : level === 'adset'
            ? insight.adset_name
            : insight.campaign_name;

      if (!date || !entityId) {
        continue;
      }

      const existing = await this.db.metaDailyInsight.findFirst({
        where: {
          meta_connection_id: connection.id,
          level,
          entity_id: entityId,
          date,
        },
      });

      const data = {
        client_id: connection.client_id,
        meta_connection_id: connection.id,
        level,
        entity_id: entityId,
        entity_name: entityName ?? null,
        date,
        spend: this.toDecimalValue(insight.spend),
        impressions: this.parseInteger(insight.impressions),
        clicks: this.parseInteger(insight.clicks),
        cpc: this.toDecimalValue(insight.cpc),
        ctr: this.toDecimalValue(insight.ctr),
        leads: this.extractLeadCount(insight.actions),
        reach: this.parseInteger(insight.reach),
        frequency: this.toDecimalValue(insight.frequency),
        raw_payload: this.toJsonValue(insight),
      };

      if (existing) {
        await this.db.metaDailyInsight.update({
          where: { id: existing.id },
          data,
        });
      } else {
        await this.db.metaDailyInsight.create({ data });
      }

      synced += 1;
    }

    return synced;
  }

  private async processLeadgenWebhook(value: Record<string, unknown>) {
    const leadgenId = this.readString(value.leadgen_id);
    const formId = this.readString(value.form_id);
    const pageId = this.readString(value.page_id);

    if (!leadgenId) {
      return false;
    }

    const connection = await this.resolveConnectionForLeadWebhook({ formId, pageId });
    if (!connection) {
      this.logger.warn('Webhook leadgen ignorado: conexao nao encontrada');
      return false;
    }

    const leadPayload = await this.fetchLeadDetails(leadgenId, connection.access_token);
    await this.importLeadPayload(connection, leadPayload, {
      form_id: formId,
      page_id: pageId,
      leadgen_id: leadgenId,
      campaign_id: this.readString(value.campaign_id),
      ad_id: this.readString(value.ad_id),
      adgroup_id: this.readString(value.adgroup_id),
      created_time: this.readString(value.created_time),
    });

    return true;
  }

  private async processWhatsappWebhook(messageEvent: Record<string, unknown>) {
    const referral = this.readRecord(messageEvent.referral);
    const ctwaClid = referral ? this.readString(referral.ctwa_clid) : undefined;
    const campaignId = referral ? this.readString(referral.source_id) : undefined;

    if (!ctwaClid) {
      return false;
    }

    const recipient = this.readRecord(messageEvent.recipient);
    const metadata = this.readRecord(messageEvent.metadata);
    const phoneNumberId =
      (recipient ? this.readString(recipient.id) : undefined) ??
      (metadata ? this.readString(metadata.phone_number_id) : undefined);

    const assetSelection = phoneNumberId
      ? await this.db.metaAssetSelection.findFirst({
          where: { phone_number_id: phoneNumberId },
          include: { meta_connection: true },
        })
      : null;

    if (!assetSelection?.meta_connection) {
      return false;
    }

    const eventTime =
      this.readNumber(messageEvent.timestamp) ??
      this.parseInteger(this.readString(messageEvent.timestamp));
    const occurredAt = eventTime ? new Date(eventTime * 1000) : new Date();

    await this.db.whatsAppAttributionEvent.create({
      data: {
        client_id: assetSelection.meta_connection.client_id,
        meta_connection_id: assetSelection.meta_connection_id,
        ctwa_clid: ctwaClid,
        meta_campaign_id: campaignId ?? null,
        event_type: 'whatsapp_message',
        occurred_at: occurredAt,
        raw_payload: this.toJsonValue(messageEvent),
      },
    });

    return true;
  }

  private async processWhatsappCloudMessagesWebhook(value: Record<string, unknown>) {
    const metadata = this.readRecord(value.metadata);
    const phoneNumberId = metadata ? this.readString(metadata.phone_number_id) : undefined;
    if (!phoneNumberId) {
      return false;
    }

    const assetSelection = await this.db.metaAssetSelection.findFirst({
      where: { phone_number_id: phoneNumberId },
      include: { meta_connection: true },
    });

    if (!assetSelection?.meta_connection) {
      this.logger.warn(
        'Webhook WhatsApp ignorado: numero nao mapeado para cliente.',
      );
      return false;
    }

    const contacts = this.readArray<Record<string, unknown>>(value.contacts);
    const contactNameByWaId = new Map<string, string>();
    for (const contact of contacts) {
      const waId = this.readString(contact.wa_id);
      const profile = this.readRecord(contact.profile);
      const profileName = profile ? this.readString(profile.name) : undefined;
      if (waId && profileName) {
        contactNameByWaId.set(waId, profileName);
      }
    }

    const messages = this.readArray<Record<string, unknown>>(value.messages);
    if (messages.length === 0) {
      return false;
    }

    let processed = 0;
    const rootReferral = this.readRecord(value.referral);

    for (const message of messages) {
      const from = this.readString(message.from);
      if (!from) {
        continue;
      }
      const wamid = this.readString(message.id);

      const occurredAt = this.resolveWhatsappTimestamp(message.timestamp);
      const extractedMessage = await this.extractWhatsappMessagePayload(
        message,
        assetSelection.meta_connection.access_token,
      );
      if (!extractedMessage?.content) {
        continue;
      }

      const lead = await this.findOrCreateWhatsappLead(
        assetSelection.meta_connection.client_id,
        from,
        contactNameByWaId.get(from),
      );
      const conversation = await this.findOrCreateWhatsappConversation(
        assetSelection.meta_connection.client_id,
        lead.id,
        occurredAt,
      );

      const duplicate = wamid
        ? await this.db.message.findFirst({
            where: { external_id: wamid },
            select: { id: true },
          })
        : await this.db.message.findFirst({
            where: {
              conversation_id: conversation.id,
              sender_type: SenderType.lead,
              content: extractedMessage.content,
              created_at: occurredAt,
            },
            select: { id: true },
          });
      if (duplicate) {
        continue;
      }

      const createdMessage = await this.db.message.create({
        data: {
          conversation_id: conversation.id,
          sender_type: SenderType.lead,
          sender_id: null,
          external_id: wamid ?? null,
          content: extractedMessage.content,
          media_id: extractedMessage.mediaId,
          media_url: extractedMessage.mediaUrl,
          created_at: occurredAt,
        },
      });

      await this.db.conversation.update({
        where: { id: conversation.id },
        data: { last_message_at: createdMessage.created_at },
      });

      const referral = this.readRecord(message.referral) ?? rootReferral;
      const ctwaClid = referral ? this.readString(referral.ctwa_clid) : undefined;
      const campaignId = referral ? this.readString(referral.source_id) : undefined;

      await this.db.whatsAppAttributionEvent.create({
        data: {
          client_id: assetSelection.meta_connection.client_id,
          meta_connection_id: assetSelection.meta_connection_id,
          lead_id: lead.id,
          conversation_id: conversation.id,
          ctwa_clid: ctwaClid ?? null,
          meta_campaign_id: campaignId ?? null,
          event_type: 'whatsapp_message',
          occurred_at: occurredAt,
          raw_payload: this.toJsonValue({
            metadata,
            message,
            contact_name: contactNameByWaId.get(from) ?? null,
          }),
        },
      });

      this.realtimeEvents.emitNewMessage(assetSelection.meta_connection.client_id, {
        conversation_id: createdMessage.conversation_id,
        message_id: createdMessage.id,
        sender_type: createdMessage.sender_type,
        sender_id: createdMessage.sender_id,
        content: createdMessage.content,
        media_id: createdMessage.media_id,
        media_url: createdMessage.media_url,
        created_at: createdMessage.created_at,
      });

      void this.clientWebhook.dispatch(
        assetSelection.meta_connection.client_id,
        'conversation.message.received',
        {
          message_id: createdMessage.id,
          conversation_id: createdMessage.conversation_id,
          lead_id: lead.id,
          sender_type: 'lead',
          content: createdMessage.content,
          media_id: createdMessage.media_id,
          media_url: createdMessage.media_url,
          channel: 'whatsapp',
          created_at: createdMessage.created_at.toISOString(),
        },
      );

      processed += 1;
    }

    return processed > 0;
  }

  private resolveWhatsappTimestamp(value: unknown) {
    const numeric = this.readNumber(value) ?? this.parseInteger(this.readString(value));
    if (!numeric) {
      return new Date();
    }

    return new Date(numeric * 1000);
  }

  private async extractWhatsappMessagePayload(
    message: Record<string, unknown>,
    accessToken: string,
  ): Promise<WhatsappExtractedMessagePayload | null> {
    const type = this.readString(message.type) ?? 'text';

    if (type === 'text') {
      const textPayload = this.readRecord(message.text);
      return {
        content: this.readString(textPayload?.body) ?? '[texto vazio]',
        mediaId: null,
        mediaUrl: null,
      };
    }

    if (type === 'button') {
      const buttonPayload = this.readRecord(message.button);
      return {
        content: this.readString(buttonPayload?.text) ?? '[botao]',
        mediaId: null,
        mediaUrl: null,
      };
    }

    if (type === 'interactive') {
      const interactivePayload = this.readRecord(message.interactive);
      const buttonReply = interactivePayload
        ? this.readRecord(interactivePayload.button_reply)
        : undefined;
      const listReply = interactivePayload
        ? this.readRecord(interactivePayload.list_reply)
        : undefined;
      return {
        content:
          this.readString(buttonReply?.title) ??
          this.readString(listReply?.title) ??
          this.readString(listReply?.description) ??
          '[mensagem interativa]',
        mediaId: null,
        mediaUrl: null,
      };
    }

    if (type === 'location') {
      const locationPayload = this.readRecord(message.location);
      const latitude = this.readNumber(locationPayload?.latitude);
      const longitude = this.readNumber(locationPayload?.longitude);
      if (latitude !== undefined && longitude !== undefined) {
        return {
          content: `[localizacao] ${latitude}, ${longitude}`,
          mediaId: null,
          mediaUrl: null,
        };
      }
      return { content: '[localizacao]', mediaId: null, mediaUrl: null };
    }

    if (type === 'contacts') {
      return { content: '[contato compartilhado]', mediaId: null, mediaUrl: null };
    }

    const mediaPayload = this.readRecord(message[type]);
    const mediaCaption = mediaPayload ? this.readString(mediaPayload.caption) : undefined;
    const mediaId = mediaPayload ? this.readString(mediaPayload.id) : undefined;
    const filename = mediaPayload ? this.readString(mediaPayload.filename) : undefined;
    const webhookMediaUrl = mediaPayload ? this.readString(mediaPayload.url) : undefined;
    const mediaUrl = mediaId
      ? ((await this.fetchWhatsappMediaUrl(mediaId, accessToken)) ?? webhookMediaUrl ?? null)
      : (webhookMediaUrl ?? null);

    if (type === 'document') {
      return {
        content: mediaCaption ?? (filename ? `[documento] ${filename}` : '[documento]'),
        mediaId: mediaId ?? null,
        mediaUrl,
      };
    }

    if (type === 'image') {
      return { content: mediaCaption ?? '[imagem]', mediaId: mediaId ?? null, mediaUrl };
    }

    if (type === 'video') {
      return { content: mediaCaption ?? '[video]', mediaId: mediaId ?? null, mediaUrl };
    }

    if (type === 'audio') {
      return { content: mediaCaption ?? '[audio]', mediaId: mediaId ?? null, mediaUrl };
    }

    if (type === 'sticker') {
      return { content: mediaCaption ?? '[sticker]', mediaId: mediaId ?? null, mediaUrl };
    }

    if (mediaCaption) {
      return { content: mediaCaption, mediaId: mediaId ?? null, mediaUrl };
    }

    return { content: `[${type}]`, mediaId: mediaId ?? null, mediaUrl };
  }

  private async fetchWhatsappMediaUrl(
    mediaId: string,
    accessToken: string,
  ): Promise<string | null> {
    try {
      const media = await this.graphGet<{ url?: string }>(mediaId, accessToken, {
        fields: 'url',
      });
      return media.url ?? null;
    } catch (error) {
      this.logger.warn(
        `Nao foi possivel resolver media_url: ${this.getErrorMessage(error)}`,
      );
      return null;
    }
  }

  private resolveWhatsappMediaKind(
    mimeType: string,
  ): 'image' | 'video' | 'audio' | 'document' | null {
    const normalized = mimeType.toLowerCase();
    if (normalized.startsWith('image/')) return 'image';
    if (normalized.startsWith('video/')) return 'video';
    if (normalized.startsWith('audio/')) return 'audio';
    if (
      normalized === 'application/pdf' ||
      normalized.startsWith('application/') ||
      normalized.startsWith('text/')
    ) {
      return 'document';
    }
    return null;
  }

  private buildOutgoingMediaLabel(
    mediaKind: 'image' | 'video' | 'audio' | 'document',
    filename: string,
    caption?: string,
  ) {
    if (caption) return caption;
    if (mediaKind === 'document') return `[documento] ${filename}`;
    if (mediaKind === 'image') return '[imagem]';
    if (mediaKind === 'video') return '[video]';
    if (mediaKind === 'audio') return '[audio]';
    return `[${mediaKind}]`;
  }

  private async getClientPrimaryWhatsappChannel(clientId: string) {
    const selectedAsset = await this.db.metaAssetSelection.findFirst({
      where: {
        phone_number_id: { not: null },
        meta_connection: {
          client_id: clientId,
          status: 'connected',
        },
      },
      include: { meta_connection: true },
      orderBy: [{ is_primary: 'desc' }, { updated_at: 'desc' }],
    });

    if (!selectedAsset?.phone_number_id) {
      throw new BadRequestException(
        'Cliente sem WhatsApp configurado. Selecione WABA e phone_number_id na integracao Meta.',
      );
    }

    return selectedAsset;
  }

  private normalizePhone(value?: string | null) {
    if (!value) {
      return '';
    }
    return value.replace(/\D/g, '');
  }

  private buildPhoneCandidates(raw?: string | null) {
    const trimmed = raw?.trim();
    if (!trimmed) {
      return null;
    }

    const normalized = normalizeBrazilianPhone(trimmed);
    const digits = phoneDigits(trimmed);
    const candidates = new Set<string>([trimmed, normalized]);

    if (digits) {
      candidates.add(digits);
      candidates.add(`+${digits}`);
      if (digits.length >= 10) {
        candidates.add(digits.slice(-10));
      }
      if (digits.length >= 11) {
        candidates.add(`+55${digits.slice(-11)}`);
      }
    }

    return { normalized, digits, candidates: Array.from(candidates).filter(Boolean) };
  }

  private async findLeadByPhone(clientId: string, phone?: string | null, excludeLeadId?: string) {
    const candidateSet = this.buildPhoneCandidates(phone);
    if (!candidateSet) {
      return null;
    }

    const exact = await this.db.lead.findFirst({
      where: {
        client_id: clientId,
        deleted_at: null,
        ...(excludeLeadId ? { id: { not: excludeLeadId } } : {}),
        OR: candidateSet.candidates.map((candidate) => ({ phone: candidate })),
      },
      orderBy: { updated_at: 'desc' },
      select: { id: true, name: true, phone: true, email: true },
    });
    if (exact) {
      return exact;
    }

    if (!candidateSet.digits) {
      return null;
    }

    const legacy = await this.db.lead.findMany({
      where: {
        client_id: clientId,
        deleted_at: null,
        ...(excludeLeadId ? { id: { not: excludeLeadId } } : {}),
        phone: { not: null },
      },
      orderBy: { updated_at: 'desc' },
      take: 300,
      select: { id: true, name: true, phone: true, email: true },
    });

    return legacy.find((item) => this.normalizePhone(item.phone) === candidateSet.digits) ?? null;
  }

  private async findOrCreateWhatsappLead(
    clientId: string,
    waId: string,
    contactName?: string,
  ): Promise<{ id: string }> {
    const normalizedWaId = this.normalizePhone(waId);
    const lead = await this.findLeadByPhone(clientId, normalizedWaId || waId);

    if (lead) {
      const updateData: { name?: string; phone?: string } = {};
      if (!lead.phone && normalizedWaId) {
        updateData.phone = `+${normalizedWaId}`;
      }
      if (contactName && this.shouldOverwriteLeadName(lead.name)) {
        updateData.name = contactName;
      }

      if (Object.keys(updateData).length > 0) {
        const updated = await this.db.lead.update({
          where: { id: lead.id },
          data: updateData,
          select: { id: true },
        });
        return updated;
      }

      return { id: lead.id };
    }

    const fallbackSuffix = normalizedWaId.slice(-4) || randomUUID().slice(0, 4).toUpperCase();
    const created = await this.db.lead.create({
      data: {
        client_id: clientId,
        name: contactName ?? `Contato WhatsApp ${fallbackSuffix}`,
        phone: normalizedWaId ? `+${normalizedWaId}` : null,
        source: 'whatsapp',
      },
      select: { id: true },
    });

    return created;
  }

  private shouldOverwriteLeadName(name: string) {
    const normalized = name.trim().toLowerCase();
    if (!normalized) {
      return true;
    }
    return normalized.startsWith('lead ') || normalized.startsWith('contato whatsapp ');
  }

  private async findOrCreateWhatsappConversation(
    clientId: string,
    leadId: string,
    occurredAt: Date,
  ) {
    const existing = await this.db.conversation.findFirst({
      where: {
        client_id: clientId,
        lead_id: leadId,
        channel: ConversationChannel.whatsapp,
      },
      orderBy: { last_message_at: 'desc' },
      select: { id: true },
    });

    if (existing) {
      return existing;
    }

    return this.db.conversation.create({
      data: {
        client_id: clientId,
        lead_id: leadId,
        channel: ConversationChannel.whatsapp,
        last_message_at: occurredAt,
      },
      select: { id: true },
    });
  }

  private async resolveConnectionForLeadWebhook(args: { formId?: string; pageId?: string }) {
    if (args.formId) {
      const form = await this.db.metaLeadForm.findFirst({
        where: { meta_form_id: args.formId },
        include: { meta_connection: true },
      });

      if (form?.meta_connection) {
        return form.meta_connection;
      }

      const assetByForm = await this.db.metaAssetSelection.findFirst({
        where: { form_id: args.formId },
        include: { meta_connection: true },
      });

      if (assetByForm?.meta_connection) {
        return assetByForm.meta_connection;
      }
    }

    if (args.pageId) {
      const assetByPage = await this.db.metaAssetSelection.findFirst({
        where: { page_id: args.pageId },
        include: { meta_connection: true },
      });

      if (assetByPage?.meta_connection) {
        return assetByPage.meta_connection;
      }
    }

    return null;
  }

  private async importLeadPayload(
    connection: { id: string; client_id: string },
    leadPayload: MetaLeadPayload,
    context: Record<string, unknown>,
  ) {
    const metaLeadId = leadPayload.id ?? this.readString(context.leadgen_id);
    if (!metaLeadId) {
      throw new BadRequestException('Payload de lead da Meta sem identificador');
    }

    const fieldData = Array.isArray(leadPayload.field_data) ? leadPayload.field_data : [];
    const leadName =
      this.pickFieldValue(fieldData, ['full_name', 'nome_completo', 'name', 'first_name']) ??
      `Lead ${metaLeadId}`;
    const leadEmail = this.pickFieldValue(fieldData, ['email']);
    const leadPhone = this.pickFieldValue(fieldData, [
      'phone_number',
      'phone',
      'telefone',
      'whatsapp',
    ]);
    const normalizedLeadPhone = leadPhone ? normalizeBrazilianPhone(leadPhone) : null;

    const existingImport = await this.db.metaLeadImport.findFirst({
      where: {
        meta_connection_id: connection.id,
        meta_lead_id: metaLeadId,
      },
    });

    let lead = existingImport?.lead_id
      ? await this.db.lead.findUnique({ where: { id: existingImport.lead_id } })
      : await this.db.lead.findFirst({
          where: {
            client_id: connection.client_id,
            facebook_lead_id: metaLeadId,
          },
        });

    if (!lead && normalizedLeadPhone) {
      const leadByPhone = await this.findLeadByPhone(connection.client_id, normalizedLeadPhone);
      if (leadByPhone) {
        lead = await this.db.lead.findUnique({ where: { id: leadByPhone.id } });
      }
    }

    if (lead) {
      if (normalizedLeadPhone) {
        const duplicatePhone = await this.findLeadByPhone(
          connection.client_id,
          normalizedLeadPhone,
          lead.id,
        );
        if (duplicatePhone) {
          throw new BadRequestException('Telefone ja cadastrado para este cliente');
        }
      }

      const updatedPhone = normalizedLeadPhone ?? lead.phone ?? null;
      lead = await this.db.lead.update({
        where: { id: lead.id },
        data: {
          name: leadName,
          email: leadEmail ?? lead.email,
          phone: updatedPhone,
        },
      });
    } else {
      if (normalizedLeadPhone) {
        const duplicatePhone = await this.findLeadByPhone(
          connection.client_id,
          normalizedLeadPhone,
        );
        if (duplicatePhone) {
          lead = await this.db.lead.update({
            where: { id: duplicatePhone.id },
            data: {
              name: leadName,
              email: leadEmail ?? duplicatePhone.email,
              phone: normalizedLeadPhone,
              facebook_lead_id: metaLeadId,
            },
          });
        }
      }

      if (!lead) {
        lead = await this.db.lead.create({
          data: {
            client_id: connection.client_id,
            name: leadName,
            email: leadEmail ?? null,
            phone: normalizedLeadPhone,
            source: 'form_page',
            facebook_lead_id: metaLeadId,
          },
        });
      }
    }

    const importData = {
      client_id: connection.client_id,
      meta_connection_id: connection.id,
      lead_id: lead.id,
      meta_lead_id: metaLeadId,
      meta_form_id: leadPayload.form_id ?? this.readString(context.form_id) ?? null,
      meta_campaign_id: leadPayload.campaign_id ?? this.readString(context.campaign_id) ?? null,
      meta_ad_set_id: leadPayload.adgroup_id ?? this.readString(context.adgroup_id) ?? null,
      meta_ad_id: leadPayload.ad_id ?? this.readString(context.ad_id) ?? null,
      meta_creative_id: this.readString(context.creative_id) ?? null,
      utm_campaign: this.readString(context.utm_campaign) ?? null,
      utm_content: this.readString(context.utm_content) ?? null,
      utm_term: this.readString(context.utm_term) ?? null,
      referral_context: this.readString(context.referral_context) ?? null,
      raw_payload: this.toJsonValue({
        lead_payload: leadPayload,
        context,
      }),
    };

    if (existingImport) {
      await this.db.metaLeadImport.update({
        where: { id: existingImport.id },
        data: importData,
      });
    } else {
      await this.db.metaLeadImport.create({
        data: importData,
      });
    }

    return lead;
  }

  private async fetchBusinesses(accessToken: string) {
    return this.graphGetAll<MetaBusinessSummary>('me/businesses', accessToken, {
      fields: 'id,name',
      limit: 200,
    });
  }

  private async fetchBusinessById(businessId: string, accessToken: string) {
    return this.graphGet<MetaBusinessSummary>(businessId, accessToken, {
      fields: 'id,name',
    });
  }

  /**
   * Lista contas da BM via owned + client. Não usa safeGraphGetAll aqui: se a Meta falhar
   * (token, permissão, rate limit), devolver [] fazia parecer que a BM “não tem contas”.
   */
  private async fetchBusinessAdAccounts(businessId: string, accessToken: string) {
    let owned: MetaAdAccountSummary[] = [];
    let clientAccounts: MetaAdAccountSummary[] = [];
    let ownedErr: string | null = null;
    let clientErr: string | null = null;

    try {
      owned = await this.graphGetAll<MetaAdAccountSummary>(
        `${businessId}/owned_ad_accounts`,
        accessToken,
        {
          fields: 'id,account_id,name',
          limit: 200,
        },
      );
    } catch (error) {
      ownedErr = this.getErrorMessage(error);
      this.logger.warn(`Falha ao listar owned_ad_accounts: ${ownedErr}`);
    }

    try {
      clientAccounts = await this.graphGetAll<MetaAdAccountSummary>(
        `${businessId}/client_ad_accounts`,
        accessToken,
        {
          fields: 'id,account_id,name',
          limit: 200,
        },
      );
    } catch (error) {
      clientErr = this.getErrorMessage(error);
      this.logger.warn(`Falha ao listar client_ad_accounts: ${clientErr}`);
    }

    const merged = this.uniqueBy(
      [...owned, ...clientAccounts].map((account) => ({
        ...account,
        account_id: this.normalizeAdAccountId(account),
      })),
      (account) => this.normalizeAdAccountId(account),
    );

    if (merged.length === 0 && (ownedErr || clientErr)) {
      // Rate limit da Graph API: não quebra o modal; usuário tenta de novo em alguns minutos.
      if (this.isMetaGraphRateLimited(ownedErr) || this.isMetaGraphRateLimited(clientErr)) {
        this.logger.warn(
          `Meta rate limit ao listar ad accounts BM ${businessId}: owned=${ownedErr ?? '-'} client=${clientErr ?? '-'}`,
        );
        return [];
      }
      throw new BadRequestException(
        `Nao foi possivel listar contas de anuncio desta BM. ` +
          `${ownedErr ?? ''}${ownedErr && clientErr ? ' | ' : ''}${clientErr ?? ''} ` +
          `Reconecte a Meta (gestor) ou verifique permissao no Business Manager.`,
      );
    }

    return merged;
  }

  /** Erros transitórios da Marketing/Graph API — não devem virar 400 no listagem de ativos. */
  private isMetaGraphRateLimited(message: string | null | undefined) {
    if (!message) {
      return false;
    }
    const m = message.toLowerCase();
    return (
      m.includes('too many calls') ||
      m.includes('rate limit') ||
      m.includes('application request limit') ||
      m.includes('(#4)') ||
      m.includes('request limit reached') ||
      m.includes('wait a bit')
    );
  }

  private async fetchBusinessPages(businessId: string, accessToken: string) {
    const owned = await this.safeGraphGetAll<MetaPageSummary>(
      `${businessId}/owned_pages`,
      accessToken,
      {
        fields: 'id,name',
        limit: 200,
      },
    );
    const client = await this.safeGraphGetAll<MetaPageSummary>(
      `${businessId}/client_pages`,
      accessToken,
      {
        fields: 'id,name',
        limit: 200,
      },
    );

    return this.uniqueBy([...owned, ...client], (page) => page.id);
  }

  private async fetchBusinessWabas(businessId: string, accessToken: string) {
    const owned = await this.safeGraphGetAll<MetaWhatsappBusinessSummary>(
      `${businessId}/owned_whatsapp_business_accounts`,
      accessToken,
      {
        fields: 'id,name',
        limit: 100,
      },
    );
    const client = await this.safeGraphGetAll<MetaWhatsappBusinessSummary>(
      `${businessId}/client_whatsapp_business_accounts`,
      accessToken,
      {
        fields: 'id,name',
        limit: 100,
      },
    );

    return this.uniqueBy([...owned, ...client], (waba) => waba.id);
  }

  private async fetchWabaPhoneNumbers(wabaId: string, accessToken: string) {
    return this.safeGraphGetAll<MetaPhoneNumberSummary>(`${wabaId}/phone_numbers`, accessToken, {
      fields: 'id,display_phone_number',
      limit: 100,
    });
  }

  private async subscribeWabaToWebhook(wabaId: string, accessToken: string) {
    try {
      await this.graphPost<{ success?: boolean | string }>(
        `${wabaId}/subscribed_apps`,
        accessToken,
      );
    } catch (error) {
      throw new BadRequestException(
        `Nao foi possivel assinar o webhook da WABA ${wabaId}: ${this.getErrorMessage(error)}`,
      );
    }
  }

  private async subscribePageToWebhook(pageId: string, pageAccessToken: string) {
    try {
      await this.graphPost<{ success?: boolean | string }>(
        `${pageId}/subscribed_apps`,
        pageAccessToken,
        undefined,
        { subscribed_fields: 'leadgen' },
      );
      this.logger.log('Webhook assinado com sucesso para pagina Meta');
    } catch (error) {
      this.logger.warn(
        `Nao foi possivel assinar webhook de pagina: ${this.getErrorMessage(error)}`,
      );
    }
  }

  private async fetchLeadForms(pageIds: string[], accessToken: string) {
    const forms: MetaLeadFormSummary[] = [];

    for (const pageId of pageIds) {
      const pageAccessToken = await this.fetchPageAccessToken(pageId, accessToken);
      if (!pageAccessToken) {
        this.logger.warn(
          'Sem page access token; formularios de lead nao podem ser listados.',
        );
        continue;
      }

      const pageForms = await this.safeGraphGetAll<MetaLeadFormSummary>(
        `${pageId}/leadgen_forms`,
        pageAccessToken,
        {
          fields: 'id,name,status,questions',
          limit: 200,
        },
      );

      forms.push(
        ...pageForms.map((form) => ({
          ...form,
          page_id: pageId,
        })),
      );
    }

    return this.uniqueBy(forms, (form) => form.id);
  }

  private async fetchPageAccessToken(pageId: string, userAccessToken: string) {
    try {
      const page = await this.graphGet<MetaPageSummary>(pageId, userAccessToken, {
        fields: 'id,access_token',
      });
      return page.access_token?.trim() || null;
    } catch (error) {
      this.logger.warn(
        `Falha ao obter page access token para ${pageId}: ${this.getErrorMessage(error)}`,
      );
      return null;
    }
  }

  private async fetchCampaignsForAccount(adAccountId: string, accessToken: string) {
    return this.safeGraphGetAll<MetaCampaignPayload>(`act_${adAccountId}/campaigns`, accessToken, {
      fields: 'id,name,status,objective,daily_budget,lifetime_budget,start_time,stop_time',
      limit: 500,
    });
  }

  private async fetchAdSetsForAccount(adAccountId: string, accessToken: string) {
    return this.safeGraphGetAll<MetaAdSetPayload>(`act_${adAccountId}/adsets`, accessToken, {
      fields: 'id,name,status,campaign_id,daily_budget,lifetime_budget',
      limit: 500,
    });
  }

  private async fetchAdsForAccount(adAccountId: string, accessToken: string) {
    return this.safeGraphGetAll<MetaAdPayload>(`act_${adAccountId}/ads`, accessToken, {
      fields: 'id,name,status,effective_status,campaign_id,adset_id,creative{id,name}',
      limit: 500,
    });
  }

  private async fetchCreative(creativeId: string, accessToken: string) {
    try {
      return await this.graphGet<MetaCreativePayload>(creativeId, accessToken, {
        fields: 'id,name,title,body,image_url,video_id,url_tags,object_story_id',
      });
    } catch (error) {
      this.logger.warn(
        `Nao foi possivel buscar creative ${creativeId}: ${this.getErrorMessage(error)}`,
      );
      return null;
    }
  }

  private async fetchInsightsForAccount(
    adAccountId: string,
    accessToken: string,
    level: MetaInsightLevel = 'campaign',
  ) {
    const levelFields =
      level === 'ad'
        ? 'campaign_id,campaign_name,adset_id,adset_name,ad_id,ad_name'
        : level === 'adset'
          ? 'campaign_id,campaign_name,adset_id,adset_name'
          : 'campaign_id,campaign_name';

    return this.safeGraphGetAll<MetaInsightPayload>(`act_${adAccountId}/insights`, accessToken, {
      fields: `${levelFields},date_start,spend,impressions,clicks,cpc,ctr,reach,frequency,actions`,
      level,
      time_increment: 1,
      date_preset: 'last_30d',
      limit: 500,
    });
  }

  private extractConversationCount(
    actions?: Array<{ action_type?: string; value?: string }>,
  ): number {
    if (!actions) {
      return 0;
    }

    const conversationAction = actions.find(
      ({ action_type }) =>
        action_type === 'onsite_conversion.messaging_conversation_started_7d' ||
        action_type === 'messaging_conversation_started_7d',
    );
    const value = Number(conversationAction?.value ?? 0);
    return Number.isFinite(value) && value >= 0 ? value : 0;
  }

  private async fetchLeadDetails(leadId: string, accessToken: string) {
    return this.graphGet<MetaLeadPayload>(leadId, accessToken, {
      fields: 'id,created_time,field_data,form_id,ad_id,adgroup_id,campaign_id,is_organic',
    });
  }

  private async fetchLeadFormLeads(formId: string, accessToken: string) {
    return this.graphGetAll<MetaLeadPayload>(`${formId}/leads`, accessToken, {
      fields: 'id,created_time,field_data,form_id,ad_id,adgroup_id,campaign_id,is_organic',
      limit: 100,
    });
  }

  private async exchangeCodeForToken(args: {
    code: string;
    redirectUri: string;
    appId: string;
    appSecret: string;
  }) {
    return this.graphGet<{
      access_token: string;
      token_type?: string;
      expires_in?: string | number;
    }>('oauth/access_token', '', {
      client_id: args.appId,
      client_secret: args.appSecret,
      redirect_uri: args.redirectUri,
      code: args.code,
    });
  }

  /**
   * Troca o token curto (~1-2h) que sai do code exchange por um token de
   * longa duracao (~60 dias). Sem isso, a conexao Meta expira em horas e o
   * sync/webhook de leads para. Se a troca falhar, devolvemos o token curto
   * com um aviso — melhor uma conexao curta do que quebrar o fluxo de OAuth.
   */
  private async exchangeForLongLivedToken(args: {
    shortLivedToken: string;
    appId: string;
    appSecret: string;
  }): Promise<{ access_token: string; token_type?: string; expires_in?: string | number }> {
    try {
      const response = await this.graphGet<{
        access_token: string;
        token_type?: string;
        expires_in?: string | number;
      }>('oauth/access_token', '', {
        grant_type: 'fb_exchange_token',
        client_id: args.appId,
        client_secret: args.appSecret,
        fb_exchange_token: args.shortLivedToken,
      });

      if (!response.access_token) {
        throw new Error('resposta sem access_token');
      }

      return response;
    } catch (error) {
      this.logger.warn(
        `Falha ao trocar token Meta por long-lived; mantendo token curto: ${this.getErrorMessage(
          error,
        )}`,
      );
      return { access_token: args.shortLivedToken };
    }
  }

  private async graphGet<T>(pathOrUrl: string, accessToken: string, params: StringMap = {}) {
    const url = this.createGraphUrl(pathOrUrl);

    if (accessToken && !url.searchParams.has('access_token')) {
      url.searchParams.set('access_token', accessToken);
    }

    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && !url.searchParams.has(key)) {
        url.searchParams.set(key, String(value));
      }
    }

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
      redirect: 'error',
      signal: AbortSignal.timeout(15_000),
    });

    const payload = await this.readGraphPayload<T>(response);

    if (!response.ok || this.hasGraphError(payload)) {
      const message = this.getGraphErrorMessage(payload) ?? `Erro Meta Graph (${response.status})`;
      if (this.isMetaGraphRateLimited(message)) {
        throw new HttpException(
          'Limite de requisicoes da Meta atingido. Aguarde alguns minutos e tente novamente.',
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
      throw new BadRequestException(message);
    }

    return payload as T;
  }

  private async graphPost<T>(
    pathOrUrl: string,
    accessToken: string,
    body?: Record<string, unknown>,
    params: StringMap = {},
  ) {
    const url = this.createGraphUrl(pathOrUrl);

    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && !url.searchParams.has(key)) {
        url.searchParams.set(key, String(value));
      }
    }

    const response = await fetch(url.toString(), {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${accessToken}`,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      redirect: 'error',
      signal: AbortSignal.timeout(15_000),
    });

    const payload = await this.readGraphPayload<T>(response);

    if (!response.ok || this.hasGraphError(payload)) {
      const message = this.getGraphErrorMessage(payload) ?? `Erro Meta Graph (${response.status})`;
      if (this.isMetaGraphRateLimited(message)) {
        throw new HttpException(
          'Limite de requisicoes da Meta atingido. Aguarde alguns minutos e tente novamente.',
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
      throw new BadRequestException(message);
    }

    return payload as T;
  }

  private async graphPostForm<T>(pathOrUrl: string, accessToken: string, form: FormData) {
    const url = this.createGraphUrl(pathOrUrl);
    const response = await fetch(url.toString(), {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: form,
      redirect: 'error',
      signal: AbortSignal.timeout(15_000),
    });

    const payload = await this.readGraphPayload<T>(response);
    if (!response.ok || this.hasGraphError(payload)) {
      const message = this.getGraphErrorMessage(payload) ?? `Erro Meta Graph (${response.status})`;
      throw new BadRequestException(message);
    }
    return payload as T;
  }

  private async graphGetAll<T>(path: string, accessToken: string, params: StringMap = {}) {
    const items: T[] = [];
    let nextPath: string | null = path;
    let currentParams: StringMap | undefined = params;
    let pages = 0;

    while (nextPath && pages < this.maxGraphPages) {
      const page: GraphListResponse<T> = await this.graphGet<GraphListResponse<T>>(
        nextPath,
        accessToken,
        currentParams,
      );
      items.push(...(page.data ?? []));
      nextPath = page.paging?.next ?? null;
      currentParams = undefined;
      pages += 1;
    }

    if (nextPath) {
      this.logger.warn(
        `Paginacao Graph truncada em ${this.maxGraphPages} paginas para "${path}" (${items.length} itens); ha mais dados nao carregados.`,
      );
    }

    return items;
  }

  private async safeGraphGetAll<T>(path: string, accessToken: string, params: StringMap = {}) {
    try {
      return await this.graphGetAll<T>(path, accessToken, params);
    } catch (error) {
      this.logger.warn(`Falha ao buscar ${path}: ${this.getErrorMessage(error)}`);
      return [];
    }
  }

  private createGraphUrl(pathOrUrl: string) {
    if (pathOrUrl.startsWith('http://') || pathOrUrl.startsWith('https://')) {
      return assertMetaGraphUrl(pathOrUrl);
    }

    const normalizedPath = pathOrUrl.replace(/^\/+/, '');
    return assertMetaGraphUrl(
      `https://graph.facebook.com/${this.getApiVersion()}/${normalizedPath}`,
    );
  }

  private buildAuthUrl(appId: string, redirectUri: string, state: string, scopes: string[]) {
    const url = new URL(`https://www.facebook.com/${this.getApiVersion()}/dialog/oauth`);
    url.searchParams.set('client_id', appId);
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('state', state);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', scopes.join(','));
    return url.toString();
  }

  private async getClientOrThrow(clientId: string) {
    const client = await this.db.client.findUnique({
      where: { id: clientId },
    });

    if (!client) {
      throw new NotFoundException('Cliente nao encontrado');
    }

    return client;
  }

  private async assertMetaClientAccess(user: AuthenticatedUser, clientId: string) {
    await this.getClientOrThrow(clientId);
    if (user.role === Role.CLIENTE) {
      if (user.client_id !== clientId) {
        throw new ForbiddenException('Acesso negado a este cliente');
      }
    }
    // Gestor e papel global: qualquer gestor acessa qualquer empresa.
    // O token do Meta continua do gestor que fez o OAuth (client.gestor_id).
  }

  private async getGestorMetaSelectionSessionOrThrow(
    gestorId: string,
  ): Promise<MetaSelectionSession> {
    const user = await this.db.user.findUnique({
      where: { id: gestorId },
      select: {
        meta_gestor_access_token: true,
        meta_gestor_token_expires_at: true,
        meta_gestor_scopes: true,
        role: true,
      },
    });

    if (!user?.meta_gestor_access_token || user.role !== Role.GESTOR) {
      throw new BadRequestException(
        'Conta Meta do gestor nao conectada. Conecte em Configuracoes / dashboard do gestor.',
      );
    }

    if (
      user.meta_gestor_token_expires_at &&
      user.meta_gestor_token_expires_at.getTime() < Date.now() - 60_000
    ) {
      throw new BadRequestException('Token Meta do gestor expirou. Reconecte no dashboard.');
    }

    const businesses = await this.fetchBusinesses(user.meta_gestor_access_token);

    return {
      accessToken: user.meta_gestor_access_token,
      scopes: user.meta_gestor_scopes ?? [],
      tokenExpiresAt: user.meta_gestor_token_expires_at?.toISOString() ?? null,
      state: null,
      businesses,
    };
  }

  private async enrichBusinessesForAccessToken(
    accessToken: string,
    businesses: MetaBusinessSummary[],
  ) {
    return Promise.all(
      businesses.map(async (business) => {
        const [adAccounts, pages, wabas] = await Promise.all([
          this.fetchBusinessAdAccounts(business.id, accessToken),
          this.fetchBusinessPages(business.id, accessToken),
          this.fetchBusinessWabas(business.id, accessToken),
        ]);
        const forms = await this.fetchLeadForms(
          pages.map((page) => page.id),
          accessToken,
        );
        const whatsappAccounts = await Promise.all(
          wabas.map(async (waba) => {
            const phoneNumbers = await this.fetchWabaPhoneNumbers(waba.id, accessToken);
            const firstPhone = phoneNumbers[0];
            return {
              id: waba.id,
              name: waba.name ?? `WABA ${waba.id}`,
              phone_number_id: firstPhone?.id,
              display_phone_number: firstPhone?.display_phone_number,
            };
          }),
        );

        return {
          id: business.id,
          name: business.name ?? `BM ${business.id}`,
          ad_accounts: adAccounts.map((account) => ({
            id: this.normalizeAdAccountId(account),
            name: account.name ?? this.normalizeAdAccountId(account),
          })),
          pages: pages.map((page) => ({
            id: page.id,
            name: page.name ?? page.id,
          })),
          forms: forms.map((form) => ({
            id: form.id,
            name: form.name ?? form.id,
            page_id: form.page_id,
          })),
          whatsapp_accounts: whatsappAccounts,
        };
      }),
    );
  }

  private async loadOauthSession(oauthSessionId: string) {
    const rawSession = await this.redis.client.get(this.getOauthSessionKey(oauthSessionId));
    if (!rawSession) {
      throw new BadRequestException('Sessao OAuth Meta expirada ou invalida');
    }

    return this.parseJson<MetaOauthSessionCache>(rawSession, 'Sessao OAuth Meta invalida');
  }

  private getOauthStateKey(state: string) {
    return `meta:oauth:state:${state}`;
  }

  private getOauthSessionKey(sessionId: string) {
    return `meta:oauth:session:${sessionId}`;
  }

  private getApiVersion() {
    return this.configService.get<string>('META_API_VERSION') ?? 'v23.0';
  }

  private getMetaScopes() {
    const scopes =
      this.configService.get<string>('META_SCOPES') ??
      'business_management,ads_read,leads_retrieval,pages_show_list,pages_read_engagement,pages_manage_ads,whatsapp_business_management,whatsapp_business_messaging';

    return scopes
      .split(',')
      .map((scope) => scope.trim())
      .filter(Boolean);
  }

  /** META_APP_ID or legacy FACEBOOK_APP_ID from .env */
  private getMetaAppId() {
    const value =
      this.configService.get<string>('META_APP_ID')?.trim() ||
      this.configService.get<string>('FACEBOOK_APP_ID')?.trim();
    if (!value) {
      throw new ServiceUnavailableException(
        'Integracao Meta nao configurada: defina META_APP_ID ou FACEBOOK_APP_ID no .env (veja .env.example).',
      );
    }
    return value;
  }

  private getMetaAppSecret() {
    const value =
      this.configService.get<string>('META_APP_SECRET')?.trim() ||
      this.configService.get<string>('FACEBOOK_APP_SECRET')?.trim();
    if (!value) {
      throw new ServiceUnavailableException(
        'Integracao Meta nao configurada: defina META_APP_SECRET ou FACEBOOK_APP_SECRET no .env.',
      );
    }
    return value;
  }

  /**
   * Must match exactly the redirect URI configured in the Meta app.
   * In development, defaults to localhost API callback if unset.
   */
  private getMetaRedirectUri() {
    const explicit =
      this.configService.get<string>('META_REDIRECT_URI')?.trim() ||
      this.configService.get<string>('FACEBOOK_REDIRECT_URI')?.trim();
    const nodeEnv = (this.configService.get<string>('NODE_ENV') ?? 'development').toLowerCase();
    const port = this.configService.get<number>('PORT') ?? 3000;
    const prefix = (this.configService.get<string>('API_PREFIX') ?? 'api').replace(
      /^\/+|\/+$/g,
      '',
    );
    const localRedirectUri = `http://localhost:${port}/${prefix}/meta/connect/callback/window`;

    if (nodeEnv !== 'production') {
      if (!explicit) {
        return localRedirectUri;
      }

      try {
        const parsed = new URL(explicit);
        if (['localhost', '127.0.0.1', '::1'].includes(parsed.hostname)) {
          return explicit;
        }
      } catch {
        // Se o valor estiver malformado, deixamos a validação de ambiente apontar o erro.
      }

      this.logger.warn(
        `Ignorando META_REDIRECT_URI não-local em desenvolvimento (${explicit}); usando ${localRedirectUri}.`,
      );
      return localRedirectUri;
    }

    if (explicit) {
      return explicit;
    }

    if (nodeEnv === 'production') {
      throw new ServiceUnavailableException(
        'Integracao Meta: defina META_REDIRECT_URI (callback OAuth) nas variaveis de ambiente.',
      );
    }

    return localRedirectUri;
  }

  private parseJson<T>(value: string, errorMessage: string) {
    try {
      return JSON.parse(value) as T;
    } catch {
      throw new InternalServerErrorException(errorMessage);
    }
  }

  private async readGraphPayload<T>(
    response: Response,
  ): Promise<(T & GraphErrorPayload) | string | null> {
    const raw = await response.text();
    if (!raw.trim()) {
      return null;
    }

    try {
      return JSON.parse(raw) as T & GraphErrorPayload;
    } catch {
      return raw;
    }
  }

  private hasGraphError(payload: unknown) {
    return Boolean(this.getGraphErrorMessage(payload));
  }

  private getGraphErrorMessage(payload: unknown) {
    if (typeof payload === 'string') {
      return payload.trim() || null;
    }

    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return null;
    }

    const error = (payload as GraphErrorPayload).error;
    if (!error?.message?.trim()) {
      return null;
    }

    return error.message.trim();
  }

  private buildAssetSelectionRows(args: {
    metaConnectionId: string;
    selectedAdAccounts: MetaAdAccountSummary[];
    selectedPages: MetaPageSummary[];
    selectedForms: MetaLeadFormSummary[];
    selectedWabaId?: string;
    phoneNumberId?: string;
  }) {
    const rows: Array<Record<string, unknown>> = [];
    let primaryAssigned = false;

    for (const account of args.selectedAdAccounts) {
      rows.push({
        meta_connection_id: args.metaConnectionId,
        ad_account_id: this.normalizeAdAccountId(account),
        ad_account_name: account.name ?? this.normalizeAdAccountId(account),
        is_primary: !primaryAssigned,
      });
      primaryAssigned = true;
    }

    for (const page of args.selectedPages) {
      rows.push({
        meta_connection_id: args.metaConnectionId,
        page_id: page.id,
        page_name: page.name ?? page.id,
        is_primary: !primaryAssigned,
      });
      primaryAssigned = true;
    }

    for (const form of args.selectedForms) {
      rows.push({
        meta_connection_id: args.metaConnectionId,
        page_id: form.page_id ?? null,
        form_id: form.id,
        form_name: form.name ?? form.id,
        is_primary: !primaryAssigned,
      });
      primaryAssigned = true;
    }

    if (args.selectedWabaId || args.phoneNumberId) {
      rows.push({
        meta_connection_id: args.metaConnectionId,
        waba_id: args.selectedWabaId ?? null,
        phone_number_id: args.phoneNumberId ?? null,
        is_primary: !primaryAssigned,
      });
    }

    return rows;
  }

  private resolveSelectedIds(allIds: string[], requestedIds?: string[]) {
    const normalizedRequested = requestedIds?.map((id) => id.trim()).filter(Boolean) ?? [];

    if (normalizedRequested.length === 0) {
      return allIds;
    }

    return allIds.filter((id) => normalizedRequested.includes(id));
  }

  private normalizeAdAccountId(account: MetaAdAccountSummary) {
    const candidate = account.account_id ?? account.id;
    return candidate.replace(/^act_/, '');
  }

  private uniqueBy<T>(items: T[], selector: (item: T) => string) {
    const map = new Map<string, T>();

    for (const item of items) {
      map.set(selector(item), item);
    }

    return Array.from(map.values());
  }

  private uniqueStrings(values: Array<string | null | undefined>) {
    return Array.from(new Set(values.filter((value): value is string => Boolean(value))));
  }

  private toDate(value?: string | null) {
    if (!value) {
      return undefined;
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return undefined;
    }

    return date;
  }

  private parseInteger(value: string | number | undefined) {
    if (value === undefined || value === null || value === '') {
      return undefined;
    }

    const parsed = Number.parseInt(String(value), 10);
    return Number.isNaN(parsed) ? undefined : parsed;
  }

  private toDecimalValue(value?: string | number | null) {
    if (value === undefined || value === null || value === '') {
      return undefined;
    }

    return new Prisma.Decimal(String(value));
  }

  private toJsonValue(value: unknown): Prisma.InputJsonValue {
    return JSON.parse(JSON.stringify(value ?? {})) as Prisma.InputJsonValue;
  }

  private extractLeadCount(actions?: Array<{ action_type?: string; value?: string }>) {
    if (!actions) {
      return undefined;
    }

    const leadAction = actions.find((action) =>
      ['lead', 'leadgen.other', 'onsite_conversion.lead_grouped'].includes(
        action.action_type ?? '',
      ),
    );

    return this.parseInteger(leadAction?.value);
  }

  private pickFieldValue(
    fieldData: Array<{
      name?: string;
      values?: string[];
    }>,
    aliases: string[],
  ) {
    const normalizedAliases = aliases.map((alias) => alias.toLowerCase());

    for (const field of fieldData) {
      const fieldName = field.name?.toLowerCase();
      if (fieldName && normalizedAliases.includes(fieldName)) {
        const firstValue = field.values?.find((value) => Boolean(value?.trim()));
        if (firstValue) {
          return firstValue.trim();
        }
      }
    }

    return undefined;
  }

  private readString(value: unknown) {
    return typeof value === 'string' && value.trim() ? value.trim() : undefined;
  }

  private readNumber(value: unknown) {
    return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
  }

  private readRecord(value: unknown) {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : undefined;
  }

  private readArray<T>(value: unknown) {
    return Array.isArray(value) ? (value as T[]) : [];
  }

  private getErrorMessage(error: unknown) {
    if (error instanceof Error) {
      return error.message;
    }

    return 'Erro desconhecido';
  }
}
