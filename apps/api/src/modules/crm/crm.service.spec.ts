import { ConflictException, NotFoundException } from "@nestjs/common";
import { CrmTaskType } from "@prisma/client";
import { Role } from "../../common/types";
import { CrmService } from "./crm.service";

describe("CrmService", () => {
  const clientId = "22222222-2222-4222-8222-222222222222";
  const leadId = "33333333-3333-4333-8333-333333333333";
  const userId = "11111111-1111-4111-8111-111111111111";
  const pipelineId = "44444444-4444-4444-8444-444444444444";
  const stageId = "55555555-5555-4555-8555-555555555555";

  let prisma: any;
  let config: any;
  let webhookDispatch: any;
  let realtimeEvents: any;
  let leadTimeline: any;
  let service: CrmService;

  beforeEach(() => {
    prisma = {
      lead: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      user: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        count: jest.fn(),
      },
      client: {
        count: jest.fn(),
        findUnique: jest.fn().mockResolvedValue({ webhook_url_n8n: null }),
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
        delete: jest.fn().mockResolvedValue({ id: "idem-cleanup" }),
      },
      webhookEvent: {
        create: jest.fn(),
      },
      crmHistory: {
        create: jest.fn(),
      },
      crmTask: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      $transaction: jest.fn(async (callback: (tx: any) => Promise<unknown>) =>
        callback(prisma),
      ),
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
    leadTimeline = {
      record: jest.fn(),
      originFromSource: jest.fn(() => "crm"),
    };
    service = new CrmService(
      prisma,
      config,
      webhookDispatch,
      realtimeEvents,
      scoreEvents as any,
      leadTimeline as any,
    );
  });

  it("cria proxima acao vinculada ao lead e registra na timeline", async () => {
    prisma.client.count.mockResolvedValue(1);
    prisma.lead.findFirst.mockResolvedValue({
      id: leadId,
      client_id: clientId,
      assigned_vendor_id: userId,
    });
    prisma.user.findFirst.mockResolvedValue({ id: userId });
    prisma.crmTask.create.mockImplementation(({ data }: any) =>
      Promise.resolve({
        id: "66666666-6666-4666-8666-666666666666",
        ...data,
        status: "pending",
        lead: { id: leadId, name: "Lead Teste", phone: "+5512999999999" },
        assigned_user: { id: userId, name: "Vendedor" },
        created_by: { id: userId, name: "Gestor" },
      }),
    );

    const result = await service.createTask(
      {
        client_id: clientId,
        lead_id: leadId,
        type: CrmTaskType.follow_up,
        title: "Retornar proposta",
        due_at: "2026-08-16T10:00:00-03:00",
      },
      {
        sub: userId,
        email: "gestor@teste.com",
        name: "Gestor",
        role: Role.GESTOR,
      },
    );

    expect(result.title).toBe("Retornar proposta");
    expect(prisma.crmTask.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ assigned_user_id: userId }),
      }),
    );
    expect(leadTimeline.record).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: "task_created", leadId }),
    );
  });

  function mockLeadBase() {
    return {
      id: leadId,
      client_id: clientId,
      assigned_vendor_id: userId,
      crm_pipeline_id: "old-pipeline",
      crm_stage_id: "old-stage",
      client: {
        id: clientId,
        webhook_url_n8n: null,
      },
      crm_pipeline: { code: "OLD_PIPELINE" },
      crm_stage: { code: "OLD_STAGE" },
    };
  }

  it("retorna replay quando idempotency key já possui response", async () => {
    prisma.lead.findUnique.mockResolvedValue(mockLeadBase());
    prisma.user.findUnique.mockResolvedValue({ id: userId });
    prisma.crmPipeline.findFirst.mockResolvedValue({
      id: pipelineId,
      code: "PIPE_A",
      client_id: clientId,
      is_active: true,
    });
    prisma.crmStage.findFirst.mockResolvedValue({
      id: stageId,
      code: "STAGE_A",
      pipeline_id: pipelineId,
      client_id: clientId,
    });
    jest
      .spyOn(service as any, "createMoveLeadRequestHash")
      .mockReturnValue("same-hash");

    prisma.apiIdempotencyRequest.findUnique.mockResolvedValue({
      request_hash: "same-hash",
      response: { moved: true, lead_id: leadId },
    });

    // força hash idêntico comparando contra createMoveLeadRequestHash interno
    const result = await service.moveLeadByCodes(
      leadId,
      { pipeline_code: "pipe_a", stage_code: "stage_a", source: "api" },
      userId,
      "idem-key",
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

  it("falha quando idempotency key já existe com payload diferente", async () => {
    prisma.lead.findUnique.mockResolvedValue(mockLeadBase());
    prisma.user.findUnique.mockResolvedValue({ id: userId });
    prisma.crmPipeline.findFirst.mockResolvedValue({
      id: pipelineId,
      code: "PIPE_A",
      client_id: clientId,
      is_active: true,
    });
    prisma.crmStage.findFirst.mockResolvedValue({
      id: stageId,
      code: "STAGE_A",
      pipeline_id: pipelineId,
      client_id: clientId,
    });
    prisma.apiIdempotencyRequest.findUnique.mockResolvedValue({
      request_hash: "outro-hash",
      response: null,
    });

    await expect(
      service.moveLeadByCodes(
        leadId,
        { pipeline_code: "pipe_a", stage_code: "stage_a", source: "api" },
        userId,
        "idem-key",
        undefined,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it("retorna moved=false quando lead já está na etapa alvo e persiste idempotência", async () => {
    prisma.lead.findUnique.mockResolvedValue({
      ...mockLeadBase(),
      crm_pipeline_id: pipelineId,
      crm_stage_id: stageId,
    });
    prisma.user.findUnique.mockResolvedValue({ id: userId });
    prisma.crmPipeline.findFirst.mockResolvedValue({
      id: pipelineId,
      code: "PIPE_A",
      client_id: clientId,
      is_active: true,
    });
    prisma.crmStage.findFirst.mockResolvedValue({
      id: stageId,
      code: "STAGE_A",
      pipeline_id: pipelineId,
      client_id: clientId,
    });
    prisma.apiIdempotencyRequest.findUnique.mockResolvedValue(null);
    prisma.apiIdempotencyRequest.create.mockResolvedValue({ id: "idem-1" });
    prisma.apiIdempotencyRequest.upsert.mockResolvedValue({ id: "idem-1" });

    const result = await service.moveLeadByCodes(
      leadId,
      {
        pipeline_code: "pipe_a",
        stage_code: "stage_a",
        notes: "ok",
        source: "api",
      },
      userId,
      "idem-key",
      undefined,
    );

    expect(result).toEqual(
      expect.objectContaining({
        moved: false,
        reason: "lead_already_in_target_stage",
        idempotent_replay: false,
      }),
    );
    expect(prisma.apiIdempotencyRequest.upsert).toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("move lead com sucesso criando histórico e webhook event", async () => {
    prisma.lead.findUnique.mockResolvedValue(mockLeadBase());
    prisma.user.findUnique.mockResolvedValue({ id: userId });
    prisma.crmPipeline.findFirst.mockResolvedValue({
      id: pipelineId,
      code: "PIPE_A",
      client_id: clientId,
      is_active: true,
    });
    prisma.crmStage.findFirst.mockResolvedValue({
      id: stageId,
      code: "STAGE_A",
      pipeline_id: pipelineId,
      client_id: clientId,
    });
    prisma.apiIdempotencyRequest.findUnique.mockResolvedValue(null);
    prisma.apiIdempotencyRequest.create.mockResolvedValue({ id: "idem-1" });
    prisma.apiIdempotencyRequest.upsert.mockResolvedValue({ id: "idem-1" });

    prisma.lead.update.mockResolvedValue({ id: leadId });
    prisma.crmHistory.create.mockResolvedValue({ id: "history-1" });
    prisma.webhookEvent.create.mockResolvedValue({ id: "webhook-1" });

    const result = await service.moveLeadByCodes(
      leadId,
      {
        pipeline_code: "pipe_a",
        stage_code: "stage_a",
        notes: "mover",
        source: "api",
      },
      userId,
      "idem-key",
      {
        sub: userId,
        email: "vend@teste.com",
        name: "Vendedor",
        role: Role.VENDEDOR,
        client_id: clientId,
      },
    );

    expect(prisma.$transaction).toHaveBeenCalled();
    expect(result).toEqual(
      expect.objectContaining({
        moved: true,
        lead_id: leadId,
        crm_history_id: "history-1",
        webhook_event_id: "webhook-1",
      }),
    );
  });

  it("falha quando lead não existe", async () => {
    prisma.lead.findUnique.mockResolvedValue(null);

    await expect(
      service.moveLeadByCodes(
        leadId,
        { pipeline_code: "pipe_a", stage_code: "stage_a" },
        userId,
        undefined,
        undefined,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
