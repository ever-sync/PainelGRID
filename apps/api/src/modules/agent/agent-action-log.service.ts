import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../config/prisma.service";
import { ClientWebhookService } from "../crm/client-webhook.service";
import { CreateAgentActionLogDto } from "./dto/create-agent-action-log.dto";
import { RequestConversationHandoffDto } from "./dto/request-conversation-handoff.dto";
import { ConversationStateService } from "./conversation-state.service";
import { AppointmentsService } from "../appointments/appointments.service";

@Injectable()
export class AgentActionLogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly conversationStateService: ConversationStateService,
    private readonly clientWebhook: ClientWebhookService,
    private readonly appointments: AppointmentsService,
  ) {}

  async createActionLog(conversationId: string, dto: CreateAgentActionLogDto) {
    const conversation =
      await this.conversationStateService.getRequiredConversation(
        conversationId,
      );
    const stateBefore =
      await this.conversationStateService.findByConversationId(conversationId);

    const recoveredCompanion = await this.recoverCompanionNames(
      conversation.lead_id,
      dto,
    );

    let finalDelivery: Record<string, unknown> | null = null;
    let finalDeliveryError: string | null = null;
    if (dto.tool_name?.trim().toLowerCase() === "final_confirmation") {
      try {
        finalDelivery = (await this.appointments.deliverCredentialForLead(
          conversation.lead_id,
          `rubinho-final:${conversation.id}:${conversation.lead_id}`,
        )) as Record<string, unknown>;
      } catch (error) {
        finalDeliveryError =
          error instanceof Error ? error.message : String(error);
      }
    }

    const apiResponse: Record<string, unknown> = {
      ...(dto.api_response ?? {}),
      ...(recoveredCompanion
        ? { companion_names_recovered: recoveredCompanion }
        : {}),
      ...(finalDelivery ? { qr_delivery: finalDelivery } : {}),
      ...(finalDeliveryError
        ? {
            qr_delivery: null,
            validator_blocked: true,
            finalization_error: finalDeliveryError,
          }
        : {}),
    };
    const normalizedStatus = dto.result_status.trim().toLowerCase();
    const blocked =
      ["blocked", "failed", "error"].includes(normalizedStatus) ||
      apiResponse.validator_blocked === true;
    const blockReason = blocked
      ? this.resolveBlockReason(dto, apiResponse)
      : (dto.block_reason ?? null);
    const previousState =
      dto.previous_state ?? this.toStateSnapshot(stateBefore);
    const resultingState =
      dto.resulting_state ?? previousState ?? undefined;

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
        previous_state: previousState as Prisma.InputJsonValue | undefined,
        received_message: dto.received_message ?? null,
        next_stage: dto.next_stage ?? null,
        tool_name: dto.tool_name ?? null,
        tool_input: dto.tool_input as Prisma.InputJsonValue | undefined,
        api_response: apiResponse as Prisma.InputJsonValue,
        resulting_state: resultingState as Prisma.InputJsonValue | undefined,
        block_reason: blockReason,
      },
    });

    if (dto.message_id) {
      await this.prisma.message.updateMany({
        where: {
          id: dto.message_id,
          conversation_id: conversation.id,
        },
        data: {
          author_type: "rubinho",
          origin: "n8n",
          agent_action_log_id: log.id,
        },
      });
    }

    return this.mapLog(log);
  }

  private resolveBlockReason(
    dto: CreateAgentActionLogDto,
    apiResponse: Record<string, unknown>,
  ) {
    if (dto.block_reason?.trim()) return dto.block_reason.trim();
    if (dto.error_message?.trim()) return dto.error_message.trim();
    if (typeof apiResponse.finalization_error === "string") {
      return apiResponse.finalization_error;
    }
    const missing = apiResponse.missing_fields;
    if (Array.isArray(missing) && missing.length > 0) {
      return `Campos obrigatorios pendentes: ${missing.join(", ")}`;
    }
    const actionReason =
      dto.action_payload && !Array.isArray(dto.action_payload)
        ? dto.action_payload.reason
        : undefined;
    if (typeof actionReason === "string" && actionReason.trim()) {
      return actionReason.trim();
    }
    return `Acao ${dto.decision_type} bloqueada sem retorno conclusivo da ferramenta`;
  }

  private toStateSnapshot(
    state: Awaited<
      ReturnType<ConversationStateService["findByConversationId"]>
    >,
  ): Record<string, unknown> | undefined {
    if (!state) return undefined;
    return {
      current_intent: state.current_intent,
      awaiting_confirmation: state.awaiting_confirmation,
      last_offered_event_id: state.last_offered_event_id,
      last_offered_slot: state.last_offered_slot?.toISOString() ?? null,
      last_agent_action: state.last_agent_action,
      handoff_required: state.handoff_required,
      handoff_reason: state.handoff_reason,
      state_payload: state.state_payload,
      updated_at: state.updated_at.toISOString(),
    };
  }

  private async recoverCompanionNames(
    leadId: string,
    dto: CreateAgentActionLogDto,
  ): Promise<string | null> {
    const received = dto.received_message?.trim();
    if (!received) return null;
    const toolName = dto.tool_name?.trim().toLowerCase() ?? "";
    const canRecover = [
      "waiting_companions",
      "waiting_companion_names",
      "final_confirmation",
    ].includes(toolName);
    if (!canRecover) return null;

    const lead = await this.prisma.lead.findUnique({
      where: { id: leadId },
      select: {
        companions: true,
        name: true,
        first_name: true,
        last_name: true,
      },
    });
    const current = lead?.companions?.trim() ?? "";
    const countMatch = current.match(/^(\d+)$/);
    if (!countMatch) return null;

    const count = Number(countMatch[1]);
    if (!Number.isInteger(count) || count < 1) return null;

    let companionName = this.looksLikeCompanionName(received) ? received : null;
    if (!companionName) {
      const previousLogs = await this.prisma.agentActionLog.findMany({
        where: {
          lead_id: leadId,
          tool_name: {
            in: ["WAITING_COMPANIONS", "WAITING_COMPANION_NAMES"],
          },
          received_message: { not: null },
        },
        orderBy: { created_at: "desc" },
        take: 12,
        select: { received_message: true },
      });
      const leadName = [lead?.first_name, lead?.last_name]
        .filter(Boolean)
        .join(" ")
        .trim()
        .toLocaleLowerCase("pt-BR");
      companionName =
        previousLogs
          .map((log) => log.received_message?.trim() ?? "")
          .find(
            (candidate) =>
              this.looksLikeCompanionName(candidate) &&
              candidate.toLocaleLowerCase("pt-BR") !== leadName &&
              candidate.toLocaleLowerCase("pt-BR") !==
                lead?.name?.trim().toLocaleLowerCase("pt-BR"),
          ) ?? null;
    }
    if (!companionName) return null;

    const value = `${count} acompanhante${count === 1 ? "" : "s"}: ${companionName}`;
    await this.prisma.lead.update({
      where: { id: leadId },
      data: { companions: value },
    });
    return value;
  }

  private looksLikeCompanionName(value: string): boolean {
    const words = value.split(/\s+/).filter(Boolean);
    if (words.length < 2 || words.length > 8) return false;
    const normalized = value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
    if (
      /\b(um|uma|dois|duas|tres|quatro|cinco|somente|so|sozinho|sozinha|acompanhante|pessoa|pessoas)\b/.test(
        normalized,
      )
    ) {
      return false;
    }
    return words.every((word) => /^[A-Za-zÀ-ÖØ-öø-ÿ'’-]+$/.test(word));
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
