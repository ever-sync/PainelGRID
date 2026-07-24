import type { Lead } from "../types";
import type { ApiCrmPipeline, ApiCrmStage } from "../services/crm";

export type KanbanColumn = {
  id: string;
  code: string;
  label: string;
  color: string;
  emptyIcon: string;
};

const DEFAULT_STAGE_BLUEPRINTS = [
  ["NOVO_LEAD", "Novo Lead", "#3B82F6"],
  ["TENTATIVA_CONTATO", "Tentativa de contato", "#8B5CF6"],
  ["LIGACAO", "Ligação", "#EC4899"],
  ["EM_CONTATO", "Em contato", "#7C3AED"],
  ["PRE_AGENDAMENTO", "Pré-agendamento", "#6366F1"],
  ["PRESENCA_AGENDADA", "Presença agendada", "#10B981"],
  ["ENVIAR_CONFIRMACAO", "Enviar confirmação", "#3D56A2"],
  ["AGENDADOS_CONFIRMADOS", "Leads Agendados - Confirmados", "#2563EB"],
  ["PRESENCA_REAGENDADA", "Presença reagendada", "#F59E0B"],
  ["PRESENCA_CANCELADA", "Presença cancelada", "#EF4444"],
  ["LEMBRETE", "Lembrete - Ainda dá tempo!", "#22D3EE"],
  ["RECUPERACAO_VENDA", "Recuperação de venda", "#D97706"],
  ["RECUPERACAO_PRESENCA", "Recuperação de presença", "#4F46E5"],
  ["RECUPERACAO_RESPONDIDA", "Recuperação respondida", "#059669"],
  ["DESINTERESSE", "Desinteresse", "#F97316"],
  ["AGUARDANDO", "Aguardando", "#9CA3AF"],
  ["PRESENCA_CONFIRMADA", "Presença confirmada", "#059669"],
  ["COMPRARAM", "Compraram", "#10B981"],
  ["LEAD_PERDIDO", "Lead perdido", "#4B5563"],
  ["LEAD_AUSENTE", "Lead ausente", "#374151"],
] as const;

function stageSuffixFromCode(code: string | null | undefined): string | null {
  if (!code) return null;
  const normalized = code.trim().toUpperCase();
  const matched = DEFAULT_STAGE_BLUEPRINTS.find(
    ([suffix]) => normalized === suffix || normalized.endsWith(`_${suffix}`),
  );
  return matched?.[0] ?? null;
}

function stageSuffixFromName(name: string | null | undefined): string | null {
  if (!name) return null;
  const normalized = name.trim().toLowerCase();
  const matched = DEFAULT_STAGE_BLUEPRINTS.find(
    ([, label]) => label.trim().toLowerCase() === normalized,
  );
  return matched?.[0] ?? null;
}

export function defaultKanbanStages(): ApiCrmStage[] {
  const finalStages = new Set([
    "DESINTERESSE",
    "PRESENCA_CONFIRMADA",
    "COMPRARAM",
    "LEAD_PERDIDO",
    "LEAD_AUSENTE",
  ]);
  return DEFAULT_STAGE_BLUEPRINTS.map(([suffix, label, color], index) => ({
    id: suffix,
    client_id: "all",
    pipeline_id: "all",
    code: suffix,
    name: label,
    display_order: index + 1,
    color,
    is_final_stage: finalStages.has(suffix),
  }));
}

export function clientIdToPipelineCode(clientId: string): string {
  const idBase = clientId.replace(/-/g, "").toUpperCase().slice(0, 16);
  return `PL_${idBase}`;
}

export function pickDefaultPipeline(
  pipelines: ApiCrmPipeline[],
  clientId: string,
): ApiCrmPipeline | undefined {
  if (pipelines.length === 0) return undefined;
  const defaultCode = clientIdToPipelineCode(clientId);
  return (
    pipelines.find((pipeline) => pipeline.code === defaultCode) ??
    pipelines.find((pipeline) => pipeline.code.startsWith("PL_")) ??
    pipelines[0]
  );
}

export function apiStagesToColumns(stages: ApiCrmStage[]): KanbanColumn[] {
  return [...stages]
    .sort((a, b) => a.display_order - b.display_order)
    .map((stage) => ({
      id: stage.id,
      code: stage.code,
      label: stage.name,
      color: stage.color || "#6B7280",
      emptyIcon: "○",
    }));
}

export function emptyBoardForStages(
  stages: ApiCrmStage[],
): Record<string, Lead[]> {
  const board: Record<string, Lead[]> = {};
  for (const stage of stages) {
    board[stage.id] = [];
  }
  return board;
}

export function distributeLeadsByStageId(
  leads: Lead[],
  stages: ApiCrmStage[],
): Record<string, Lead[]> {
  const board = emptyBoardForStages(stages);
  const firstStageId = stages[0]?.id;
  if (!firstStageId) return board;

  for (const lead of leads) {
    const stageId =
      lead.crm_stage_id && board[lead.crm_stage_id] !== undefined
        ? lead.crm_stage_id
        : firstStageId;
    board[stageId].push(lead);
  }

  return board;
}

export function distributeLeadsByStageCode(
  leads: Lead[],
  stages: ApiCrmStage[],
): Record<string, Lead[]> {
  const board = emptyBoardForStages(stages);
  const firstStageId = stages[0]?.id;
  if (!firstStageId) return board;

  for (const lead of leads) {
    const suffix =
      stageSuffixFromCode(lead.crm_stage_code) ??
      stageSuffixFromName(lead.crm_stage_name) ??
      "NOVO_LEAD";
    const stageId = board[suffix] !== undefined ? suffix : firstStageId;
    board[stageId].push(lead);
  }

  return board;
}

export function stageCodeById(
  stages: ApiCrmStage[],
  stageId: string,
): string | undefined {
  return stages.find((stage) => stage.id === stageId)?.code;
}
