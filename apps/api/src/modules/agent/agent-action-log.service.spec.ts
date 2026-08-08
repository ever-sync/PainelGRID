import { AgentActionLogService } from "./agent-action-log.service";

describe("AgentActionLogService", () => {
  const clientId = "11111111-1111-4111-8111-111111111111";
  const leadId = "22222222-2222-4222-8222-222222222222";
  const conversationId = "33333333-3333-4333-8333-333333333333";

  let prisma: any;
  let conversationStateService: any;
  let appointments: any;
  let service: AgentActionLogService;

  beforeEach(() => {
    prisma = {
      agentActionLog: {
        create: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
      },
      message: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      lead: {
        findUnique: jest.fn().mockResolvedValue(null),
        update: jest.fn(),
      },
    };

    conversationStateService = {
      getRequiredConversation: jest.fn().mockResolvedValue({
        id: conversationId,
        client_id: clientId,
        lead_id: leadId,
      }),
      upsertForConversation: jest.fn().mockResolvedValue({
        conversation_id: conversationId,
        client_id: clientId,
        lead_id: leadId,
        handoff_required: true,
        handoff_reason: "solicitou humano",
        last_agent_action: "handoff_requested",
        updated_at: new Date("2026-04-20T18:00:00.000Z"),
      }),
    };

    appointments = {
      deliverCredentialForLead: jest.fn(),
    };
    service = new AgentActionLogService(
      prisma,
      conversationStateService,
      { dispatch: jest.fn() } as never,
      appointments,
    );
  });

  it("registra acao do agente vinculada a conversa", async () => {
    prisma.agentActionLog.create.mockResolvedValue({
      id: "log-1",
      conversation_id: conversationId,
      client_id: clientId,
      lead_id: leadId,
      provider: "openai",
      model: "gpt-5.4-mini",
      trigger_type: "incoming_message",
      decision_type: "classify_intent",
      confidence: 0.88,
      input_summary: "lead quer remarcar",
      output_summary: "classificado como reagendamento",
      action_payload: { intent: "reschedule" },
      result_status: "completed",
      error_message: null,
      created_at: new Date("2026-04-20T18:01:00.000Z"),
    });

    const result = await service.createActionLog(conversationId, {
      message_id: "44444444-4444-4444-8444-444444444444",
      provider: "openai",
      model: "gpt-5.4-mini",
      trigger_type: "incoming_message",
      decision_type: "classify_intent",
      confidence: 0.88,
      input_summary: "lead quer remarcar",
      output_summary: "classificado como reagendamento",
      action_payload: { intent: "reschedule" },
      result_status: "completed",
    });

    expect(prisma.agentActionLog.create).toHaveBeenCalled();
    expect(prisma.message.updateMany).toHaveBeenCalledWith({
      where: {
        id: "44444444-4444-4444-8444-444444444444",
        conversation_id: conversationId,
      },
      data: {
        author_type: "rubinho",
        origin: "n8n",
        agent_action_log_id: "log-1",
      },
    });
    expect(result).toEqual(
      expect.objectContaining({
        conversation_id: conversationId,
        decision_type: "classify_intent",
        confidence: 0.88,
      }),
    );
  });

  it("abre handoff e audita a decisao correspondente", async () => {
    prisma.agentActionLog.create.mockResolvedValue({
      id: "log-2",
      conversation_id: conversationId,
      client_id: clientId,
      lead_id: leadId,
      provider: null,
      model: null,
      trigger_type: "handoff_request",
      decision_type: "handoff",
      confidence: 0.24,
      input_summary: "pedido sensivel",
      output_summary: "encaminhar para recepcao",
      action_payload: {
        requested_by_type: "agent",
        requested_by_id: null,
        note: "encaminhar",
      },
      result_status: "handoff_required",
      error_message: null,
      created_at: new Date("2026-04-20T18:03:00.000Z"),
    });

    const result = await service.requestHandoff(conversationId, {
      reason: "pedido sensivel",
      note: "encaminhar para recepcao",
      confidence: 0.24,
    });

    expect(conversationStateService.upsertForConversation).toHaveBeenCalledWith(
      conversationId,
      {
        last_agent_action: "handoff_requested",
        handoff_required: true,
        handoff_reason: "pedido sensivel",
      },
    );
    expect(result).toEqual(
      expect.objectContaining({
        conversation_id: conversationId,
        handoff_required: true,
        handoff_reason: "solicitou humano",
      }),
    );
  });

  it("consolida nome do acompanhante quando a quantidade ja foi salva", async () => {
    prisma.lead.findUnique.mockResolvedValue({
      companions: "1",
      name: "Rafaela Lobo",
      first_name: "Rafaela",
      last_name: "Lobo",
    });
    prisma.lead.update.mockResolvedValue({});
    prisma.agentActionLog.create.mockImplementation(({ data }: any) =>
      Promise.resolve({
        id: "log-companion",
        ...data,
        created_at: new Date("2026-08-08T12:22:48.000Z"),
      }),
    );

    await service.createActionLog(conversationId, {
      trigger_type: "incoming_message",
      decision_type: "collect_data",
      result_status: "success",
      tool_name: "WAITING_COMPANIONS",
      received_message: "Gael Lobo",
    });

    expect(prisma.lead.update).toHaveBeenCalledWith({
      where: { id: leadId },
      data: { companions: "1 acompanhante: Gael Lobo" },
    });
  });

  it("recupera o nome do acompanhante de uma resposta anterior", async () => {
    prisma.lead.findUnique.mockResolvedValue({
      companions: "1",
      name: "Rafaela Lobo",
      first_name: "Rafaela",
      last_name: "Lobo",
    });
    prisma.agentActionLog.findMany.mockResolvedValue([
      { received_message: "Elisa Lobo" },
      { received_message: "Rafaela Lobo" },
    ]);
    prisma.lead.update.mockResolvedValue({});
    prisma.agentActionLog.create.mockImplementation(({ data }: any) =>
      Promise.resolve({
        id: "log-companion-history",
        ...data,
        created_at: new Date("2026-08-08T13:26:54.000Z"),
      }),
    );

    await service.createActionLog(conversationId, {
      trigger_type: "incoming_message",
      decision_type: "collect_data",
      result_status: "success",
      tool_name: "WAITING_COMPANION_NAMES",
      received_message: "14",
    });

    expect(prisma.lead.update).toHaveBeenCalledWith({
      where: { id: leadId },
      data: { companions: "1 acompanhante: Elisa Lobo" },
    });
  });

  it("aciona entrega garantida da credencial na confirmacao final", async () => {
    appointments.deliverCredentialForLead.mockResolvedValue({
      sent: true,
      email: { sent: true },
    });
    prisma.agentActionLog.create.mockImplementation(({ data }: any) =>
      Promise.resolve({
        id: "log-final",
        ...data,
        created_at: new Date("2026-08-08T12:26:23.000Z"),
      }),
    );

    await service.createActionLog(conversationId, {
      trigger_type: "incoming_message",
      decision_type: "finalize",
      result_status: "success",
      tool_name: "final_confirmation",
      received_message: "Está sim",
    });

    expect(appointments.deliverCredentialForLead).toHaveBeenCalledWith(
      leadId,
      `rubinho-final:${conversationId}:${leadId}`,
    );
    expect(prisma.agentActionLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          api_response: expect.objectContaining({
            qr_delivery: expect.objectContaining({ sent: true }),
          }),
        }),
      }),
    );
  });
});
