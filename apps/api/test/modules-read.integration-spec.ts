import { ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { NextFunction, Request, Response } from 'express';

const request = require('supertest');
import { CampaignsController } from '../src/modules/campaigns/campaigns.controller';
import { CampaignsService } from '../src/modules/campaigns/campaigns.service';
import { ClientsController } from '../src/modules/clients/clients.controller';
import { ClientsService } from '../src/modules/clients/clients.service';
import { ConversationsController } from '../src/modules/conversations/conversations.controller';
import { ConversationsService } from '../src/modules/conversations/conversations.service';
import { EventsController } from '../src/modules/events/events.controller';
import { EventsService } from '../src/modules/events/events.service';
import { EventDashboardService } from '../src/modules/events/event-dashboard.service';
import { LeadsController } from '../src/modules/leads/leads.controller';
import { LeadsService } from '../src/modules/leads/leads.service';

describe('Core modules read endpoints (integration)', () => {
  const clientId = '22222222-2222-4222-8222-222222222222';
  const convoId = '33333333-3333-4333-8333-333333333333';

  async function createApp() {
    const mockClients = {
      findAllForUser: jest.fn().mockResolvedValue([{ id: clientId, company_name: 'Empresa Demo' }]),
      findOneForUser: jest.fn().mockResolvedValue({ id: clientId, company_name: 'Empresa Demo' }),
    };
    const mockEvents = {
      findAll: jest.fn().mockResolvedValue([{ id: 'evt-1', name: 'Evento Demo' }]),
    };
    const mockEventDashboard = {
      getTvDashboard: jest.fn().mockResolvedValue({}),
    };
    const mockCampaigns = {
      findAll: jest.fn().mockResolvedValue([{ id: 'camp-1', name: 'Campanha Demo' }]),
    };
    const mockConversations = {
      findAll: jest.fn().mockResolvedValue([{ id: convoId }]),
      findMessages: jest.fn().mockResolvedValue([{ id: 'msg-1', content: 'Oi' }]),
      addMessage: jest.fn().mockResolvedValue({ id: 'msg-2', content: 'Nova mensagem' }),
    };
    const mockLeads = {
      findAll: jest.fn().mockResolvedValue([{ id: 'lead-1', name: 'Lead Demo' }]),
    };

    const moduleRef = await Test.createTestingModule({
      controllers: [
        ClientsController,
        EventsController,
        CampaignsController,
        ConversationsController,
        LeadsController,
      ],
      providers: [
        { provide: ClientsService, useValue: mockClients },
        { provide: EventsService, useValue: mockEvents },
        { provide: EventDashboardService, useValue: mockEventDashboard },
        { provide: CampaignsService, useValue: mockCampaigns },
        { provide: ConversationsService, useValue: mockConversations },
        { provide: LeadsService, useValue: mockLeads },
      ],
    }).compile();

    const app = moduleRef.createNestApplication();
    app.use((req: Request, _res: Response, next: NextFunction) => {
      (req as Request & { user?: object }).user = {
        sub: 'aaaaaaaa-bbbb-4ccc-dddd-eeeeeeeeeeee',
        email: 'gestor@demo.com',
        name: 'Gestor Demo',
        role: 'gestor',
        client_id: clientId,
      };
      next();
    });
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();

    return { app, mockClients, mockEvents, mockCampaigns, mockConversations, mockLeads };
  }

  it('GET /api/clients retorna lista', async () => {
    const { app, mockClients } = await createApp();

    await request(app.getHttpServer()).get('/api/clients').expect(200);
    expect(mockClients.findAllForUser).toHaveBeenCalled();

    await app.close();
  });

  it('GET /api/clients/:id retorna cliente', async () => {
    const { app, mockClients } = await createApp();

    await request(app.getHttpServer()).get(`/api/clients/${clientId}`).expect(200);
    expect(mockClients.findOneForUser).toHaveBeenCalled();

    await app.close();
  });

  it('GET /api/events com client_id retorna eventos', async () => {
    const { app, mockEvents } = await createApp();

    await request(app.getHttpServer())
      .get('/api/events')
      .query({ client_id: clientId })
      .expect(200);
    expect(mockEvents.findAll).toHaveBeenCalled();

    await app.close();
  });

  it('GET /api/campaigns com client_id retorna campanhas', async () => {
    const { app, mockCampaigns } = await createApp();

    await request(app.getHttpServer())
      .get('/api/campaigns')
      .query({ client_id: clientId })
      .expect(200);
    expect(mockCampaigns.findAll).toHaveBeenCalled();

    await app.close();
  });

  it('GET /api/leads com client_id retorna leads', async () => {
    const { app, mockLeads } = await createApp();

    await request(app.getHttpServer()).get('/api/leads').query({ client_id: clientId }).expect(200);
    expect(mockLeads.findAll).toHaveBeenCalled();

    await app.close();
  });

  it('GET /api/conversations e GET /:id/messages retornam dados', async () => {
    const { app, mockConversations } = await createApp();

    await request(app.getHttpServer())
      .get('/api/conversations')
      .query({ client_id: clientId })
      .expect(200);
    await request(app.getHttpServer()).get(`/api/conversations/${convoId}/messages`).expect(200);

    expect(mockConversations.findAll).toHaveBeenCalled();
    expect(mockConversations.findMessages).toHaveBeenCalled();

    await app.close();
  });

  it('POST /api/conversations/:id/messages adiciona mensagem', async () => {
    const { app, mockConversations } = await createApp();

    await request(app.getHttpServer())
      .post(`/api/conversations/${convoId}/messages`)
      .send({ content: 'Nova mensagem' })
      .expect(201);
    expect(mockConversations.addMessage).toHaveBeenCalled();

    await app.close();
  });
});
