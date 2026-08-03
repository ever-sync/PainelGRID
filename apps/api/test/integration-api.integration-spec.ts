import { ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';

const request = require('supertest');
import { CrmService } from '../src/modules/crm/crm.service';
import { IntegrationController } from '../src/modules/integration/integration.controller';
import { IntegrationKeyGuard } from '../src/modules/integration/integration-key.guard';
import { LeadsService } from '../src/modules/leads/leads.service';
import { EventsService } from '../src/modules/events/events.service';
import { RubinhoService } from '../src/modules/rubinho/rubinho.service';
import { PrismaService } from '../src/config/prisma.service';

describe('Integrations v1 (integration)', () => {
  const apiKey = 'test-integration-key-32chars!!';
  const leadId = '33333333-3333-4333-8333-333333333333';
  const clientId = '22222222-2222-4222-8222-222222222222';

  async function createApp() {
    const mockLeads = {
      patchLeadForIntegration: jest.fn().mockResolvedValue({ id: leadId, ok: true }),
      createFacebookLeadsForIntegration: jest.fn().mockResolvedValue({
        received: 1,
        created: 1,
        already_existed: 0,
        items: [{ id: leadId, already_existed: false }],
      }),
    };
    const mockCrm = { moveLeadByIntegration: jest.fn().mockResolvedValue({ ok: true }) };
    const mockEvents = {
      findOneForIntegration: jest.fn().mockResolvedValue({ id: 'evt-1' }),
    };
    const mockRubinho = {
      getRubinhoConfigForIntegration: jest.fn().mockResolvedValue({ id: 'rub-1' }),
    };

    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          load: [
            () => ({
              LEADFLOW_INTEGRATION_API_KEY: apiKey,
              LEADFLOW_INTEGRATION_CLIENT_ID: clientId,
              LEADFLOW_INTEGRATION_ACTOR_USER_ID: 'aaaaaaaa-bbbb-4ccc-dddd-eeeeeeeeeeee',
            }),
          ],
        }),
      ],
      controllers: [IntegrationController],
      providers: [
        IntegrationKeyGuard,
        {
          provide: PrismaService,
          useValue: {
            integrationCredential: { findUnique: jest.fn().mockResolvedValue(null) },
            lead: { findUnique: jest.fn().mockResolvedValue({ client_id: clientId }) },
          },
        },
        { provide: LeadsService, useValue: mockLeads },
        { provide: CrmService, useValue: mockCrm },
        { provide: EventsService, useValue: mockEvents },
        { provide: RubinhoService, useValue: mockRubinho },
      ],
    }).compile();

    const app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();
    return { app, mockLeads, mockCrm };
  }

  it('PATCH /integrations/v1/leads/:id com chave valida', async () => {
    const { app, mockLeads } = await createApp();

    await request(app.getHttpServer())
      .patch(`/api/integrations/v1/leads/${leadId}`)
      .set('X-Leadflow-Integration-Key', apiKey)
      .send({ name: 'Atualizado via API' })
      .expect(200);

    expect(mockLeads.patchLeadForIntegration).toHaveBeenCalled();

    await app.close();
  });

  it('PATCH sem chave retorna 401', async () => {
    const { app } = await createApp();

    await request(app.getHttpServer())
      .patch(`/api/integrations/v1/leads/${leadId}`)
      .send({})
      .expect(401);

    await app.close();
  });

  it('POST /integrations/v1/leads/facebook aceita o array bruto da campanha', async () => {
    const { app, mockLeads } = await createApp();
    const payload = [
      {
        lead_id: '1946096999403754',
        nome: 'Raphael',
        email: 'raphaelbetel3@gmail.com',
        telefone: '+5512981092776',
        preferencia_atendimento: 'whatsapp',
        formulario_id: '27515534804767924',
        anuncio_id: '120247888509270620',
        anuncio: 'Novo anúncio de Leads',
        campanha_id: '120247888509250620',
        campanha: 'teste',
        criado_em: '2026-07-14T02:25:25+0000',
        origem: 'facebook_lead_ads',
        todos_os_campos: { full_name: 'Raphael' },
      },
    ];

    await request(app.getHttpServer())
      .post('/api/integrations/v1/leads/facebook')
      .set('X-Leadflow-Integration-Key', apiKey)
      .send(payload)
      .expect(201);

    expect(mockLeads.createFacebookLeadsForIntegration).toHaveBeenCalledWith(
      clientId,
      expect.arrayContaining([
        expect.objectContaining({
          lead_id: '1946096999403754',
          campanha_id: '120247888509250620',
        }),
      ]),
    );

    await app.close();
  });

  it('POST /integrations/v1/leads/:id/crm/move com chave valida', async () => {
    const { app, mockCrm } = await createApp();

    await request(app.getHttpServer())
      .post(`/api/integrations/v1/leads/${leadId}/crm/move`)
      .set('X-Leadflow-Integration-Key', apiKey)
      .send({ pipeline_code: 'PIPE_DEMO1', stage_code: 'STG_DEMO1' })
      .expect(201);

    expect(mockCrm.moveLeadByIntegration).toHaveBeenCalled();

    await app.close();
  });
});
