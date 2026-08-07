import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../config/prisma.service";
import { AuthenticatedUser } from "../auth/auth.types";
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

@Injectable()
export class OperationsService {
  constructor(private readonly prisma: PrismaService) {}

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
