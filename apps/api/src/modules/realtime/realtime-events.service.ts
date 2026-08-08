import { Injectable } from "@nestjs/common";
import { NotificationType } from "@prisma/client";
import { NotificationsService } from "../notifications/notifications.service";
import { RealtimeGateway } from "./realtime.gateway";

/** Rótulos das ações que chegam em `lead_updated`. */
const LEAD_UPDATED_LABELS: Record<
  string,
  { title: string; description: string; type: NotificationType }
> = {
  created: {
    title: "🆕 Novo lead cadastrado",
    description: "Um lead entrou na base e aguarda atendimento.",
    type: NotificationType.info,
  },
  sale_created: {
    title: "💰 Venda registrada",
    description: "Uma venda foi lançada para um lead da operação.",
    type: NotificationType.info,
  },
  appointment_created: {
    title: "📅 Novo agendamento",
    description: "Um lead foi agendado para visita.",
    type: NotificationType.appointment,
  },
  appointment_confirmed: {
    title: "👍 Agendamento confirmado",
    description: "O lead confirmou a visita agendada.",
    type: NotificationType.appointment,
  },
  appointment_rescheduled: {
    title: "🔁 Agendamento remarcado",
    description: "A visita de um lead mudou de data.",
    type: NotificationType.appointment,
  },
  appointment_cancelled: {
    title: "❌ Agendamento cancelado",
    description: "Um lead cancelou a visita agendada.",
    type: NotificationType.appointment,
  },
};

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

/**
 * Ponto único por onde passam os eventos de tempo real. Além de empurrar para
 * os sockets conectados, grava a notificação — quem estava fora no momento
 * encontra o registro ao voltar.
 */
@Injectable()
export class RealtimeEventsService {
  constructor(
    private readonly gateway: RealtimeGateway,
    private readonly notifications: NotificationsService,
  ) {}

  emitNewMessage(clientId: string, payload: Record<string, unknown>) {
    this.gateway.emitToClient(clientId, "new_message", payload);
    // Só mensagem de lead vira notificação: o eco das próprias respostas não.
    if (payload.sender_type !== "lead") return;
    const content = asString(payload.content);
    void this.notifications.notifyClientTeam({
      clientId,
      type: NotificationType.message,
      title: "💬 Nova mensagem de lead",
      description: content
        ? content.length > 160
          ? `${content.slice(0, 160)}…`
          : content
        : "Uma nova mensagem chegou no chat.",
      target: "chat",
    });
  }

  emitLeadUpdated(clientId: string, payload: Record<string, unknown>) {
    this.gateway.emitToClient(clientId, "lead_updated", payload);
    const action = asString(payload.action);
    // `checkin` e `stage_changed` têm evento próprio — notificar aqui duplicaria.
    if (!action || action === "checkin" || action === "stage_changed") return;
    const label = LEAD_UPDATED_LABELS[action];
    if (!label) return;
    void this.notifications.notifyClientTeam({
      clientId,
      type: label.type,
      title: label.title,
      description: label.description,
      target: "leads",
    });
  }

  emitLeadCheckin(clientId: string, payload: Record<string, unknown>) {
    this.gateway.emitToClient(clientId, "lead_checkin", payload);
    void this.notifications.notifyClientTeam({
      clientId,
      type: NotificationType.appointment,
      title: "✅ Check-in confirmado",
      description: "Um lead confirmou presença no evento.",
      target: "leads",
    });
  }

  emitStageChanged(clientId: string, payload: Record<string, unknown>) {
    this.gateway.emitToClient(clientId, "stage_changed", payload);
    const stage = asString(payload.stage_code);
    const pipeline = asString(payload.pipeline_code);
    void this.notifications.notifyClientTeam({
      clientId,
      type: NotificationType.info,
      title: "🔀 Lead mudou de etapa",
      description: stage
        ? `Movido para "${stage}"${pipeline ? ` no funil ${pipeline}` : ""}.`
        : "Um lead avançou no funil.",
      target: "leads",
    });
  }

  emitVendorCalled(clientId: string, payload: Record<string, unknown>) {
    this.gateway.emitToClient(clientId, "vendor_called", payload);
    const leadName = asString(payload.lead_name) ?? "Um lead";
    const vendorId = asString(payload.vendor_id);
    void this.notifications.notifyClientTeam({
      clientId,
      type: NotificationType.alert,
      title: "🚨 Cliente na recepção",
      description: `${leadName} chegou e está aguardando atendimento.`,
      target: "leads",
      // A chamada é de uma pessoa; o restante da equipe não precisa do alerta.
      userIds: vendorId ? [vendorId] : undefined,
    });
  }
}
