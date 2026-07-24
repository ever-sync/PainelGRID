import { useEffect, useRef, useState, type ReactNode } from "react";
import clsx from "clsx";
import {
  Bell,
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Moon,
  Sparkles,
  Sun,
  Users,
  CheckCircle2,
} from "lucide-react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card } from "../../components/ui/Card";
import { readStoredSession } from "../../services/auth";
import { listClients, mapApiClientToClient } from "../../services/clients";
import {
  listEvents,
  mapApiEventToEvent,
  getActiveEventsSummary,
  type ActiveEventSummary,
} from "../../services/events";
import { listLeads, mapApiLeadToLead } from "../../services/leads";
import { useGestorClient } from "../../hooks/useGestorClient";
import {
  applyDashboardDarkEnabled,
  DASHBOARD_DARK_CHANGE_EVENT,
  readDashboardDarkEnabled,
} from "../../lib/dashboard-dark-mode";
import type { Client, Event, Lead } from "../../types";

type CalendarEvent = {
  day: number;
  dateKey: string;
  label: string;
  tone: "red" | "blue" | "yellow";
};

type CampaignChartPoint = {
  day: string;
  totalLeads: number;
  confirmedLeads: number;
  noResponseLeads: number;
  lostLeads: number;
  scheduledUnconfirmed: number;
};

type CampaignMetricKey =
  | "totalLeads"
  | "confirmedLeads"
  | "noResponseLeads"
  | "lostLeads"
  | "scheduledUnconfirmed";

const campaignMetrics: Array<{
  key: CampaignMetricKey;
  label: string;
  stroke: string;
  areaFrom: string;
  areaTo: string;
  chipStyle: string;
}> = [
  {
    key: "totalLeads",
    label: "Total de contatos",
    stroke: "#E11D48",
    areaFrom: "rgba(225, 29, 72, 0.30)",
    areaTo: "rgba(225, 29, 72, 0.03)",
    chipStyle: "bg-rose-50 text-rose-700",
  },
  {
    key: "confirmedLeads",
    label: "Confirmados",
    stroke: "#2563EB",
    areaFrom: "rgba(37, 99, 235, 0.26)",
    areaTo: "rgba(37, 99, 235, 0.03)",
    chipStyle: "bg-blue-50 text-blue-700",
  },
  {
    key: "noResponseLeads",
    label: "Sem resposta",
    stroke: "#D97706",
    areaFrom: "rgba(217, 119, 6, 0.24)",
    areaTo: "rgba(217, 119, 6, 0.03)",
    chipStyle: "bg-amber-50 text-amber-700",
  },
  {
    key: "lostLeads",
    label: "Perdidos",
    stroke: "#71717A",
    areaFrom: "rgba(113, 113, 122, 0.22)",
    areaTo: "rgba(113, 113, 122, 0.02)",
    chipStyle: "bg-zinc-100 text-zinc-700",
  },
  {
    key: "scheduledUnconfirmed",
    label: "Agendados sem confirmacao",
    stroke: "#7C3AED",
    areaFrom: "rgba(124, 58, 237, 0.24)",
    areaTo: "rgba(124, 58, 237, 0.03)",
    chipStyle: "bg-violet-50 text-violet-700",
  },
];

function formatDate(date: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(date));
}

function formatShortDate(date: Date) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
  }).format(date);
}

function formatMonthYear(date: Date) {
  return new Intl.DateTimeFormat("pt-BR", {
    month: "long",
    year: "numeric",
  }).format(date);
}

function toDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseDateKey(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year, (month || 1) - 1, day || 1);
}

function isDateOnOrBefore(date: string, boundary: Date) {
  return new Date(date).getTime() <= boundary.getTime();
}

function CampaignChartTooltip({
  active,
  payload,
  label,
  dark,
}: {
  active?: boolean;
  payload?: Array<{
    dataKey?: string;
    value?: number | string;
  }>;
  label?: string;
  dark?: boolean;
}) {
  if (!active || !payload?.length) return null;

  const rowsByMetric = new Map<
    CampaignMetricKey,
    { key: CampaignMetricKey; label: string; color: string; value: number }
  >();

  payload.forEach((entry) => {
    const key = entry.dataKey as CampaignMetricKey | undefined;
    if (!key) return;
    const metric = campaignMetrics.find((item) => item.key === key);
    if (!metric || rowsByMetric.has(key)) return;
    rowsByMetric.set(key, {
      key,
      label: metric.label,
      color: metric.stroke,
      value: Number(entry.value ?? 0),
    });
  });

  const rows = Array.from(rowsByMetric.values()).sort(
    (a, b) => b.value - a.value,
  );

  return (
    <div
      className={clsx(
        "min-w-[180px] rounded-2xl p-3 shadow-xl backdrop-blur",
        dark
          ? "border border-zinc-700 bg-zinc-900/95"
          : "border border-zinc-200 bg-white/95",
      )}
    >
      <p
        className={clsx(
          "text-[11px] font-semibold uppercase tracking-[0.18em]",
          dark ? "text-zinc-400" : "text-zinc-400",
        )}
      >
        {label}
      </p>
      <div className="mt-2 space-y-1.5">
        {rows.map((row) => (
          <div
            key={row.key}
            className="flex items-center justify-between gap-3"
          >
            <span
              className={clsx(
                "flex items-center gap-2 text-xs",
                dark ? "text-zinc-300" : "text-zinc-600",
              )}
            >
              <span
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: row.color }}
              />
              {row.label}
            </span>
            <span
              className={clsx(
                "text-xs font-semibold",
                dark ? "text-zinc-100" : "text-zinc-900",
              )}
            >
              {row.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function buildCampaignChartData(
  eventId: string,
  allLeads: Lead[],
  eventDateIso?: string,
): CampaignChartPoint[] {
  const relevantLeads = allLeads.filter((lead) => lead.event_id === eventId);
  const endDate = eventDateIso ? new Date(eventDateIso) : new Date();
  const startDate = new Date(
    Date.UTC(
      endDate.getUTCFullYear(),
      endDate.getUTCMonth(),
      endDate.getUTCDate() - 6,
    ),
  );

  return Array.from({ length: 7 }, (_, index) => {
    const currentDate = new Date(
      Date.UTC(
        startDate.getUTCFullYear(),
        startDate.getUTCMonth(),
        startDate.getUTCDate() + index,
      ),
    );
    const dayBoundary = new Date(currentDate);
    dayBoundary.setUTCHours(23, 59, 59, 999);

    const leadsUntilDay = relevantLeads.filter((lead) =>
      isDateOnOrBefore(lead.created_at, dayBoundary),
    );

    return {
      day: formatShortDate(currentDate),
      totalLeads: leadsUntilDay.length,
      confirmedLeads: leadsUntilDay.filter(
        (lead) =>
          lead.confirmation_status === "confirmed" ||
          lead.confirmation_status === "checked_in",
      ).length,
      noResponseLeads: leadsUntilDay.filter(
        (lead) =>
          lead.confirmation_status === "pending" &&
          (lead.crm_stage === "novo" || lead.crm_stage === "contactado"),
      ).length,
      lostLeads: leadsUntilDay.filter(
        (lead) =>
          lead.confirmation_status === "cancelled" ||
          lead.crm_stage === "perdido",
      ).length,
      scheduledUnconfirmed: leadsUntilDay.filter(
        (lead) => lead.confirmation_status === "scheduled",
      ).length,
    };
  });
}

function buildCalendarGrid(year: number, month: number) {
  const firstDay = new Date(year, month, 1).getDay();
  const cells: Array<number | null> = [];

  for (let i = 0; i < firstDay; i += 1) {
    cells.push(null);
  }

  for (let day = 1; day <= new Date(year, month + 1, 0).getDate(); day += 1) {
    cells.push(day);
  }

  while (cells.length % 7 !== 0) {
    cells.push(null);
  }

  const rows: Array<Array<number | null>> = [];
  for (let i = 0; i < cells.length; i += 7) {
    rows.push(cells.slice(i, i + 7));
  }

  return rows;
}

function getCalendarEvents(
  apiEvents: Event[],
  monthZeroBased: number,
  year: number,
): CalendarEvent[] {
  return apiEvents
    .filter((event) => {
      const eventDate = new Date(event.event_date);
      return (
        eventDate.getMonth() === monthZeroBased &&
        eventDate.getFullYear() === year
      );
    })
    .map((event) => ({
      day: new Date(event.event_date).getDate(),
      dateKey: toDateKey(new Date(event.event_date)),
      label: event.name,
      tone:
        event.status === "active"
          ? ("red" as const)
          : event.status === "draft"
            ? ("yellow" as const)
            : ("blue" as const),
    }));
}

function getEasterDate(year: number) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

function buildBrazilHolidayMap(year: number) {
  const holidays = new Map<string, string>();
  const add = (month: number, day: number, name: string) => {
    holidays.set(toDateKey(new Date(year, month - 1, day)), name);
  };

  add(1, 1, "Confraternização Universal");
  add(4, 21, "Tiradentes");
  add(5, 1, "Dia do Trabalho");
  add(9, 7, "Independência do Brasil");
  add(10, 12, "Nossa Senhora Aparecida");
  add(11, 2, "Finados");
  add(11, 15, "Proclamação da República");
  add(12, 25, "Natal");

  const easter = getEasterDate(year);
  const carnival = new Date(easter);
  carnival.setDate(easter.getDate() - 47);
  const goodFriday = new Date(easter);
  goodFriday.setDate(easter.getDate() - 2);
  const corpusChristi = new Date(easter);
  corpusChristi.setDate(easter.getDate() + 60);

  holidays.set(toDateKey(carnival), "Carnaval");
  holidays.set(toDateKey(goodFriday), "Sexta-feira Santa");
  holidays.set(toDateKey(easter), "Páscoa");
  holidays.set(toDateKey(corpusChristi), "Corpus Christi");

  return holidays;
}

function MetricCard({
  title,
  value,
  subtitle,
  icon,
  accent,
  highlight = false,
}: {
  title: string;
  value: string;
  subtitle: string;
  icon: ReactNode;
  accent: string;
  /** Card de destaque (fundo solido na cor de marca), igual ao "hero" da referencia. */
  highlight?: boolean;
}) {
  if (highlight) {
    return (
      <Card className="rounded-3xl bg-[#FF0636] text-white shadow-[0_16px_40px_rgba(255,6,54,0.25)]">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-white/80">{title}</p>
            <p className="mt-2 text-3xl font-extrabold tracking-tight">
              {value}
            </p>
            <p className="mt-1 text-xs font-medium text-white/70">{subtitle}</p>
          </div>
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/15 text-white">
            {icon}
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card className="rounded-3xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-zinc-500">{title}</p>
          <p className="mt-2 text-3xl font-extrabold tracking-tight text-zinc-950">
            {value}
          </p>
          <p className="mt-1 text-xs font-medium text-zinc-500">{subtitle}</p>
        </div>
        <div
          className={`flex h-11 w-11 items-center justify-center rounded-2xl ${accent}`}
        >
          {icon}
        </div>
      </div>
    </Card>
  );
}

function ActiveEventFunnelCard({ event }: { event: ActiveEventSummary }) {
  const stages = [
    { label: "Leads", value: event.funnel.leads },
    { label: "Agend.", value: event.funnel.scheduled },
    { label: "Confirm.", value: event.funnel.confirmed },
    { label: "Check-in", value: event.funnel.checked_in },
    { label: "Vend.", value: event.funnel.sold },
  ];
  const maxValue = Math.max(event.funnel.leads, 1);

  return (
    <Card className="w-[420px] shrink-0 rounded-3xl">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-zinc-950">
            {event.name}
          </p>
          <p className="text-xs text-zinc-500">
            {new Intl.DateTimeFormat("pt-BR", {
              day: "2-digit",
              month: "short",
            }).format(new Date(event.event_date))}
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-green-100 px-2.5 py-1 text-[11px] font-semibold text-green-700">
          Ativo
        </span>
      </div>

      <div className="mt-5 grid grid-cols-5 gap-1">
        {stages.map((stage) => (
          <div key={stage.label} className="min-w-0 text-center">
            <p className="text-lg font-black leading-tight tracking-tight text-zinc-950">
              {stage.value}
            </p>
            <p className="mt-1 truncate text-[10px] font-medium leading-tight text-zinc-400">
              {stage.label}
            </p>
          </div>
        ))}
      </div>

      <div className="mt-4">
        <div className="mb-1 flex items-center justify-between text-xs text-zinc-500">
          <span>Conversão (vendidos / leads)</span>
          <span>{Math.round((event.funnel.sold / maxValue) * 100)}%</span>
        </div>
        <div className="h-1.5 rounded-full bg-zinc-100">
          <div
            className="h-1.5 rounded-full bg-[#FF0636]"
            style={{
              width: `${Math.round((event.funnel.sold / maxValue) * 100)}%`,
            }}
          />
        </div>
      </div>
    </Card>
  );
}

function SectionTitle({
  title,
  action,
}: {
  title: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <h3 className="text-base font-semibold tracking-tight text-zinc-950">
        {title}
      </h3>
      {action}
    </div>
  );
}

export function DashboardGestorPage() {
  const { user } = useGestorClient();
  const today = new Date();
  const todayKey = toDateKey(today);
  const firstName = user.name.split(" ")[0] || "Gestor";

  const [clients, setClients] = useState<Client[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [activeEventsSummary, setActiveEventsSummary] = useState<
    ActiveEventSummary[]
  >([]);
  const [calendarCursor, setCalendarCursor] = useState(
    new Date(today.getFullYear(), today.getMonth(), 1),
  );
  const [selectedDateKey, setSelectedDateKey] = useState(todayKey);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(() =>
    readDashboardDarkEnabled(user.id),
  );
  const [loadError, setLoadError] = useState(false);
  const notificationsRef = useRef<HTMLDivElement | null>(null);
  const calendarRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const t = readStoredSession()?.accessToken;
    if (!t) return;

    setLoadError(false);

    void Promise.all([
      listClients(t)
        .then((rows) => setClients(rows.map(mapApiClientToClient)))
        .catch(() => {
          setClients([]);
          setLoadError(true);
        }),
      listLeads({ take: 300 }, t)
        .then((rows) => setLeads(rows.map(mapApiLeadToLead)))
        .catch(() => {
          setLeads([]);
          setLoadError(true);
        }),
      listEvents({}, t)
        .then((rows) => setEvents(rows.map(mapApiEventToEvent)))
        .catch(() => {
          setEvents([]);
          setLoadError(true);
        }),
      getActiveEventsSummary(t)
        .then(setActiveEventsSummary)
        .catch(() => {
          setActiveEventsSummary([]);
          setLoadError(true);
        }),
    ]);
  }, []);

  useEffect(() => {
    setIsDarkMode(readDashboardDarkEnabled(user.id));
  }, [user.id]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const sync = () => setIsDarkMode(readDashboardDarkEnabled(user.id));
    window.addEventListener("storage", sync);
    window.addEventListener("focus", sync);
    window.addEventListener(DASHBOARD_DARK_CHANGE_EVENT, sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener("focus", sync);
      window.removeEventListener(DASHBOARD_DARK_CHANGE_EVENT, sync);
    };
  }, [user.id]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (!notificationsRef.current) return;
      if (!notificationsRef.current.contains(event.target as Node)) {
        setNotificationsOpen(false);
      }
    }

    if (notificationsOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [notificationsOpen]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (!calendarRef.current) return;
      if (!calendarRef.current.contains(event.target as Node)) {
        setCalendarOpen(false);
      }
    }

    if (calendarOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [calendarOpen]);

  const activeClients = clients.filter(
    (client) => client.status === "active",
  ).length;
  const totalLeads = leads.length;
  const activeEvents = events.filter(
    (event) => event.status === "active",
  ).length;
  const totalConfirmed = leads.filter(
    (lead) =>
      lead.confirmation_status === "confirmed" ||
      lead.confirmation_status === "checked_in",
  ).length;
  const pendingLeads = leads.filter(
    (lead) => lead.confirmation_status === "pending",
  ).length;
  const scheduledLeads = leads.filter(
    (lead) => lead.confirmation_status === "scheduled",
  ).length;
  const confirmationRate =
    totalLeads > 0 ? Math.round((totalConfirmed / totalLeads) * 100) : 0;
  const scheduledRate =
    totalLeads > 0 ? Math.round((scheduledLeads / totalLeads) * 100) : 0;
  const pendingRate =
    totalLeads > 0 ? Math.round((pendingLeads / totalLeads) * 100) : 0;
  const nowMs = Date.now();
  const weekAgoMs = nowMs - 7 * 24 * 60 * 60 * 1000;
  const startOfMonthMs = new Date(
    new Date().getFullYear(),
    new Date().getMonth(),
    1,
  ).getTime();
  const leadsThisWeek = leads.filter(
    (lead) => new Date(lead.created_at).getTime() >= weekAgoMs,
  ).length;
  const clientsThisMonth = clients.filter(
    (client) => new Date(client.created_at).getTime() >= startOfMonthMs,
  ).length;
  // Alertas reais: eventos ainda "ativos" cuja data já passou (precisam de fechamento)
  const criticalAlerts = events.filter(
    (event) =>
      event.status === "active" && new Date(event.event_date).getTime() < nowMs,
  ).length;

  const calMonth = calendarCursor.getMonth();
  const calYear = calendarCursor.getFullYear();
  const monthLabel = formatMonthYear(calendarCursor);
  const calendarRows = buildCalendarGrid(calYear, calMonth);
  const calendarEvents = getCalendarEvents(events, calMonth, calYear);
  const holidayMap = buildBrazilHolidayMap(calYear);
  const selectedDate = parseDateKey(selectedDateKey);
  const selectedDateLabel = new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "full",
  }).format(selectedDate);
  const selectedDateEvents = events.filter(
    (event) => toDateKey(new Date(event.event_date)) === selectedDateKey,
  );

  const campaignOptions = events
    .filter((event) => event.status === "active" || event.status === "draft")
    .map((event) => {
      const participantClients = clients.filter((item) =>
        event.participant_client_ids.includes(item.id),
      );

      return {
        id: event.id,
        clientName:
          participantClients.length > 0
            ? participantClients
                .map((client) => client.company_name)
                .join(" · ")
            : "Participantes nao encontrados",
        eventName: event.name,
        campaignName: event.name,
        date: formatDate(event.event_date),
      };
    });

  const [selectedCampaignId, setSelectedCampaignId] = useState("");
  const [activeMetricKey, setActiveMetricKey] =
    useState<CampaignMetricKey>("totalLeads");
  const selectedEventForChart =
    events.find((e) => e.id === selectedCampaignId) ?? events[0];
  const selectedCampaign =
    campaignOptions.find((campaign) => campaign.id === selectedCampaignId) ??
    campaignOptions[0];

  useEffect(() => {
    setSelectedCampaignId((prev) => {
      if (prev && events.some((e) => e.id === prev)) return prev;
      const first = events.find(
        (e) => e.status === "active" || e.status === "draft",
      );
      return first?.id ?? "";
    });
  }, [events]);

  const campaignChartData = buildCampaignChartData(
    selectedCampaign?.id ?? "",
    leads,
    selectedEventForChart?.event_date,
  );
  const campaignSummary = campaignChartData[campaignChartData.length - 1] ?? {
    day: "--",
    totalLeads: 0,
    confirmedLeads: 0,
    noResponseLeads: 0,
    lostLeads: 0,
    scheduledUnconfirmed: 0,
  };
  const activeMetric =
    campaignMetrics.find((metric) => metric.key === activeMetricKey) ??
    campaignMetrics[0];

  const nextEvents = events.filter(
    (event) =>
      (event.status === "active" || event.status === "draft") &&
      new Date(event.event_date).getTime() >= nowMs,
  );
  const notificationItems = [
    {
      id: "alerts",
      title: `${criticalAlerts} alertas críticos`,
      description: "Pendentes para revisão no dashboard.",
      tone: "critical" as const,
    },
    {
      id: "events",
      title: `${activeEvents} eventos ativos`,
      description: "Eventos em andamento no calendário.",
      tone: "info" as const,
    },
    {
      id: "leads",
      title: `${totalConfirmed} confirmações`,
      description: "Leads com confirmação ou check-in.",
      tone: "success" as const,
    },
  ];
  const unreadNotifications = notificationItems.length;

  const confirmationRanking = [...events]
    .map((event) => ({
      event,
      confirmed: leads.filter(
        (l) =>
          l.event_id === event.id &&
          (l.confirmation_status === "confirmed" ||
            l.confirmation_status === "checked_in"),
      ).length,
    }))
    .sort((a, b) => b.confirmed - a.confirmed)
    .slice(0, 3)
    .map((row, index) => {
      const participantClients = clients.filter((item) =>
        row.event.participant_client_ids.includes(item.id),
      );
      const palette = ["bg-[#FF0636]", "bg-[#3D56A2]", "bg-[#FBBB49]"];

      return {
        position: index + 1,
        eventName: row.event.name,
        clientName:
          participantClients.length > 0
            ? participantClients
                .map((client) => client.company_name)
                .join(" · ")
            : "Participantes nao encontrados",
        confirmed: row.confirmed,
        date: formatDate(row.event.event_date),
        color: palette[index] || palette[0],
      };
    });

  return (
    <div className={clsx("space-y-6", isDarkMode && "dashboard-dark bg-black")}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-950 md:text-3xl">
            Bem-vindo, {firstName}
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            Acompanhe o desempenho da sua operação em tempo real.
          </p>
        </div>

        <div
          ref={notificationsRef}
          className="relative flex items-center gap-2"
        >
          <div ref={calendarRef} className="relative">
            <button
              type="button"
              onClick={() => setCalendarOpen((current) => !current)}
              className={clsx(
                "relative inline-flex h-10 w-10 items-center justify-center rounded-full border transition-colors",
                isDarkMode
                  ? "border-zinc-700 bg-zinc-900 text-zinc-100 hover:bg-zinc-800"
                  : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50",
              )}
              aria-label="Calendário de eventos"
            >
              <CalendarDays size={17} />
            </button>

            {calendarOpen ? (
              <div
                className={clsx(
                  "absolute right-0 top-12 z-20 w-[320px] rounded-3xl border p-4 shadow-2xl",
                  isDarkMode
                    ? "border-zinc-700 bg-zinc-900"
                    : "border-zinc-200 bg-white",
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p
                      className={clsx(
                        "text-sm font-semibold",
                        isDarkMode ? "text-zinc-100" : "text-zinc-950",
                      )}
                    >
                      Calendário de eventos
                    </p>
                    <p
                      className={clsx(
                        "text-xs",
                        isDarkMode ? "text-zinc-400" : "text-zinc-500",
                      )}
                    >
                      {monthLabel}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        setCalendarCursor(
                          (current) =>
                            new Date(
                              current.getFullYear(),
                              current.getMonth() - 1,
                              1,
                            ),
                        )
                      }
                      className="flex h-8 w-8 items-center justify-center rounded-full border border-zinc-200 text-zinc-500 transition-colors hover:text-zinc-900"
                      aria-label="Mes anterior"
                    >
                      <ChevronLeft size={15} />
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setCalendarCursor(
                          (current) =>
                            new Date(
                              current.getFullYear(),
                              current.getMonth() + 1,
                              1,
                            ),
                        )
                      }
                      className="flex h-8 w-8 items-center justify-center rounded-full border border-zinc-200 text-zinc-500 transition-colors hover:text-zinc-900"
                      aria-label="Proximo mes"
                    >
                      <ChevronRight size={15} />
                    </button>
                  </div>
                </div>

                <div className="mt-4 flex items-center gap-2">
                  <input
                    type="date"
                    value={selectedDateKey}
                    onChange={(event) => {
                      const value = event.target.value;
                      setSelectedDateKey(value);
                      const date = parseDateKey(value);
                      setCalendarCursor(
                        new Date(date.getFullYear(), date.getMonth(), 1),
                      );
                    }}
                    className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-medium text-zinc-700 outline-none focus:border-zinc-400"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedDateKey(todayKey);
                      setCalendarCursor(
                        new Date(today.getFullYear(), today.getMonth(), 1),
                      );
                    }}
                    className="rounded-xl border border-zinc-200 px-3 py-2 text-xs font-semibold text-zinc-600 transition-colors hover:text-zinc-950"
                  >
                    Hoje
                  </button>
                </div>

                <div className="mt-4 grid grid-cols-7 gap-1 text-center text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-400">
                  {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map(
                    (day) => (
                      <div key={day} className="py-1">
                        {day}
                      </div>
                    ),
                  )}
                </div>

                <div className="mt-2 space-y-1">
                  {calendarRows.map((week, weekIndex) => (
                    <div key={weekIndex} className="grid grid-cols-7 gap-1">
                      {week.map((day, dayIndex) => {
                        if (!day) {
                          return (
                            <div
                              key={`${weekIndex}-${dayIndex}`}
                              className="flex h-9 items-center justify-center rounded-full text-transparent"
                            >
                              .
                            </div>
                          );
                        }

                        const cellDate = new Date(calYear, calMonth, day);
                        const dateKey = toDateKey(cellDate);
                        const event = calendarEvents.find(
                          (item) => item.dateKey === dateKey,
                        );
                        const holidayName = holidayMap.get(dateKey);
                        const isToday = dateKey === todayKey;
                        const isSelected = dateKey === selectedDateKey;
                        const isFuture = cellDate.getTime() > today.getTime();

                        return (
                          <button
                            type="button"
                            onClick={() => setSelectedDateKey(dateKey)}
                            key={`${weekIndex}-${dayIndex}`}
                            className={clsx(
                              "relative flex h-9 items-center justify-center rounded-full text-sm font-semibold transition-colors",
                              "text-zinc-700 hover:bg-zinc-100",
                              isFuture && "text-zinc-950",
                              isToday && "ring-1 ring-zinc-300",
                              isSelected &&
                                "bg-zinc-950 text-white hover:bg-zinc-900",
                              !isSelected &&
                                event?.tone === "red" &&
                                "bg-[#FF0636]/10 text-[#b0002b]",
                              !isSelected &&
                                event?.tone === "yellow" &&
                                "bg-[#FBBB49]/20 text-[#8a5a00]",
                              !isSelected &&
                                event?.tone === "blue" &&
                                "bg-[#3D56A2]/10 text-[#2f468c]",
                            )}
                            title={holidayName ?? event?.label}
                          >
                            {day}
                            {!isSelected && (event || holidayName) ? (
                              <span
                                className={clsx(
                                  "absolute bottom-1 h-1.5 w-1.5 rounded-full",
                                  holidayName ? "bg-emerald-500" : "bg-current",
                                )}
                              />
                            ) : null}
                          </button>
                        );
                      })}
                    </div>
                  ))}
                </div>

                <div className="mt-4 rounded-2xl border border-zinc-100 bg-zinc-50 p-3">
                  <p className="text-xs font-semibold text-zinc-700">
                    {selectedDateLabel}
                  </p>
                  {holidayMap.get(selectedDateKey) ? (
                    <p className="mt-1 text-xs font-medium text-emerald-700">
                      Feriado: {holidayMap.get(selectedDateKey)}
                    </p>
                  ) : null}
                  {selectedDateEvents.length > 0 ? (
                    <p className="mt-1 text-xs text-zinc-600">
                      {selectedDateEvents.length} evento(s):{" "}
                      {selectedDateEvents
                        .slice(0, 2)
                        .map((event) => event.name)
                        .join(" • ")}
                      {selectedDateEvents.length > 2 ? "..." : ""}
                    </p>
                  ) : (
                    <p className="mt-1 text-xs text-zinc-500">
                      Nenhum evento neste dia.
                    </p>
                  )}
                  <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-zinc-500">
                    <span className="flex items-center gap-1">
                      <span className="h-2 w-2 rounded-full bg-emerald-500" />
                      Feriado
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="h-2 w-2 rounded-full bg-[#FF0636]" />
                      Evento ativo
                    </span>
                  </div>
                </div>
              </div>
            ) : null}
          </div>

          <button
            type="button"
            onClick={() => setNotificationsOpen((current) => !current)}
            className={clsx(
              "relative inline-flex h-10 w-10 items-center justify-center rounded-full border transition-colors",
              isDarkMode
                ? "border-zinc-700 bg-zinc-900 text-zinc-100 hover:bg-zinc-800"
                : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50",
            )}
            aria-label="Notificações"
          >
            <Bell size={17} />
            {unreadNotifications > 0 ? (
              <span className="absolute -right-1 -top-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[#FF0636] px-1 text-[10px] font-bold text-white">
                {unreadNotifications}
              </span>
            ) : null}
          </button>

          {notificationsOpen ? (
            <div
              className={clsx(
                "absolute right-0 top-12 z-20 w-[280px] rounded-2xl border p-3 shadow-2xl",
                isDarkMode
                  ? "border-zinc-700 bg-zinc-900"
                  : "border-zinc-200 bg-white",
              )}
            >
              <p
                className={clsx(
                  "text-[11px] font-semibold uppercase tracking-[0.16em]",
                  isDarkMode ? "text-zinc-400" : "text-zinc-400",
                )}
              >
                Notificações
              </p>
              <div className="mt-2 space-y-2">
                {notificationItems.map((item) => (
                  <div
                    key={item.id}
                    className={clsx(
                      "rounded-xl border p-2.5",
                      isDarkMode
                        ? "border-zinc-700 bg-zinc-800/40"
                        : "border-zinc-100 bg-zinc-50",
                    )}
                  >
                    <div className="flex items-start gap-2">
                      <span
                        className={clsx(
                          "mt-1 h-2 w-2 rounded-full",
                          item.tone === "critical" && "bg-[#FF0636]",
                          item.tone === "info" && "bg-[#3D56A2]",
                          item.tone === "success" && "bg-[#16a34a]",
                        )}
                      />
                      <div className="min-w-0">
                        <p
                          className={clsx(
                            "text-xs font-semibold",
                            isDarkMode ? "text-zinc-100" : "text-zinc-900",
                          )}
                        >
                          {item.title}
                        </p>
                        <p
                          className={clsx(
                            "text-xs",
                            isDarkMode ? "text-zinc-400" : "text-zinc-500",
                          )}
                        >
                          {item.description}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <button
            type="button"
            onClick={() => {
              const next = !isDarkMode;
              applyDashboardDarkEnabled(user.id, next);
              setIsDarkMode(next);
            }}
            className={clsx(
              "inline-flex h-10 items-center gap-2 rounded-full border px-3 text-xs font-semibold transition-colors",
              isDarkMode
                ? "border-zinc-700 bg-zinc-900 text-zinc-100 hover:bg-zinc-800"
                : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50",
            )}
            aria-label="Alternar modo escuro"
          >
            {isDarkMode ? <Sun size={16} /> : <Moon size={16} />}
            {isDarkMode ? "Claro" : "Escuro"}
          </button>
        </div>
      </div>

      {loadError ? (
        <div
          className={clsx(
            "rounded-2xl border px-4 py-3 text-sm font-medium",
            isDarkMode
              ? "border-red-900 bg-red-950/40 text-red-300"
              : "border-red-200 bg-red-50 text-red-700",
          )}
        >
          Alguns dados do painel não puderam ser carregados. Atualize a página
          ou tente novamente em instantes.
        </div>
      ) : null}

      <div className="space-y-6">
        {/* 1. Top Row: 4 Metric Cards (Full Width) */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard
            title="Clientes ativos"
            value={String(activeClients)}
            subtitle={
              clientsThisMonth > 0
                ? `+${clientsThisMonth} este mês`
                : "Sem novos este mês"
            }
            icon={<Users size={18} className="text-[#FF0636]" />}
            accent="bg-[#FF0636]/10"
          />
          <MetricCard
            title="Contatos captados"
            value={String(totalLeads)}
            subtitle={
              leadsThisWeek > 0
                ? `+${leadsThisWeek} na semana`
                : "Sem novos na semana"
            }
            icon={<Sparkles size={18} />}
            accent="bg-white/15"
            highlight
          />
          <MetricCard
            title="Eventos ativos"
            value={String(activeEvents)}
            subtitle={`${nextEvents.length} proximos agendados`}
            icon={<CalendarDays size={18} className="text-[#FBBB49]" />}
            accent="bg-[#FBBB49]/20"
          />
          <MetricCard
            title="Alertas criticos"
            value={String(criticalAlerts)}
            subtitle="Eventos ativos vencidos"
            icon={<CheckCircle2 size={18} className="text-[#FF0636]" />}
            accent="bg-[#FF0636]/10"
          />
        </div>

        {/* 2. Active Events Row */}
        {activeEventsSummary.length > 0 && (
          <div className="space-y-3">
            <SectionTitle title="Eventos ativos" />
            <div className="-mx-1 flex gap-4 overflow-x-auto px-1 pb-2">
              {activeEventsSummary.map((event) => (
                <ActiveEventFunnelCard key={event.id} event={event} />
              ))}
            </div>
          </div>
        )}

        {/* 3. Balanced 2-Column Grid: Ranking & Engagement / Progress */}
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Ranking de Confirmações */}
          <Card className="flex flex-col justify-between overflow-hidden rounded-3xl" padding="lg">
            <div>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-zinc-950">
                    Ranking de confirmações de eventos
                  </p>
                  <p className="mt-1 text-xs text-zinc-500">
                    {confirmationRanking.length}{" "}
                    {confirmationRanking.length === 1 ? "evento" : "eventos"}{" "}
                    com mais presença confirmada
                  </p>
                </div>
                <span className="rounded-full bg-[#FF0636]/10 px-2.5 py-1 text-[11px] font-semibold text-[#FF0636]">
                  {confirmationRanking.reduce(
                    (sum, event) => sum + event.confirmed,
                    0,
                  )}{" "}
                  confirmações
                </span>
              </div>

              <div className="mt-5 space-y-3">
                {confirmationRanking.map((event) => (
                  <div
                    key={`${event.eventName}-${event.position}`}
                    className="flex items-center gap-3 rounded-2xl border border-zinc-100 p-3"
                  >
                    <div
                      className={`flex h-12 w-12 items-center justify-center rounded-2xl ${event.color} text-white`}
                    >
                      <span className="text-sm font-black">
                        {event.position}
                      </span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-zinc-950">
                        {event.eventName}
                      </p>
                      <p className="line-clamp-2 text-xs text-zinc-500">
                        Cliente: {event.clientName} - Data: {event.date}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-black text-zinc-950">
                        {event.confirmed}
                      </p>
                      <p className="text-[10px] uppercase tracking-[0.18em] text-zinc-400">
                        Confirmados
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </Card>

          {/* Progresso & Termômetro de Engajamento */}
          <Card className="flex flex-col justify-between overflow-hidden rounded-3xl" padding="lg">
            <SectionTitle title="Progresso & Engajamento" />
            <div className="mt-5 grid items-center gap-6 sm:grid-cols-2">
              <div
                className="mx-auto flex h-36 w-36 shrink-0 items-center justify-center rounded-full"
                style={{
                  background: `conic-gradient(#FF0636 0 ${confirmationRate}%, ${
                    isDarkMode ? "#27272a" : "#e5e7eb"
                  } ${confirmationRate}% 100%)`,
                }}
              >
                <div
                  className={clsx(
                    "flex h-24 w-24 items-center justify-center rounded-full shadow-inner",
                    isDarkMode ? "bg-zinc-900" : "bg-white",
                  )}
                >
                  <div className="text-center">
                    <p
                      className={clsx(
                        "text-3xl font-black",
                        isDarkMode ? "text-zinc-100" : "text-zinc-950",
                      )}
                    >
                      {confirmationRate}%
                    </p>
                    <p
                      className={clsx(
                        "text-[10px] font-semibold uppercase tracking-[0.18em]",
                        isDarkMode ? "text-zinc-500" : "text-zinc-400",
                      )}
                    >
                      Confirmação
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <div>
                  <p className="text-sm font-semibold text-zinc-950">
                    Funil de confirmação
                  </p>
                  <p className="text-xs text-zinc-500">
                    {totalConfirmed} de {totalLeads} contatos confirmados
                  </p>
                </div>
                <div className="space-y-2.5">
                  <div>
                    <div className="mb-1 flex items-center justify-between text-xs text-zinc-500">
                      <span>Confirmados</span>
                      <span>{totalConfirmed}</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-zinc-100">
                      <div
                        className="h-1.5 rounded-full bg-[#FF0636]"
                        style={{ width: `${confirmationRate}%` }}
                      />
                    </div>
                  </div>
                  <div>
                    <div className="mb-1 flex items-center justify-between text-xs text-zinc-500">
                      <span>Agendados</span>
                      <span>{scheduledLeads}</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-zinc-100">
                      <div
                        className="h-1.5 rounded-full bg-[#3D56A2]"
                        style={{ width: `${scheduledRate}%` }}
                      />
                    </div>
                  </div>
                  <div>
                    <div className="mb-1 flex items-center justify-between text-xs text-zinc-500">
                      <span>Pendentes</span>
                      <span>{pendingLeads}</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-zinc-100">
                      <div
                        className="h-1.5 rounded-full bg-[#FBBB49]"
                        style={{ width: `${pendingRate}%` }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </Card>
        </div>

        {/* 4. Full Width Campaign Chart */}
        <Card className="rounded-3xl" padding="lg">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-3">
                <SectionTitle
                  title="Contatos por campanha - ultimos 7 dias"
                  action={
                    <span className="rounded-full bg-[#FF0636]/10 px-3 py-1 text-xs font-semibold text-[#FF0636]">
                      Meta selecionada
                    </span>
                  }
                />
              </div>
              <p className="text-xs text-zinc-500">
                {selectedCampaign?.campaignName} -{" "}
                {selectedCampaign?.clientName}
              </p>
            </div>

            <label className="w-full max-w-md">
              <span className="mb-2 block text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-400">
                Campanha do Facebook
              </span>
              <div className="relative">
                <select
                  value={selectedCampaignId}
                  onChange={(event) =>
                    setSelectedCampaignId(event.target.value)
                  }
                  className="w-full appearance-none rounded-2xl border border-zinc-200 bg-white px-4 py-3 pr-10 text-sm font-medium text-zinc-950 shadow-sm outline-none transition-colors focus:border-[#FF0636]"
                >
                  {campaignOptions.map((campaign) => (
                    <option key={campaign.id} value={campaign.id}>
                      {campaign.clientName} | {campaign.campaignName}
                    </option>
                  ))}
                </select>
                <ChevronDown
                  size={18}
                  className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-zinc-400"
                />
              </div>
            </label>
          </div>

          <div className="mt-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                {campaignMetrics.map((metric) => {
                  const isActive = metric.key === activeMetricKey;
                  return (
                    <button
                      key={metric.key}
                      type="button"
                      onClick={() => setActiveMetricKey(metric.key)}
                      className={clsx(
                        "rounded-full px-3 py-1 transition-all",
                        metric.chipStyle,
                        isActive
                          ? "scale-[1.02] shadow-sm ring-1 ring-current/25"
                          : "opacity-70 hover:opacity-100",
                      )}
                    >
                      {metric.label}
                    </button>
                  );
                })}
              </div>
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-semibold text-zinc-500">
                  {campaignSummary.day}
                </span>
                <span className="rounded-full bg-zinc-900 px-3 py-1 text-xs font-semibold text-white">
                  {campaignSummary[activeMetric.key]}{" "}
                  {activeMetric.label.toLowerCase()}
                </span>
              </div>
            </div>

            <div
              className={clsx(
                "overflow-hidden rounded-3xl border p-3 shadow-inner",
                isDarkMode
                  ? "border-zinc-700 bg-[#111217]"
                  : "border-zinc-100 bg-white",
              )}
            >
              <div className="h-[330px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart
                    data={campaignChartData}
                    margin={{ top: 18, right: 16, left: 8, bottom: 8 }}
                  >
                    <defs>
                      {campaignMetrics.map((metric) => (
                        <linearGradient
                          key={`area-${metric.key}`}
                          id={`area-${metric.key}`}
                          x1="0"
                          y1="0"
                          x2="0"
                          y2="1"
                        >
                          <stop offset="0%" stopColor={metric.areaFrom} />
                          <stop offset="100%" stopColor={metric.areaTo} />
                        </linearGradient>
                      ))}
                    </defs>

                    <CartesianGrid
                      vertical={false}
                      stroke="#e4e4e7"
                      strokeDasharray="4 6"
                      strokeOpacity={0.8}
                    />
                    <XAxis
                      dataKey="day"
                      axisLine={false}
                      tickLine={false}
                      tickMargin={12}
                      tick={{
                        fill: "#a1a1aa",
                        fontSize: 12,
                        fontWeight: 600,
                      }}
                    />
                    <YAxis
                      axisLine={false}
                      tickLine={false}
                      allowDecimals={false}
                      tick={{
                        fill: "#a1a1aa",
                        fontSize: 11,
                        fontWeight: 600,
                      }}
                      width={28}
                    />
                    <Tooltip
                      cursor={{ stroke: "#d4d4d8", strokeDasharray: "4 4" }}
                      content={<CampaignChartTooltip dark={isDarkMode} />}
                    />

                    {campaignMetrics.map((metric) => (
                      <Area
                        key={`area-${metric.key}`}
                        type="monotone"
                        dataKey={metric.key}
                        fill={`url(#area-${metric.key})`}
                        stroke="none"
                        fillOpacity={metric.key === activeMetricKey ? 1 : 0}
                        isAnimationActive={false}
                      />
                    ))}

                    {campaignMetrics.map((metric) => {
                      const isActive = metric.key === activeMetricKey;
                      return (
                        <Line
                          key={`line-${metric.key}`}
                          type="monotone"
                          dataKey={metric.key}
                          stroke={metric.stroke}
                          strokeWidth={isActive ? 3.2 : 2}
                          strokeOpacity={isActive ? 1 : 0.3}
                          dot={{
                            r: isActive ? 4 : 2,
                            fill: metric.stroke,
                            stroke: "#fff",
                            strokeWidth: 2,
                          }}
                          activeDot={{
                            r: 6,
                            fill: metric.stroke,
                            stroke: "#fff",
                            strokeWidth: 2,
                          }}
                          isAnimationActive={false}
                        />
                      );
                    })}
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          <div className="mt-5 grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
            {campaignMetrics.map((metric) => (
              <div
                key={`kpi-${metric.key}`}
                className={clsx(
                  "rounded-2xl border px-3 py-2",
                  isDarkMode
                    ? "border-zinc-700 bg-[#15161b]"
                    : "border-zinc-100 bg-white",
                )}
              >
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-400">
                  {metric.label}
                </p>
                <p
                  className="mt-1 text-base font-bold"
                  style={{ color: metric.stroke }}
                >
                  {campaignSummary[metric.key]}
                </p>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
