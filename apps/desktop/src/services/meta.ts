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
