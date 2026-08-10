import { httpRequest } from "./http";

export type AuditLogItem = {
  id: string;
  timestamp: string;
  actor: string;
  role: string;
  action: string;
  category: "lead" | "venda" | "evento" | "sistema";
  details: string;
  lead: { id: string; name: string };
  event: { id: string; name: string } | null;
};

export function listAuditLogs(
  token: string,
  params: { client_id: string; event_id?: string; search?: string },
) {
  const query = new URLSearchParams({ client_id: params.client_id });
  if (params.event_id) query.set("event_id", params.event_id);
  if (params.search) query.set("search", params.search);
  return httpRequest<AuditLogItem[]>(`/events/audit-logs?${query}`, {
    method: "GET",
    token,
    cache: "no-store",
  });
}
