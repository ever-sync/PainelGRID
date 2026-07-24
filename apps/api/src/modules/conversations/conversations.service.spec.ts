/* eslint-disable @typescript-eslint/no-explicit-any */
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { SenderType } from '@prisma/client';
import { Role } from '../../common/types';
import { ConversationsService } from './conversations.service';

const clientId = '11111111-1111-4111-8111-111111111111';
const convId = 'cccc0000-0000-4000-8000-000000000001';
const leadId = 'aaaa0000-0000-4000-8000-000000000001';

const makeConv = (channel = 'whatsapp') => ({
  id: convId,
  client_id: clientId,
  lead_id: leadId,
  channel,
  last_message_at: new Date(),
  created_at: new Date(),
});

const makeMsg = (overrides: Partial<Record<string, unknown>> = {}) => ({
  id: 'msg-1',
  conversation_id: convId,
  sender_type: SenderType.lead,
  sender_id: null,
  content: 'oi',
  external_id: null,
  media_id: null,
  media_url: null,
  created_at: new Date(),
  ...overrides,
});

describe('ConversationsService', () => {
  let prisma: any;
  let clientsService: any;
  let realtimeEvents: any;
  let metaService: any;
  let service: ConversationsService;

  beforeEach(() => {
    prisma = {
      conversation: { findMany: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
      message: { findMany: jest.fn(), create: jest.fn() },
      lead: { findUnique: jest.fn() },
      agentActionLog: { findMany: jest.fn() },
      conversationState: { upsert: jest.fn().mockResolvedValue({ updated_at: new Date() }) },
    };
    clientsService = { assertGestorOwnsClient: jest.fn().mockResolvedValue(undefined) };
    realtimeEvents = { emitNewMessage: jest.fn() };
    metaService = { sendClientWhatsappMessage: jest.fn().mockResolvedValue('wamid-1') };
    service = new ConversationsService(prisma, clientsService, realtimeEvents, metaService, {
      dispatch: jest.fn(),
    } as never);
  });

  // ─── findAll ─────────────────────────────────────────────────────────────

  describe('findAll', () => {
    const baseRow = {
      id: convId,
      client_id: clientId,
      lead_id: leadId,
      channel: 'whatsapp',
      last_message_at: new Date(),
      created_at: new Date(),
      lead: { id: leadId, name: 'Maria' },
      state: {
        handoff_required: true,
        handoff_reason: 'urgente',
        last_agent_action: 'wait',
        updated_at: new Date(),
      },
      messages: [{ content: 'ola' }],
    };

    it('GESTOR: delega ownership a clientsService e mapeia resposta', async () => {
      prisma.conversation.findMany.mockResolvedValue([baseRow]);

      const result = await service.findAll(
        { sub: 'g1', role: Role.GESTOR, email: 'g@x', name: 'G' } as any,
        { client_id: clientId } as any,
      );

      expect(clientsService.assertGestorOwnsClient).toHaveBeenCalledWith('g1', clientId);
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        id: convId,
        lead_name: 'Maria',
        last_message: 'ola',
        handoff_required: true,
        handoff_reason: 'urgente',
      });
    });

    it('VENDEDOR: passa quando client_id coincide', async () => {
      prisma.conversation.findMany.mockResolvedValue([]);
      await expect(
        service.findAll(
          { sub: 'v1', role: Role.VENDEDOR, email: 'v@x', name: 'V', client_id: clientId } as any,
          { client_id: clientId } as any,
        ),
      ).resolves.toEqual([]);
      expect(clientsService.assertGestorOwnsClient).not.toHaveBeenCalled();
    });

    it('VENDEDOR: bloqueia quando client_id difere', async () => {
      await expect(
        service.findAll(
          { sub: 'v1', role: Role.VENDEDOR, email: 'v@x', name: 'V', client_id: 'outro' } as any,
          { client_id: clientId } as any,
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('usa string vazia como last_message quando sem mensagens', async () => {
      prisma.conversation.findMany.mockResolvedValue([{ ...baseRow, messages: [], state: null }]);
      const result = await service.findAll(
        { sub: 'g1', role: Role.GESTOR, email: 'g@x', name: 'G' } as any,
        { client_id: clientId } as any,
      );
      expect(result[0].last_message).toBe('');
      expect(result[0].handoff_required).toBe(false);
    });
  });

  // ─── findMessages ─────────────────────────────────────────────────────────

  describe('findMessages', () => {
    it('lança NotFoundException quando conversa nao existe', async () => {
      prisma.conversation.findUnique.mockResolvedValue(null);
      await expect(
        service.findMessages({ sub: 'u', role: Role.GESTOR } as any, 'nao-existe'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('RECEPCAO: bloqueia client_id divergente', async () => {
      prisma.conversation.findUnique.mockResolvedValue(makeConv());
      await expect(
        service.findMessages({ sub: 'r1', role: Role.RECEPCAO, client_id: 'outro' } as any, convId),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('retorna mensagens quando autorizado', async () => {
      const msgs = [makeMsg({ id: 'msg-1' }), makeMsg({ id: 'msg-2' })];
      prisma.conversation.findUnique.mockResolvedValue(makeConv());
      prisma.message.findMany.mockResolvedValue(msgs);

      const result = await service.findMessages({ sub: 'g1', role: Role.GESTOR } as any, convId);

      expect(prisma.message.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { conversation_id: convId } }),
      );
      expect(result).toHaveLength(2);
    });
  });

  // ─── findAgentActions ────────────────────────────────────────────────────

  describe('findAgentActions', () => {
    it('lança NotFoundException quando conversa nao existe', async () => {
      prisma.conversation.findUnique.mockResolvedValue(null);
      await expect(
        service.findAgentActions({ sub: 'u', role: Role.GESTOR } as any, 'x'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('retorna logs mapeados', async () => {
      prisma.conversation.findUnique.mockResolvedValue(makeConv());
      prisma.agentActionLog.findMany.mockResolvedValue([
        {
          id: 'log-1',
          conversation_id: convId,
          provider: 'openai',
          model: 'gpt-4',
          trigger_type: 'message',
          decision_type: 'reply',
          confidence: 0.9,
          input_summary: 'in',
          output_summary: 'out',
          action_payload: {},
          result_status: 'success',
          error_message: null,
          created_at: new Date(),
        },
      ]);

      const result = await service.findAgentActions(
        { sub: 'g1', role: Role.GESTOR } as any,
        convId,
      );

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({ id: 'log-1', provider: 'openai' });
    });
  });

  // ─── addMessage ───────────────────────────────────────────────────────────

  describe('addMessage', () => {
    it('lança NotFoundException quando conversa nao existe', async () => {
      prisma.conversation.findUnique.mockResolvedValue(null);
      await expect(
        service.addMessage({ sub: 'u', role: Role.GESTOR } as any, convId, {
          content: 'oi',
        } as any),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('RECEPCAO → sender_type=system, nao chama metaService', async () => {
      prisma.conversation.findUnique.mockResolvedValue(makeConv('whatsapp'));
      prisma.message.create.mockResolvedValue(makeMsg({ sender_type: SenderType.system }));
      prisma.conversation.update.mockResolvedValue({});

      await service.addMessage(
        { sub: 'r1', role: Role.RECEPCAO, client_id: clientId } as any,
        convId,
        { content: ' oi ' } as any,
      );

      expect(metaService.sendClientWhatsappMessage).not.toHaveBeenCalled();
      expect(prisma.message.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ sender_type: SenderType.system, content: 'oi' }),
        }),
      );
    });

    it('GESTOR + whatsapp → sender_type=user, chama metaService e emite realtime', async () => {
      prisma.conversation.findUnique.mockResolvedValue(makeConv('whatsapp'));
      prisma.lead.findUnique.mockResolvedValue({ phone: '+5511999990000' });
      const created = makeMsg({ sender_type: SenderType.user, content: 'ola' });
      prisma.message.create.mockResolvedValue(created);
      prisma.conversation.update.mockResolvedValue({});

      await service.addMessage({ sub: 'g1', role: Role.GESTOR } as any, convId, {
        content: 'ola',
      } as any);

      expect(metaService.sendClientWhatsappMessage).toHaveBeenCalledWith(
        clientId,
        '+5511999990000',
        'ola',
      );
      expect(realtimeEvents.emitNewMessage).toHaveBeenCalledWith(
        clientId,
        expect.objectContaining({ conversation_id: convId }),
      );
    });

    it('canal nao-whatsapp → nao chama metaService', async () => {
      prisma.conversation.findUnique.mockResolvedValue(makeConv('web'));
      prisma.message.create.mockResolvedValue(makeMsg({ sender_type: SenderType.user }));
      prisma.conversation.update.mockResolvedValue({});

      await service.addMessage(
        { sub: 'v1', role: Role.VENDEDOR, client_id: clientId } as any,
        convId,
        { content: 'msg' } as any,
      );

      expect(metaService.sendClientWhatsappMessage).not.toHaveBeenCalled();
    });

    it('findAll: vendedor visualiza apenas conversas dos seus proprios leads', async () => {
      prisma.conversation.findMany.mockResolvedValue([]);
      await service.findAll(
        { sub: 'vendor-123', role: Role.VENDEDOR, client_id: clientId } as any,
        { client_id: clientId },
      );
      expect(prisma.conversation.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            client_id: clientId,
            lead: { assigned_vendor_id: 'vendor-123', deleted_at: null },
          }),
        }),
      );
    });
  });
});
