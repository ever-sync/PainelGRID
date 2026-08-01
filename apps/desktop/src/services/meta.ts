import { httpRequest } from "./http";

type MetaStatusResponse = {
  client_id: string;
  connected: boolean;
  connection?: Record<string, unknown> | null;
};

type MetaSummaryResponse = {
  client_id: string;
  connected: boolean;
  summary: {
    campaigns: number;
    ad_sets: number;
    ads: number;
    leads_imported: number;
    spend_today: number;
    daily_budget: number;
    remaining_budget?: number;
    insight_date?: string | null;
    top_forms?: Array<{ id: string; name: string; leads: number }>;
    top_utm_campaigns?: Array<{ value: string; leads: number }>;
    top_utm_contents?: Array<{ value: string; leads: number }>;
    top_utm_terms?: Array<{ value: string; leads: number }>;
  };
};

export type MetaCampaignReportRow = {
  id: string;
  name: string;
  status: string | null;
  spend: number;
  leads: number;
  cost_per_lead: number;
  impressions: number;
  conversations: number;
  cost_per_conversation: number;
  reach: number;
  // Colunas por tipo de campanha (extraidas de raw_payload.actions no backend).
  clicks: number;
  cost_per_click: number;
  ctr: number;
  cpm: number;
  frequency: number;
  link_clicks: number;
  cost_per_link_click: number;
  video_views: number;
  cost_per_video_view: number;
  post_engagement: number;
  page_engagement: number;
  cost_per_engagement: number;
  messaging_replies: number;
};

export type MetaAdReportRow = MetaCampaignReportRow;

export type MetaAdSetReportRow = MetaCampaignReportRow & {
  ads: MetaAdReportRow[];
};

export type MetaCampaignsReportItem = MetaCampaignReportRow & {
  objective: string | null;
  ad_sets: MetaAdSetReportRow[];
};

export type MetaCampaignsReportResponse = {
  client_id: string;
  connected: boolean;
  campaigns: MetaCampaignsReportItem[];
  /** Amplitude realmente sincronizada; limita o seletor de datas. */
  available_range: { from: string | null; to: string | null };
};

export type CampaignsReportFilters = {
  from?: string;
  to?: string;
  objective?: string;
};

export type MetaBusinessApiOption = {
  id: string;
  name: string;
  ad_accounts?: Array<{ id: string; name?: string }>;
  pages?: Array<{ id: string; name?: string }>;
  forms?: Array<{ id: string; name?: string; page_id?: string }>;
  whatsapp_accounts?: Array<{
    id: string;
    name?: string;
    phone_number_id?: string;
    display_phone_number?: string;
  }>;
};

export type StartConnectResponse = {
  client_id: string;
  state: string;
  auth_url: string;
  expires_in_seconds: number;
};

type ListMetaBusinessesResponse = {
  client_id: string;
  oauth_session_id?: string | null;
  gestor_token?: boolean;
  businesses: MetaBusinessApiOption[];
};

type SelectMetaAssetsPayload = {
  client_id: string;
  oauth_session_id?: string;
  gestor_token?: boolean;
  business_id: string;
  ad_account_ids?: string[];
  page_ids?: string[];
  form_ids?: string[];
  waba_id?: string;
  phone_number_id?: string;
};

export type MetaGestorConnectResponse = {
  gestor_id: string;
  state: string;
  auth_url: string;
  expires_in_seconds: number;
  flow: "gestor";
};

export type MetaGestorStatusResponse = {
  gestor_id: string;
  connected: boolean;
  token_expires_at: string | null;
  connected_at: string | null;
  scopes: string[];
};

type SelectMetaAssetsResponse = {
  client_id: string;
  meta_connection_id: string;
  business: { id: string; name: string };
  selected_assets: {
    ad_accounts: Array<{ id: string; name: string }>;
    pages: Array<{ id: string; name: string }>;
    forms: Array<{ id: string; page_id: string; name: string }>;
    waba_id?: string | null;
    phone_number_id?: string | null;
  };
  sync_job_id: string;
  initial_sync: {
    status: "completed" | "failed" | "queued";
    message?: string;
    summary?: Record<string, unknown>;
  };
};

type SyncFullResponse = {
  client_id: string;
  meta_connection_id: string;
  sync_job_id: string;
  status?: "completed" | "failed" | "queued";
  summary: Record<string, unknown>;
};

type ImportHistoricalLeadsResponse = {
  client_id: string;
  meta_connection_id: string;
  sync_job_id: string;
  status?: "completed" | "failed" | "queued";
  summary: Record<string, unknown>;
};

type DisconnectMetaResponse = {
  client_id: string;
  disconnected: boolean;
  message?: string;
  meta_connection_id?: string;
  disconnected_at?: string;
};

export function startMetaConnect(clientId: string, token: string) {
  return httpRequest<StartConnectResponse>("/meta/connect/start", {
    method: "POST",
    token,
    body: { client_id: clientId },
  });
}

export function startMetaGestorConnect(token: string) {
  return httpRequest<MetaGestorConnectResponse>("/meta/gestor/connect/start", {
    method: "POST",
    token,
  });
}

export function getMetaGestorStatus(token: string) {
  return httpRequest<MetaGestorStatusResponse>("/meta/gestor/status", {
    method: "GET",
    token,
  });
}

export function disconnectMetaGestor(token: string) {
  return httpRequest<{ gestor_id: string; disconnected: boolean }>(
    "/meta/gestor/disconnect",
    {
      method: "POST",
      token,
    },
  );
}

export function getMetaStatus(clientId: string, token: string) {
  return httpRequest<MetaStatusResponse>(`/meta/status/${clientId}`, {
    method: "GET",
    token,
  });
}

export function getMetaSummary(clientId: string, token: string) {
  return httpRequest<MetaSummaryResponse>(`/meta/summary/${clientId}`, {
    method: "GET",
    token,
  });
}

export function getMetaCampaignsReport(
  clientId: string,
  token: string,
  filters: CampaignsReportFilters = {},
) {
  const params = new URLSearchParams();
  if (filters.from) params.set("from", filters.from);
  if (filters.to) params.set("to", filters.to);
  if (filters.objective) params.set("objective", filters.objective);
  const qs = params.toString();

  return httpRequest<MetaCampaignsReportResponse>(
    `/meta/campaigns-report/${clientId}${qs ? `?${qs}` : ""}`,
    {
      method: "GET",
      token,
    },
  );
}

export type AssignableCampaign = {
  meta_campaign_id: string;
  name: string;
  status: string | null;
  objective: string | null;
  assigned_client_id: string | null;
  assigned_event_id: string | null;
  assigned_event_name: string | null;
  /** Palpite pela pagina promovida; so pre-marca a tela, nao decide nada. */
  suggested_client_id: string | null;
  belongs_to_this_client: boolean;
};

export function listAssignableCampaigns(clientId: string, token: string) {
  return httpRequest<AssignableCampaign[]>(
    `/meta/campaign-assignments/${clientId}`,
    {
      method: "GET",
      token,
    },
  );
}

export type LinkedCampaign = {
  meta_campaign_id: string;
  name: string;
  event_id: string | null;
  event_name: string | null;
  linked_at: string;
};

export function listLinkedCampaigns(clientId: string, token: string) {
  return httpRequest<LinkedCampaign[]>(
    `/meta/campaign-assignments/${clientId}/linked`,
    {
      method: "GET",
      token,
    },
  );
}

export function assignMetaCampaign(
  payload: {
    meta_campaign_id: string;
    campaign_name?: string;
    client_id: string;
    event_id?: string | null;
  },
  token: string,
) {
  return httpRequest<Record<string, unknown>>("/meta/campaign-assignments", {
    method: "POST",
    token,
    body: payload,
  });
}

export function unassignMetaCampaign(metaCampaignId: string, token: string) {
  return httpRequest<{ removed: boolean }>(
    `/meta/campaign-assignments/${encodeURIComponent(metaCampaignId)}`,
    {
      method: "DELETE",
      token,
    },
  );
}

export function syncMetaFull(clientId: string, token: string) {
  return httpRequest<SyncFullResponse>("/meta/sync/full", {
    method: "POST",
    token,
    body: { client_id: clientId },
  });
}

export function importMetaLeads(
  clientId: string,
  token: string,
  formIds?: string[],
) {
  return httpRequest<ImportHistoricalLeadsResponse>("/meta/sync/leads", {
    method: "POST",
    token,
    body: { client_id: clientId, form_ids: formIds },
  });
}

export function disconnectMeta(clientId: string, token: string) {
  return httpRequest<DisconnectMetaResponse>("/meta/disconnect", {
    method: "POST",
    token,
    body: { client_id: clientId },
  });
}

export function listMetaBusinesses(
  clientId: string,
  oauthSessionId: string | null,
  token: string,
  options?: { gestor_token?: boolean },
) {
  const params = new URLSearchParams({ client_id: clientId });
  if (options?.gestor_token) {
    params.set("gestor_token", "true");
  } else if (oauthSessionId) {
    params.set("oauth_session_id", oauthSessionId);
  }
  return httpRequest<ListMetaBusinessesResponse>(
    `/meta/businesses?${params.toString()}`,
    {
      method: "GET",
      token,
    },
  );
}

export function selectMetaAssets(
  payload: SelectMetaAssetsPayload,
  token: string,
) {
  return httpRequest<SelectMetaAssetsResponse>("/meta/select-assets", {
    method: "POST",
    token,
    body: payload,
  });
}
