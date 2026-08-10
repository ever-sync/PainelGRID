import { httpRequest } from "./http";

export type ApiEmailHistoryItem = {
  id: string;
  created_at: string;
  sent_at: string | null;
  failed_at: string | null;
  dispatch_type: string;
  workflow_key: string;
  status: string;
  provider: string | null;
  provider_message_id: string | null;
  failure_reason: string | null;
  metadata: Record<string, unknown> | null;
  lead: { id: string; name: string; email: string | null };
  event: { id: string; name: string } | null;
};

export function listEmailHistory(
  clientId: string,
  token: string,
  filters: {
    status?: string;
    origin?: string;
    dateFrom?: string;
    dateTo?: string;
  },
) {
  const query = new URLSearchParams({ client_id: clientId });
  if (filters.status) query.set("status", filters.status);
  if (filters.origin) query.set("origin", filters.origin);
  if (filters.dateFrom) query.set("date_from", filters.dateFrom);
  if (filters.dateTo) query.set("date_to", filters.dateTo);
  return httpRequest<ApiEmailHistoryItem[]>(`/dispatches/emails?${query}`, {
    token,
    cache: "no-store",
  });
}
