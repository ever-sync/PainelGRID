import { OperationsService } from "./operations.service";

describe("OperationsService", () => {
  const prisma = {
    operationalIssue: { upsert: jest.fn() },
    operationalHeartbeat: { upsert: jest.fn() },
    lead: { findMany: jest.fn() },
    dispatchEvent: { findMany: jest.fn() },
    conversationState: { findMany: jest.fn() },
    conversation: { findMany: jest.fn() },
  };
  let service: OperationsService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new OperationsService(prisma as never);
  });

  it("deduplica ocorrências pelo fingerprint e incrementa recorrência", async () => {
    prisma.operationalIssue.upsert.mockResolvedValue({ id: "issue-1" });
    await service.report({
      type: "QR_NOT_DELIVERED",
      severity: "critical",
      title: "QR Code não entregue",
      message: "Falha Meta",
      source: "n8n",
      fingerprint: "qr:lead-1",
    });

    expect(prisma.operationalIssue.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { fingerprint: "qr:lead-1" },
        update: expect.objectContaining({
          status: "open",
          occurrence_count: { increment: 1 },
        }),
      }),
    );
  });

  it("atualiza heartbeat sem criar eventos duplicados", async () => {
    prisma.operationalHeartbeat.upsert.mockResolvedValue({
      name: "rubinho-v2",
    });
    await service.heartbeat({ name: "rubinho-v2", status: "healthy" });
    expect(prisma.operationalHeartbeat.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { name: "rubinho-v2" },
        update: expect.objectContaining({ status: "healthy" }),
      }),
    );
  });

  it("conta cada lead em uma unica pergunta e mantem respostas como KPI acumulado", async () => {
    const sentAt = new Date("2026-08-09T12:00:00.000Z");
    prisma.lead.findMany.mockResolvedValue([
      {
        id: "lead-1",
        client_id: "client-1",
        event_interest_id: "event-1",
        name: "Raphael dos Santos",
        first_name: "Raphael",
        last_name: "dos Santos",
        companions: null,
        store_visit_datetime: null,
        description: null,
        vehicle_plate: null,
        confirmation_status: "pending",
        created_at: sentAt,
        updated_at: sentAt,
      },
      {
        id: "lead-2",
        client_id: "client-1",
        event_interest_id: "event-1",
        name: "Lead sem resposta",
        first_name: null,
        last_name: null,
        companions: null,
        store_visit_datetime: null,
        description: null,
        vehicle_plate: null,
        confirmation_status: "pending",
        created_at: sentAt,
        updated_at: sentAt,
      },
    ]);
    prisma.dispatchEvent.findMany.mockResolvedValue([
      {
        lead_id: "lead-1",
        status: "replied",
        sent_at: sentAt,
        delivered_at: sentAt,
        read_at: sentAt,
        replied_at: new Date("2026-08-09T12:01:00.000Z"),
        failed_at: null,
        created_at: sentAt,
      },
      {
        lead_id: "lead-2",
        status: "sent",
        sent_at: sentAt,
        delivered_at: null,
        read_at: null,
        replied_at: null,
        failed_at: null,
        created_at: sentAt,
      },
    ]);
    prisma.conversationState.findMany.mockResolvedValue([]);
    prisma.conversation.findMany.mockResolvedValue([]);

    const result = await service.rubinhoThermometer(
      { role: "gestor" } as never,
      { event_id: "event-1" },
    );

    expect(result.totals.template_sent).toBe(2);
    expect(result.totals.template_replied).toBe(1);
    expect(result.totals.engaged).toBe(1);
    expect(
      result.stages.find((stage) => stage.key === "WAITING_COMPANIONS")?.count,
    ).toBe(1);
    expect(result.stages.reduce((sum, stage) => sum + stage.count, 0)).toBe(1);
    expect(result.rates.scheduling).toBeLessThanOrEqual(100);
    expect(result.rates.completion).toBeLessThanOrEqual(100);
  });

  it("nao classifica lead sem disparo como aguardando template", async () => {
    const createdAt = new Date("2026-08-09T12:00:00.000Z");
    prisma.lead.findMany.mockResolvedValue([
      {
        id: "lead-sem-disparo",
        client_id: "client-1",
        event_interest_id: "event-1",
        name: "Lead organico",
        first_name: null,
        last_name: null,
        companions: null,
        store_visit_datetime: null,
        description: null,
        vehicle_plate: null,
        confirmation_status: "pending",
        created_at: createdAt,
        updated_at: createdAt,
      },
    ]);
    prisma.dispatchEvent.findMany.mockResolvedValue([]);
    prisma.conversationState.findMany.mockResolvedValue([]);
    prisma.conversation.findMany.mockResolvedValue([]);

    const result = await service.rubinhoThermometer(
      { role: "gestor" } as never,
      { event_id: "event-1" },
    );

    expect(result.totals.awaiting_template).toBe(0);
    expect(result.totals.engaged).toBe(0);
  });
});
