/* eslint-disable @typescript-eslint/no-explicit-any */
import { ConflictException, NotFoundException } from '@nestjs/common';
import { ConversationStateService } from './conversation-state.service';

describe('ConversationStateService', () => {
  const clientId = '11111111-1111-4111-8111-111111111111';
  const leadId = '22222222-2222-4222-8222-222222222222';
  const conversationId = '33333333-3333-4333-8333-333333333333';
  const eventId = '44444444-4444-4444-8444-444444444444';

  let prisma: any;
  let service: ConversationStateService;

  beforeEach(() => {
    prisma = {
      event: { findUnique: jest.fn() },
      conversation: { findUnique: jest.fn() },
      conversationState: {
        findUnique: jest.fn(),
        upsert: jest.fn(),
      },
    };

    service = new ConversationStateService(prisma);
  });

  it('faz upsert de estado para a conversa', async () => {
    prisma.conversation.findUnique.mockResolvedValue({
      id: conversationId,
      client_id: clientId,
      lead_id: leadId,
      lead: { id: leadId },
    });
    prisma.event.findUnique.mockResolvedValue({
      id: eventId,
      client_id: clientId,
      participants: [{ client_id: clientId }],
    });
    prisma.conversationState.upsert.mockResolvedValue({
      id: 'state-1',
      conversation_id: conversationId,
      client_id: clientId,
      lead_id: leadId,
      current_intent: 'schedule_visit',
      awaiting_confirmation: true,
      last_offered_event_id: eventId,
      last_offered_event: { name: 'Open House' },
      last_offered_slot: new Date('2026-04-22T17:00:00.000Z'),
      last_agent_action: 'offer_slots',
      handoff_required: false,
      handoff_reason: null,
      state_payload: { step: 'awaiting_confirmation' },
      updated_at: new Date('2026-04-20T15:01:00.000Z'),
    });

    const result = await service.updateState(conversationId, {
      current_intent: 'schedule_visit',
      awaiting_confirmation: true,
      last_offered_event_id: eventId,
      last_offered_slot: '2026-04-22T14:00:00-03:00',
      last_agent_action: 'offer_slots',
      state_payload: { step: 'awaiting_confirmation' },
    });

    expect(prisma.conversationState.upsert).toHaveBeenCalled();
    expect(result).toEqual(
      expect.objectContaining({
        conversation_id: conversationId,
        current_intent: 'schedule_visit',
        last_offered_event_id: eventId,
        last_offered_event_name: 'Open House',
      }),
    );
  });

  it('rejeita evento que nao pertence ao cliente da conversa', async () => {
    prisma.conversation.findUnique.mockResolvedValue({
      id: conversationId,
      client_id: clientId,
      lead_id: leadId,
      lead: { id: leadId },
    });
    prisma.event.findUnique.mockResolvedValue({
      id: eventId,
      client_id: 'another-client',
    });

    await expect(
      service.updateState(conversationId, {
        last_offered_event_id: eventId,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('bloqueia atualizacao da IA quando handoff estiver ativo', async () => {
    prisma.conversation.findUnique.mockResolvedValue({
      id: conversationId,
      client_id: clientId,
      lead_id: leadId,
      lead: { id: leadId },
    });
    prisma.conversationState.findUnique.mockResolvedValue({
      id: 'state-1',
      conversation_id: conversationId,
      handoff_required: true,
    });

    await expect(
      service.updateState(conversationId, {
        current_intent: 'schedule_visit',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
