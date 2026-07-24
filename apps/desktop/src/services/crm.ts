import { httpRequest } from "./http";

export type ApiCrmPipeline = {
  id: string;
  client_id: string;
  code: string;
  name: string;
  description: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  /** Presente em GET /crm/pipelines (evita round-trip extra por pipeline). */
  stages?: ApiCrmStage[];
};

export type ApiCrmStage = {
  id: string;
  client_id: string;
  pipeline_id: string;
  code: string;
  name: string;
  display_order: number;
  color: string;
  is_final_stage: boolean;
};

export function listCrmPipelines(clientId: string, token: string) {
  const qs = new URLSearchParams({ client_id: clientId });
  return httpRequest<ApiCrmPipeline[]>(`/crm/pipelines?${qs.toString()}`, {
    method: "GET",
    token,
  });
}

export function listPipelineStages(pipelineId: string, token: string) {
  return httpRequest<ApiCrmStage[]>(`/crm/pipelines/${pipelineId}/stages`, {
    method: "GET",
    token,
  });
}

/** Contagem real de leads por etapa (crm_stage_id), independente do carregamento
 * progressivo dos cards no Kanban. */
export function getCrmStageCounts(clientId: string, token: string) {
  return httpRequest<{ counts: Record<string, number> }>(
    `/crm/leads/stage-counts?client_id=${encodeURIComponent(clientId)}`,
    { method: "GET", token },
  );
}

export type ApiCrmHistoryItem = {
  id: string;
  from_stage: { id: string; name: string; code: string; color: string } | null;
  to_stage: { id: string; name: string; code: string; color: string };
  changed_by: { id: string; name: string };
  notes: string | null;
  created_at: string;
};

export function listLeadHistory(leadId: string, token: string) {
  return httpRequest<ApiCrmHistoryItem[]>(`/crm/leads/${leadId}/history`, {
    method: "GET",
    token,
  });
}

export type ApiLeadTimelineEventType =
  | "created"
  | "stage_moved"
  | "status_changed"
  | "assigned"
  | "unassigned"
  | "tag_added"
  | "tag_removed"
  | "note"
  | "message";

export type ApiLeadTimelineOrigin =
  | "crm"
  | "whatsapp"
  | "vendor"
  | "gestor"
  | "automation"
  | "integration"
  | "n8n"
  | "system";

export type ApiLeadTimelineItem = {
  id: string;
  event_type: ApiLeadTimelineEventType;
  origin: ApiLeadTimelineOrigin;
  from_stage: { id: string; name: string; code: string; color: string } | null;
  to_stage: { id: string; name: string; code: string; color: string } | null;
  from_value: string | null;
  to_value: string | null;
  actor: { id: string | null; name: string | null };
  notes: string | null;
  occurred_at: string;
};

export function listLeadTimeline(leadId: string, token: string) {
  return httpRequest<ApiLeadTimelineItem[]>(`/crm/leads/${leadId}/timeline`, {
    method: "GET",
    token,
  });
}

export type CreatePipelineBody = {
  client_id: string;
  name: string;
  code?: string;
  stages?: Array<{
    name: string;
    code?: string;
    display_order: number;
    color: string;
    is_final_stage?: boolean;
  }>;
};

export function createCrmPipeline(body: CreatePipelineBody, token: string) {
  return httpRequest<ApiCrmPipeline & { stages: ApiCrmStage[] }>(
    "/crm/pipelines",
    {
      method: "POST",
      token,
      body,
    },
  );
}

export function moveCrmLead(
  leadId: string,
  body: {
    pipeline_code: string;
    stage_code: string;
    source?: string;
    notes?: string;
  },
  token: string,
) {
  return httpRequest<{
    moved: boolean;
    lead_id: string;
    from_stage_id: string | null;
    to_stage_id: string;
    pipeline_code: string;
    stage_code: string;
    confirmation_status?: string;
  }>(`/crm/leads/${leadId}/move`, {
    method: "POST",
    token,
    body,
  });
}

export type BulkMoveResult = {
  total: number;
  moved: number;
  skipped: number;
  pipeline_code: string;
  stage_code: string;
  results: Array<{ lead_id: string; moved: boolean; reason?: string }>;
};

export function bulkMoveCrmLeads(
  body: {
    lead_ids: string[];
    pipeline_code: string;
    stage_code: string;
    source?: string;
    notes?: string;
    force?: boolean;
  },
  token: string,
) {
  return httpRequest<BulkMoveResult>("/crm/leads/bulk-move", {
    method: "POST",
    token,
    body,
  });
}
