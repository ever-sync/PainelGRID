import {
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../config/prisma.service";
import { UpdateConversationStateDto } from "./dto/update-conversation-state.dto";

@Injectable()
export class ConversationStateService {
  constructor(private readonly prisma: PrismaService) {}

  async findByConversationId(conversationId: string) {
    return this.prisma.conversationState.findUnique({
      where: { conversation_id: conversationId },
      include: {
        last_offered_event: {
          select: { id: true, name: true, event_date: true, status: true },
        },
      },
    });
  }

  async getRequiredConversation(conversationId: string) {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      include: {
        lead: true,
      },
    });

    if (!conversation) {
      throw new NotFoundException("Conversa nao encontrada");
    }

    return conversation;
  }

  async upsertForConversation(
    conversationId: string,
    data: {
      current_intent?: string | null;
      awaiting_confirmation?: boolean;
      last_offered_event_id?: string | null;
      last_offered_slot?: Date | null;
      last_agent_action?: string | null;
      handoff_required?: boolean;
      handoff_reason?: string | null;
      state_payload?: Prisma.InputJsonValue;
    },
  ) {
    const conversation = await this.getRequiredConversation(conversationId);

    return this.prisma.conversationState.upsert({
      where: { conversation_id: conversationId },
      create: {
        conversation_id: conversationId,
        client_id: conversation.client_id,
        lead_id: conversation.lead_id,
        current_intent: data.current_intent ?? null,
        awaiting_confirmation: data.awaiting_confirmation ?? false,
        last_offered_event_id: data.last_offered_event_id ?? null,
        last_offered_slot: data.last_offered_slot ?? null,
        last_agent_action: data.last_agent_action ?? null,
        handoff_required: data.handoff_required ?? false,
        handoff_reason: data.handoff_reason ?? null,
        state_payload: data.state_payload ?? {},
      },
      update: {
        current_intent: data.current_intent,
        awaiting_confirmation: data.awaiting_confirmation,
        last_offered_event_id: data.last_offered_event_id,
        last_offered_slot: data.last_offered_slot,
        last_agent_action: data.last_agent_action,
        handoff_required: data.handoff_required,
        handoff_reason: data.handoff_reason,
        state_payload: data.state_payload,
        client_id: conversation.client_id,
        lead_id: conversation.lead_id,
      },
      include: {
        last_offered_event: {
          select: { id: true, name: true, event_date: true, status: true },
        },
      },
    });
  }

  async updateState(conversationId: string, dto: UpdateConversationStateDto) {
    const conversation = await this.getRequiredConversation(conversationId);
    const currentState = await this.findByConversationId(conversationId);

    if (currentState?.handoff_required && dto.handoff_required !== false) {
      throw new ConflictException("Handoff humano ativo para esta conversa");
    }

    if (dto.last_offered_event_id) {
      const event = await this.prisma.event.findUnique({
        where: { id: dto.last_offered_event_id },
        include: {
          participants: {
            select: { client_id: true },
          },
        },
      });

      const participantClientIds = event?.participants?.length
        ? event.participants.map((participant) => participant.client_id)
        : [];

      if (!event || !participantClientIds.includes(conversation.client_id)) {
        throw new NotFoundException("Evento nao encontrado para esta conversa");
      }
    }

    const state = await this.upsertForConversation(conversationId, {
      current_intent: dto.current_intent,
      awaiting_confirmation: dto.awaiting_confirmation,
      last_offered_event_id: dto.last_offered_event_id,
      last_offered_slot: dto.last_offered_slot
        ? new Date(dto.last_offered_slot)
        : undefined,
      last_agent_action: dto.last_agent_action,
      handoff_required: dto.handoff_required,
      handoff_reason: dto.handoff_reason,
      state_payload: dto.state_payload as Prisma.InputJsonValue | undefined,
    });

    return {
      id: state.id,
      conversation_id: state.conversation_id,
      client_id: state.client_id,
      lead_id: state.lead_id,
      current_intent: state.current_intent,
      awaiting_confirmation: state.awaiting_confirmation,
      last_offered_event_id: state.last_offered_event_id,
      last_offered_event_name: state.last_offered_event?.name ?? null,
      last_offered_slot: this.toIsoString(state.last_offered_slot),
      last_agent_action: state.last_agent_action,
      handoff_required: state.handoff_required,
      handoff_reason: state.handoff_reason,
      state_payload: state.state_payload,
      updated_at: this.toIsoString(state.updated_at),
    };
  }

  private toIsoString(value: Date | null) {
    return value ? value.toISOString() : null;
  }
}
