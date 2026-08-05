import type { ConfirmationStatus, LeadSource } from "../../../types";
import type { VendorCategory } from "../../../types";
import type { IntegrationCredential } from "../../../services/clients";
import type { StaffUser } from "../../../services/users";
import type {
  MetaLeadRoutingForm,
  MetaLeadWhatsappTemplateParameterKey,
} from "../../../services/meta";

/** Tipos e helpers puros da tela de detalhe do cliente. */

export type EditableStaffRole = "cliente" | "vendedor" | "recepcao";
export type LeadSourceFilter = "all" | LeadSource;
export type ConfirmationStatusFilter = "all" | ConfirmationStatus;
export type EditableVendorCategory = VendorCategory;
export type DeleteAction =
  | { kind: "client" }
  | { kind: "staff"; member: StaffUser }
  | { kind: "lead"; leadId: string; leadName: string }
  | { kind: "bulk-leads"; leadIds: string[] };
export type IntegrationAction = {
  kind: "rotate" | "revoke";
  credential: IntegrationCredential;
};
export type MetaLeadRoutingDraft = {
  event_id: string;
  crm_pipeline_id: string;
  call_stage_id: string;
  whatsapp_stage_id: string;
  whatsapp_template_name: string;
  whatsapp_template_language: string;
  whatsapp_template_parameter_keys: Array<
    MetaLeadWhatsappTemplateParameterKey | ""
  >;
};

export function emptyMetaLeadRoutingDraft(): MetaLeadRoutingDraft {
  return {
    event_id: "",
    crm_pipeline_id: "",
    call_stage_id: "",
    whatsapp_stage_id: "",
    whatsapp_template_name: "",
    whatsapp_template_language: "",
    whatsapp_template_parameter_keys: [],
  };
}

export function draftsFromMetaLeadRoutingForms(
  forms: MetaLeadRoutingForm[],
): Record<string, MetaLeadRoutingDraft> {
  return Object.fromEntries(
    forms.map((form) => [
      form.id,
      form.mapping
        ? {
            event_id: form.mapping.event_id,
            crm_pipeline_id: form.mapping.crm_pipeline_id,
            call_stage_id: form.mapping.call_stage_id,
            whatsapp_stage_id: form.mapping.whatsapp_stage_id,
            whatsapp_template_name: form.mapping.whatsapp_template_name ?? "",
            whatsapp_template_language:
              form.mapping.whatsapp_template_language ?? "",
            whatsapp_template_parameter_keys:
              form.mapping.whatsapp_template_parameter_keys ?? [],
          }
        : emptyMetaLeadRoutingDraft(),
    ]),
  );
}

export const META_LEAD_TEMPLATE_PARAMETER_OPTIONS: Array<{
  value: MetaLeadWhatsappTemplateParameterKey;
  label: string;
}> = [
  { value: "lead_name", label: "Nome do lead" },
  { value: "event_name", label: "Nome do evento" },
  { value: "company_name", label: "Nome do cliente" },
  { value: "event_date", label: "Data e hora do evento" },
  { value: "event_location", label: "Local do evento" },
];

export function defaultMetaTemplateParameters(
  count: number,
): MetaLeadWhatsappTemplateParameterKey[] {
  const defaults: MetaLeadWhatsappTemplateParameterKey[] = [
    "lead_name",
    "event_name",
    "company_name",
    "event_date",
    "event_location",
  ];
  return Array.from(
    { length: count },
    (_, index) => defaults[index] ?? "lead_name",
  );
}

export const VENDOR_CATEGORY_OPTIONS: Array<{
  value: EditableVendorCategory;
  label: string;
}> = [
  { value: "novo", label: "Novo" },
  { value: "semininovo", label: "Semininovo" },
  { value: "pdc", label: "PCD" },
  { value: "consorcio", label: "Consorcio" },
  { value: "assinatura", label: "Assinatura" },
];

export const LEAD_SOURCE_OPTIONS: Array<{
  value: LeadSourceFilter;
  label: string;
}> = [
  { value: "all", label: "Todas as fontes" },
  { value: "facebook_ads", label: "Facebook Ads" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "manual", label: "Manual" },
  { value: "form_page", label: "Formulário" },
  { value: "import_excel", label: "Importação" },
];

export const LEAD_STATUS_OPTIONS: Array<{
  value: ConfirmationStatusFilter;
  label: string;
}> = [
  { value: "all", label: "Todos os status" },
  { value: "pending", label: "Pendente" },
  { value: "scheduled", label: "Agendado" },
  { value: "confirmed", label: "Confirmado" },
  { value: "checked_in", label: "Check-in" },
  { value: "cancelled", label: "Cancelado" },
];

export const META_IMPORT_PAGE_SIZE = 6;
export const LEADS_PAGE_SIZE = 50;

export function formatDateTime(value?: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function isIntegrationCredentialActive(
  credential: IntegrationCredential,
) {
  if (credential.revoked_at) return false;
  if (!credential.expires_at) return true;
  return new Date(credential.expires_at).getTime() > Date.now();
}

export function formatDateOnly(value?: string | null) {
  if (!value) return "—";
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (match) return `${match[3]}/${match[2]}/${match[1]}`;
  return new Date(value).toLocaleDateString("pt-BR");
}

export function formatCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  }).format(value);
}

export function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export function getErrorMessage(err: unknown, fallback: string) {
  return err instanceof Error ? err.message : fallback;
}

export function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}
