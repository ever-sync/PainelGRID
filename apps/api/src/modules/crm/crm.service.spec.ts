/* eslint-disable @typescript-eslint/no-explicit-any */
import { ConflictException, NotFoundException } from '@nestjs/common';
import { Role } from '../../common/types';
import { CrmService } from './crm.service';

describe('CrmService', () => {
  const clientId = '22222222-2222-4222-8222-222222222222';
  const leadId = '33333333-3333-4333-8333-333333333333';
  const userId = '11111111-1111-4111-8111-111111111111';
  const pipelineId = '44444444-4444-4444-8444-444444444444';
  const stageId = '55555555-5555-4555-8555-555555555555';

  let prisma: any;
  let config: any;
  let webhookDispatch: any;
  let realtimeEvents: any;
  let service: CrmService;

  beforeEach(() => {
    prisma = {
      lead: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      user: {
        findUnique: jest.fn(),
      },
      client: {
        count: jest.fn(),
      },
      crmPipeline: {
        findFirst: jest.fn(),
      },
      crmStage: {
        findFirst: jest.fn(),
      },
      apiIdempotencyRequest: {
        findUnique: jest.fn(),
        create: jest.fn(),
        upsert: jest.fn(),
        delete: jest.fn().mockResolvedValue({ id: 'idem-cleanup' }),
      },
      webhookEvent: {
        create: jest.fn(),
      },
      crmHistory: {
        create: jest.fn(),
      },
      $transaction: jest.fn(async (callback: (tx: any) => Promise<unknown>) => callback(prisma)),
    };

    config = {
      get: jest.fn(),
    };

    webhookDispatch = {
      enqueue: jest.fn(),
    };

    realtimeEvents = {
      emitStageChanged: jest.fn(),
      emitLeadUpdated: jest.fn(),
    };

    const scoreEvents = { award: jest.fn() };
    const leadTimeline = { record: jest.fn(), originFromSource: jest.fn(() => 'crm') };
    service = new CrmService(
      prisma,
      config,
      webhookDispatch,
      realtimeEvents,
      scoreEvents as any,
      leadTimeline as any,
    );
  });

  function mockLeadBase() {
    return {
      id: leadId,
      client_id: clientId,
      assigned_vendor_id: userId,
      crm_pipeline_id: 'old-pipeline',
      crm_stage_id: 'old-stage',
      client: {
        id: clientId,
        webhook_url_n8n: null,
      },
      crm_pipeline: { code: 'OLD_PIPELINE' },
      crm_stage: { code: 'OLD_STAGE' },
    };
  }

  it('retorna replay quando idempotency key já possui response', async () => {
    prisma.lead.findUnique.mockResolvedValue(mockLeadBase());
    prisma.user.findUnique.mockResolvedValue({ id: userId });
    prisma.crmPipeline.findFirst.mockResolvedValue({
      id: pipelineId,
      code: 'PIPE_A',
      client_id: clientId,
      is_active: true,
    });
    prisma.crmStage.findFirst.mockResolvedValue({
      id: stageId,
      code: 'STAGE_A',
      pipeline_id: pipelineId,
      client_id: clientId,
    });
    jest.spyOn(service as any, 'createMoveLeadRequestHash').mockReturnValue('same-hash');

    prisma.apiIdempotencyRequest.findUnique.mockResolvedValue({
      request_hash: 'same-hash',
      response: { moved: true, lead_id: leadId },
    });

    // força hash idêntico comparando contra createMoveLeadRequestHash interno
    const result = await service.moveLeadByCodes(
      leadId,
      { pipeline_code: 'pipe_a', stage_code: 'stage_a', source: 'api' },
      userId,
      'idem-key',
      undefined,
    );

    expect(result).toEqual({
      moved: true,
      lead_id: leadId,
      idempotent_replay: true,
    });
    expect(prisma.apiIdempotencyRequest.create).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('falha quando idempotency key já existe com payload diferente', async () => {
    prisma.lead.findUnique.mockResolvedValue(mockLeadBase());
    prisma.user.findUnique.mockResolvedValue({ id: userId });
    prisma.crmPipeline.findFirst.mockResolvedValue({
      id: pipelineId,
      code: 'PIPE_A',
      client_id: clientId,
      is_active: true,
    });
    prisma.crmStage.findFirst.mockResolvedValue({
      id: stageId,
      code: 'STAGE_A',
      pipeline_id: pipelineId,
      client_id: clientId,
    });
    prisma.apiIdempotencyRequest.findUnique.mockResolvedValue({
      request_hash: 'outro-hash',
      response: null,
    });

    await expect(
      service.moveLeadByCodes(
        leadId,
        { pipeline_code: 'pipe_a', stage_code: 'stage_a', source: 'api' },
        userId,
        'idem-key',
        undefined,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('retorna moved=false quando lead já está na etapa alvo e persiste idempotência', async () => {
    prisma.lead.findUnique.mockResolvedValue({
      ...mockLeadBase(),
      crm_pipeline_id: pipelineId,
      crm_stage_id: stageId,
    });
    prisma.user.findUnique.mockResolvedValue({ id: userId });
    prisma.crmPipeline.findFirst.mockResolvedValue({
      id: pipelineId,
      code: 'PIPE_A',
      client_id: clientId,
      is_active: true,
    });
    prisma.crmStage.findFirst.mockResolvedValue({
      id: stageId,
      code: 'STAGE_A',
      pipeline_id: pipelineId,
      client_id: clientId,
    });
    prisma.apiIdempotencyRequest.findUnique.mockResolvedValue(null);
    prisma.apiIdempotencyRequest.create.mockResolvedValue({ id: 'idem-1' });
    prisma.apiIdempotencyRequest.upsert.mockResolvedValue({ id: 'idem-1' });

    const result = await service.moveLeadByCodes(
      leadId,
      { pipeline_code: 'pipe_a', stage_code: 'stage_a', notes: 'ok', source: 'api' },
      userId,
      'idem-key',
      undefined,
    );

    expect(result).toEqual(
      expect.objectContaining({
        moved: false,
        reason: 'lead_already_in_target_stage',
        idempotent_replay: false,
      }),
    );
    expect(prisma.apiIdempotencyRequest.upsert).toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('move lead com sucesso criando histórico e webhook event', async () => {
    prisma.lead.findUnique.mockResolvedValue(mockLeadBase());
    prisma.user.findUnique.mockResolvedValue({ id: userId });
    prisma.crmPipeline.findFirst.mockResolvedValue({
      id: pipelineId,
      code: 'PIPE_A',
      client_id: clientId,
      is_active: true,
    });
    prisma.crmStage.findFirst.mockResolvedValue({
      id: stageId,
      code: 'STAGE_A',
      pipeline_id: pipelineId,
      client_id: clientId,
    });
    prisma.apiIdempotencyRequest.findUnique.mockResolvedValue(null);
    prisma.apiIdempotencyRequest.create.mockResolvedValue({ id: 'idem-1' });
    prisma.apiIdempotencyRequest.upsert.mockResolvedValue({ id: 'idem-1' });

    prisma.lead.update.mockResolvedValue({ id: leadId });
    prisma.crmHistory.create.mockResolvedValue({ id: 'history-1' });
    prisma.webhookEvent.create.mockResolvedValue({ id: 'webhook-1' });

    const result = await service.moveLeadByCodes(
      leadId,
      { pipeline_code: 'pipe_a', stage_code: 'stage_a', notes: 'mover', source: 'api' },
      userId,
      'idem-key',
      {
        sub: userId,
        email: 'vend@teste.com',
        name: 'Vendedor',
        role: Role.VENDEDOR,
        client_id: clientId,
      },
    );

    expect(prisma.$transaction).toHaveBeenCalled();
    expect(result).toEqual(
      expect.objectContaining({
        moved: true,
        lead_id: leadId,
        crm_history_id: 'history-1',
        webhook_event_id: 'webhook-1',
      }),
    );
  });

  it('falha quando lead não existe', async () => {
    prisma.lead.findUnique.mockResolvedValue(null);

    await expect(
      service.moveLeadByCodes(
        leadId,
        { pipeline_code: 'pipe_a', stage_code: 'stage_a' },
        userId,
        undefined,
        undefined,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
