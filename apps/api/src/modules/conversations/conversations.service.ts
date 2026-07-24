import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, SenderType } from '@prisma/client';
import { Role } from '../../common/types';
import { PrismaService } from '../../config/prisma.service';
import { AuthenticatedUser } from '../auth/auth.types';
import { ClientsService } from '../clients/clients.service';
import { ClientWebhookService } from '../crm/client-webhook.service';
import { MetaService } from '../meta/meta.service';
import { RealtimeEventsService } from '../realtime/realtime-events.service';
import { CreateMessageDto } from './dto/create-message.dto';
import { EnsureConversationDto } from './dto/ensure-conversation.dto';
import { FindConversationsQueryDto } from './dto/find-conversations-query.dto';

@Injectable()
export class ConversationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clientsService: ClientsService,
    private readonly realtimeEvents: RealtimeEventsService,
    private readonly metaService: MetaService,
    private readonly clientWebhook: ClientWebhookService,
  ) {}

  private async assertClientRead(user: AuthenticatedUser, clientId: string) {
    if (user.role === Role.GESTOR) {
      await this.clientsService.assertGestorOwnsClient(user.sub, clientId);
      return;
    }
    if (user.role === Role.CLIENTE || user.role === Role.VENDEDOR || user.role === Role.RECEPCAO) {
      if (!user.client_id || user.client_id !== clientId) {
        throw new ForbiddenException('Sem permissao');
      }
      return;
    }
    throw new ForbiddenException('Sem permissao');
  }

  async findAll(user: AuthenticatedUser, query: FindConversationsQueryDto) {
    await this.assertClientRead(user, query.client_id);

    const where: Prisma.ConversationWhereInput = { client_id: query.client_id };
    if (user.role === Role.VENDEDOR) {
      where.lead = { assigned_vendor_id: user.sub, deleted_at: null };
    }

    const rows = await this.prisma.conversation.findMany({
      where,
      orderBy: { last_message_at: 'desc' },
      include: {
        lead: { select: { id: true, name: true } },
        state: {
          select: {
            handoff_required: true,
            handoff_reason: true,
            last_agent_action: true,
            updated_at: true,
          },
        },
        messages: { orderBy: { created_at: 'desc' }, take: 1 },
      },
    });

    return rows.map((row) => ({
      id: row.id,
      client_id: row.client_id,
      lead_id: row.lead_id,
      lead_name: row.lead.name,
      channel: row.channel,
      last_message_at: row.last_message_at,
      last_message: row.messages[0]?.content ?? '',
      handoff_required: row.state?.handoff_required ?? false,
      handoff_reason: row.state?.handoff_reason ?? null,
      last_agent_action: row.state?.last_agent_action ?? null,
      handoff_updated_at: row.state?.updated_at ?? null,
      created_at: row.created_at,
    }));
  }

  async ensureConversation(user: AuthenticatedUser, dto: EnsureConversationDto) {
    await this.assertClientRead(user, dto.client_id);

    const lead = await this.prisma.lead.findFirst({
      where: {
        id: dto.lead_id,
        client_id: dto.client_id,
        deleted_at: null,
      },
      select: { id: true },
    });
    if (!lead) {
      throw new NotFoundException('Lead nao encontrado para este cliente');
    }

    let conversation = await this.prisma.conversation.findFirst({
      where: {
        client_id: dto.client_id,
        lead_id: dto.lead_id,
        channel: dto.channel,
      },
      orderBy: { created_at: 'desc' },
    });

    if (!conversation) {
      conversation = await this.prisma.conversation.create({
        data: {
          client_id: dto.client_id,
          lead_id: dto.lead_id,
          channel: dto.channel,
          last_message_at: new Date(),
        },
      });
    }

    const row = await this.prisma.conversation.findUnique({
      where: { id: conversation.id },
      include: {
        lead: { select: { id: true, name: true } },
        state: {
          select: {
            handoff_required: true,
            handoff_reason: true,
            last_agent_action: true,
            updated_at: true,
          },
        },
        messages: { orderBy: { created_at: 'desc' }, take: 1 },
      },
    });

    if (!row) {
      throw new NotFoundException('Conversa nao encontrada');
    }

    return {
      id: row.id,
      client_id: row.client_id,
      lead_id: row.lead_id,
      lead_name: row.lead.name,
      channel: row.channel,
      last_message_at: row.last_message_at,
      last_message: row.messages[0]?.content ?? '',
      handoff_required: row.state?.handoff_required ?? false,
      handoff_reason: row.state?.handoff_reason ?? null,
      last_agent_action: row.state?.last_agent_action ?? null,
      handoff_updated_at: row.state?.updated_at ?? null,
      created_at: row.created_at,
    };
  }

  async findMessages(user: AuthenticatedUser, conversationId: string) {
    const conv = await this.prisma.conversation.findUnique({ where: { id: conversationId } });
    if (!conv) {
      throw new NotFoundException('Conversa nao encontrada');
    }
    await this.assertClientRead(user, conv.client_id);

    return this.prisma.message.findMany({
      where: { conversation_id: conversationId },
      orderBy: { created_at: 'asc' },
    });
  }

  async downloadMessageMedia(user: AuthenticatedUser, messageId: string) {
    const msg = await this.prisma.message.findUnique({
      where: { id: messageId },
      include: { conversation: true },
    });
    if (!msg) {
      throw new NotFoundException('Mensagem nao encontrada');
    }
    await this.assertClientRead(user, msg.conversation.client_id);

    if (!msg.media_id && !msg.media_url) {
      throw new NotFoundException('Mensagem sem midia');
    }

    return this.metaService.downloadClientWhatsappMedia(msg.conversation.client_id, {
      mediaId: msg.media_id,
      mediaUrl: msg.media_url,
    });
  }

  async findAgentActions(user: AuthenticatedUser, conversationId: string) {
    const conv = await this.prisma.conversation.findUnique({ where: { id: conversationId } });
    if (!conv) {
      throw new NotFoundException('Conversa nao encontrada');
    }
    await this.assertClientRead(user, conv.client_id);

    const logs = await this.prisma.agentActionLog.findMany({
      where: { conversation_id: conversationId },
      orderBy: { created_at: 'desc' },
      take: 8,
    });

    return logs.map((log) => ({
      id: log.id,
      conversation_id: log.conversation_id,
      provider: log.provider,
      model: log.model,
      trigger_type: log.trigger_type,
      decision_type: log.decision_type,
      confidence: log.confidence,
      input_summary: log.input_summary,
      output_summary: log.output_summary,
      action_payload: log.action_payload,
      result_status: log.result_status,
      error_message: log.error_message,
      created_at: log.created_at,
    }));
  }

  async addMessage(user: AuthenticatedUser, conversationId: string, dto: CreateMessageDto) {
    const conv = await this.prisma.conversation.findUnique({ where: { id: conversationId } });
    if (!conv) {
      throw new NotFoundException('Conversa nao encontrada');
    }
    await this.assertClientRead(user, conv.client_id);

    const senderType: SenderType =
      user.role === Role.VENDEDOR || user.role === Role.CLIENTE || user.role === Role.GESTOR
        ? SenderType.user
        : SenderType.system;
    const senderId = dto.sender_id ?? user.sub;
    const content = dto.content.trim();
    let externalId: string | null = null;

    if (conv.channel === 'whatsapp' && senderType === SenderType.user) {
      const lead = await this.prisma.lead.findUnique({
        where: { id: conv.lead_id },
        select: { phone: true },
      });
      externalId = await this.metaService.sendClientWhatsappMessage(
        conv.client_id,
        lead?.phone ?? '',
        content,
      );
    }

    const msg = await this.prisma.message.create({
      data: {
        conversation_id: conversationId,
        sender_type: senderType,
        sender_id: senderId,
        content,
        external_id: externalId,
      },
    });

    await this.prisma.conversation.update({
      where: { id: conversationId },
      data: { last_message_at: msg.created_at },
    });

    if (senderType === SenderType.user) {
      const state = await this.prisma.conversationState.upsert({
        where: { conversation_id: conversationId },
        create: {
          conversation_id: conversationId,
          client_id: conv.client_id,
          lead_id: conv.lead_id,
          handoff_required: true,
          handoff_reason: 'Atendimento manual iniciado pelo painel',
          last_agent_action: 'handoff_requested',
        },
        update: {
          handoff_required: true,
          handoff_reason: 'Atendimento manual iniciado pelo painel',
          last_agent_action: 'handoff_requested',
        },
      });

      void this.clientWebhook.dispatch(conv.client_id, 'handoff.requested', {
        conversation_id: conversationId,
        lead_id: conv.lead_id,
        client_id: conv.client_id,
        reason: 'Atendimento manual iniciado pelo painel',
        requested_by_type: 'user',
        requested_by_id: senderId,
        requested_at: state.updated_at.toISOString(),
      });
    }

    this.realtimeEvents.emitNewMessage(conv.client_id, {
      conversation_id: msg.conversation_id,
      message_id: msg.id,
      sender_type: msg.sender_type,
      sender_id: msg.sender_id,
      content: msg.content,
      media_id: msg.media_id,
      media_url: msg.media_url,
      created_at: msg.created_at,
    });

    void this.clientWebhook.dispatch(conv.client_id, 'conversation.message.sent', {
      message_id: msg.id,
      conversation_id: msg.conversation_id,
      lead_id: conv.lead_id,
      sender_type: msg.sender_type,
      sender_id: msg.sender_id,
      content: msg.content,
      channel: conv.channel,
      created_at: msg.created_at.toISOString(),
    });

    return msg;
  }

  async addMediaMessage(
    user: AuthenticatedUser,
    conversationId: string,
    args: { fileBuffer: Buffer; filename: string; mimeType: string; caption?: string },
  ) {
    const conv = await this.prisma.conversation.findUnique({ where: { id: conversationId } });
    if (!conv) {
      throw new NotFoundException('Conversa nao encontrada');
    }
    await this.assertClientRead(user, conv.client_id);

    const senderType: SenderType =
      user.role === Role.VENDEDOR || user.role === Role.CLIENTE || user.role === Role.GESTOR
        ? SenderType.user
        : SenderType.system;

    if (conv.channel !== 'whatsapp' || senderType !== SenderType.user) {
      throw new ForbiddenException('Envio de midia disponivel apenas para conversa WhatsApp.');
    }

    const lead = await this.prisma.lead.findUnique({
      where: { id: conv.lead_id },
      select: { phone: true },
    });

    const sent = await this.metaService.sendClientWhatsappMediaMessage({
      clientId: conv.client_id,
      to: lead?.phone ?? '',
      fileBuffer: args.fileBuffer,
      filename: args.filename,
      mimeType: args.mimeType,
      caption: args.caption,
    });

    const msg = await this.prisma.message.create({
      data: {
        conversation_id: conversationId,
        sender_type: senderType,
        sender_id: user.sub,
        content: sent.contentLabel,
        external_id: sent.wamid,
        media_id: sent.mediaId,
        media_url: sent.mediaUrl,
      },
    });

    await this.prisma.conversation.update({
      where: { id: conversationId },
      data: { last_message_at: msg.created_at },
    });

    if (senderType === SenderType.user) {
      const state = await this.prisma.conversationState.upsert({
        where: { conversation_id: conversationId },
        create: {
          conversation_id: conversationId,
          client_id: conv.client_id,
          lead_id: conv.lead_id,
          handoff_required: true,
          handoff_reason: 'Atendimento manual iniciado pelo painel',
          last_agent_action: 'handoff_requested',
        },
        update: {
          handoff_required: true,
          handoff_reason: 'Atendimento manual iniciado pelo painel',
          last_agent_action: 'handoff_requested',
        },
      });

      void this.clientWebhook.dispatch(conv.client_id, 'handoff.requested', {
        conversation_id: conversationId,
        lead_id: conv.lead_id,
        client_id: conv.client_id,
        reason: 'Atendimento manual iniciado pelo painel',
        requested_by_type: 'user',
        requested_by_id: user.sub,
        requested_at: state.updated_at.toISOString(),
      });
    }

    this.realtimeEvents.emitNewMessage(conv.client_id, {
      conversation_id: msg.conversation_id,
      message_id: msg.id,
      sender_type: msg.sender_type,
      sender_id: msg.sender_id,
      content: msg.content,
      media_id: msg.media_id,
      media_url: msg.media_url,
      created_at: msg.created_at,
    });

    void this.clientWebhook.dispatch(conv.client_id, 'conversation.message.sent', {
      message_id: msg.id,
      conversation_id: msg.conversation_id,
      lead_id: conv.lead_id,
      sender_type: msg.sender_type,
      sender_id: msg.sender_id,
      content: msg.content,
      media_id: msg.media_id,
      media_url: msg.media_url,
      channel: conv.channel,
      created_at: msg.created_at.toISOString(),
    });

    return msg;
  }
}
