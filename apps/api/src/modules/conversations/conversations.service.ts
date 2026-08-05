import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConversationChannel, Prisma, SenderType } from '@prisma/client';
import { Role } from '../../common/types';
import { PrismaService } from '../../config/prisma.service';
import { StorageService } from '../../config/storage.service';
import { AuthenticatedUser } from '../auth/auth.types';
import { ClientsService } from '../clients/clients.service';
import { ClientWebhookService } from '../crm/client-webhook.service';
import { MetaService } from '../meta/meta.service';
import { RealtimeEventsService } from '../realtime/realtime-events.service';
import { CreateMessageDto } from './dto/create-message.dto';
import { EnsureConversationDto } from './dto/ensure-conversation.dto';
import { FindConversationsQueryDto } from './dto/find-conversations-query.dto';

type N8nHistoryRow = {
  history_id: number;
  client_id: string;
  lead_id: string;
  message_type: 'human' | 'ai';
  content: string;
};

@Injectable()
export class ConversationsService {
  private readonly logger = new Logger(ConversationsService.name);
  private readonly n8nHistorySyncs = new Map<string, Promise<number>>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly clientsService: ClientsService,
    private readonly realtimeEvents: RealtimeEventsService,
    private readonly metaService: MetaService,
    private readonly clientWebhook: ClientWebhookService,
    private readonly storage: StorageService,
  ) {}

  private mediaStorageKey(messageId: string): string {
    return `whatsapp-media/${messageId}`;
  }

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

  private async assertConversationAccess(
    user: AuthenticatedUser,
    conversation: {
      client_id: string;
      lead?: { assigned_vendor_id: string | null } | null;
    },
  ) {
    await this.assertClientRead(user, conversation.client_id);
    if (
      user.role === Role.VENDEDOR &&
      conversation.lead?.assigned_vendor_id !== user.sub
    ) {
      throw new ForbiddenException('Conversa nao atribuida a este vendedor');
    }
  }

  async findAll(user: AuthenticatedUser, query: FindConversationsQueryDto) {
    const clientId =
      query.client_id ??
      (user.role === Role.GESTOR ? null : (user.client_id ?? null));

    if (clientId) {
      await this.assertClientRead(user, clientId);
    } else if (user.role !== Role.GESTOR) {
      throw new ForbiddenException('Usuario sem empresa vinculada');
    }

    await this.syncN8nHistoryForClient(clientId);

    const where: Prisma.ConversationWhereInput = clientId
      ? { client_id: clientId }
      : {};
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

  /**
   * O workflow legado do Rubinho grava a memoria do LangChain em
   * agent_chat_history, fora das tabelas que alimentam o chat do painel.
   * Copia apenas mensagens visiveis e usa o ID da memoria como chave
   * idempotente, permitindo rodar a cada consulta sem criar duplicatas.
   */
  async syncN8nHistoryForClient(clientId: string | null): Promise<number> {
    if (typeof this.prisma.$queryRaw !== 'function') return 0;

    const syncKey = clientId ?? '__all_clients__';
    const running = this.n8nHistorySyncs.get(syncKey);
    if (running) return running;

    const sync = this.importN8nHistoryForClient(clientId)
      .catch((error: unknown) => {
        const record = error && typeof error === 'object' ? (error as Record<string, unknown>) : null;
        const code = record?.code ? String(record.code) : '';
        const meta = record?.meta && typeof record.meta === 'object' ? (record.meta as Record<string, unknown>) : null;
        const databaseCode = meta?.code ? String(meta.code) : '';
        const missingHistoryTable = code === '42P01' || (code === 'P2010' && databaseCode === '42P01');
        if (!missingHistoryTable) {
          const message = error instanceof Error ? error.message : String(error);
          this.logger.warn(`Falha ao sincronizar historico do n8n: ${message}`);
        }
        return 0;
      })
      .finally(() => this.n8nHistorySyncs.delete(syncKey));

    this.n8nHistorySyncs.set(syncKey, sync);
    return sync;
  }

  private async importN8nHistoryForClient(
    clientId: string | null,
  ): Promise<number> {
    const clientFilter = clientId
      ? Prisma.sql`AND lead.client_id = ${clientId}::uuid`
      : Prisma.empty;
    const rows = await this.prisma.$queryRaw<N8nHistoryRow[]>(Prisma.sql`
      SELECT
        history.id AS history_id,
        matched_lead.client_id AS client_id,
        matched_lead.id AS lead_id,
        history.message->>'type' AS message_type,
        history.message->>'content' AS content
      FROM agent_chat_history history
      JOIN LATERAL (
        SELECT lead.id, lead.client_id
        FROM leads lead
        WHERE lead.deleted_at IS NULL
          ${clientFilter}
          AND length(regexp_replace(COALESCE(lead.phone, ''), '[^0-9]', '', 'g')) >= 10
          AND (
            regexp_replace(COALESCE(lead.phone, ''), '[^0-9]', '', 'g') =
              regexp_replace(history.session_id, '[^0-9]', '', 'g')
            OR right(regexp_replace(COALESCE(lead.phone, ''), '[^0-9]', '', 'g'), 11) =
              right(regexp_replace(history.session_id, '[^0-9]', '', 'g'), 11)
          )
        ORDER BY lead.updated_at DESC, lead.id DESC
        LIMIT 1
      ) matched_lead ON true
      WHERE NOT EXISTS (
        SELECT 1
        FROM messages stored_message
        WHERE stored_message.external_id = 'n8n-history:' || history.id::text
      )
        AND (
          history.message->>'type' = 'human'
          OR (
            history.message->>'type' = 'ai'
            AND CASE
              WHEN jsonb_typeof(history.message->'tool_calls') = 'array'
                THEN jsonb_array_length(history.message->'tool_calls') = 0
              ELSE true
            END
          )
        )
      ORDER BY history.id ASC
      LIMIT 1000
    `);

    const usableRows = rows.filter((row) => row.content?.trim());
    if (usableRows.length === 0) return 0;

    // A tabela do LangChain nao possui timestamp. Preservamos a ordem pelo ID
    // e ancoramos o lote no instante da importacao.
    const importedAt = Date.now();
    const timestampByHistoryId = new Map(
      usableRows.map((row, index) => [row.history_id, new Date(importedAt - (usableRows.length - index - 1) * 1_000)]),
    );
    const byLead = new Map<string, N8nHistoryRow[]>();
    for (const row of usableRows) {
      const leadKey = `${row.client_id}:${row.lead_id}`;
      const leadRows = byLead.get(leadKey) ?? [];
      leadRows.push(row);
      byLead.set(leadKey, leadRows);
    }

    let imported = 0;
    for (const historyRows of byLead.values()) {
      const { client_id: rowClientId, lead_id: leadId } = historyRows[0];
      imported += await this.prisma.$transaction(async (tx) => {
        const lockKey = `${rowClientId}:${leadId}:${ConversationChannel.whatsapp}`;
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`;

        let conversation = await tx.conversation.findFirst({
          where: {
            client_id: rowClientId,
            lead_id: leadId,
            channel: ConversationChannel.whatsapp,
          },
          orderBy: [{ last_message_at: 'desc' }, { created_at: 'desc' }],
        });
        if (!conversation) {
          conversation = await tx.conversation.create({
            data: {
              client_id: rowClientId,
              lead_id: leadId,
              channel: ConversationChannel.whatsapp,
            },
          });
        }

        const created = await tx.message.createMany({
          data: historyRows.map((row) => ({
            conversation_id: conversation.id,
            sender_type: row.message_type === 'human' ? SenderType.lead : SenderType.user,
            sender_id: null,
            content: row.content.trim(),
            external_id: `n8n-history:${row.history_id}`,
            created_at: timestampByHistoryId.get(row.history_id)!,
          })),
          skipDuplicates: true,
        });

        if (created.count > 0) {
          const latest = historyRows.reduce(
            (value, row) => {
              const timestamp = timestampByHistoryId.get(row.history_id)!;
              return timestamp.getTime() > value.getTime() ? timestamp : value;
            },
            conversation.last_message_at ?? new Date(0),
          );
          if (!conversation.last_message_at || latest.getTime() > conversation.last_message_at.getTime()) {
            await tx.conversation.update({
              where: { id: conversation.id },
              data: { last_message_at: latest },
            });
          }
        }

        return created.count;
      });
    }

    return imported;
  }

  async ensureConversation(user: AuthenticatedUser, dto: EnsureConversationDto) {
    await this.assertClientRead(user, dto.client_id);

    const lead = await this.prisma.lead.findFirst({
      where: {
        id: dto.lead_id,
        client_id: dto.client_id,
        deleted_at: null,
      },
      select: { id: true, assigned_vendor_id: true },
    });
    if (!lead) {
      throw new NotFoundException('Lead nao encontrado para este cliente');
    }
    if (user.role === Role.VENDEDOR && lead.assigned_vendor_id !== user.sub) {
      throw new ForbiddenException('Lead nao atribuido a este vendedor');
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
    const conv = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      include: { lead: { select: { assigned_vendor_id: true } } },
    });
    if (!conv) {
      throw new NotFoundException('Conversa nao encontrada');
    }
    await this.assertConversationAccess(user, conv);

    return this.prisma.message.findMany({
      where: { conversation_id: conversationId },
      orderBy: { created_at: 'asc' },
    });
  }

  async downloadMessageMedia(user: AuthenticatedUser, messageId: string) {
    const msg = await this.prisma.message.findUnique({
      where: { id: messageId },
      include: {
        conversation: {
          include: { lead: { select: { assigned_vendor_id: true } } },
        },
      },
    });
    if (!msg) {
      throw new NotFoundException('Mensagem nao encontrada');
    }
    await this.assertConversationAccess(user, msg.conversation);

    if (!msg.media_id && !msg.media_url) {
      throw new NotFoundException('Mensagem sem midia');
    }

    const storageKey = this.mediaStorageKey(messageId);
    const cached = await this.storage.download(storageKey);
    if (cached) {
      return { buffer: cached.buffer, contentType: cached.contentType, filename: messageId };
    }

    const media = await this.metaService.downloadClientWhatsappMedia(msg.conversation.client_id, {
      mediaId: msg.media_id,
      mediaUrl: msg.media_url,
    });
    void this.storage.upload(storageKey, media.buffer, media.contentType);
    return media;
  }

  async findAgentActions(user: AuthenticatedUser, conversationId: string) {
    const conv = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      include: { lead: { select: { assigned_vendor_id: true } } },
    });
    if (!conv) {
      throw new NotFoundException('Conversa nao encontrada');
    }
    await this.assertConversationAccess(user, conv);

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
    const conv = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      include: { lead: { select: { assigned_vendor_id: true } } },
    });
    if (!conv) {
      throw new NotFoundException('Conversa nao encontrada');
    }
    await this.assertConversationAccess(user, conv);

    const senderType: SenderType =
      user.role === Role.VENDEDOR || user.role === Role.CLIENTE || user.role === Role.GESTOR
        ? SenderType.user
        : SenderType.system;
    const senderId = user.sub;
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
    const conv = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      include: { lead: { select: { assigned_vendor_id: true } } },
    });
    if (!conv) {
      throw new NotFoundException('Conversa nao encontrada');
    }
    await this.assertConversationAccess(user, conv);

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

    void this.storage.upload(this.mediaStorageKey(msg.id), args.fileBuffer, args.mimeType);

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
