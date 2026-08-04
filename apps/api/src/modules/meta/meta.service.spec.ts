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
      findFirst: jest.fn(),
    },
    metaLeadRoutingRule: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      upsert: jest.fn(),
      delete: jest.fn(),
      deleteMany: jest.fn(),
    },
    metaCampaignAssignment: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      upsert: jest.fn(),
      delete: jest.fn(),
    },
    metaDailyInsight: {
      aggregate: jest.fn(),
      findMany: jest.fn(),
    },
    metaCampaign: {
      findMany: jest.fn(),
    },
    metaAdSet: {
      findMany: jest.fn(),
    },
    metaAd: {
      findMany: jest.fn(),
    },
    event: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
    },
    crmPipeline: {
      findFirst: jest.fn(),
    },
    crmStage: {
      findMany: jest.fn(),
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
      groupBy: jest.fn(),
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

  describe('getCampaignsReport com filtros', () => {
    const gestor = { sub: 'gestor-1', role: Role.GESTOR } as AuthenticatedUser;

    beforeEach(() => {
      prisma.client.findUnique.mockResolvedValue({ id: 'client-1', gestor_id: 'gestor-1' });
      prisma.metaConnection.findFirst.mockResolvedValue({ id: 'conn-1', client_id: 'client-1' });
      prisma.metaCampaign.findMany.mockResolvedValue([]);
      prisma.metaAdSet.findMany.mockResolvedValue([]);
      prisma.metaAd.findMany.mockResolvedValue([]);
      prisma.metaDailyInsight.findMany.mockResolvedValue([]);
      prisma.metaDailyInsight.aggregate.mockResolvedValue({
        _min: { date: null },
        _max: { date: null },
      });
      prisma.metaLeadImport.groupBy.mockResolvedValue([]);
      prisma.metaCampaignAssignment.findMany.mockResolvedValue([]);
    });

    it('filtra os leads importados por `imported_at`, o campo real do modelo', async () => {
      await service.getCampaignsReport(gestor, 'client-1', {
        from: '2026-07-04',
        to: '2026-08-02',
      });

      const [args] = prisma.metaLeadImport.groupBy.mock.calls[0] as [
        { where: Record<string, unknown> },
      ];
      // `created_at` nao existe em MetaLeadImport e quebrava a query em runtime.
      expect(args.where).not.toHaveProperty('created_at');
      expect(args.where.imported_at).toEqual({
        gte: new Date('2026-07-04T00:00:00.000Z'),
        lte: new Date('2026-08-02T23:59:59.999Z'),
      });
    });

    it('sem periodo, nao aplica recorte de data nos leads importados', async () => {
      await service.getCampaignsReport(gestor, 'client-1', {});

      const [args] = prisma.metaLeadImport.groupBy.mock.calls[0] as [
        { where: Record<string, unknown> },
      ];
      expect(args.where).not.toHaveProperty('imported_at');
    });

    it('only_linked restringe as campanhas no banco, nao no front', async () => {
      prisma.metaCampaignAssignment.findMany.mockResolvedValue([
        { meta_campaign_id: 'campaign-1' },
      ]);

      await service.getCampaignsReport(gestor, 'client-1', {
        only_linked: true,
        status: 'ACTIVE',
      });

      const [args] = prisma.metaCampaign.findMany.mock.calls[0] as [
        { where: Record<string, unknown> },
      ];
      expect(args.where).toMatchObject({
        status: 'ACTIVE',
        meta_campaign_id: { in: ['campaign-1'] },
      });
    });
  });

  describe('roteamento de leads por formulario', () => {
    const gestor = { sub: 'gestor-1', role: Role.GESTOR } as AuthenticatedUser;
    const dto = {
      form_id: 'form-1',
      event_id: '11111111-1111-4111-8111-111111111111',
      crm_pipeline_id: '22222222-2222-4222-8222-222222222222',
      call_stage_id: '33333333-3333-4333-8333-333333333333',
      whatsapp_stage_id: '44444444-4444-4444-8444-444444444444',
    };

    beforeEach(() => {
      prisma.client.findUnique.mockResolvedValue({
        id: 'client-1',
        gestor_id: 'gestor-1',
      });
    });

    it('lista formularios selecionados com o mapeamento persistido', async () => {
      prisma.metaAssetSelection.findMany.mockResolvedValue([
        { form_id: 'form-1', form_name: 'Formulario 1', page_id: 'page-1' },
        { form_id: 'form-1', form_name: 'Formulario 1', page_id: 'page-1' },
        { form_id: 'form-2', form_name: 'Formulario 2', page_id: 'page-1' },
      ]);
      prisma.metaLeadRoutingRule.findMany.mockResolvedValue([
        {
          id: 'routing-1',
          form_id: 'form-1',
          event: { id: 'event-1', name: 'Evento' },
          crm_pipeline: { id: 'pipeline-1', name: 'Pipeline', code: 'PL' },
          call_stage: { id: 'stage-1', name: 'Ligacao', code: 'LIG', color: '#111111' },
          whatsapp_stage: {
            id: 'stage-2',
            name: 'WhatsApp',
            code: 'WA',
            color: '#222222',
          },
        },
      ]);

      const result = await service.listLeadRoutingRules(gestor, 'client-1');

      expect(result.forms).toHaveLength(2);
      expect(result.forms).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: 'form-1',
            mapping: expect.objectContaining({ id: 'routing-1' }),
          }),
          expect.objectContaining({ id: 'form-2', mapping: null }),
        ]),
      );
    });

    it('salva evento, pipeline e etapas quando todos pertencem ao cliente', async () => {
      prisma.metaAssetSelection.findFirst
        .mockResolvedValueOnce({ form_id: 'form-1', form_name: 'Formulario 1' })
        .mockResolvedValueOnce(null);
      prisma.metaLeadRoutingRule.findUnique.mockResolvedValue(null);
      prisma.event.findFirst.mockResolvedValue({ id: dto.event_id });
      prisma.crmPipeline.findFirst.mockResolvedValue({ id: dto.crm_pipeline_id });
      prisma.crmStage.findMany.mockResolvedValue([
        { id: dto.call_stage_id },
        { id: dto.whatsapp_stage_id },
      ]);
      prisma.metaLeadRoutingRule.upsert.mockResolvedValue({
        id: 'routing-1',
        client_id: 'client-1',
        ...dto,
      });

      const result = await service.upsertLeadRoutingRule(
        gestor,
        'client-1',
        dto,
      );

      expect(result).toMatchObject({ id: 'routing-1', ...dto });
      expect(prisma.metaLeadRoutingRule.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { form_id: 'form-1' },
          create: expect.objectContaining({
            client_id: 'client-1',
            form_name: 'Formulario 1',
            ...dto,
          }),
        }),
      );
    });

    it('salva template aprovado e a ordem dos parametros dinamicos', async () => {
      const templateDto = {
        ...dto,
        whatsapp_template_name: 'boas_vindas_evento',
        whatsapp_template_language: 'pt_BR',
        whatsapp_template_parameter_keys: [
          'lead_name',
          'event_name',
        ] as Array<'lead_name' | 'event_name'>,
      };
      jest.spyOn(service, 'listClientWhatsappTemplates').mockResolvedValue({
        client_id: 'client-1',
        waba_id: 'waba-1',
        templates: [
          {
            id: 'template-1',
            name: 'boas_vindas_evento',
            language: 'pt_BR',
            category: 'MARKETING',
            body_text: 'Ola {{1}}, esperamos voce no {{2}}.',
            body_parameter_count: 2,
            supported: true,
          },
        ],
      });
      prisma.metaAssetSelection.findFirst
        .mockResolvedValueOnce({ form_id: 'form-1', form_name: 'Formulario 1' })
        .mockResolvedValueOnce(null);
      prisma.metaLeadRoutingRule.findUnique.mockResolvedValue(null);
      prisma.event.findFirst.mockResolvedValue({ id: dto.event_id });
      prisma.crmPipeline.findFirst.mockResolvedValue({ id: dto.crm_pipeline_id });
      prisma.crmStage.findMany.mockResolvedValue([
        { id: dto.call_stage_id },
        { id: dto.whatsapp_stage_id },
      ]);
      prisma.metaLeadRoutingRule.upsert.mockResolvedValue({
        id: 'routing-1',
        client_id: 'client-1',
        ...templateDto,
      });

      await service.upsertLeadRoutingRule(gestor, 'client-1', templateDto);

      expect(prisma.metaLeadRoutingRule.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            whatsapp_template_name: 'boas_vindas_evento',
            whatsapp_template_language: 'pt_BR',
            whatsapp_template_parameter_keys: ['lead_name', 'event_name'],
          }),
        }),
      );
    });

    it('lista somente templates aprovados e informa parametros do corpo', async () => {
      jest.spyOn(service as any, 'getClientPrimaryWhatsappChannel').mockResolvedValue({
        waba_id: 'waba-1',
        phone_number_id: 'phone-number-1',
        meta_connection: { access_token: 'token-1' },
      });
      jest.spyOn(service as any, 'graphGetAll').mockResolvedValue([
        {
          id: 'template-approved',
          name: 'boas_vindas_evento',
          status: 'APPROVED',
          category: 'MARKETING',
          language: 'pt_BR',
          components: [{ type: 'BODY', text: 'Ola {{1}}, evento {{2}}.' }],
        },
        {
          id: 'template-pending',
          name: 'aguardando_aprovacao',
          status: 'PENDING',
          language: 'pt_BR',
        },
      ]);

      const result = await service.listClientWhatsappTemplates(gestor, 'client-1');

      expect(result.templates).toEqual([
        expect.objectContaining({
          id: 'template-approved',
          name: 'boas_vindas_evento',
          language: 'pt_BR',
          body_parameter_count: 2,
          supported: true,
        }),
      ]);
    });

    it('bloqueia formulario selecionado simultaneamente por outro cliente', async () => {
      prisma.metaAssetSelection.findFirst
        .mockResolvedValueOnce({ form_id: 'form-1', form_name: 'Formulario 1' })
        .mockResolvedValueOnce({ id: 'selection-other-client' });
      prisma.metaLeadRoutingRule.findUnique.mockResolvedValue(null);
      prisma.event.findFirst.mockResolvedValue({ id: dto.event_id });
      prisma.crmPipeline.findFirst.mockResolvedValue({ id: dto.crm_pipeline_id });
      prisma.crmStage.findMany.mockResolvedValue([
        { id: dto.call_stage_id },
        { id: dto.whatsapp_stage_id },
      ]);

      await expect(
        service.upsertLeadRoutingRule(gestor, 'client-1', dto),
      ).rejects.toThrow('Formulario Meta ja esta vinculado a outro cliente');

      expect(prisma.metaLeadRoutingRule.upsert).not.toHaveBeenCalled();
    });

    it('bloqueia etapa que nao pertence ao pipeline escolhido', async () => {
      prisma.metaAssetSelection.findFirst
        .mockResolvedValueOnce({ form_id: 'form-1', form_name: 'Formulario 1' })
        .mockResolvedValueOnce(null);
      prisma.metaLeadRoutingRule.findUnique.mockResolvedValue(null);
      prisma.event.findFirst.mockResolvedValue({ id: dto.event_id });
      prisma.crmPipeline.findFirst.mockResolvedValue({ id: dto.crm_pipeline_id });
      prisma.crmStage.findMany.mockResolvedValue([{ id: dto.call_stage_id }]);

      await expect(
        service.upsertLeadRoutingRule(gestor, 'client-1', dto),
      ).rejects.toThrow(
        'As etapas de ligacao e WhatsApp devem pertencer ao pipeline selecionado',
      );

      expect(prisma.metaLeadRoutingRule.upsert).not.toHaveBeenCalled();
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
