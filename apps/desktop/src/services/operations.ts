import { httpRequest } from "./http";

export type OperationalIssue = {
  id: string;
  type: string;
  severity: "info" | "warning" | "critical";
  status: "open" | "resolved";
  title: string;
  message: string;
  source: string;
  client_id: string | null;
  client_name: string | null;
  lead_id: string | null;
  conversation_id: string | null;
  occurrence_count: number;
  last_seen_at: string;
  metadata: Record<string, unknown>;
  lead: { id: string; name: string; phone: string | null } | null;
};

export type OperationalDashboard = {
  generated_at: string;
  summary: Array<{
    type: string;
    label: string;
    status: string;
    severity: string;
    count: number;
  }>;
  issues: OperationalIssue[];
};

export type RubinhoThermometer = {
  generated_at: string;
  refresh_after_seconds: number;
  filters: { client_id: string | null; event_id: string | null };
  totals: {
    leads: number;
    awaiting_template: number;
    template_sent: number;
    template_delivered: number;
    template_read: number;
    template_delivered_or_read: number;
    template_without_confirmation: number;
    template_without_dispatch: number;
    template_replied: number;
    template_not_replied: number;
    template_failed: number;
    engaged: number;
    scheduled: number;
    completed: number;
    handoff: number;
  };
  rates: {
    template_reply: number;
    scheduling: number;
    completion: number;
  };
  stages: Array<{
    key: string;
    label: string;
    short_label: string;
    count: number;
    percent_of_replies: number;
  }>;
};

export type RubinhoTemplateLeadStatus =
  | "delivered_or_read"
  | "failed"
  | "without_confirmation"
  | "without_dispatch";

export type RubinhoTemplateLeadList = {
  generated_at: string;
  status: RubinhoTemplateLeadStatus;
  total: number;
  protected: number;
  eligible_for_review: number;
  leads: Array<{
    id: string;
    name: string;
    phone: string | null;
    source: string;
    client_name: string;
    event_name: string | null;
    created_at: string;
    confirmation_status: string;
    template_status: RubinhoTemplateLeadStatus;
    failure_code: string | null;
    failure_reason: string | null;
    has_reply: boolean;
    has_active_appointment: boolean;
    protected: boolean;
    protected_reasons: string[];
  }>;
};

export type AgentAuditEntry = {
  id: string;
  created_at: string;
  decision_type: string;
  result_status: string;
  previous_state: unknown;
  received_message: string | null;
  next_stage: string | null;
  tool_name: string | null;
  tool_input: unknown;
  api_response: unknown;
  resulting_state: unknown;
  block_reason: string | null;
  error_message: string | null;
};

export function getOperationalDashboard(
  token: string,
  params: Record<string, string> = {},
) {
  const query = new URLSearchParams(
    Object.entries(params).filter(([, value]) => Boolean(value)),
  ).toString();
  return httpRequest<OperationalDashboard>(
    `/operations/dashboard${query ? `?${query}` : ""}`,
    { token },
  );
}

export function getRubinhoThermometer(
  token: string,
  params: { client_id?: string; event_id?: string } = {},
  signal?: AbortSignal,
) {
  const query = new URLSearchParams(
    Object.entries(params).filter(([, value]) => Boolean(value)),
  ).toString();
  return httpRequest<RubinhoThermometer>(
    `/operations/rubinho-thermometer${query ? `?${query}` : ""}`,
    { token, signal },
  );
}

export function getRubinhoTemplateLeads(
  token: string,
  params: {
    client_id?: string;
    event_id?: string;
    status: RubinhoTemplateLeadStatus;
  },
  signal?: AbortSignal,
) {
  const query = new URLSearchParams(
    Object.entries(params).filter(([, value]) => Boolean(value)),
  ).toString();
  return httpRequest<RubinhoTemplateLeadList>(
    `/operations/rubinho-template-leads?${query}`,
    { token, signal },
  );
}

export function resolveOperationalIssue(token: string, id: string) {
  return httpRequest(`/operations/issues/${id}/resolve`, {
    method: "PATCH",
    token,
  });
}

export function reopenOperationalIssue(token: string, id: string) {
  return httpRequest(`/operations/issues/${id}/reopen`, {
    method: "PATCH",
    token,
  });
}

export function getConversationAudit(token: string, conversationId: string) {
  return httpRequest<AgentAuditEntry[]>(
    `/operations/conversations/${conversationId}/audit`,
    { token },
  );
}
