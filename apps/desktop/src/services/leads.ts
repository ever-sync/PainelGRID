import type { ConfirmationStatus, CrmStage, Lead, LeadSource } from "../types";
import { API_BASE, httpRequest } from "./http";

export type ApiLead = {
  id: string;
  client_id: string;
  team_id?: string | null;
  name: string;
  email: string | null;
  phone: string | null;
  source: LeadSource;
  tags: string[];
  crm_pipeline_id: string | null;
  crm_pipeline_code: string | null;
  crm_stage_id: string | null;
  crm_stage_code: string | null;
  crm_stage_name: string | null;
  event_interest_id: string | null;
  event_interest_name?: string | null;
  event_id: string | null;
  confirmation_status: ConfirmationStatus;
  confirmation_date: string | null;
  store_visit_datetime: string | null;
  assigned_vendor_id: string | null;
  registered_by_id?: string | null;
  registered_by_name?: string | null;
  attendant_type?: "user" | "external_agent" | null;
  attendant_user_id?: string | null;
  sold_by_vendor_id?: string | null;
  campaign_id: string | null;
  notes: string | null;
  vehicle_plate?: string | null;
  cpf?: string | null;
  wristband_number?: string | null;
  companions?: string | null;
  description?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  birth_date?: string | null;
  facebook_lead_id: string | null;
  facebook_form_id?: string | null;
  facebook_ad_id?: string | null;
  facebook_ad_name?: string | null;
  facebook_ad_set_id?: string | null;
  facebook_ad_set_name?: string | null;
  facebook_campaign_id?: string | null;
  facebook_campaign_name?: string | null;
  preferred_contact_channel?: string | null;
  source_created_at?: string | null;
  source_payload?: Record<string, unknown> | null;
  checkin_token: string | null;
  checkin_voucher: string | null;
  active_appointment: Lead["active_appointment"];
  created_at: string;
  updated_at: string;
};

const STAGE_CODE_TO_CRM: Record<string, CrmStage> = {
  NOVO: "novo",
  LEAD_NOVO: "novo",
  CONTACTADO: "contactado",
  NAO_RESPONDE: "nao_responde",
  SEM_RESPOSTA: "nao_responde",
  NO_SHOW: "nao_responde",
  AGENDADO: "agendado",
  CONFIRMADO: "agendado",
  CHECKIN: "checkin",
  VISITOU: "checkin",
  CONVERTIDO: "convertido",
  PERDIDO: "perdido",
};

export const STAGE_NAME_TO_CRM: Record<string, CrmStage> = {
  Novo: "novo",
  Contactado: "contactado",
  "Não responde": "nao_responde",
  "Nao responde": "nao_responde",
  "Sem resposta": "nao_responde",
  "No-show": "nao_responde",
  Agendado: "agendado",
  Confirmado: "agendado",
  "Check-in": "checkin",
  Checkin: "checkin",
  Visitou: "checkin",
  Convertido: "convertido",
  Perdido: "perdido",
};

export function crmStageFromApiCode(
  code: string | null | undefined,
  name?: string | null,
): CrmStage {
  if (code) {
    const byCode = STAGE_CODE_TO_CRM[code];
    if (byCode) return byCode;
  }
  if (name) {
    const byName = STAGE_NAME_TO_CRM[name];
    if (byName) return byName;
  }
  return "novo";
}

export function mapApiLeadToLead(row: ApiLead): Lead {
  return {
    id: row.id,
    client_id: row.client_id,
    team_id: row.team_id ?? null,
    name: row.name,
    email: row.email ?? "",
    phone: row.phone ?? "",
    source: row.source,
    crm_stage: crmStageFromApiCode(row.crm_stage_code, row.crm_stage_name),
    crm_stage_id: row.crm_stage_id ?? null,
    crm_stage_code: row.crm_stage_code ?? null,
    crm_stage_name: row.crm_stage_name ?? null,
    crm_pipeline_id: row.crm_pipeline_id ?? null,
    tags: row.tags ?? [],
    confirmation_status: row.confirmation_status,
    assigned_vendor_id: row.assigned_vendor_id,
    registered_by_id: row.registered_by_id ?? null,
    registered_by_name: row.registered_by_name ?? null,
    attendant_type: row.attendant_type ?? null,
    attendant_user_id: row.attendant_user_id ?? null,
    sold_by_vendor_id: row.sold_by_vendor_id ?? null,
    event_interest: row.event_interest_name ?? null,
    event_id: row.event_interest_id,
    store_visit_datetime: row.store_visit_datetime
      ? new Date(row.store_visit_datetime).toISOString()
      : null,
    notes: row.notes ?? "",
    vehicle_plate: row.vehicle_plate ?? "",
    cpf: row.cpf ?? null,
    wristband_number: row.wristband_number ?? null,
    companions: row.companions ?? "",
    description: row.description ?? "",
    first_name: row.first_name ?? "",
    last_name: row.last_name ?? "",
    birth_date: row.birth_date ?? null,
    facebook_lead_id: row.facebook_lead_id ?? null,
    facebook_form_id: row.facebook_form_id ?? null,
    facebook_ad_id: row.facebook_ad_id ?? null,
    facebook_ad_name: row.facebook_ad_name ?? null,
    facebook_ad_set_id: row.facebook_ad_set_id ?? null,
    facebook_ad_set_name: row.facebook_ad_set_name ?? null,
    facebook_campaign_id: row.facebook_campaign_id ?? null,
    facebook_campaign_name: row.facebook_campaign_name ?? null,
    preferred_contact_channel: row.preferred_contact_channel ?? null,
    source_created_at: row.source_created_at ?? null,
    source_payload: row.source_payload ?? null,
    checkin_token: row.checkin_token ?? null,
    checkin_voucher: row.checkin_voucher ?? null,
    active_appointment: row.active_appointment ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export type ListLeadsParams = {
  /** Omitido: gestor lista leads de todos os clientes; demais papéis usam o client_id do token. */
  client_id?: string;
  source?: LeadSource;
  confirmation_status?: ConfirmationStatus;
  search?: string;
  event_id?: string;
  unassigned_only?: boolean;
  take?: number;
};

export type FetchAllLeadsOptions = {
  signal?: AbortSignal;
  /** Limite de segurança para o kanban (evita dezenas de páginas sequenciais). */
  maxItems?: number;
  /** Chamado a cada página — permite pintar o board antes de carregar tudo. */
  onPage?: (page: ApiLead[], accumulated: ApiLead[]) => void;
};

type ApiLeadsListResponse =
  | ApiLead[]
  | {
      items: ApiLead[];
      page_info?: unknown;
    };

export async function fetchAllLeads(
  params: ListLeadsParams,
  token: string,
  options: FetchAllLeadsOptions = {},
): Promise<ApiLead[]> {
  const all: ApiLead[] = [];
  let cursor: string | null = null;
  const PAGE_SIZE = 200;
  const maxItems = options.maxItems ?? 2_000;

  do {
    if (options.signal?.aborted) {
      throw new DOMException("Aborted", "AbortError");
    }

    const qs = new URLSearchParams();
    if (params.client_id) qs.set("client_id", params.client_id);
    if (params.source) qs.set("source", params.source);
    if (params.confirmation_status)
      qs.set("confirmation_status", params.confirmation_status);
    if (params.search?.trim()) qs.set("search", params.search.trim());
    if (params.event_id) qs.set("event_id", params.event_id);
    if (params.unassigned_only) qs.set("unassigned_only", "true");
    qs.set("take", String(PAGE_SIZE));
    if (cursor) qs.set("cursor", cursor);

    const payload = await httpRequest<
      | {
          items: ApiLead[];
          page_info: { next_cursor: string | null; has_next_page: boolean };
        }
      | ApiLead[]
    >(`/leads?${qs.toString()}`, {
      method: "GET",
      token,
      signal: options.signal,
    });

    const items = Array.isArray(payload) ? payload : payload.items;
    all.push(...items);
    options.onPage?.(items, all);
    cursor = Array.isArray(payload)
      ? null
      : (payload.page_info?.next_cursor ?? null);

    if (all.length >= maxItems) {
      break;
    }
  } while (cursor);

  return all;
}

export function listLeads(params: ListLeadsParams, token: string) {
  const qs = new URLSearchParams();
  if (params.client_id) qs.set("client_id", params.client_id);
  if (params.source) qs.set("source", params.source);
  if (params.confirmation_status)
    qs.set("confirmation_status", params.confirmation_status);
  if (params.search?.trim()) qs.set("search", params.search.trim());
  if (params.event_id) qs.set("event_id", params.event_id);
  if (params.unassigned_only) qs.set("unassigned_only", "true");
  if (params.take) qs.set("take", String(params.take));

  return httpRequest<ApiLeadsListResponse>(`/leads?${qs.toString()}`, {
    method: "GET",
    token,
  }).then((payload) => {
    if (Array.isArray(payload)) return payload;
    return Array.isArray(payload.items) ? payload.items : [];
  });
}

export type UpdateLeadBody = {
  confirmation_status?: ConfirmationStatus;
  name?: string;
  email?: string | null;
  phone?: string | null;
  source?: LeadSource;
  notes?: string | null;
  store_visit_datetime?: string | null;
  event_interest_id?: string | null;
  crm_pipeline_id?: string | null;
  crm_stage_id?: string | null;
  assigned_vendor_id?: string | null;
  vehicle_plate?: string | null;
  cpf?: string | null;
  wristband_number?: string | null;
  companions?: string | null;
  description?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  birth_date?: string | null;
};

export function updateLead(id: string, body: UpdateLeadBody, token: string) {
  return httpRequest<ApiLead>(`/leads/${id}`, { method: "PATCH", token, body });
}

export function getLead(id: string, token: string) {
  return httpRequest<ApiLead>(`/leads/${id}`, { method: "GET", token });
}

export function deleteLead(id: string, token: string) {
  return httpRequest<{ deleted: boolean }>(`/leads/${id}`, {
    method: "DELETE",
    token,
  });
}

export type CreateLeadBody = {
  client_id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  source: LeadSource;
  tags?: string[];
  event_interest_id?: string | null;
  crm_pipeline_id?: string | null;
  crm_stage_id?: string | null;
  notes?: string | null;
};

export function createLead(body: CreateLeadBody, token: string) {
  return httpRequest<ApiLead>("/leads", { method: "POST", token, body });
}

export function assignLeadToMe(id: string, token: string) {
  return httpRequest<ApiLead>(`/leads/${id}/assign-to-me`, {
    method: "POST",
    token,
  });
}

export function notifyVendorCall(id: string, token: string) {
  return httpRequest<{ success: boolean }>(`/leads/${id}/call-vendor`, {
    method: "POST",
    token,
  });
}

export type CheckLeadPhoneResponse = {
  exists: boolean;
  lead?: {
    id: string;
    name: string;
    assigned_vendor_id: string | null;
    assigned_vendor_name: string | null;
  };
};

export function checkLeadPhone(
  phone: string,
  token: string,
  clientId?: string,
  eventId?: string,
) {
  const qs = new URLSearchParams({ phone: phone.trim() });
  if (clientId) qs.set("client_id", clientId);
  if (eventId) qs.set("event_id", eventId);
  return httpRequest<CheckLeadPhoneResponse>(
    `/leads/check-phone?${qs.toString()}`,
    {
      method: "GET",
      token,
    },
  );
}
export function checkInLeadByToken(token: string, accessToken: string) {
  return httpRequest<ApiLead>("/leads/check-in-by-token", {
    method: "POST",
    token: accessToken,
    body: { token: token.trim() },
  });
}

export async function exportLeadsCsv(params: ListLeadsParams, token: string) {
  const qs = new URLSearchParams();
  if (params.client_id) qs.set("client_id", params.client_id);
  if (params.source) qs.set("source", params.source);
  if (params.confirmation_status)
    qs.set("confirmation_status", params.confirmation_status);
  if (params.search?.trim()) qs.set("search", params.search.trim());

  const response = await fetch(`${API_BASE}/leads/export?${qs.toString()}`, {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    throw new Error(`Falha ao exportar CSV (${response.status})`);
  }
  return response.text();
}

export async function importLeadsCsv(
  params: { client_id: string; file: File },
  token: string,
): Promise<{ imported: number; skipped: number; errors: string[] }> {
  const form = new FormData();
  form.append("client_id", params.client_id);
  form.append("file", params.file);

  const response = await fetch(`${API_BASE}/leads/import`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });

  const text = await response.text();
  const payload = text
    ? (JSON.parse(text) as { message?: string } & Record<string, unknown>)
    : {};
  if (!response.ok) {
    throw new Error(
      (payload.message as string) ||
        `Falha ao importar CSV (${response.status})`,
    );
  }
  return payload as { imported: number; skipped: number; errors: string[] };
}

export async function queryFipeData(
  plate: string,
  token: string,
  eventId?: string | null,
): Promise<{ brand: string; model: string; modelYear: string; value: string }> {
  const qs = eventId
    ? `?${new URLSearchParams({ event_id: eventId }).toString()}`
    : "";
  const response = await fetch(`${API_BASE}/leads/fipe/${plate}${qs}`, {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` },
  });

  const text = await response.text();
  const payload = text
    ? (JSON.parse(text) as { message?: string } & Record<string, unknown>)
    : {};
  if (!response.ok) {
    throw new Error(
      (payload.message as string) ||
        `Falha ao consultar FIPE (${response.status})`,
    );
  }
  return payload as {
    brand: string;
    model: string;
    modelYear: string;
    value: string;
  };
}

export function closeLeadAttendance(
  leadId: string,
  payload: {
    wristband_number?: string;
    cpf?: string;
    phone?: string;
    sold: boolean;
    attendance_duration_seconds?: number;
  },
  accessToken: string,
) {
  return httpRequest<ApiLead>(`/leads/${leadId}/close-attendance`, {
    method: "POST",
    token: accessToken,
    body: payload,
  });
}

export function lookupLeadByCpfOrPhone(query: string, token: string) {
  const qs = new URLSearchParams({ q: query });
  return httpRequest<ApiLead[]>(`/leads/lookup?${qs.toString()}`, {
    method: "GET",
    token,
  });
}
