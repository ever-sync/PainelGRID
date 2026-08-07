import { httpRequest } from "./http";
import type { Event, EventStatus, LeadSource } from "../types";

export type SaleSegment = "NOVO" | "SEMINOVO" | "VENDA_DIRETA" | "PCD";

export type ApiEvent = {
  id: string;
  client_id: string;
  participant_client_ids?: string[];
  name: string;
  event_type: string | null;
  description: string | null;
  launch_date: string | null;
  event_date: string;
  event_end_date: string | null;
  location: string | null;
  capacity: number | null;
  sales_target: number | null;
  scheduled_target?: number | null;
  require_wristband?: boolean;
  allow_vendor_checkin?: boolean;
  allow_vendor_fipe?: boolean;
  total_investment?: number | null;
  paid_traffic_investment?: number | null;
  status: EventStatus;
  cover_image_url: string | null;
  image_urls: string[];
  event_days?: Array<{ start: string; end: string }> | null;
  created_at: string;
  updated_at: string;
  leads_count?: number;
  confirmed_count?: number;
  checkin_count?: number;
  _count?: { interested_leads: number };
};

export function listEvents(
  params: { client_id?: string; status?: EventStatus } = {},
  token: string,
) {
  const qs = new URLSearchParams();
  if (params.client_id) qs.set("client_id", params.client_id);
  if (params.status) qs.set("status", params.status);
  return httpRequest<ApiEvent[]>(`/events?${qs.toString()}`, {
    method: "GET",
    token,
    cache: "no-store",
  });
}

export function getEvent(eventId: string, token: string) {
  return httpRequest<ApiEvent>(`/events/${eventId}`, { method: "GET", token });
}

export type CreateEventPayload = {
  client_id?: string;
  participant_client_ids?: string[];
  name: string;
  event_type?: string;
  description?: string;
  launch_date?: string;
  event_date: string;
  event_end_date?: string;
  location?: string;
  capacity?: number;
  sales_target?: number;
  scheduled_target?: number;
  require_wristband?: boolean;
  allow_vendor_checkin?: boolean;
  allow_vendor_fipe?: boolean;
  total_investment?: number;
  paid_traffic_investment?: number;
  status?: EventStatus;
  cover_image_url?: string;
  image_urls?: string[];
  event_days?: Array<{ start: string; end: string }>;
};

export function createEvent(payload: CreateEventPayload, token: string) {
  return httpRequest<ApiEvent>("/events", {
    method: "POST",
    token,
    body: payload,
  });
}

export type UpdateEventPayload = Partial<
  Omit<
    CreateEventPayload,
    | "client_id"
    | "event_type"
    | "description"
    | "launch_date"
    | "event_end_date"
    | "location"
    | "capacity"
    | "sales_target"
    | "scheduled_target"
    | "total_investment"
    | "paid_traffic_investment"
  >
> & {
  client_id?: string;
  event_type?: string | null;
  description?: string | null;
  launch_date?: string | null;
  event_end_date?: string | null;
  location?: string | null;
  capacity?: number | null;
  sales_target?: number | null;
  scheduled_target?: number | null;
  total_investment?: number | null;
  paid_traffic_investment?: number | null;
};

export function updateEvent(
  eventId: string,
  payload: UpdateEventPayload,
  token: string,
) {
  return httpRequest<ApiEvent>(`/events/${eventId}`, {
    method: "PATCH",
    token,
    body: payload,
  });
}

export function deleteEvent(eventId: string, token: string) {
  return httpRequest<{ id: string }>(`/events/${eventId}`, {
    method: "DELETE",
    token,
  });
}

// ── Dashboard TV ─────────────────────────────────────────────────────────────

export type EventDashboardTvResponse = {
  event: {
    id: string;
    name: string;
    event_date: string;
    event_end_date: string | null;
    location: string | null;
    capacity: number | null;
    sales_target: number | null;
    scheduled_target: number | null;
    status: EventStatus;
    participant_client_ids: string[];
  };
  funnel: {
    leads: number;
    scheduled: number;
    confirmed: number;
    checked_in: number;
    no_show?: number;
    sold: number;
  };
  vendors: Array<{
    vendor_id: string;
    vendor_name: string;
    vendor_avatar_url?: string | null;
    client_id: string | null;
    team_id: string | null;
    team_name: string | null;
    leads: number;
    scheduled: number;
    confirmed: number;
    checked_in: number;
    sold: number;
    revenue?: number;
    points: number;
  }>;
  teams: Array<{
    team_id: string;
    team_name: string;
    logo_url: string | null;
    leads: number;
    scheduled: number;
    confirmed: number;
    checked_in: number;
    sold: number;
    revenue?: number;
    points: number;
  }>;
  cars: {
    by_segment: Array<{ type: SaleSegment; count: number }>;
    top_models: Array<{ model: string; count: number }>;
    total_value: string;
  };
  daily: Array<{
    date: string;
    leads: number;
    scheduled: number;
    confirmed: number;
    checked_in: number;
    sold: number;
  }>;
  checkin_by_source: Array<{ source: LeadSource; count: number }>;
  arrivals_by_hour?: Array<{ hour: number; count: number }>;
  arrival_data_quality?: {
    checked_in_leads: number;
    with_real_timestamp: number;
    missing_timestamp: number;
    coverage_percent: number;
    appointment_timestamps: number;
    timeline_timestamps: number;
  };
  activeCalls?: Array<{
    id: string;
    lead_id: string;
    lead_name: string;
    vendor_id: string;
    vendor_name: string;
    team_name: string | null;
    timestamp: string;
  }>;
  generated_at: string;
};

export function getEventDashboardTv(
  eventId: string,
  token: string,
  signal?: AbortSignal,
) {
  return httpRequest<EventDashboardTvResponse>(
    `/events/${eventId}/dashboard-tv`,
    {
      method: "GET",
      token,
      signal,
    },
  );
}

// ── Resumo de eventos ativos (card do dashboard geral) ──────────────────────

export type ActiveEventSummary = {
  id: string;
  name: string;
  event_date: string;
  location: string | null;
  funnel: {
    leads: number;
    scheduled: number;
    confirmed: number;
    checked_in: number;
    sold: number;
  };
};

export function getActiveEventsSummary(token: string, signal?: AbortSignal) {
  return httpRequest<ActiveEventSummary[]>("/events/active-summary", {
    method: "GET",
    token,
    signal,
  });
}

export function computeDynamicEventStatus(row: {
  status: EventStatus | string;
  launch_date?: Date | string | null;
  event_date: Date | string;
  event_end_date?: Date | string | null;
}): EventStatus {
  if (row.status === "cancelled") {
    return "cancelled" as EventStatus;
  }

  const now = new Date();
  const startDate = row.launch_date
    ? new Date(row.launch_date)
    : new Date(row.event_date);

  let endDate: Date;
  if (row.event_end_date) {
    endDate = new Date(row.event_end_date);
  } else {
    const eDate = new Date(row.event_date);
    eDate.setHours(23, 59, 59, 999);
    endDate = eDate;
  }

  if (now < startDate) {
    return "draft" as EventStatus;
  } else if (now > endDate) {
    return "completed" as EventStatus;
  } else {
    return "active" as EventStatus;
  }
}

export function mapApiEventToEvent(row: ApiEvent): Event {
  const leadsCount = row._count?.interested_leads ?? 0;
  const computedStatus = computeDynamicEventStatus(row);

  return {
    id: row.id,
    client_id: row.client_id,
    participant_client_ids: row.participant_client_ids ?? [],
    name: row.name,
    event_type: row.event_type ?? null,
    description: row.description ?? "",
    launch_date: row.launch_date ?? null,
    event_date: row.event_date,
    event_end_date: row.event_end_date ?? null,
    location: row.location ?? "",
    capacity: row.capacity,
    sales_target: row.sales_target ?? null,
    scheduled_target: row.scheduled_target ?? null,
    require_wristband: row.require_wristband ?? false,
    total_investment: row.total_investment ?? null,
    paid_traffic_investment: row.paid_traffic_investment ?? null,
    status: computedStatus,
    cover_image_url: row.cover_image_url,
    image_urls: row.image_urls ?? [],
    event_days: row.event_days ?? null,
    leads_count: row.leads_count ?? leadsCount,
    confirmed_count: row.confirmed_count ?? 0,
    checkin_count: row.checkin_count ?? 0,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

// ── Relatório Executivo (atribuição real, Rubinho, histórico) ───────────────

export type ExecutiveAttributionRow = {
  level: "campaign" | "adset" | "ad";
  entity_id: string;
  name: string;
  meta_campaign_id: string | null;
  meta_ad_set_id: string | null;
  leads: number;
  scheduled: number;
  checked_in: number;
  sold: number;
  revenue: number;
  spend: number;
  meta_leads: number;
  impressions: number;
  reach: number;
  conversations: number;
  cpl: number;
  cost_per_conversation: number;
  cost_per_scheduled: number;
  cost_per_sale: number;
  roas: number;
  roi_percent: number;
};

export type ExecutiveJourneyAttribution = {
  leads: number;
  appointments: number;
  checked_in: number;
  sales: number;
  revenue: number;
};

export type ExecutiveReportResponse = {
  event_id: string;
  investment: {
    total: number | null;
    paid_traffic: number | null;
  };
  ratings: {
    overall_avg: number;
    total: number;
    by_vendor: Array<{ vendor_id: string; avg_score: number; count: number }>;
  };
  event_feedback: {
    event_rating: { average: number; responses: number };
    nps: {
      score: number;
      responses: number;
      promoters: number;
      passives: number;
      detractors: number;
    };
    google: {
      requested: number;
      clicked: number;
      verified_published: number;
    };
  };
  vehicle_intelligence: {
    coverage: {
      total_leads: number;
      identified_vehicles: number;
      with_fipe_value: number;
      vehicle_percent: number;
      fipe_percent: number;
    };
    trade_in_fleet: {
      total_fipe: number;
      average_fipe: number;
      by_brand: Array<{ name: string; count: number }>;
      by_model: Array<{ name: string; count: number }>;
      by_year: Array<{ name: string; count: number }>;
      by_fipe_range: Array<{
        key: string;
        label: string;
        leads: number;
        sold: number;
        conversion_percent: number;
      }>;
    };
    conversion: {
      identified_vehicle_leads: number;
      sold_with_vehicle: number;
      conversion_percent: number;
      identified_not_sold: number;
    };
    sold_vehicles: Array<{ model: string; count: number }>;
    desired_vehicle: { available: boolean; reason: string };
  };
  attribution: Array<ExecutiveAttributionRow & { meta_campaign_id: string }>;
  attribution_by_level: {
    campaigns: ExecutiveAttributionRow[];
    ad_sets: ExecutiveAttributionRow[];
    ads: ExecutiveAttributionRow[];
  };
  attribution_period: {
    from: string;
    to: string;
    source: "event_launch_date" | "default_30_days";
    timezone: string;
    default_lookback_days: number | null;
    campaigns_started_before_window: number;
  };
  attribution_coverage: {
    attributed_leads: number;
    total_leads: number;
    attributed_sold: number;
    total_sold: number;
  };
  rubinho: {
    mensagens: number;
    conversas_iniciadas: number;
    credenciamentos: number;
    agendamentos: number;
    comparecimentos: number;
    taxa_comparecimento: number;
    vendas_originadas: number;
    receita_influenciada: number;
    acoes_ia: number;
    attribution_method?: "agent_created_appointment";
    attribution_breakdown?: {
      originated: ExecutiveJourneyAttribution;
      influenced: ExecutiveJourneyAttribution;
      recovered: ExecutiveJourneyAttribution;
      manual: ExecutiveJourneyAttribution;
      precedence: string[];
    };
  };
  commercial_revenue?: {
    total_sales: number;
    total_revenue: number;
    by_vendor: Array<{
      vendor_id: string;
      sales: number;
      revenue: number;
      average_ticket: number;
    }>;
    by_team: Array<{
      team_id: string;
      sales: number;
      revenue: number;
      average_ticket: number;
    }>;
    coverage: {
      vendor_sales: number;
      vendor_percent: number;
      team_sales: number;
      team_percent: number;
      unassigned_team_sales: number;
      unassigned_team_revenue: number;
    };
  };
  data_quality?: {
    real: string[];
    attributed: string[];
    estimated: string[];
    warnings: string[];
  };
  history: Array<{
    event_id: string;
    name: string;
    event_date: string;
    leads: number;
    scheduled: number;
    confirmed: number;
    checked_in: number;
    sold: number;
    revenue: number;
  }>;
};

export function getEventExecutiveReport(
  eventId: string,
  token: string,
  signal?: AbortSignal,
) {
  return httpRequest<ExecutiveReportResponse>(
    `/events/${eventId}/executive-report`,
    { method: "GET", token, signal },
  );
}
