import { ConfigService } from '@nestjs/config';
import { ForbiddenException } from '@nestjs/common';
import { createHmac } from 'crypto';
import { Role } from '../../common/types';
import { AuthenticatedUser } from '../auth/auth.types';
import { PrismaService } from '../../config/prisma.service';
import { RedisService } from '../../config/redis.service';
import { RealtimeEventsService } from '../realtime/realtime-events.service';
import { MetaService } from './meta.service';

describe('MetaService', () => {
  const prisma = {
    client: {
      findUnique: jest.fn(),
    },
    metaConnection: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    metaAssetSelection: {
      findMany: jest.fn(),
    },
    metaCampaignAssignment: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      upsert: jest.fn(),
      delete: jest.fn(),
    },
    metaDailyInsight: {
      aggregate: jest.fn(),
    },
    event: {
      findUnique: jest.fn(),
    },
    metaSyncJob: {
      create: jest.fn(),
      update: jest.fn(),
    },
    metaLeadImport: {
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
    lead: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    metaLeadForm: {
      findFirst: jest.fn(),
    },
  };

  const redis = {
    client: {
      get: jest.fn(),
      set: jest.fn(),
      del: jest.fn(),
    },
  };

  const config = {
    get: jest.fn(),
  };

  const realtime = {
    emitToClient: jest.fn(),
  };

  const metaSyncQueue = {
    // `enqueueJob` envolve o add em `withTimeout`, que encadeia `.then`:
    // o mock precisa devolver promise.
    add: jest.fn().mockResolvedValue({ id: 'job-queue-1' }),
  };

  let service: MetaService;

  beforeEach(() => {
    jest.clearAllMocks();
    config.get.mockReset();
    service = new MetaService(
      prisma as unknown as PrismaService,
      redis as unknown as RedisService,
      config as unknown as ConfigService,
      realtime as unknown as RealtimeEventsService,
      { dispatch: jest.fn() } as never,
      metaSyncQueue as never,
    );
  });

  it('rejeita webhook Meta sem assinatura valida ou sem corpo bruto', async () => {
    const rawBody = Buffer.from('{"object":"page"}');
    config.get.mockImplementation((key: string) =>
      key === 'META_APP_SECRET' ? 'meta-secret' : undefined,
    );

    await expect(service.receiveWebhook({ object: 'page' }, undefined, rawBody)).rejects.toThrow(
      ForbiddenException,
    );
    await expect(
      service.receiveWebhook({ object: 'page' }, 'sha256=invalid', rawBody),
    ).rejects.toThrow(ForbiddenException);

    const signature = `sha256=${createHmac('sha256', 'meta-secret')
      .update(rawBody)
      .digest('hex')}`;
    await expect(
      service.receiveWebhook({ object: 'page' }, signature, undefined),
    ).rejects.toThrow(ForbiddenException);
  });

  it('cadastra automaticamente leads do formulário da Meta como form_page', async () => {
    const connection = { id: 'conn-1', client_id: 'client-1', access_token: 'token-1' };
    const leadPayload = {
      id: 'meta-lead-1',
      form_id: 'form-1',
      field_data: [
        { name: 'full_name', values: ['Ana Silva'] },
        { name: 'email', values: ['ana@example.com'] },
        { name: 'phone_number', values: ['11999999999'] },
      ],
    };

    prisma.metaLeadImport.findFirst.mockResolvedValue(null);
    prisma.lead.findUnique.mockResolvedValue(null);
    prisma.lead.findFirst.mockResolvedValue(null);
    prisma.lead.findMany.mockResolvedValue([]);
    prisma.lead.create.mockResolvedValue({ id: 'lead-1' });
    prisma.metaLeadImport.create.mockResolvedValue({ id: 'import-1' });

    jest.spyOn(service as any, 'fetchLeadDetails').mockResolvedValue(leadPayload);
    jest.spyOn(service as any, 'resolveConnectionForLeadWebhook').mockResolvedValue(connection);

    const result = await (service as any).processLeadgenWebhook({
      leadgen_id: 'meta-lead-1',
      form_id: 'form-1',
      page_id: 'page-1',
    });

    expect(result).toBe(true);
    expect(prisma.lead.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        client_id: 'client-1',
        name: 'Ana Silva',
        email: 'ana@example.com',
        phone: '+5511999999999',
        source: 'form_page',
        facebook_lead_id: 'meta-lead-1',
      }),
    });
    expect(prisma.metaLeadImport.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        client_id: 'client-1',
        meta_connection_id: 'conn-1',
        lead_id: 'lead-1',
        meta_lead_id: 'meta-lead-1',
        meta_form_id: 'form-1',
      }),
    });
  });

  it('enfileira a importacao de leads antigos da Meta (job pendente)', async () => {
    const connection = { id: 'conn-1', client_id: 'client-1', access_token: 'token-1' };

    prisma.client.findUnique.mockResolvedValue({ id: 'client-1', gestor_id: 'gestor-1' });
    prisma.metaConnection.findFirst.mockResolvedValue(connection);
    prisma.metaAssetSelection.findMany.mockResolvedValue([
      { form_id: 'form-1', form_name: 'Form 1', page_id: 'page-1' },
    ]);
    prisma.metaSyncJob.create.mockResolvedValue({ id: 'job-1' });

    const user: AuthenticatedUser = {
      sub: 'cliente-1',
      email: 'cliente@example.com',
      name: 'Cliente',
      role: Role.CLIENTE,
      client_id: 'client-1',
    };

    const result = await service.importHistoricalLeads(user, { client_id: 'client-1' });

    expect(result).toMatchObject({
      client_id: 'client-1',
      meta_connection_id: 'conn-1',
      sync_job_id: 'job-1',
      status: 'queued',
    });
    expect(prisma.metaSyncJob.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        client_id: 'client-1',
        meta_connection_id: 'conn-1',
        job_type: 'historical_lead_import',
        status: 'pending',
      }),
    });
    expect(metaSyncQueue.add).toHaveBeenCalledWith(
      'historical-leads',
      expect.objectContaining({ metaConnectionId: 'conn-1', jobId: 'job-1' }),
      expect.any(Object),
    );
    // A importacao em si nao roda no request.
    expect(prisma.lead.create).not.toHaveBeenCalled();
  });

  it('importa leads antigos dos formularios selecionados ao rodar o job (worker)', async () => {
    const connection = { id: 'conn-1', client_id: 'client-1', access_token: 'token-1' };
    const leadPayload = {
      id: 'meta-lead-1',
      form_id: 'form-1',
      field_data: [
        { name: 'full_name', values: ['Ana Silva'] },
        { name: 'email', values: ['ana@example.com'] },
        { name: 'phone_number', values: ['11999999999'] },
      ],
    };

    prisma.metaConnection.findUnique.mockResolvedValue(connection);
    prisma.metaAssetSelection.findMany.mockResolvedValue([
      { form_id: 'form-1', form_name: 'Form 1', page_id: 'page-1' },
    ]);
    prisma.metaSyncJob.update.mockResolvedValue({ id: 'job-1' });
    prisma.metaConnection.update.mockResolvedValue(connection);
    prisma.metaLeadImport.findFirst.mockResolvedValue(null);
    prisma.lead.findUnique.mockResolvedValue(null);
    prisma.lead.findFirst.mockResolvedValue(null);
    prisma.lead.findMany.mockResolvedValue([]);
    prisma.lead.create.mockResolvedValue({ id: 'lead-1' });
    prisma.metaLeadImport.create.mockResolvedValue({ id: 'import-1' });

    jest.spyOn(service as any, 'fetchPageAccessToken').mockResolvedValue('page-token-1');
    jest.spyOn(service as any, 'fetchLeadFormLeads').mockResolvedValue([leadPayload]);

    const summary = await service.runHistoricalLeadImport('conn-1', 'job-1', []);

    expect(summary).toMatchObject({ forms: 1, leads_imported: 1 });
    expect(prisma.lead.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        client_id: 'client-1',
        name: 'Ana Silva',
        email: 'ana@example.com',
        phone: '+5511999999999',
        source: 'form_page',
        facebook_lead_id: 'meta-lead-1',
      }),
    });
    expect(prisma.metaLeadImport.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        client_id: 'client-1',
        meta_connection_id: 'conn-1',
        lead_id: 'lead-1',
        meta_lead_id: 'meta-lead-1',
        meta_form_id: 'form-1',
      }),
    });
  });

  describe('investimento do evento', () => {
    const gestor = { sub: 'gestor-1', role: Role.GESTOR } as AuthenticatedUser;

    beforeEach(() => {
      prisma.client.findUnique.mockResolvedValue({ id: 'client-1', gestor_id: 'gestor-1' });
    });

    it('soma o gasto real das campanhas vinculadas ao evento', async () => {
      prisma.event.findUnique.mockResolvedValue({
        id: 'event-1',
        client_id: 'client-1',
        paid_traffic_investment: 500,
      });
      prisma.metaCampaignAssignment.findMany.mockResolvedValue([
        { meta_campaign_id: 'campaign-1' },
        { meta_campaign_id: 'campaign-2' },
      ]);
      prisma.metaDailyInsight.aggregate.mockResolvedValue({
        _sum: { spend: 1234.56, impressions: 9000, clicks: 300, leads: 42 },
      });

      const result = await service.getEventAdSpend(gestor, 'event-1');

      expect(result).toMatchObject({
        linked_campaigns: 2,
        spend: 1234.56,
        source: 'meta',
        leads: 42,
      });
      // O gasto vem das campanhas do evento, nao da conta inteira.
      expect(prisma.metaDailyInsight.aggregate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { level: 'campaign', entity_id: { in: ['campaign-1', 'campaign-2'] } },
        }),
      );
    });

    it('sem campanha vinculada, cai no valor digitado a mao no evento', async () => {
      prisma.event.findUnique.mockResolvedValue({
        id: 'event-1',
        client_id: 'client-1',
        paid_traffic_investment: 500,
      });
      prisma.metaCampaignAssignment.findMany.mockResolvedValue([]);

      const result = await service.getEventAdSpend(gestor, 'event-1');

      expect(result).toMatchObject({ linked_campaigns: 0, spend: 500, source: 'manual' });
      expect(prisma.metaDailyInsight.aggregate).not.toHaveBeenCalled();
    });

    it('recusa vincular campanha a evento de outro cliente', async () => {
      prisma.event.findUnique.mockResolvedValue({ client_id: 'client-2' });

      await expect(
        service.assignCampaign(gestor, {
          meta_campaign_id: 'campaign-1',
          client_id: 'client-1',
          event_id: 'event-de-outro',
        }),
      ).rejects.toThrow('Evento pertence a outro cliente');

      expect(prisma.metaCampaignAssignment.upsert).not.toHaveBeenCalled();
    });
  });

  describe('runFullSyncForConnection com conta de anuncio compartilhada', () => {
    const ADSET_DA_CASA = {
      id: 'adset-1',
      campaign_id: 'campaign-1',
      promoted_object: { page_id: 'page-A' },
    };
    const ADSET_DE_OUTRO_CLIENTE = {
      id: 'adset-2',
      campaign_id: 'campaign-2',
      promoted_object: { page_id: 'page-B' },
    };
    const ADSET_SEM_ATRIBUICAO = { id: 'adset-3', campaign_id: 'campaign-3' };

    const TODAS_AS_CAMPANHAS = [
      { id: 'campaign-1' },
      { id: 'campaign-2' },
      { id: 'campaign-3' },
    ];

    /** Prepara o sync isolando as chamadas de rede; devolve os spies de gravacao. */
    function armarSync({
      compartilhada,
      vinculos = [],
    }: {
      compartilhada: boolean;
      vinculos?: Array<{ meta_campaign_id: string; client_id: string }>;
    }) {
      prisma.metaCampaignAssignment.findMany.mockResolvedValue(vinculos);
      prisma.metaConnection.findUnique.mockResolvedValue({
        id: 'conn-1',
        client_id: 'client-1',
        access_token: 'token-1',
      });
      prisma.metaSyncJob.update.mockResolvedValue({});
      prisma.metaConnection.update.mockResolvedValue({});
      prisma.metaLeadImport.count.mockResolvedValue(0);

      prisma.metaAssetSelection.findMany.mockImplementation(
        ({ where }: { where: Record<string, unknown> }) => {
          // Chamada do particionamento: quantos clientes usam esta conta.
          if ('ad_account_id' in where) {
            return Promise.resolve(
              compartilhada
                ? [
                    { meta_connection: { client_id: 'client-1' } },
                    { meta_connection: { client_id: 'client-2' } },
                  ]
                : [{ meta_connection: { client_id: 'client-1' } }],
            );
          }
          // Chamada dos assets selecionados da conexao.
          return Promise.resolve([
            { ad_account_id: 'act1', page_id: 'page-A', form_id: 'form-A' },
          ]);
        },
      );

      jest
        .spyOn(service as any, 'fetchAdSetsForAccount')
        .mockResolvedValue([ADSET_DA_CASA, ADSET_DE_OUTRO_CLIENTE, ADSET_SEM_ATRIBUICAO]);
      jest
        .spyOn(service as any, 'fetchCampaignsForAccount')
        .mockResolvedValue(TODAS_AS_CAMPANHAS);
      jest
        .spyOn(service as any, 'fetchAdsForAccount')
        .mockResolvedValue([
          { id: 'ad-1', campaign_id: 'campaign-1' },
          { id: 'ad-2', campaign_id: 'campaign-2' },
        ]);
      jest
        .spyOn(service as any, 'fetchInsightsForAccount')
        .mockResolvedValue([
          { campaign_id: 'campaign-1', spend: '10' },
          { campaign_id: 'campaign-2', spend: '999' },
        ]);
      jest.spyOn(service as any, 'fetchLeadForms').mockResolvedValue([]);
      jest.spyOn(service as any, 'syncLeadForms').mockResolvedValue(0);

      return {
        syncCampaigns: jest.spyOn(service as any, 'syncCampaigns').mockResolvedValue(0),
        syncAdSets: jest.spyOn(service as any, 'syncAdSets').mockResolvedValue(0),
        syncAdsAndCreatives: jest
          .spyOn(service as any, 'syncAdsAndCreatives')
          .mockResolvedValue({ ads: 0, creatives: 0 }),
        syncInsights: jest.spyOn(service as any, 'syncInsights').mockResolvedValue(0),
      };
    }

    it('grava apenas as campanhas atribuidas ao cliente', async () => {
      const spies = armarSync({ compartilhada: true });

      await service.runFullSyncForConnection('conn-1', 'job-1');

      expect(spies.syncCampaigns).toHaveBeenCalledWith(expect.anything(), [{ id: 'campaign-1' }]);
      expect(spies.syncAdSets).toHaveBeenCalledWith(expect.anything(), [ADSET_DA_CASA]);
      expect(spies.syncAdsAndCreatives).toHaveBeenCalledWith(expect.anything(), [
        { id: 'ad-1', campaign_id: 'campaign-1' },
      ]);
    });

    it('nao vaza o investimento de outro cliente nos insights', async () => {
      const spies = armarSync({ compartilhada: true });

      await service.runFullSyncForConnection('conn-1', 'job-1');

      for (const [, insights] of spies.syncInsights.mock.calls) {
        expect(insights).toEqual([{ campaign_id: 'campaign-1', spend: '10' }]);
      }
    });

    it('o vinculo explicito traz campanha que a inferencia descartaria', async () => {
      // campaign-3 nao tem promoted_object: so entra porque foi vinculada.
      const spies = armarSync({
        compartilhada: true,
        vinculos: [{ meta_campaign_id: 'campaign-3', client_id: 'client-1' }],
      });

      await service.runFullSyncForConnection('conn-1', 'job-1');

      expect(spies.syncCampaigns).toHaveBeenCalledWith(expect.anything(), [
        { id: 'campaign-1' },
        { id: 'campaign-3' },
      ]);
    });

    it('o vinculo a outro cliente exclui a campanha mesmo com a pagina batendo', async () => {
      // campaign-1 promove page-A (deste cliente), mas foi dada ao client-2.
      const spies = armarSync({
        compartilhada: true,
        vinculos: [{ meta_campaign_id: 'campaign-1', client_id: 'client-2' }],
      });

      await service.runFullSyncForConnection('conn-1', 'job-1');

      expect(spies.syncCampaigns).toHaveBeenCalledWith(expect.anything(), []);
      expect(spies.syncAdSets).toHaveBeenCalledWith(expect.anything(), []);
    });

    it('com conta dedicada nao descarta nada, mesmo sem promoted_object', async () => {
      const spies = armarSync({ compartilhada: false });

      await service.runFullSyncForConnection('conn-1', 'job-1');

      expect(spies.syncCampaigns).toHaveBeenCalledWith(expect.anything(), TODAS_AS_CAMPANHAS);
      expect(spies.syncAdSets).toHaveBeenCalledWith(expect.anything(), [
        ADSET_DA_CASA,
        ADSET_DE_OUTRO_CLIENTE,
        ADSET_SEM_ATRIBUICAO,
      ]);
    });
  });
});
