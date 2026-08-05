import { AgentActionLogService } from "./agent-action-log.service";

describe("AgentActionLogService", () => {
  const clientId = "11111111-1111-4111-8111-111111111111";
  const leadId = "22222222-2222-4222-8222-222222222222";
  const conversationId = "33333333-3333-4333-8333-333333333333";

  let prisma: any;
  let conversationStateService: any;
  let service: AgentActionLogService;

  beforeEach(() => {
    prisma = {
      agentActionLog: {
        create: jest.fn(),
        findMany: jest.fn(),
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

    service = new AgentActionLogService(prisma, conversationStateService, {
      dispatch: jest.fn(),
    } as never);
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
});
