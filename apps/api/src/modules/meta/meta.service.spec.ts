import { ConfigService } from '@nestjs/config';
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
    metaSyncJob: {
      create: jest.fn(),
      update: jest.fn(),
    },
    metaLeadImport: {
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
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
    add: jest.fn(),
  };

  let service: MetaService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new MetaService(
      prisma as unknown as PrismaService,
      redis as unknown as RedisService,
      config as unknown as ConfigService,
      realtime as unknown as RealtimeEventsService,
      { dispatch: jest.fn() } as never,
      metaSyncQueue as never,
    );
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
});
