import type { CrmStage, Lead } from "../../types";
import type { ApiCrmStage } from "../../services/crm";

export function formatStageLeadCount(count: number) {
  return count > 999 ? "999+" : String(count);
}

export function removeLeadFromBoard(
  board: Record<string, Lead[]>,
  leadId: string,
) {
  const next = { ...board };
  for (const stageId of Object.keys(next)) {
    const current = next[stageId] ?? [];
    const filtered = current.filter((lead) => lead.id !== leadId);
    if (filtered.length !== current.length) next[stageId] = filtered;
  }
  return next;
}

export function upsertLeadInBoard(
  board: Record<string, Lead[]>,
  lead: Lead,
  stages: ApiCrmStage[],
) {
  const next = removeLeadFromBoard(board, lead.id);
  const targetStageId =
    lead.crm_stage_id && next[lead.crm_stage_id] !== undefined
      ? lead.crm_stage_id
      : (stages[0]?.id ?? null);

  if (targetStageId) {
    next[targetStageId] = [...(next[targetStageId] ?? []), lead];
  }
  return next;
}

export const LEGACY_STAGES: Array<{
  id: CrmStage;
  label: string;
  color: string;
  accent: string;
  chip: string;
  emptyIcon: string;
}> = [
  { id: "novo", label: "Novo", color: "#FF0636", accent: "from-[#FF0636] to-[#FBBB49]", chip: "bg-[#FF0636]/10 text-[#FF0636]", emptyIcon: "✦" },
  { id: "contactado", label: "Contactado", color: "#3D56A2", accent: "from-[#3D56A2] to-[#7c3aed]", chip: "bg-[#3D56A2]/10 text-[#3D56A2]", emptyIcon: "◎" },
  { id: "nao_responde", label: "Não responde", color: "#F97316", accent: "from-[#F97316] to-[#FBBB49]", chip: "bg-orange-100 text-orange-700", emptyIcon: "◌" },
  { id: "agendado", label: "Agendado", color: "#FBBB49", accent: "from-[#FBBB49] to-[#FF0636]", chip: "bg-[#FBBB49]/20 text-[#8a5a00]", emptyIcon: "◈" },
  { id: "checkin", label: "Check-in", color: "#8B5CF6", accent: "from-[#8B5CF6] to-[#3D56A2]", chip: "bg-purple-100 text-purple-700", emptyIcon: "◇" },
  { id: "convertido", label: "Convertido", color: "#10B981", accent: "from-emerald-500 to-[#3D56A2]", chip: "bg-emerald-500/10 text-emerald-700", emptyIcon: "◆" },
  { id: "perdido", label: "Perdido", color: "#6B7280", accent: "from-zinc-500 to-[#FF0636]", chip: "bg-zinc-100 text-zinc-700", emptyIcon: "○" },
];

export const CRM_SOURCE_OPTIONS = [
  { value: "all", label: "Todas as fontes" },
  { value: "facebook_ads", label: "Facebook Ads" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "manual", label: "Manual" },
  { value: "form_page", label: "Formulario" },
] as const;

export const CRM_SOURCE_LABELS: Record<string, string> = {
  facebook_ads: "Facebook Ads",
  whatsapp: "WhatsApp",
  manual: "Manual",
  form_page: "Formulário",
  import_excel: "Importação Excel",
};

export function formatCrmDate(date: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(date));
}

export function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}
