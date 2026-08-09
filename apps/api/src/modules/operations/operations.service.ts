import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../config/prisma.service";
import { AuthenticatedUser } from "../auth/auth.types";
import {
  deriveRubinhoConversationState,
  type RubinhoStep,
} from "../agent/rubinho-conversation-state";
import { HeartbeatDto } from "./dto/heartbeat.dto";
import { ReportOperationalIssueDto } from "./dto/report-operational-issue.dto";

const LABELS: Record<string, string> = {
  UNKNOWN_FORM: "Formulário desconhecido",
  CLIENT_NOT_IDENTIFIED: "Cliente não identificado",
  EVENT_NOT_FOUND: "Evento não encontrado",
  LEAD_WITHOUT_STAGE: "Lead sem etapa",
  TEMPLATE_FAILED: "Falha no template",
  FIPE_FAILED: "Falha na consulta FIPE",
  APPOINTMENT_FAILED: "Falha no agendamento",
  QR_NOT_DELIVERED: "QR Code não entregue",
  HANDOFF_REQUIRED: "Intervenção humana",
  WORKFLOW_STOPPED: "Workflow parado",
  META_TOKEN_EXPIRING: "Token Meta perto de expirar",
  WHATSAPP_DISCONNECTED: "WhatsApp desconectado",
  ERROR_SPIKE: "Aumento de erros",
  META_LEADS_NOT_IMPORTED: "Leads Meta não importados",
  QUEUE_BACKLOG: "Fila acumulada",
  TEMPLATE_REJECTED: "Template rejeitado",
  APIBRASIL_UNAVAILABLE: "APIBrasil indisponível",
};

const RUBINHO_STAGE_META: Record<
  RubinhoStep,
  { label: string; short_label: string }
> = {
  WAITING_FULL_NAME: {
    label: "Aguardando nome completo",
    short_label: "Nome completo",
  },
  WAITING_COMPANIONS: {
    label: "Aguardando quantidade de acompanhantes",
    short_label: "Acompanhantes",
  },
  WAITING_COMPANION_NAMES: {
    label: "Aguardando nomes dos acompanhantes",
    short_label: "Nomes",
  },
  WAITING_EVENT_DATE: {
    label: "Aguardando escolha da data",
    short_label: "Data",
  },
  WAITING_TRADE_IN: {
    label: "Aguardando resposta sobre troca",
    short_label: "Troca",
  },
  WAITING_VEHICLE_PLATE: {
    label: "Aguardando placa do veículo",
    short_label: "Placa",
  },
  WAITING_FINAL_CONFIRMATION: {
    label: "Aguardando confirmação do resumo",
    short_label: "Confirmação",
  },
  COMPLETED: {
    label: "Credenciamento concluído",
    short_label: "Concluído",
  },
  CANCELLED: { label: "Credenciamento cancelado", short_label: "Cancelado" },
  HUMAN_HANDOFF: {
    label: "Aguardando intervenção humana",
    short_label: "Handoff",
  },
};

const RUBINHO_STAGE_ORDER: RubinhoStep[] = [
  "WAITING_FULL_NAME",
  "WAITING_COMPANIONS",
  "WAITING_COMPANION_NAMES",
  "WAITING_EVENT_DATE",
  "WAITING_TRADE_IN",
  "WAITING_VEHICLE_PLATE",
  "WAITING_FINAL_CONFIRMATION",
  "COMPLETED",
  "CANCELLED",
  "HUMAN_HANDOFF",
];

@Injectable()
export class OperationsService {
  constructor(private readonly prisma: PrismaService) {}

  async rubinhoThermometer(
    user: AuthenticatedUser,
    filters: { client_id?: string; event_id?: string },
  ) {
    const clientId =
      user.role === "cliente"
        ? (user.client_id ?? "__none__")
        : filters.client_id || undefined;
    const leadWhere: Prisma.LeadWhereInput = {
      deleted_at: null,
      client_id: clientId,
      event_interest_id: filters.event_id || undefined,
    };
    const leads = await this.prisma.lead.findMany({
      where: leadWhere,
      select: {
        id: true,
        client_id: true,
        event_interest_id: true,
        name: true,
        first_name: true,
        last_name: true,
        companions: true,
        store_visit_datetime: true,
        description: true,
        vehicle_plate: true,
        confirmation_status: true,
        created_at: true,
        updated_at: true,
      },
      orderBy: { created_at: "desc" },
      take: 5000,
    });
    const leadIds = leads.map((lead) => lead.id);
    if (!leadIds.length) {
      return {
        generated_at: new Date().toISOString(),
        refresh_after_seconds: 5,
        filters: { client_id: clientId ?? null, event_id: filters.event_id ?? null },
        totals: {
          leads: 0,
          awaiting_template: 0,
          template_sent: 0,
          template_delivered: 0,
          template_read: 0,
          template_replied: 0,
          template_failed: 0,
          scheduled: 0,
          completed: 0,
          handoff: 0,
        },
        rates: { template_reply: 0, scheduling: 0, completion: 0 },
        stages: [],
      };
    }

    const [dispatches, states, conversations] = await Promise.all([
      this.prisma.dispatchEvent.findMany({
        where: {
          lead_id: { in: leadIds },
          dispatch_type: "lead_welcome_template",
        },
        select: {
          lead_id: true,
          status: true,
          sent_at: true,
          delivered_at: true,
          read_at: true,
          replied_at: true,
          failed_at: true,
          created_at: true,
        },
        orderBy: { created_at: "desc" },
      }),
      this.prisma.conversationState.findMany({
        where: { lead_id: { in: leadIds } },
        select: {
          lead_id: true,
          handoff_required: true,
          state_payload: true,
          updated_at: true,
        },
        orderBy: { updated_at: "desc" },
      }),
      this.prisma.conversation.findMany({
        where: { lead_id: { in: leadIds } },
        select: {
          lead_id: true,
          messages: {
            where: { sender_type: "lead" },
            select: { created_at: true },
            orderBy: { created_at: "desc" },
            take: 1,
          },
        },
      }),
    ]);

    const latestDispatch = new Map<string, (typeof dispatches)[number]>();
    for (const dispatch of dispatches) {
      if (!latestDispatch.has(dispatch.lead_id)) {
        latestDispatch.set(dispatch.lead_id, dispatch);
      }
    }
    const latestState = new Map<string, (typeof states)[number]>();
    for (const state of states) {
      if (!latestState.has(state.lead_id)) latestState.set(state.lead_id, state);
    }
    const latestInbound = new Map<string, Date>();
    for (const conversation of conversations) {
      const createdAt = conversation.messages[0]?.created_at;
      if (!createdAt) continue;
      const previous = latestInbound.get(conversation.lead_id);
      if (!previous || createdAt > previous) {
        latestInbound.set(conversation.lead_id, createdAt);
      }
    }

    const questionCounts = new Map<RubinhoStep, number>();
    let awaitingTemplate = 0;
    let templateSent = 0;
    let templateDelivered = 0;
    let templateRead = 0;
    let templateReplied = 0;
    let templateFailed = 0;
    let scheduled = 0;

    for (const lead of leads) {
      const dispatch = latestDispatch.get(lead.id);
      const inboundAt = latestInbound.get(lead.id);
      const hasReply = Boolean(
        dispatch?.replied_at ||
          (dispatch?.sent_at && inboundAt && inboundAt >= dispatch.sent_at),
      );
      const sent = Boolean(dispatch?.sent_at);
      const failed = Boolean(dispatch?.failed_at || dispatch?.status === "failed");
      if (!sent && !failed) awaitingTemplate += 1;
      if (sent) templateSent += 1;
      if (dispatch?.delivered_at) templateDelivered += 1;
      if (dispatch?.read_at) templateRead += 1;
      if (hasReply) templateReplied += 1;
      if (failed) templateFailed += 1;
      if (["scheduled", "confirmed", "checked_in", "closed"].includes(lead.confirmation_status)) {
        scheduled += 1;
      }

      // Antes da primeira resposta o lead permanece no estágio operacional do
      // template. Depois da resposta, cada lead ocupa exatamente uma pergunta.
      if (!hasReply && dispatch) continue;
      if (!hasReply && !latestState.has(lead.id) && !inboundAt) continue;
      const state = latestState.get(lead.id);
      const payload = state?.state_payload as { current_step?: unknown } | null;
      const payloadStep = payload?.current_step;
      const canonical = deriveRubinhoConversationState(lead, {
        handoffRequired: state?.handoff_required ?? false,
        previouslyCompleted: payloadStep === "COMPLETED",
      });
      // O estado persistido pode ficar alguns segundos atrasado em relação aos
      // dados efetivamente salvos no lead. Para o termômetro operacional, a
      // fonte da verdade é sempre a etapa canônica derivada do cadastro atual.
      const step = canonical.current_step;
      questionCounts.set(step, (questionCounts.get(step) ?? 0) + 1);
    }

    const completed = questionCounts.get("COMPLETED") ?? 0;
    const handoff = questionCounts.get("HUMAN_HANDOFF") ?? 0;
    const repliedBase = Math.max(templateReplied, 1);
    const sentBase = Math.max(templateSent, 1);
    return {
      generated_at: new Date().toISOString(),
      refresh_after_seconds: 5,
      filters: { client_id: clientId ?? null, event_id: filters.event_id ?? null },
      totals: {
        leads: leads.length,
        awaiting_template: awaitingTemplate,
        template_sent: templateSent,
        template_delivered: templateDelivered,
        template_read: templateRead,
        template_replied: templateReplied,
        template_failed: templateFailed,
        scheduled,
        completed,
        handoff,
      },
      rates: {
        template_reply: Math.round((templateReplied / sentBase) * 1000) / 10,
        scheduling: Math.round((scheduled / repliedBase) * 1000) / 10,
        completion: Math.round((completed / repliedBase) * 1000) / 10,
      },
      stages: RUBINHO_STAGE_ORDER.map((key) => ({
        key,
        ...RUBINHO_STAGE_META[key],
        count: questionCounts.get(key) ?? 0,
        percent_of_replies:
          Math.round(((questionCounts.get(key) ?? 0) / repliedBase) * 1000) /
          10,
      })),
    };
  }

  async report(dto: ReportOperationalIssueDto, incrementOccurrence = true) {
    const now = new Date();
    return this.prisma.operationalIssue.upsert({
      where: { fingerprint: dto.fingerprint },
      create: {
        type: dto.type,
        severity: dto.severity ?? "warning",
        title: dto.title,
        message: dto.message,
        source: dto.source ?? "integration",
        fingerprint: dto.fingerprint,
        client_id: dto.client_id,
        lead_id: dto.lead_id,
        conversation_id: dto.conversation_id,
        event_id: dto.event_id,
        metadata: (dto.metadata ?? {}) as Prisma.InputJsonValue,
      },
      update: {
        status: "open",
        severity: dto.severity ?? "warning",
        title: dto.title,
        message: dto.message,
        metadata: (dto.metadata ?? {}) as Prisma.InputJsonValue,
        last_seen_at: now,
        resolved_at: null,
        resolved_by: null,
        occurrence_count: incrementOccurrence ? { increment: 1 } : undefined,
      },
    });
  }

  heartbeat(dto: HeartbeatDto) {
    return this.prisma.operationalHeartbeat.upsert({
      where: { name: dto.name },
      create: {
        name: dto.name,
        client_id: dto.client_id,
        status: dto.status ?? "healthy",
        metadata: (dto.metadata ?? {}) as Prisma.InputJsonValue,
      },
      update: {
        client_id: dto.client_id,
        status: dto.status ?? "healthy",
        metadata: (dto.metadata ?? {}) as Prisma.InputJsonValue,
        last_seen_at: new Date(),
      },
    });
  }

  async dashboard(
    user: AuthenticatedUser,
    filters: {
      status?: string;
      type?: string;
      client_id?: string;
      search?: string;
    },
  ) {
    await this.detectIssues();
    const where: Prisma.OperationalIssueWhereInput = {
      status:
        filters.status && filters.status !== "all" ? filters.status : undefined,
      type: filters.type && filters.type !== "all" ? filters.type : undefined,
      client_id:
        user.role === "cliente"
          ? (user.client_id ?? "__none__")
          : filters.client_id || undefined,
      OR: filters.search
        ? [
            { title: { contains: filters.search, mode: "insensitive" } },
            { message: { contains: filters.search, mode: "insensitive" } },
          ]
        : undefined,
    };
    const [issues, grouped, clients] = await Promise.all([
      this.prisma.operationalIssue.findMany({
        where,
        orderBy: [{ severity: "asc" }, { last_seen_at: "desc" }],
        take: 250,
      }),
      this.prisma.operationalIssue.groupBy({
        by: ["type", "status", "severity"],
        where: {
          client_id:
            user.role === "cliente"
              ? (user.client_id ?? "__none__")
              : filters.client_id || undefined,
        },
        _count: true,
      }),
      this.prisma.client.findMany({
        where: { id: { in: [] } },
        select: { id: true, company_name: true },
      }),
    ]);
    const clientIds = [
      ...new Set(issues.map((i) => i.client_id).filter(Boolean)),
    ] as string[];
    const leadIds = [
      ...new Set(issues.map((i) => i.lead_id).filter(Boolean)),
    ] as string[];
    const [issueClients, leads] = await Promise.all([
      clientIds.length
        ? this.prisma.client.findMany({
            where: { id: { in: clientIds } },
            select: { id: true, company_name: true },
          })
        : Promise.resolve(clients),
      leadIds.length
        ? this.prisma.lead.findMany({
            where: { id: { in: leadIds } },
            select: { id: true, name: true, phone: true },
          })
        : Promise.resolve([]),
    ]);
    const clientMap = new Map(issueClients.map((c) => [c.id, c.company_name]));
    const leadMap = new Map(leads.map((l) => [l.id, l]));
    return {
      generated_at: new Date().toISOString(),
      summary: grouped.map((g) => ({
        type: g.type,
        label: LABELS[g.type] ?? g.type,
        status: g.status,
        severity: g.severity,
        count: g._count,
      })),
      issues: issues.map((i) => ({
        ...i,
        client_name: i.client_id ? (clientMap.get(i.client_id) ?? null) : null,
        lead: i.lead_id ? (leadMap.get(i.lead_id) ?? null) : null,
      })),
    };
  }

  async audit(user: AuthenticatedUser, conversationId: string) {
    const conversation = await this.prisma.conversation.findFirstOrThrow({
      where: {
        id: conversationId,
        client_id:
          user.role === "cliente" ? (user.client_id ?? "__none__") : undefined,
      },
      select: { id: true },
    });
    return this.prisma.agentActionLog.findMany({
      where: { conversation_id: conversation.id },
      orderBy: { created_at: "desc" },
      take: 100,
    });
  }

  resolve(id: string, user: AuthenticatedUser) {
    return this.prisma.operationalIssue.update({
      where: { id },
      data: {
        status: "resolved",
        resolved_at: new Date(),
        resolved_by: user.sub,
      },
    });
  }

  reopen(id: string) {
    return this.prisma.operationalIssue.update({
      where: { id },
      data: { status: "open", resolved_at: null, resolved_by: null },
    });
  }

  private async detectIssues() {
    await this.prisma.operationalIssue.updateMany({
      where: {
        source: {
          in: ["detector", "meta", "bullmq", "heartbeat", "rubinho"],
        },
        status: "open",
      },
      data: { status: "resolved", resolved_at: new Date() },
    });
    const now = Date.now();
    const tokenThreshold = new Date(now + 7 * 86400000);
    const staleThreshold = new Date(now - 10 * 60000);
    const hourAgo = new Date(now - 3600000);
    const [
      leads,
      handoffs,
      tokens,
      selections,
      staleJobs,
      failedJobs,
      heartbeats,
      recentErrors,
    ] = await Promise.all([
      this.prisma.lead.findMany({
        where: { deleted_at: null, crm_stage_id: null },
        select: { id: true, client_id: true, name: true },
        take: 100,
      }),
      this.prisma.conversationState.findMany({
        where: { handoff_required: true },
        select: {
          conversation_id: true,
          lead_id: true,
          client_id: true,
          handoff_reason: true,
        },
        take: 100,
      }),
      this.prisma.metaConnection.findMany({
        where: { token_expires_at: { not: null, lte: tokenThreshold } },
        select: {
          id: true,
          client_id: true,
          business_name: true,
          token_expires_at: true,
        },
      }),
      this.prisma.metaAssetSelection.findMany({
        where: { is_primary: true, phone_number_id: null },
        select: {
          id: true,
          meta_connection: { select: { client_id: true, business_name: true } },
        },
      }),
      this.prisma.metaSyncJob.findMany({
        where: { status: "pending", created_at: { lte: staleThreshold } },
        select: { id: true, client_id: true, job_type: true, created_at: true },
        take: 100,
      }),
      this.prisma.metaSyncJob.findMany({
        where: {
          status: "failed",
          created_at: { gte: new Date(now - 86400000) },
        },
        select: {
          id: true,
          client_id: true,
          job_type: true,
          error_message: true,
        },
        take: 100,
      }),
      this.prisma.operationalHeartbeat.findMany(),
      this.prisma.agentActionLog.count({
        where: {
          created_at: { gte: hourAgo },
          result_status: { notIn: ["success", "completed"] },
        },
      }),
    ]);
    for (const l of leads)
      await this.detect({
        type: "LEAD_WITHOUT_STAGE",
        severity: "critical",
        title: "Lead sem etapa no CRM",
        message: `${l.name || "Lead"} não possui etapa e pode ficar sem atendimento.`,
        source: "detector",
        fingerprint: `lead-stage:${l.id}`,
        client_id: l.client_id,
        lead_id: l.id,
      });
    for (const h of handoffs)
      await this.detect({
        type: "HANDOFF_REQUIRED",
        title: "Conversa aguardando intervenção humana",
        message: h.handoff_reason || "O Rubinho solicitou atendimento humano.",
        source: "rubinho",
        fingerprint: `handoff:${h.conversation_id}`,
        client_id: h.client_id,
        lead_id: h.lead_id,
        conversation_id: h.conversation_id,
      });
    for (const t of tokens)
      await this.detect({
        type: "META_TOKEN_EXPIRING",
        severity: "critical",
        title: "Token da Meta perto de expirar",
        message: `${t.business_name} expira em ${t.token_expires_at?.toLocaleDateString("pt-BR")}.`,
        source: "meta",
        fingerprint: `meta-token:${t.id}`,
        client_id: t.client_id,
      });
    for (const s of selections)
      await this.detect({
        type: "WHATSAPP_DISCONNECTED",
        severity: "critical",
        title: "Número do WhatsApp não vinculado",
        message: `${s.meta_connection.business_name} não possui phone_number_id primário.`,
        source: "meta",
        fingerprint: `whatsapp:${s.id}`,
        client_id: s.meta_connection.client_id,
      });
    for (const j of staleJobs)
      await this.detect({
        type: "QUEUE_BACKLOG",
        severity: "critical",
        title: "Fila Meta acumulada",
        message: `Job ${j.job_type} aguarda processamento há mais de 10 minutos.`,
        source: "bullmq",
        fingerprint: `queue:${j.id}`,
        client_id: j.client_id,
      });
    for (const j of failedJobs)
      await this.detect({
        type: "META_LEADS_NOT_IMPORTED",
        severity: "critical",
        title: "Sincronização Meta falhou",
        message: j.error_message || `Falha no job ${j.job_type}.`,
        source: "meta",
        fingerprint: `meta-job:${j.id}`,
        client_id: j.client_id,
      });
    for (const h of heartbeats.filter(
      (item) => item.last_seen_at < staleThreshold || item.status === "failed",
    ))
      await this.detect({
        type: h.name.toLowerCase().includes("apibrasil")
          ? "APIBRASIL_UNAVAILABLE"
          : "WORKFLOW_STOPPED",
        severity: "critical",
        title: "Workflow sem sinal",
        message: `${h.name} não envia heartbeat há mais de 10 minutos.`,
        source: "heartbeat",
        fingerprint: `workflow:${h.name}`,
        client_id: h.client_id ?? undefined,
      });
    if (recentErrors >= 10)
      await this.detect({
        type: "ERROR_SPIKE",
        severity: "critical",
        title: "Aumento de erros do Rubinho",
        message: `${recentErrors} ações com erro ou bloqueio na última hora.`,
        source: "rubinho",
        fingerprint: `error-spike:${new Date().toISOString().slice(0, 13)}`,
        metadata: { recent_errors: recentErrors },
      });
  }

  private detect(dto: ReportOperationalIssueDto) {
    return this.report(dto, false);
  }
}
