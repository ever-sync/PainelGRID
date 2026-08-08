import { WhatsappContextResolverService } from "./whatsapp-context-resolver.service";

describe("WhatsappContextResolverService", () => {
  const prisma = {
    metaAssetSelection: { findMany: jest.fn() },
    dispatchEvent: { findFirst: jest.fn() },
    lead: { findMany: jest.fn(), findFirst: jest.fn() },
    event: { findFirst: jest.fn() },
    conversation: { findFirst: jest.fn() },
    client: { findUnique: jest.fn() },
    crmPipeline: { findFirst: jest.fn() },
    crmStage: { findFirst: jest.fn() },
  };
  let service: WhatsappContextResolverService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new WhatsappContextResolverService(prisma as never);
    prisma.metaAssetSelection.findMany.mockResolvedValue([
      {
        meta_connection_id: "connection-a",
        meta_connection: { client_id: "client-a" },
      },
      {
        meta_connection_id: "connection-b",
        meta_connection: { client_id: "client-b" },
      },
    ]);
    prisma.lead.findMany.mockResolvedValue([]);
    prisma.conversation.findFirst.mockResolvedValue({
      id: "conversation-b",
      last_message_at: new Date("2026-08-07T12:00:00.000Z"),
    });
    prisma.client.findUnique.mockResolvedValue({
      id: "client-b",
      company_name: "Cliente B",
    });
    prisma.crmPipeline.findFirst.mockResolvedValue({
      id: "pipeline-b",
      code: "PIPELINE_B",
      name: "Pipeline B",
    });
    prisma.crmStage.findFirst.mockResolvedValue({
      id: "stage-b",
      code: "TENTATIVA_B",
      name: "Tentativa B",
    });
  });

  it("usa o template respondido para separar dois clientes no mesmo numero", async () => {
    prisma.dispatchEvent.findFirst.mockResolvedValue({
      id: "dispatch-b",
      client_id: "client-b",
      lead_id: "lead-b",
      event_id: "event-b",
      conversation_id: "conversation-b",
      lead: { event_interest_id: "event-b" },
    });
    prisma.lead.findFirst.mockResolvedValue({
      id: "lead-b",
      client_id: "client-b",
      name: "Maria Souza",
      first_name: "Maria",
      last_name: "Souza",
      phone: "+5511999999999",
      email: null,
      facebook_form_id: "form-b",
      event_interest_id: "event-b",
      crm_pipeline_id: "pipeline-b",
      crm_stage_id: "stage-b",
      preferred_contact_channel: "whatsapp",
    });
    prisma.event.findFirst.mockResolvedValue({
      id: "event-b",
      client_id: "client-b",
      name: "Evento B",
      description: "Condições do Evento B",
      event_type: "Grand Prix de Vendas",
      event_date: new Date("2026-09-10T12:00:00.000Z"),
      event_end_date: null,
      event_days: [],
      location: "Loja B",
      status: "active",
    });

    const result = await service.resolve({
      phoneNumberId: "shared-phone-number",
      customerPhone: "5511999999999",
      providerMessageId: "wamid-template-b",
    });

    expect(prisma.dispatchEvent.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          client_id: { in: ["client-a", "client-b"] },
          provider_message_id: "wamid-template-b",
        }),
      }),
    );
    expect(result).toMatchObject({
      authorized: true,
      routing_reason: "provider_message_context",
      dispatch_id: "dispatch-b",
      client: { id: "client-b" },
      event: { id: "event-b", name: "Evento B" },
      lead: { id: "lead-b", facebook_form_id: "form-b" },
      conversation: { id: "conversation-b" },
    });
  });

  it("bloqueia quando o telefone possui mais de um contexto sem disparo", async () => {
    prisma.dispatchEvent.findFirst.mockResolvedValue(null);
    prisma.lead.findMany.mockResolvedValue([
      {
        id: "lead-a",
        client_id: "client-a",
        event_interest_id: "event-a",
      },
      {
        id: "lead-b",
        client_id: "client-b",
        event_interest_id: "event-b",
      },
    ]);

    await expect(
      service.resolve({
        phoneNumberId: "shared-phone-number",
        customerPhone: "5511999999999",
      }),
    ).resolves.toEqual({
      authorized: false,
      reason: "ambiguous_context",
    });
    expect(prisma.event.findFirst).not.toHaveBeenCalled();
  });
});
