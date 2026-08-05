import { Injectable, NotFoundException } from "@nestjs/common";
import { AppointmentStatus, EventStatus } from "@prisma/client";
import { PrismaService } from "../../config/prisma.service";
import { GetAgentEventsAvailabilityQueryDto } from "./dto/get-agent-events-availability-query.dto";
import { GetAgentWhatsappContextQueryDto } from "./dto/get-agent-whatsapp-context-query.dto";

const ACTIVE_APPOINTMENT_STATUSES = [
  AppointmentStatus.proposed,
  AppointmentStatus.scheduled,
  AppointmentStatus.confirmed,
] satisfies AppointmentStatus[];

const CAPACITY_APPOINTMENT_STATUSES = [
  AppointmentStatus.scheduled,
  AppointmentStatus.confirmed,
  AppointmentStatus.completed,
] satisfies AppointmentStatus[];

@Injectable()
export class AgentService {
  constructor(private readonly prisma: PrismaService) {}

  async getWhatsappContext(query: GetAgentWhatsappContextQueryDto) {
    const lead = query.conversation_id
      ? await this.resolveLeadFromConversation(query.conversation_id)
      : await this.resolveLeadById(query.lead_id!);

    const conversation = query.conversation_id
      ? await this.prisma.conversation.findUnique({
          where: { id: query.conversation_id },
          include: {
            messages: { orderBy: { created_at: "desc" }, take: 20 },
          },
        })
      : await this.prisma.conversation.findFirst({
          where: { lead_id: lead.id },
          orderBy: [{ last_message_at: "desc" }, { created_at: "desc" }],
          include: {
            messages: { orderBy: { created_at: "desc" }, take: 20 },
          },
        });

    const [client, appointments, activeEvents, conversationState] =
      await Promise.all([
        this.prisma.client.findUnique({
          where: { id: lead.client_id },
        }),
        this.prisma.appointment.findMany({
          where: { lead_id: lead.id },
          orderBy: [{ scheduled_at: "desc" }, { created_at: "desc" }],
          take: 10,
          include: {
            event: {
              select: {
                id: true,
                name: true,
                event_date: true,
                status: true,
                location: true,
              },
            },
          },
        }),
        this.prisma.event.findMany({
          where: {
            client_id: lead.client_id,
            status: { in: [EventStatus.active, EventStatus.draft] },
          },
          orderBy: { event_date: "asc" },
          take: 10,
        }),
        conversation
          ? this.prisma.conversationState.findUnique({
              where: { conversation_id: conversation.id },
              include: {
                last_offered_event: {
                  select: {
                    id: true,
                    name: true,
                    event_date: true,
                    status: true,
                  },
                },
              },
            })
          : Promise.resolve(null),
      ]);

    if (!client) {
      throw new NotFoundException("Cliente nao encontrado");
    }

    const recentMessages = [...(conversation?.messages ?? [])]
      .reverse()
      .map((message) => ({
        id: message.id,
        sender_type: message.sender_type,
        sender_id: message.sender_id,
        content: message.content,
        media_url: message.media_url,
        read_at: this.toIsoString(message.read_at),
        created_at: this.toIsoString(message.created_at),
      }));

    return {
      lead: {
        id: lead.id,
        client_id: lead.client_id,
        name: lead.name,
        email: lead.email,
        phone: lead.phone,
        source: lead.source,
        tags: lead.tags,
        crm_pipeline_id: lead.crm_pipeline_id,
        crm_stage_id: lead.crm_stage_id,
        crm_pipeline_code: lead.crm_pipeline?.code ?? null,
        crm_stage_code: lead.crm_stage?.code ?? null,
        crm_stage_name: lead.crm_stage?.name ?? null,
        confirmation_status: lead.confirmation_status,
        confirmation_date: this.toIsoString(lead.confirmation_date),
        store_visit_datetime: this.toIsoString(lead.store_visit_datetime),
        event_interest_id: lead.event_interest_id,
        event_interest_name: lead.event_interest?.name ?? null,
        assigned_vendor_id: lead.assigned_vendor_id,
        deleted_at: this.toIsoString(lead.deleted_at),
      },
      client: {
        id: client.id,
        company_name: client.company_name,
        whatsapp_number: client.whatsapp_number,
        phone_number: client.phone_number,
        webhook_url_n8n: client.webhook_url_n8n,
        settings: client.settings,
      },
      conversation: conversation
        ? {
            id: conversation.id,
            client_id: conversation.client_id,
            lead_id: conversation.lead_id,
            channel: conversation.channel,
            last_message_at: this.toIsoString(conversation.last_message_at),
            created_at: this.toIsoString(conversation.created_at),
          }
        : null,
      recent_messages: recentMessages,
      crm: {
        pipeline: lead.crm_pipeline
          ? {
              id: lead.crm_pipeline.id,
              code: lead.crm_pipeline.code,
              name: lead.crm_pipeline.name,
            }
          : null,
        stage: lead.crm_stage
          ? {
              id: lead.crm_stage.id,
              code: lead.crm_stage.code,
              name: lead.crm_stage.name,
            }
          : null,
      },
      appointments: appointments.map((appointment) => ({
        id: appointment.id,
        event_id: appointment.event_id,
        event_name: appointment.event?.name ?? null,
        scheduled_at: this.toIsoString(appointment.scheduled_at),
        timezone: appointment.timezone,
        status: appointment.status,
        channel: appointment.channel,
        source: appointment.source,
        confirmed_at: this.toIsoString(appointment.confirmed_at),
        cancelled_at: this.toIsoString(appointment.cancelled_at),
        rescheduled_from_appointment_id:
          appointment.rescheduled_from_appointment_id,
        notes: appointment.notes,
      })),
      eligible_events: activeEvents.map((event) => ({
        id: event.id,
        name: event.name,
        event_date: this.toIsoString(event.event_date),
        location: event.location,
        capacity: event.capacity,
        status: event.status,
      })),
      conversation_state: conversationState
        ? {
            id: conversationState.id,
            current_intent: conversationState.current_intent,
            awaiting_confirmation: conversationState.awaiting_confirmation,
            last_offered_event_id: conversationState.last_offered_event_id,
            last_offered_event_name:
              conversationState.last_offered_event?.name ?? null,
            last_offered_slot: this.toIsoString(
              conversationState.last_offered_slot,
            ),
            last_agent_action: conversationState.last_agent_action,
            handoff_required: conversationState.handoff_required,
            handoff_reason: conversationState.handoff_reason,
            state_payload: conversationState.state_payload,
            updated_at: this.toIsoString(conversationState.updated_at),
          }
        : null,
      flags: {
        has_active_appointment: appointments.some((appointment) =>
          ACTIVE_APPOINTMENT_STATUSES.some(
            (status) => status === appointment.status,
          ),
        ),
        awaiting_confirmation:
          conversationState?.awaiting_confirmation ?? false,
        handoff_required: conversationState?.handoff_required ?? false,
        ai_response_allowed: !(conversationState?.handoff_required ?? false),
        lead_deleted: Boolean(lead.deleted_at),
      },
    };
  }

  async getEventsAvailability(query: GetAgentEventsAvailabilityQueryDto) {
    const client = await this.prisma.client.findUnique({
      where: { id: query.client_id },
    });

    if (!client) {
      throw new NotFoundException("Cliente nao encontrado");
    }

    let lead: Awaited<ReturnType<typeof this.resolveLeadById>> | null = null;
    if (query.lead_id) {
      lead = await this.resolveLeadById(query.lead_id);
      if (lead.client_id !== query.client_id) {
        throw new NotFoundException("Lead nao encontrado para este cliente");
      }
    }

    const events = await this.prisma.event.findMany({
      where: {
        client_id: query.client_id,
        status: { in: [EventStatus.active, EventStatus.draft] },
      },
      orderBy: { event_date: "asc" },
    });

    const eventIds = events.map((event) => event.id);
    const appointments = eventIds.length
      ? await this.prisma.appointment.findMany({
          where: {
            event_id: { in: eventIds },
            status: {
              in: [
                ...CAPACITY_APPOINTMENT_STATUSES,
                ...ACTIVE_APPOINTMENT_STATUSES,
              ],
            },
          },
          select: {
            id: true,
            event_id: true,
            lead_id: true,
            status: true,
          },
        })
      : [];

    const occupiedByEvent = new Map<string, number>();
    const leadActiveByEvent = new Set<string>();

    for (const appointment of appointments) {
      if (
        CAPACITY_APPOINTMENT_STATUSES.some(
          (status) => status === appointment.status,
        )
      ) {
        occupiedByEvent.set(
          appointment.event_id,
          (occupiedByEvent.get(appointment.event_id) ?? 0) + 1,
        );
      }

      if (
        lead &&
        appointment.lead_id === lead.id &&
        ACTIVE_APPOINTMENT_STATUSES.some(
          (status) => status === appointment.status,
        )
      ) {
        leadActiveByEvent.add(appointment.event_id);
      }
    }

    return {
      client_id: client.id,
      lead_id: lead?.id ?? null,
      rules: client.settings,
      events: events.map((event) => {
        const occupied = occupiedByEvent.get(event.id) ?? 0;
        const remaining =
          event.capacity == null
            ? null
            : Math.max(event.capacity - occupied, 0);
        const blockingReasons: string[] = [];

        if (event.status === EventStatus.draft) {
          blockingReasons.push("event_in_draft");
        }
        if (event.capacity != null && occupied >= event.capacity) {
          blockingReasons.push("capacity_reached");
        }
        if (leadActiveByEvent.has(event.id)) {
          blockingReasons.push("lead_has_active_appointment");
        }

        return {
          id: event.id,
          name: event.name,
          description: event.description,
          event_date: this.toIsoString(event.event_date),
          location: event.location,
          capacity: event.capacity,
          occupied_slots: occupied,
          remaining_slots: remaining,
          status: event.status,
          lead_has_active_appointment: leadActiveByEvent.has(event.id),
          is_available: blockingReasons.length === 0,
          blocking_reasons: blockingReasons,
        };
      }),
    };
  }

  private async resolveLeadFromConversation(conversationId: string) {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      include: {
        lead: {
          include: {
            crm_pipeline: true,
            crm_stage: true,
            event_interest: true,
          },
        },
      },
    });

    if (!conversation) {
      throw new NotFoundException("Conversa nao encontrada");
    }

    return conversation.lead;
  }

  private async resolveLeadById(leadId: string) {
    const lead = await this.prisma.lead.findUnique({
      where: { id: leadId },
      include: {
        crm_pipeline: true,
        crm_stage: true,
        event_interest: true,
      },
    });

    if (!lead || lead.deleted_at) {
      throw new NotFoundException("Lead nao encontrado");
    }

    return lead;
  }

  private toIsoString(value: Date | null) {
    return value ? value.toISOString() : null;
  }
}
