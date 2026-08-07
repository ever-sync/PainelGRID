import type { Lead } from "../../types";
import type { OperationalReportResponse } from "../../services/events";

export type ReportMetricConfidence =
  "real" | "derived" | "estimated" | "demonstrative" | "unavailable";

export type ReportMetricContract = {
  key: string;
  label: string;
  confidence: ReportMetricConfidence;
  source: string;
  caveat?: string;
};

/**
 * Contrato de caracterização do relatório operacional antes da refatoração.
 * Ele torna explícito o que é real e o que ainda precisa ser substituído nas
 * próximas fases, evitando que dados demonstrativos pareçam operacionais.
 */
export const REPORT_METRIC_CONTRACT: readonly ReportMetricContract[] = [
  {
    key: "leads",
    label: "Total de leads",
    confidence: "real",
    source: "Lead agregado no backend",
  },
  {
    key: "crm_funnel",
    label: "Funil do CRM",
    confidence: "real",
    source: "Appointment + LeadTimeline + Sale",
  },
  {
    key: "appointments",
    label: "Agendamentos",
    confidence: "real",
    source: "Appointment",
  },
  {
    key: "checkins",
    label: "Check-ins",
    confidence: "real",
    source: "Appointment.completed_at + LeadTimeline",
  },
  {
    key: "sales",
    label: "Vendas",
    confidence: "real",
    source: "Sale",
  },
  {
    key: "campaign_performance",
    label: "Campanhas, conjuntos e anúncios",
    confidence: "real",
    source: "MetaCampaignInsight + atribuição do evento",
  },
  {
    key: "event_investment",
    label: "Investimento por evento",
    confidence: "real",
    source: "MetaCampaignInsight.spend",
  },
  {
    key: "event_revenue",
    label: "Receita por evento",
    confidence: "real",
    source: "Sale.value",
  },
  {
    key: "vendor_team_fallback",
    label: "Ranking sem snapshot",
    confidence: "unavailable",
    source: "Estado vazio até existir snapshot real do evento",
  },
  {
    key: "export",
    label: "Exportação",
    confidence: "real",
    source: "Endpoint operacional paginado, exportado em CSV",
  },
] as const;

export function filterOperationalReportLeads(
  leads: Lead[],
  selectedClientId: string,
  selectedEventId: string,
): Lead[] {
  return leads.filter((lead) => {
    if (selectedClientId !== "all" && lead.client_id !== selectedClientId) {
      return false;
    }
    if (selectedEventId !== "all" && lead.event_id !== selectedEventId)
      return false;
    return true;
  });
}

export function leadsForOperationalEvent(
  leads: Lead[],
  eventId: string,
): Lead[] {
  return leads.filter((lead) => lead.event_id === eventId);
}

export function summarizeOperationalLeads(leads: Lead[]) {
  const totalLeads = leads.length;
  const scheduled = leads.filter(
    (lead) =>
      lead.crm_stage === "agendado" ||
      lead.crm_stage === "checkin" ||
      lead.crm_stage === "convertido",
  ).length;
  const checkedIn = leads.filter(
    (lead) => lead.crm_stage === "checkin" || lead.crm_stage === "convertido",
  ).length;
  const converted = leads.filter(
    (lead) => lead.crm_stage === "convertido",
  ).length;

  return {
    totalLeads,
    scheduled,
    checkedIn,
    converted,
    conversionRate:
      totalLeads > 0 ? Math.round((converted / totalLeads) * 100) : 0,
    checkinRate:
      totalLeads > 0 ? Math.round((checkedIn / totalLeads) * 100) : 0,
  };
}

export function operationalLeadSourceLabel(source?: string | null): string {
  const normalized = (source ?? "").toLowerCase();
  if (
    normalized.includes("facebook") ||
    normalized.includes("meta") ||
    normalized.includes("instagram") ||
    normalized.includes("ig") ||
    normalized === "facebook_ads"
  ) {
    return "Facebook Ads (Meta)";
  }
  if (normalized.includes("whatsapp")) return "WhatsApp Direct";
  if (
    normalized.includes("form") ||
    normalized.includes("site") ||
    normalized.includes("web") ||
    normalized === "form_page"
  ) {
    return "Formulário Web";
  }
  if (normalized.includes("manual") || normalized.includes("balcao")) {
    return "Manual / Balcão";
  }
  return "Outros Canais";
}

export function groupOperationalLeadsBySource(leads: Lead[]) {
  const grouped = new Map<string, number>();
  for (const lead of leads) {
    const label = operationalLeadSourceLabel(lead.source);
    grouped.set(label, (grouped.get(label) ?? 0) + 1);
  }
  return [...grouped.entries()].map(([name, value]) => ({ name, value }));
}

const csvCell = (value: unknown) => {
  const text = value == null ? "" : String(value);
  return `"${text.replace(/"/g, '""')}"`;
};

export function buildOperationalReportCsv(
  items: OperationalReportResponse["items"],
): string {
  const header = [
    "Nome",
    "E-mail",
    "Telefone",
    "Cliente",
    "Evento",
    "Origem",
    "Etapa CRM",
    "Status de confirmação",
    "Criado em",
  ];
  const rows = items.map((item) => [
    item.name,
    item.email,
    item.phone,
    item.client.company_name,
    item.event_interest?.name,
    operationalLeadSourceLabel(item.source),
    item.crm_stage?.name,
    item.confirmation_status,
    new Date(item.created_at).toLocaleString("pt-BR"),
  ]);
  return `\uFEFF${[header, ...rows]
    .map((row) => row.map(csvCell).join(";"))
    .join("\r\n")}`;
}
