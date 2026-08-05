import { AppointmentStatus, EventStatus } from "@prisma/client";
import { AgentService } from "./agent.service";

describe("AgentService", () => {
  const clientId = "11111111-1111-4111-8111-111111111111";
  const leadId = "22222222-2222-4222-8222-222222222222";
  const conversationId = "33333333-3333-4333-8333-333333333333";
  const eventId = "44444444-4444-4444-8444-444444444444";

  let prisma: any;
  let service: AgentService;

  beforeEach(() => {
    prisma = {
      client: { findUnique: jest.fn() },
      lead: { findUnique: jest.fn() },
      conversation: { findUnique: jest.fn(), findFirst: jest.fn() },
      conversationState: { findUnique: jest.fn() },
      appointment: { findMany: jest.fn() },
      event: { findMany: jest.fn() },
    };

    service = new AgentService(prisma);
  });

  it("monta contexto consolidado a partir de conversation_id", async () => {
    prisma.conversation.findUnique
      .mockResolvedValueOnce({
        id: conversationId,
        lead: {
          id: leadId,
          client_id: clientId,
          name: "Maria",
          email: "maria@example.com",
          phone: "11999999999",
          source: "whatsapp",
          tags: ["vip"],
          crm_pipeline_id: null,
          crm_stage_id: null,
          crm_pipeline: null,
          crm_stage: null,
          event_interest_id: null,
          event_interest: null,
          confirmation_status: "pending",
          confirmation_date: null,
          store_visit_datetime: null,
          assigned_vendor_id: null,
          deleted_at: null,
        },
      })
      .mockResolvedValueOnce({
        id: conversationId,
        client_id: clientId,
        lead_id: leadId,
        channel: "whatsapp",
        last_message_at: new Date("2026-04-20T15:00:00.000Z"),
        created_at: new Date("2026-04-20T14:00:00.000Z"),
        messages: [
          {
            id: "m2",
            sender_type: "user",
            sender_id: null,
            content: "Pode me mostrar horarios?",
            media_url: null,
            read_at: null,
            created_at: new Date("2026-04-20T15:00:00.000Z"),
          },
          {
            id: "m1",
            sender_type: "lead",
            sender_id: null,
            content: "Oi",
            media_url: null,
            read_at: null,
            created_at: new Date("2026-04-20T14:59:00.000Z"),
          },
        ],
      });
    prisma.client.findUnique.mockResolvedValue({
      id: clientId,
      company_name: "Cliente Demo",
      whatsapp_number: null,
      phone_number: null,
      webhook_url_n8n: null,
      settings: { handoff: { enabled: true } },
    });
    prisma.appointment.findMany.mockResolvedValue([
      {
        id: "apt-1",
        event_id: eventId,
        event: { name: "Open House" },
        scheduled_at: new Date("2026-04-22T17:00:00.000Z"),
        timezone: "America/Sao_Paulo",
        status: AppointmentStatus.scheduled,
        channel: "whatsapp",
        source: "n8n_ai_agent",
        confirmed_at: null,
        cancelled_at: null,
        rescheduled_from_appointment_id: null,
        notes: null,
      },
    ]);
    prisma.event.findMany.mockResolvedValue([
      {
        id: eventId,
        name: "Open House",
        event_date: new Date("2026-04-22T17:00:00.000Z"),
        location: "Loja Centro",
        capacity: 20,
        status: EventStatus.active,
      },
    ]);
    prisma.conversationState.findUnique.mockResolvedValue({
      id: "state-1",
      current_intent: "schedule_visit",
      awaiting_confirmation: true,
      last_offered_event_id: eventId,
      last_offered_event: { name: "Open House" },
      last_offered_slot: new Date("2026-04-22T17:00:00.000Z"),
      last_agent_action: "offer_slots",
      handoff_required: false,
      handoff_reason: null,
      state_payload: { step: "awaiting_confirmation" },
      updated_at: new Date("2026-04-20T15:01:00.000Z"),
    });

    const result = await service.getWhatsappContext({
      conversation_id: conversationId,
    });

    expect(result.lead.id).toBe(leadId);
    expect(result.conversation).not.toBeNull();
    expect(result.conversation!.id).toBe(conversationId);
    expect(result.recent_messages).toHaveLength(2);
    expect(result.conversation_state).not.toBeNull();
    expect(result.conversation_state!.current_intent).toBe("schedule_visit");
    expect(result.flags.awaiting_confirmation).toBe(true);
    expect(result.flags.has_active_appointment).toBe(true);
  });

  it("calcula disponibilidade por evento e bloqueios do lead", async () => {
    prisma.client.findUnique.mockResolvedValue({
      id: clientId,
      settings: { slot_strategy: "simple_capacity" },
    });
    prisma.lead.findUnique.mockResolvedValue({
      id: leadId,
      client_id: clientId,
      deleted_at: null,
      crm_pipeline: null,
      crm_stage: null,
      event_interest: null,
    });
    prisma.event.findMany.mockResolvedValue([
      {
        id: eventId,
        name: "Open House",
        description: null,
        event_date: new Date("2026-04-22T17:00:00.000Z"),
        location: "Loja Centro",
        capacity: 1,
        status: EventStatus.active,
      },
      {
        id: "event-2",
        name: "Preview",
        description: null,
        event_date: new Date("2026-04-23T17:00:00.000Z"),
        location: "Loja Sul",
        capacity: 10,
        status: EventStatus.draft,
      },
    ]);
    prisma.appointment.findMany.mockResolvedValue([
      {
        id: "apt-1",
        event_id: eventId,
        lead_id: leadId,
        status: AppointmentStatus.scheduled,
      },
      {
        id: "apt-2",
        event_id: eventId,
        lead_id: "another-lead",
        status: AppointmentStatus.confirmed,
      },
    ]);

    const result = await service.getEventsAvailability({
      client_id: clientId,
      lead_id: leadId,
    });

    expect(result.events[0]).toEqual(
      expect.objectContaining({
        id: eventId,
        occupied_slots: 2,
        is_available: false,
      }),
    );
    expect(result.events[0].blocking_reasons).toContain("capacity_reached");
    expect(result.events[0].blocking_reasons).toContain(
      "lead_has_active_appointment",
    );
    expect(result.events[1].blocking_reasons).toContain("event_in_draft");
  });
});
