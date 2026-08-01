import type { MetaCampaignReportRow } from "../services/meta";

export type MetaColumnId =
  | "spend"
  | "leads"
  | "cost_per_lead"
  | "conversations"
  | "cost_per_conversation"
  | "messaging_replies"
  | "impressions"
  | "reach"
  | "frequency"
  | "cpm"
  | "clicks"
  | "ctr"
  | "cost_per_click"
  | "link_clicks"
  | "cost_per_link_click"
  | "video_views"
  | "cost_per_video_view"
  | "post_engagement"
  | "page_engagement"
  | "cost_per_engagement";

export type MetaColumn = {
  id: MetaColumnId;
  label: string;
  /** `currency` formata em R$, `percent` em %, `number` com separador. */
  format: "currency" | "number" | "percent" | "decimal";
  /** Coluna de custo: mostra "—" quando o denominador e zero. */
  denominator?: keyof MetaCampaignReportRow;
  /** Grupo no configurador de colunas. */
  group: "Investimento" | "Formulário" | "Mensagens" | "Alcance" | "Tráfego" | "Engajamento";
};

export const META_COLUMNS: MetaColumn[] = [
  { id: "spend", label: "Valor investido", format: "currency", group: "Investimento" },

  { id: "leads", label: "Leads", format: "number", group: "Formulário" },
  { id: "cost_per_lead", label: "Custo por lead", format: "currency", denominator: "leads", group: "Formulário" },

  { id: "conversations", label: "Conversas", format: "number", group: "Mensagens" },
  { id: "cost_per_conversation", label: "Custo / conversa", format: "currency", denominator: "conversations", group: "Mensagens" },
  { id: "messaging_replies", label: "Primeiras respostas", format: "number", group: "Mensagens" },

  { id: "impressions", label: "Impressões", format: "number", group: "Alcance" },
  { id: "reach", label: "Contas alcançadas", format: "number", group: "Alcance" },
  { id: "frequency", label: "Frequência", format: "decimal", group: "Alcance" },
  { id: "cpm", label: "CPM", format: "currency", group: "Alcance" },

  { id: "clicks", label: "Cliques", format: "number", group: "Tráfego" },
  { id: "ctr", label: "CTR", format: "percent", group: "Tráfego" },
  { id: "cost_per_click", label: "CPC", format: "currency", denominator: "clicks", group: "Tráfego" },
  { id: "link_clicks", label: "Cliques no link", format: "number", group: "Tráfego" },
  { id: "cost_per_link_click", label: "Custo / clique no link", format: "currency", denominator: "link_clicks", group: "Tráfego" },

  { id: "video_views", label: "Views de vídeo", format: "number", group: "Engajamento" },
  { id: "cost_per_video_view", label: "Custo / view", format: "currency", denominator: "video_views", group: "Engajamento" },
  { id: "post_engagement", label: "Engaj. publicação", format: "number", group: "Engajamento" },
  { id: "page_engagement", label: "Engaj. página", format: "number", group: "Engajamento" },
  { id: "cost_per_engagement", label: "Custo / engajamento", format: "currency", denominator: "post_engagement", group: "Engajamento" },
];

export const META_COLUMN_BY_ID = new Map(META_COLUMNS.map((c) => [c.id, c]));

/**
 * Objetivos da Meta (nomenclatura ODAX e a legada). Cada um traz o conjunto de
 * colunas que faz sentido para aquele tipo — custo por lead numa campanha de
 * alcance nao significa nada, e CPM numa de formulario esconde o que importa.
 */
export type MetaObjectivePreset = {
  label: string;
  /** Valores de `objective` da Meta que caem neste preset. */
  matches: string[];
  columns: MetaColumnId[];
};

export const OBJECTIVE_PRESETS: MetaObjectivePreset[] = [
  {
    label: "Formulário (Leads)",
    matches: ["OUTCOME_LEADS", "LEAD_GENERATION"],
    columns: ["spend", "leads", "cost_per_lead", "impressions", "clicks", "ctr", "reach"],
  },
  {
    label: "Mensagens / WhatsApp",
    matches: ["MESSAGES", "OUTCOME_MESSAGES"],
    columns: ["spend", "conversations", "cost_per_conversation", "messaging_replies", "impressions", "reach"],
  },
  {
    label: "Engajamento",
    matches: ["OUTCOME_ENGAGEMENT", "POST_ENGAGEMENT", "PAGE_LIKES", "VIDEO_VIEWS"],
    columns: ["spend", "post_engagement", "cost_per_engagement", "video_views", "conversations", "impressions", "reach"],
  },
  {
    label: "Alcance / Reconhecimento",
    matches: ["OUTCOME_AWARENESS", "REACH", "BRAND_AWARENESS"],
    columns: ["spend", "reach", "impressions", "frequency", "cpm"],
  },
  {
    label: "Tráfego",
    matches: ["OUTCOME_TRAFFIC", "LINK_CLICKS", "TRAFFIC"],
    columns: ["spend", "link_clicks", "cost_per_link_click", "clicks", "ctr", "cost_per_click", "impressions"],
  },
  {
    label: "Vendas / Conversões",
    matches: ["OUTCOME_SALES", "CONVERSIONS"],
    columns: ["spend", "leads", "cost_per_lead", "clicks", "ctr", "impressions", "reach"],
  },
];

/** Colunas quando nenhum objetivo esta filtrado: uma amostra de cada grupo. */
export const DEFAULT_COLUMNS: MetaColumnId[] = [
  "spend",
  "leads",
  "cost_per_lead",
  "impressions",
  "conversations",
  "cost_per_conversation",
  "reach",
];

export function presetForObjective(objective: string | null | undefined) {
  if (!objective) return null;
  return (
    OBJECTIVE_PRESETS.find((preset) => preset.matches.includes(objective)) ?? null
  );
}

/** Rotulo amigavel; objetivo desconhecido cai no proprio codigo da Meta. */
export function objectiveLabel(objective: string | null | undefined) {
  if (!objective) return "Sem objetivo";
  return presetForObjective(objective)?.label ?? objective;
}

const STORAGE_PREFIX = "painelgrid:meta-columns";

export function readStoredColumns(clientId: string): MetaColumnId[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(`${STORAGE_PREFIX}:${clientId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return null;
    // Descarta ids que sumiram entre versoes, para nao quebrar a tabela.
    const valid = parsed.filter(
      (id): id is MetaColumnId =>
        typeof id === "string" && META_COLUMN_BY_ID.has(id as MetaColumnId),
    );
    return valid.length > 0 ? valid : null;
  } catch {
    return null;
  }
}

export function storeColumns(clientId: string, columns: MetaColumnId[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      `${STORAGE_PREFIX}:${clientId}`,
      JSON.stringify(columns),
    );
  } catch {
    // Modo privado / cota cheia: a escolha vale so nesta sessao.
  }
}
