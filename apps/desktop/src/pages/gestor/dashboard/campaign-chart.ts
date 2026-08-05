import type { Lead } from "../../../types";
import type { CampaignChartPoint } from "../CampaignPerformanceChart";

/** Agregacao do grafico "Contatos por campanha". Fora da pagina para poder
 *  ser testada: foi aqui que o acumulado disfarcado de serie diaria passou
 *  despercebido. */

export function formatShortDate(date: Date) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
  }).format(date);
}

export const isScheduledLead = (lead: Lead) =>
  lead.confirmation_status === "scheduled" ||
  lead.crm_stage === "agendado" ||
  Boolean(lead.active_appointment?.scheduled_at);

export const isConfirmedLead = (lead: Lead) =>
  lead.confirmation_status === "confirmed";

export const isCancelledLead = (lead: Lead) =>
  lead.confirmation_status === "cancelled" || lead.crm_stage === "perdido";

export const isCheckedInLead = (lead: Lead) =>
  lead.confirmation_status === "checked_in";

export function countCampaignMetrics(leads: Lead[]) {
  return {
    totalLeads: leads.length,
    scheduledLeads: leads.filter(isScheduledLead).length,
    confirmedLeads: leads.filter(isConfirmedLead).length,
    cancelledLeads: leads.filter(isCancelledLead).length,
    checkedInLeads: leads.filter(isCheckedInLead).length,
  };
}

/** Chave de dia no fuso do navegador — mesma base do rotulo do eixo. Agrupar em
 *  UTC jogaria o lead criado depois das 21h (BRT) para o dia seguinte. */
export function localDayKey(date: Date) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

export function buildCampaignChartData(
  eventId: string,
  allLeads: Lead[],
  eventDateIso?: string,
  periodDays: 7 | 15 | 30 = 7,
): CampaignChartPoint[] {
  const relevantLeads = allLeads.filter((lead) => lead.event_id === eventId);

  // A janela termina hoje. Se o evento ja aconteceu, termina na data dele:
  // depois disso nao entra lead novo e o grafico seria uma fila de zeros.
  const today = new Date();
  const eventDate = eventDateIso ? new Date(eventDateIso) : null;
  const endDate =
    eventDate &&
    !Number.isNaN(eventDate.getTime()) &&
    eventDate.getTime() < today.getTime()
      ? eventDate
      : today;

  // Leads do dia, nao acumulado ate o dia: o acumulado repetia o total da
  // campanha em todas as barras sempre que nada novo entrava no periodo.
  const leadsByDay = new Map<string, Lead[]>();
  for (const lead of relevantLeads) {
    const createdAt = new Date(lead.created_at);
    if (Number.isNaN(createdAt.getTime())) continue;
    const key = localDayKey(createdAt);
    const bucket = leadsByDay.get(key);
    if (bucket) bucket.push(lead);
    else leadsByDay.set(key, [lead]);
  }

  return Array.from({ length: periodDays }, (_, index) => {
    const currentDate = new Date(
      endDate.getFullYear(),
      endDate.getMonth(),
      endDate.getDate() - (periodDays - 1) + index,
    );

    return {
      day: formatShortDate(currentDate),
      ...countCampaignMetrics(leadsByDay.get(localDayKey(currentDate)) ?? []),
    };
  });
}
