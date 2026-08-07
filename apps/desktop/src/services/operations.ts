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
