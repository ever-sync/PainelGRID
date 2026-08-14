import type { Client, CrmStageStatusRule, PlanType } from "../types";
import { httpRequest } from "./http";

export type ApiClient = {
  id: string;
  gestor_id: string;
  company_name: string;
  cnpj: string | null;
  logo_url: string | null;
  plan: string;
  webhook_url_n8n: string | null;
  facebook_page_id: string | null;
  facebook_ad_account_id: string | null;
  whatsapp_number: string | null;
  phone_number: string | null;
  vendor_signup_token: string | null;
  settings: unknown;
  created_at: string;
  updated_at: string;
  leads_count: number;
  events_count: number;
  vehicles_count: number;
};

const CLIENT_LIST_CACHE_TTL_MS = 10_000;
let clientListCache:
  | {
      token: string;
      expiresAt: number;
      value: ApiClient[];
    }
  | undefined;
let clientListRequest:
  { token: string; promise: Promise<ApiClient[]> } | undefined;

export function invalidateClientListCache() {
  clientListCache = undefined;
  clientListRequest = undefined;
}

export function listClients(token: string) {
  const now = Date.now();
  if (clientListCache?.token === token && clientListCache.expiresAt > now) {
    return Promise.resolve(clientListCache.value);
  }
  if (clientListRequest?.token === token) return clientListRequest.promise;

  const promise = httpRequest<ApiClient[]>("/clients", {
    method: "GET",
    token,
  })
    .then((rows) => {
      clientListCache = {
        token,
        expiresAt: Date.now() + CLIENT_LIST_CACHE_TTL_MS,
        value: rows,
      };
      return rows;
    })
    .finally(() => {
      if (clientListRequest?.promise === promise) clientListRequest = undefined;
    });
  clientListRequest = { token, promise };
  return promise;
}

/**
 * Empresas que ainda operam — o que os seletores das telas de trabalho devem
 * oferecer. Empresa desativada continua existindo (e aparecendo em Clientes,
 * para reativar ou excluir) mas nao deve ser escolhivel em CRM, Chat ou
 * Eventos. Relatorios sao a excecao proposital: o historico dela continua
 * valendo depois de desativada.
 */
export function onlyActiveClients(clients: Client[]): Client[] {
  return clients.filter((client) => client.status === "active");
}

export function getClient(id: string, token: string) {
  return httpRequest<ApiClient>(`/clients/${id}`, { method: "GET", token });
}

export type CreateClientPayload = {
  company_name: string;
  vehicle_brand?: string;
  cnpj?: string;
  webhook_url_n8n?: string;
  phone_number?: string;
  whatsapp_number?: string;
  address?: string;
  contact_email?: string;
  address_street?: string;
  address_number?: string;
  address_complement?: string;
  address_district?: string;
  address_city?: string;
  address_state?: string;
  address_zipcode?: string;
};

export function createClient(token: string, payload: CreateClientPayload) {
  return httpRequest<ApiClient>("/clients", {
    method: "POST",
    token,
    body: payload,
  }).then((created) => {
    invalidateClientListCache();
    return created;
  });
}

export type UpdateClientPayload = Omit<
  Partial<CreateClientPayload>,
  "vehicle_brand"
> & {
  vehicle_brand?: string | null;
  is_active?: boolean;
  crm_stage_status_rules?: CrmStageStatusRule[] | null;
  score_rules?: {
    scheduled_points: number;
    checkin_points: number;
    sold_points: number;
  };
};

export function updateClient(
  id: string,
  token: string,
  payload: UpdateClientPayload,
) {
  return httpRequest<ApiClient>(`/clients/${id}`, {
    method: "PATCH",
    token,
    body: payload,
  }).then((updated) => {
    invalidateClientListCache();
    return updated;
  });
}

export function deleteClient(id: string, token: string) {
  return httpRequest<{ deleted: boolean }>(`/clients/${id}`, {
    method: "DELETE",
    token,
  }).then((result) => {
    invalidateClientListCache();
    return result;
  });
}

export type IntegrationCredential = {
  id: string;
  client_id: string;
  name: string;
  key_prefix: string;
  created_at: string;
  expires_at: string | null;
  revoked_at: string | null;
  last_used_at: string | null;
};

export type IntegrationCredentialWithKey = IntegrationCredential & {
  key: string;
};

export function listIntegrationCredentials(clientId: string, token: string) {
  return httpRequest<IntegrationCredential[]>(
    `/clients/${clientId}/integration-credentials`,
    { method: "GET", token },
  );
}

export function createIntegrationCredential(
  clientId: string,
  token: string,
  name: string,
) {
  return httpRequest<IntegrationCredentialWithKey>(
    `/clients/${clientId}/integration-credentials`,
    {
      method: "POST",
      token,
      body: { name },
    },
  );
}

/** Troca o token do link publico de auto-cadastro. O link antigo para de funcionar. */
export function rotateVendorSignupLink(clientId: string, token: string) {
  return httpRequest<{ vendor_signup_token: string }>(
    `/clients/${clientId}/vendor-signup-link/rotate`,
    { method: "POST", token },
  );
}

export function rotateIntegrationCredential(
  clientId: string,
  credentialId: string,
  token: string,
) {
  return httpRequest<IntegrationCredentialWithKey>(
    `/clients/${clientId}/integration-credentials/${credentialId}/rotate`,
    { method: "POST", token },
  );
}

export function revokeIntegrationCredential(
  clientId: string,
  credentialId: string,
  token: string,
) {
  return httpRequest<IntegrationCredential>(
    `/clients/${clientId}/integration-credentials/${credentialId}/revoke`,
    { method: "POST", token },
  );
}

export type CnpjLookupResult = {
  legalName: string;
  tradeName: string;
  phone?: string;
  email?: string;
  addressStreet?: string;
  addressNumber?: string;
  addressComplement?: string;
  addressDistrict?: string;
  addressCity?: string;
  addressState?: string;
  addressZipcode?: string;
};

export async function lookupCompanyByCnpj(
  rawCnpj: string,
): Promise<CnpjLookupResult> {
  const cnpj = rawCnpj.replace(/\D/g, "");
  if (cnpj.length !== 14) {
    throw new Error("CNPJ deve conter 14 dígitos.");
  }

  const response = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`);
  if (!response.ok) {
    throw new Error("Não foi possível consultar o CNPJ.");
  }

  const data = (await response.json()) as {
    razao_social?: string;
    nome_fantasia?: string;
    ddd_telefone_1?: string;
    ddd_telefone_2?: string;
    correio_eletronico?: string;
    logradouro?: string;
    numero?: string;
    complemento?: string;
    bairro?: string;
    municipio?: string;
    uf?: string;
    cep?: string;
  };

  return {
    legalName: data.razao_social?.trim() || "",
    tradeName: data.nome_fantasia?.trim() || "",
    phone:
      data.ddd_telefone_1?.trim() || data.ddd_telefone_2?.trim() || undefined,
    email: data.correio_eletronico?.trim() || undefined,
    addressStreet: data.logradouro?.trim() || undefined,
    addressNumber: data.numero?.trim() || undefined,
    addressComplement: data.complemento?.trim() || undefined,
    addressDistrict: data.bairro?.trim() || undefined,
    addressCity: data.municipio?.trim() || undefined,
    addressState: data.uf?.trim() || undefined,
    addressZipcode: data.cep?.trim() || undefined,
  };
}

const planMap: Record<string, PlanType> = {
  basic: "starter",
  starter: "starter",
  pro: "pro",
  enterprise: "enterprise",
};

export function mapApiClientToClient(row: ApiClient): Client {
  const settingsRecord =
    row.settings &&
    typeof row.settings === "object" &&
    !Array.isArray(row.settings)
      ? (row.settings as Record<string, unknown>)
      : {};

  const address =
    typeof settingsRecord.address === "string" && settingsRecord.address.trim()
      ? settingsRecord.address.trim()
      : [
          settingsRecord.address_street,
          settingsRecord.address_number,
          settingsRecord.address_complement,
          settingsRecord.address_district,
          settingsRecord.address_city,
          settingsRecord.address_state,
          settingsRecord.address_zipcode,
        ]
          .filter(
            (part): part is string =>
              typeof part === "string" && part.trim().length > 0,
          )
          .join(", ");
  const contactEmail =
    typeof settingsRecord.contact_email === "string" &&
    settingsRecord.contact_email.trim()
      ? settingsRecord.contact_email.trim()
      : "";
  const isActive =
    typeof settingsRecord.is_active === "boolean"
      ? settingsRecord.is_active
      : true;
  const vehicleBrand =
    typeof settingsRecord.vehicle_brand === "string"
      ? settingsRecord.vehicle_brand.trim()
      : "";
  const crmStageStatusRules = Array.isArray(
    settingsRecord.crm_stage_status_rules,
  )
    ? settingsRecord.crm_stage_status_rules
        .filter(
          (item): item is Record<string, unknown> =>
            typeof item === "object" && item !== null && !Array.isArray(item),
        )
        .map((item) => ({
          status: String(item.status) as CrmStageStatusRule["status"],
          stage_id: String(item.stage_id ?? ""),
          stage_code:
            typeof item.stage_code === "string" ? item.stage_code : null,
          stage_name:
            typeof item.stage_name === "string" ? item.stage_name : null,
        }))
        .filter((item) => item.stage_id)
    : [];
  const rawScoreRules =
    settingsRecord.score_rules &&
    typeof settingsRecord.score_rules === "object" &&
    !Array.isArray(settingsRecord.score_rules)
      ? (settingsRecord.score_rules as Record<string, unknown>)
      : null;
  const scoreRules = rawScoreRules
    ? {
        scheduled_points: Math.max(
          0,
          Number(rawScoreRules.scheduled_points ?? 2),
        ),
        checkin_points: Math.max(0, Number(rawScoreRules.checkin_points ?? 3)),
        sold_points: Math.max(0, Number(rawScoreRules.sold_points ?? 7)),
      }
    : undefined;

  return {
    id: row.id,
    company_name: row.company_name,
    vehicle_brand: vehicleBrand,
    cnpj: row.cnpj ?? "",
    plan: planMap[row.plan] ?? "starter",
    logo_url: row.logo_url,
    facebook_page_id: row.facebook_page_id,
    facebook_ad_account_id: row.facebook_ad_account_id,
    whatsapp_number: row.whatsapp_number,
    phone_number: row.phone_number,
    webhook_url_n8n: row.webhook_url_n8n,
    vendor_signup_token: row.vendor_signup_token ?? null,
    address,
    contact_email: contactEmail,
    status: isActive ? "active" : "inactive",
    leads_count: row.leads_count,
    events_count: row.events_count ?? 0,
    vehicles_count: row.vehicles_count ?? 0,
    crm_stage_status_rules: crmStageStatusRules,
    score_rules: scoreRules,
    created_at: row.created_at,
  };
}
