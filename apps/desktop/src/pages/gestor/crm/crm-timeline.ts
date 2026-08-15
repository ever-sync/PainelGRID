import type {
  ApiLeadTimelineItem,
  ApiLeadTimelineOrigin,
} from "../../../services/crm";

/** Rotulos, cores e formatadores da linha do tempo e dos status do lead. */

export const CONFIRMATION_LABELS: Record<string, string> = {
  pending: "Pendente",
  confirmed: "Confirmado",
  checked_in: "Check-in realizado",
  cancelled: "Cancelado",
};

export function formatDateFull(date: string | null | undefined) {
  if (!date) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(date));
}

export function formatDateShort(date: string | null | undefined) {
  if (!date) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(date));
}

export function formatDateOnly(date: string | null | undefined) {
  if (!date) return "—";
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(date);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : formatDateShort(date);
}

export const TIMELINE_ORIGIN_LABEL: Record<ApiLeadTimelineOrigin, string> = {
  crm: "CRM",
  whatsapp: "WhatsApp",
  vendor: "Vendedor",
  gestor: "Gestor",
  automation: "Automação",
  integration: "Integração",
  n8n: "n8n",
  system: "Sistema",
};

export const TIMELINE_ORIGIN_COLOR: Record<ApiLeadTimelineOrigin, string> = {
  crm: "#3D56A2",
  whatsapp: "#22C55E",
  vendor: "#A855F7",
  gestor: "#0EA5E9",
  automation: "#F59E0B",
  integration: "#6366F1",
  n8n: "#EC4899",
  system: "#71717A",
};

export const CONFIRMATION_STATUS_LABEL: Record<string, string> = {
  pending: "Pendente",
  scheduled: "Agendado",
  confirmed: "Confirmado",
  cancelled: "Cancelado",
  checked_in: "Check-in",
};

export function statusLabelPt(value: string | null) {
  if (!value) return "—";
  return CONFIRMATION_STATUS_LABEL[value] ?? value;
}

export function timelineTitle(item: ApiLeadTimelineItem) {
  switch (item.event_type) {
    case "created":
      return "Lead criado";
    case "stage_moved":
      return item.from_stage
        ? `${item.from_stage.name} → ${item.to_stage?.name ?? item.to_value ?? "—"}`
        : `Entrou em ${item.to_stage?.name ?? item.to_value ?? "—"}`;
    case "status_changed":
      return `Status: ${statusLabelPt(item.from_value)} → ${statusLabelPt(item.to_value)}`;
    case "assigned":
      return "Vendedor atribuído";
    case "unassigned":
      return "Vendedor removido";
    case "tag_added":
      return `Tag adicionada${item.to_value ? `: ${item.to_value}` : ""}`;
    case "tag_removed":
      return `Tag removida${item.from_value ? `: ${item.from_value}` : ""}`;
    case "note":
      return "Anotação";
    case "message":
      return "Mensagem";
    case "task_created":
      return "Próxima ação criada";
    case "task_completed":
      return "Próxima ação concluída";
    case "action_recorded":
      return "Contato registrado";
    default:
      return item.event_type;
  }
}

export function timelineDotColor(item: ApiLeadTimelineItem) {
  if (item.event_type === "stage_moved" && item.to_stage)
    return item.to_stage.color;
  return TIMELINE_ORIGIN_COLOR[item.origin] ?? "#71717A";
}
