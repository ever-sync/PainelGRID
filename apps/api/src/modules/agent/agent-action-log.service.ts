import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../config/prisma.service";
import { ClientWebhookService } from "../crm/client-webhook.service";
import { CreateAgentActionLogDto } from "./dto/create-agent-action-log.dto";
import { RequestConversationHandoffDto } from "./dto/request-conversation-handoff.dto";
import { ConversationStateService } from "./conversation-state.service";

@Injectable()
export class AgentActionLogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly conversationStateService: ConversationStateService,
    private readonly clientWebhook: ClientWebhookService,
  ) {}

  async createActionLog(conversationId: string, dto: CreateAgentActionLogDto) {
    const conversation =
      await this.conversationStateService.getRequiredConversation(
        conversationId,
      );

    const log = await this.prisma.agentActionLog.create({
      data: {
        conversation_id: conversation.id,
        client_id: conversation.client_id,
        lead_id: conversation.lead_id,
        provider: dto.provider ?? null,
        model: dto.model ?? null,
        trigger_type: dto.trigger_type,
        decision_type: dto.decision_type,
        confidence: dto.confidence ?? null,
        input_summary: dto.input_summary ?? null,
        output_summary: dto.output_summary ?? null,
        action_payload: (dto.action_payload ?? {}) as Prisma.InputJsonValue,
        result_status: dto.result_status,
        error_message: dto.error_message ?? null,
        previous_state: dto.previous_state as Prisma.InputJsonValue | undefined,
        received_message: dto.received_message ?? null,
        next_stage: dto.next_stage ?? null,
        tool_name: dto.tool_name ?? null,
        tool_input: dto.tool_input as Prisma.InputJsonValue | undefined,
        api_response: dto.api_response as Prisma.InputJsonValue | undefined,
        resulting_state: dto.resulting_state as
          Prisma.InputJsonValue | undefined,
        block_reason: dto.block_reason ?? null,
      },
    });

    return this.mapLog(log);
  }

  async listConversationLogs(conversationId: string, limit = 10) {
    await this.conversationStateService.getRequiredConversation(conversationId);

    const logs = await this.prisma.agentActionLog.findMany({
      where: { conversation_id: conversationId },
      orderBy: { created_at: "desc" },
      take: Math.min(Math.max(limit, 1), 20),
    });

    return logs.map((log) => this.mapLog(log));
  }

  async requestHandoff(
    conversationId: string,
    dto: RequestConversationHandoffDto,
  ) {
    const state = await this.conversationStateService.upsertForConversation(
      conversationId,
      {
        last_agent_action: "handoff_requested",
        handoff_required: true,
        handoff_reason: dto.reason,
      },
    );

    const log = await this.prisma.agentActionLog.create({
      data: {
        conversation_id: state.conversation_id,
        client_id: state.client_id,
        lead_id: state.lead_id,
        provider: dto.provider ?? null,
        model: dto.model ?? null,
        trigger_type: dto.trigger_type ?? "handoff_request",
        decision_type: "handoff",
        confidence: dto.confidence ?? null,
        input_summary: dto.reason,
        output_summary: dto.note ?? dto.reason,
        action_payload: {
          requested_by_type: dto.requested_by_type ?? "agent",
          requested_by_id: dto.requested_by_id ?? null,
          note: dto.note ?? null,
        },
        result_status: "handoff_required",
        error_message: null,
      },
    });

    const response = {
      conversation_id: state.conversation_id,
      handoff_required: state.handoff_required,
      handoff_reason: state.handoff_reason,
      last_agent_action: state.last_agent_action,
      updated_at: state.updated_at.toISOString(),
      log: this.mapLog(log),
    };

    void this.clientWebhook.dispatch(state.client_id, "handoff.requested", {
      conversation_id: state.conversation_id,
      lead_id: state.lead_id,
      client_id: state.client_id,
      reason: dto.reason,
      note: dto.note ?? null,
      requested_by_type: dto.requested_by_type ?? "agent",
      requested_by_id: dto.requested_by_id ?? null,
      requested_at: state.updated_at.toISOString(),
    });

    return response;
  }

  private mapLog(log: {
    id: string;
    conversation_id: string;
    client_id: string;
    lead_id: string;
    provider: string | null;
    model: string | null;
    trigger_type: string;
    decision_type: string;
    confidence: number | null;
    input_summary: string | null;
    output_summary: string | null;
    action_payload: Prisma.JsonValue;
    result_status: string;
    error_message: string | null;
    created_at: Date;
    previous_state?: Prisma.JsonValue | null;
    received_message?: string | null;
    next_stage?: string | null;
    tool_name?: string | null;
    tool_input?: Prisma.JsonValue | null;
    api_response?: Prisma.JsonValue | null;
    resulting_state?: Prisma.JsonValue | null;
    block_reason?: string | null;
  }) {
    return {
      id: log.id,
      conversation_id: log.conversation_id,
      client_id: log.client_id,
      lead_id: log.lead_id,
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
      previous_state: log.previous_state ?? null,
      received_message: log.received_message ?? null,
      next_stage: log.next_stage ?? null,
      tool_name: log.tool_name ?? null,
      tool_input: log.tool_input ?? null,
      api_response: log.api_response ?? null,
      resulting_state: log.resulting_state ?? null,
      block_reason: log.block_reason ?? null,
      created_at: log.created_at.toISOString(),
    };
  }
}
