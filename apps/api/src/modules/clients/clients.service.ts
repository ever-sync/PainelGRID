import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Client, Prisma } from '@prisma/client';
import { Role } from '../../common/types';
import { assertSafeWebhookUrl } from '../../common/outbound-url.util';
import { PrismaService } from '../../config/prisma.service';
import { RedisService } from '../../config/redis.service';
import { AuthenticatedUser } from '../auth/auth.types';
import { provisionDefaultCrmPipeline } from '../crm/default-crm-pipeline';
import { type CrmStageStatusRule, withCrmStageStatusRules } from './client-settings';
import { CreateClientDto } from './dto/create-client.dto';
import { UpdateClientDto } from './dto/update-client.dto';

const CLIENT_CACHE_TTL_SECONDS = 5 * 60; // 5 min
const clientCacheKey = (clientId: string) => `clients:item:${clientId}`;
const clientOwnerCacheKey = (gestorId: string, clientId: string) =>
  `clients:owner:${gestorId}:${clientId}`;

/** API shape: never expose facebook_access_token; include primary ad account id for UI. */
export type ClientListItem = Omit<Client, 'facebook_access_token'> & {
  leads_count: number;
  events_count: number;
  vehicles_count: number;
  facebook_ad_account_id: string | null;
};

const clientListInclude = {
  _count: {
    select: { leads: { where: { deleted_at: null } }, event_participations: true, vehicles: true },
  },
  facebook_ad_accounts: {
    where: { status: 'active' },
    orderBy: { created_at: 'asc' as const },
    take: 1,
    select: { ad_account_id: true },
  },
} as const;

@Injectable()
export class ClientsService {
  private readonly logger = new Logger(ClientsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  /** Invalida cache para um cliente — chamado em update/delete. */
  private async invalidateClientCache(clientId: string, gestorId?: string | null) {
    try {
      await this.redis.client.del(clientCacheKey(clientId));
      if (gestorId) {
        await this.redis.client.del(clientOwnerCacheKey(gestorId, clientId));
      }
    } catch (err) {
      this.logger.warn(
        `Falha ao invalidar cache de cliente ${clientId}: ${(err as Error).message}`,
      );
    }
  }

  private buildSettings(
    currentSettings: unknown,
    patch: {
      address?: string | null;
      contact_email?: string | null;
      address_street?: string | null;
      address_number?: string | null;
      address_complement?: string | null;
      address_district?: string | null;
      address_city?: string | null;
      address_state?: string | null;
      address_zipcode?: string | null;
      is_active?: boolean;
      crm_stage_status_rules?: CrmStageStatusRule[] | null;
    },
  ): Prisma.InputJsonValue {
    const base =
      currentSettings && typeof currentSettings === 'object' && !Array.isArray(currentSettings)
        ? ({ ...(currentSettings as Record<string, Prisma.InputJsonValue>) } as Record<
            string,
            Prisma.InputJsonValue
          >)
        : {};

    if (patch.address !== undefined) {
      const value = patch.address?.trim() ?? '';
      if (value) base.address = value;
      else delete base.address;
    }

    if (patch.contact_email !== undefined) {
      const value = patch.contact_email?.trim() ?? '';
      if (value) base.contact_email = value;
      else delete base.contact_email;
    }

    if (patch.address_street !== undefined) {
      const value = patch.address_street?.trim() ?? '';
      if (value) base.address_street = value;
      else delete base.address_street;
    }

    if (patch.address_number !== undefined) {
      const value = patch.address_number?.trim() ?? '';
      if (value) base.address_number = value;
      else delete base.address_number;
    }

    if (patch.address_complement !== undefined) {
      const value = patch.address_complement?.trim() ?? '';
      if (value) base.address_complement = value;
      else delete base.address_complement;
    }

    if (patch.address_district !== undefined) {
      const value = patch.address_district?.trim() ?? '';
      if (value) base.address_district = value;
      else delete base.address_district;
    }

    if (patch.address_city !== undefined) {
      const value = patch.address_city?.trim() ?? '';
      if (value) base.address_city = value;
      else delete base.address_city;
    }

    if (patch.address_state !== undefined) {
      const value = patch.address_state?.trim() ?? '';
      if (value) base.address_state = value;
      else delete base.address_state;
    }

    if (patch.address_zipcode !== undefined) {
      const value = patch.address_zipcode?.trim() ?? '';
      if (value) base.address_zipcode = value;
      else delete base.address_zipcode;
    }

    if (patch.is_active !== undefined) {
      base.is_active = patch.is_active;
    }

    return withCrmStageStatusRules(base, patch.crm_stage_status_rules);
  }

  private toListItem(
    row: Client & {
      _count: { leads: number; event_participations: number; vehicles: number };
      facebook_ad_accounts: { ad_account_id: string }[];
    },
  ): ClientListItem {
    const { _count, facebook_access_token: _token, facebook_ad_accounts, ...rest } = row;
    return {
      ...rest,
      leads_count: _count.leads,
      events_count: _count.event_participations,
      vehicles_count: _count.vehicles,
      facebook_ad_account_id: facebook_ad_accounts[0]?.ad_account_id ?? null,
    };
  }

  async assertGestorOwnsClient(gestorId: string, clientId: string) {
    const cacheKey = clientOwnerCacheKey(gestorId, clientId);

    // Hot path: cache hit confirma ownership sem ir no Postgres.
    try {
      const cached = await this.redis.client.get(cacheKey);
      if (cached) {
        return JSON.parse(cached) as Client;
      }
    } catch (err) {
      this.logger.warn(`Cache miss por erro: ${(err as Error).message}`);
    }

    const client = await this.prisma.client.findFirst({
      where: { id: clientId, gestor_id: gestorId },
    });

    if (!client) {
      throw new ForbiddenException('Cliente nao encontrado ou sem permissao');
    }

    try {
      await this.redis.client.set(cacheKey, JSON.stringify(client), 'EX', CLIENT_CACHE_TTL_SECONDS);
    } catch (err) {
      this.logger.warn(`Falha ao salvar cache: ${(err as Error).message}`);
    }

    return client;
  }

  async findAllForUser(user: AuthenticatedUser): Promise<ClientListItem[]> {
    if (user.role === Role.GESTOR) {
      const rows = await this.prisma.client.findMany({
        where: { gestor_id: user.sub },
        orderBy: { created_at: 'desc' },
        include: clientListInclude,
      });

      return rows.map((row) => this.toListItem(row));
    }

    if (user.role === Role.CLIENTE) {
      if (!user.client_id) {
        throw new ForbiddenException('Usuario sem empresa vinculada');
      }

      const row = await this.prisma.client.findUnique({
        where: { id: user.client_id },
        include: clientListInclude,
      });

      if (!row) {
        throw new NotFoundException('Cliente nao encontrado');
      }

      return [this.toListItem(row)];
    }

    throw new ForbiddenException('Sem permissao para listar clientes');
  }

  async findOneForUser(user: AuthenticatedUser, id: string): Promise<ClientListItem> {
    await this.ensureReadAccess(user, id);

    const row = await this.prisma.client.findUnique({
      where: { id },
      include: clientListInclude,
    });

    if (!row) {
      throw new NotFoundException('Cliente nao encontrado');
    }

    return this.toListItem(row);
  }

  async create(dto: CreateClientDto, gestorId: string): Promise<ClientListItem> {
    const webhookUrl = dto.webhook_url_n8n?.trim()
      ? await this.validateWebhookUrl(dto.webhook_url_n8n)
      : null;
    const settings = this.buildSettings(
      {},
      {
        address: dto.address ?? undefined,
        contact_email: dto.contact_email ?? undefined,
        address_street: dto.address_street ?? undefined,
        address_number: dto.address_number ?? undefined,
        address_complement: dto.address_complement ?? undefined,
        address_district: dto.address_district ?? undefined,
        address_city: dto.address_city ?? undefined,
        address_state: dto.address_state ?? undefined,
        address_zipcode: dto.address_zipcode ?? undefined,
        is_active: dto.is_active ?? true,
      },
    );

    const row = await this.prisma.$transaction(
      async (tx) => {
        const client = await tx.client.create({
          data: {
            gestor_id: gestorId,
            company_name: dto.company_name.trim(),
            cnpj: dto.cnpj?.trim() ?? null,
            plan: dto.plan?.trim() || 'basic',
            logo_url: dto.logo_url ?? null,
            webhook_url_n8n: webhookUrl,
            phone_number: dto.phone_number?.trim() ?? null,
            whatsapp_number: dto.whatsapp_number?.trim() ?? null,
            settings,
          },
          include: clientListInclude,
        });

        await provisionDefaultCrmPipeline(tx, client.id);
        return client;
      },
      { maxWait: 10_000, timeout: 20_000 },
    );

    return this.toListItem(row);
  }

  async updateForUser(
    user: AuthenticatedUser,
    id: string,
    dto: UpdateClientDto,
  ): Promise<ClientListItem> {
    if (user.role === Role.GESTOR) {
      await this.assertGestorOwnsClient(user.sub, id);
      await this.invalidateClientCache(id, user.sub);
    } else if (user.role === Role.CLIENTE && user.client_id === id) {
      if (
        dto.plan !== undefined ||
        dto.is_active !== undefined ||
        dto.webhook_url_n8n !== undefined ||
        dto.crm_stage_status_rules !== undefined
      ) {
        throw new ForbiddenException('Campos administrativos exigem acesso de gestor');
      }
    } else {
      throw new ForbiddenException('Sem permissao para editar esta empresa');
    }

    const current = await this.prisma.client.findUnique({
      where: { id },
      select: { settings: true },
    });

    const hasSettingsPatch =
      dto.address !== undefined ||
      dto.contact_email !== undefined ||
      dto.address_street !== undefined ||
      dto.address_number !== undefined ||
      dto.address_complement !== undefined ||
      dto.address_district !== undefined ||
      dto.address_city !== undefined ||
      dto.address_state !== undefined ||
      dto.address_zipcode !== undefined ||
      dto.is_active !== undefined ||
      dto.crm_stage_status_rules !== undefined;

    const webhookUrl =
      dto.webhook_url_n8n === undefined
        ? undefined
        : dto.webhook_url_n8n?.trim()
          ? await this.validateWebhookUrl(dto.webhook_url_n8n)
          : null;

    const row = await this.prisma.client.update({
      where: { id },
      data: {
        company_name: dto.company_name?.trim(),
        cnpj: dto.cnpj === undefined ? undefined : (dto.cnpj?.trim() ?? null),
        plan: dto.plan?.trim(),
        logo_url: dto.logo_url,
        webhook_url_n8n: webhookUrl,
        phone_number:
          dto.phone_number === undefined ? undefined : (dto.phone_number?.trim() ?? null),
        whatsapp_number:
          dto.whatsapp_number === undefined ? undefined : (dto.whatsapp_number?.trim() ?? null),
        settings: hasSettingsPatch
          ? this.buildSettings(current?.settings, {
              address: dto.address,
              contact_email: dto.contact_email,
              address_street: dto.address_street,
              address_number: dto.address_number,
              address_complement: dto.address_complement,
              address_district: dto.address_district,
              address_city: dto.address_city,
              address_state: dto.address_state,
              address_zipcode: dto.address_zipcode,
              is_active: dto.is_active,
              crm_stage_status_rules: dto.crm_stage_status_rules ?? undefined,
            })
          : undefined,
      },
      include: clientListInclude,
    });

    return this.toListItem(row);
  }

  private async ensureReadAccess(user: AuthenticatedUser, clientId: string) {
    if (user.role === Role.GESTOR) {
      await this.assertGestorOwnsClient(user.sub, clientId);
      return;
    }

    if (user.role === Role.CLIENTE && user.client_id === clientId) {
      return;
    }

    throw new ForbiddenException('Sem permissao para este cliente');
  }

  private async validateWebhookUrl(raw: string): Promise<string> {
    try {
      return await assertSafeWebhookUrl(raw);
    } catch (error) {
      throw new BadRequestException((error as Error).message);
    }
  }

  async deleteForUser(user: AuthenticatedUser, clientId: string) {
    if (user.role !== Role.GESTOR) {
      throw new ForbiddenException('Apenas gestor pode excluir empresa');
    }

    await this.assertGestorOwnsClient(user.sub, clientId);
    await this.invalidateClientCache(clientId, user.sub);

    await this.prisma.$transaction(
      async (tx) => {
        await tx.apiIdempotencyRequest.deleteMany({ where: { client_id: clientId } });
        await tx.webhookEvent.deleteMany({ where: { client_id: clientId } });

        await tx.scoreEvent.deleteMany({ where: { client_id: clientId } });
        await tx.sale.deleteMany({ where: { client_id: clientId } });
        await tx.appointment.deleteMany({ where: { client_id: clientId } });
        await tx.agentActionLog.deleteMany({ where: { client_id: clientId } });
        await tx.conversationState.deleteMany({ where: { client_id: clientId } });
        await tx.whatsAppAttributionEvent.deleteMany({ where: { client_id: clientId } });

        await tx.metaDailyInsight.deleteMany({ where: { client_id: clientId } });
        await tx.metaLeadImport.deleteMany({ where: { client_id: clientId } });
        await tx.metaLeadForm.deleteMany({ where: { client_id: clientId } });
        await tx.metaCreative.deleteMany({ where: { client_id: clientId } });
        await tx.metaAd.deleteMany({ where: { client_id: clientId } });
        await tx.metaAdSet.deleteMany({ where: { client_id: clientId } });
        await tx.metaCampaign.deleteMany({ where: { client_id: clientId } });
        await tx.metaSyncJob.deleteMany({ where: { client_id: clientId } });
        await tx.metaAssetSelection.deleteMany({
          where: { meta_connection: { client_id: clientId } },
        });
        await tx.metaConnection.deleteMany({ where: { client_id: clientId } });

        await tx.facebookAdAccount.deleteMany({ where: { client_id: clientId } });
        await tx.message.deleteMany({ where: { conversation: { client_id: clientId } } });
        await tx.conversation.deleteMany({ where: { client_id: clientId } });
        await tx.campaignVendor.deleteMany({ where: { campaign: { client_id: clientId } } });
        await tx.campaign.deleteMany({ where: { client_id: clientId } });
        await tx.crmHistory.deleteMany({ where: { lead: { client_id: clientId } } });
        await tx.lead.updateMany({
          where: { client_id: clientId },
          data: {
            crm_pipeline_id: null,
            crm_stage_id: null,
            event_interest_id: null,
            campaign_id: null,
            assigned_vendor_id: null,
          },
        });
        await tx.crmStage.deleteMany({ where: { client_id: clientId } });
        await tx.crmPipeline.deleteMany({ where: { client_id: clientId } });
        await tx.event.deleteMany({ where: { client_id: clientId } });
        await tx.lead.deleteMany({ where: { client_id: clientId } });
        await tx.courseProgress.deleteMany({ where: { vendor: { client_id: clientId } } });
        await tx.salesTeamMember.deleteMany({ where: { team: { client_id: clientId } } });
        await tx.salesTeam.deleteMany({ where: { client_id: clientId } });
        await tx.user.deleteMany({ where: { client_id: clientId } });
        await tx.client.delete({ where: { id: clientId } });
      },
      { maxWait: 10_000, timeout: 60_000 },
    );

    return { deleted: true };
  }
}
