import { useEffect, useRef, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import clsx from "clsx";
import {
  Activity,
  Bell,
  Bot,
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  MessageCircle,
  Moon,
  Send,
  Sparkles,
  Sun,
  Users,
  CheckCircle2,
} from "lucide-react";
import { Card } from "../../components/ui/Card";
import { readStoredSession } from "../../services/auth";
import { listClients, mapApiClientToClient } from "../../services/clients";
import {
  listEvents,
  mapApiEventToEvent,
  getActiveEventsSummary,
  type ActiveEventSummary,
} from "../../services/events";
import { fetchAllLeads, mapApiLeadToLead } from "../../services/leads";
import {
  getRubinhoThermometer,
  type RubinhoThermometer,
} from "../../services/operations";
import { useGestorClient } from "../../hooks/useGestorClient";
import {
  applyDashboardDarkEnabled,
  DASHBOARD_DARK_CHANGE_EVENT,
  readDashboardDarkEnabled,
} from "../../lib/dashboard-dark-mode";
import type { Client, Event, Lead } from "../../types";
import { DeferredCampaignPerformanceChart } from "./DeferredCampaignPerformanceChart";
import type { CampaignMetricKey } from "./CampaignPerformanceChart";
import {
  buildCampaignChartData,
  countCampaignMetrics,
} from "./dashboard/campaign-chart";

type CalendarEvent = {
  day: number;
  dateKey: string;
  label: string;
  tone: "red" | "blue" | "yellow";
};

const campaignMetrics: Array<{
  key: CampaignMetricKey;
  label: string;
  stroke: string;
  chipStyle: string;
}> = [
  {
    key: "totalLeads",
    label: "Quantidade de lead",
    stroke: "#FF0636",
    chipStyle:
      "bg-rose-50 text-rose-600 font-semibold border border-rose-200/70",
  },
  {
    key: "scheduledLeads",
    label: "Agendados",
    stroke: "#3B82F6",
    chipStyle:
      "bg-blue-50 text-blue-600 font-semibold border border-blue-200/70",
  },
  {
    key: "confirmedLeads",
    label: "Confirmados",
    stroke: "#8B5CF6",
    chipStyle:
      "bg-purple-50 text-purple-600 font-semibold border border-purple-200/70",
  },
  {
    key: "cancelledLeads",
    label: "Cancelados",
    stroke: "#EF4444",
    chipStyle: "bg-red-50 text-red-600 font-semibold border border-red-200/70",
  },
  {
    key: "checkedInLeads",
    label: "Presença confirmada",
    stroke: "#10B981",
    chipStyle:
      "bg-emerald-50 text-emerald-600 font-semibold border border-emerald-200/70",
  },
];

function formatDate(date: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(date));
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

function ActiveEventFunnelCard({
  event,
  isTopPerformer,
}: {
  event: ActiveEventSummary;
  isTopPerformer?: boolean;
}) {
  const stages = [
    { label: "Leads", value: event.funnel.leads },
    { label: "Agend.", value: event.funnel.scheduled },
    { label: "Confirm.", value: event.funnel.confirmed },
    { label: "Check-in", value: event.funnel.checked_in },
    { label: "Vend.", value: event.funnel.sold },
  ];
  const maxValue = Math.max(event.funnel.leads, 1);
  const conversionRate = Math.round((event.funnel.sold / maxValue) * 100);
  const isExpired =
    new Date(event.event_date).getTime() < new Date().setHours(0, 0, 0, 0);

  return (
    <Card className="w-[420px] shrink-0 rounded-3xl relative overflow-hidden">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="truncate text-sm font-semibold text-zinc-950">
              {event.name}
            </p>
            {isTopPerformer && conversionRate > 0 && (
              <span className="shrink-0 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700 border border-amber-200 flex items-center gap-1 shadow-sm">
                👑 Maior Conversão
              </span>
            )}
          </div>
          <p className="text-xs text-zinc-500">
            {new Intl.DateTimeFormat("pt-BR", {
              day: "2-digit",
              month: "short",
              year: "numeric",
            }).format(new Date(event.event_date))}
          </p>
        </div>

        {isExpired ? (
          <span className="shrink-0 rounded-full bg-amber-100/80 px-2.5 py-1 text-[11px] font-bold text-amber-800 border border-amber-300/60">
            ⚠️ Finalização Pendente
          </span>
        ) : (
          <span className="shrink-0 rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-bold text-emerald-700">
            Ativo
          </span>
        )}
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
          <span className="font-bold text-zinc-900">{conversionRate}%</span>
        </div>
        <div className="h-1.5 rounded-full bg-zinc-100">
          <div
            className="h-1.5 rounded-full bg-[#FF0636] transition-all duration-500"
            style={{
              width: `${conversionRate}%`,
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

function RubinhoThermometerCard({
  data,
  events,
  selectedEventId,
  onSelectEvent,
  isDarkMode,
  loading,
}: {
  data: RubinhoThermometer | null;
  events: Event[];
  selectedEventId: string;
  onSelectEvent: (eventId: string) => void;
  isDarkMode: boolean;
  loading: boolean;
}) {
  const stages =
    data?.stages.filter(
      (stage) => !["CANCELLED", "HUMAN_HANDOFF"].includes(stage.key),
    ) ?? [];
  const maxStageCount = Math.max(...stages.map((stage) => stage.count), 1);
  /** Base do "% do total": quantos leads estão distribuídos pelas etapas. */
  const stageTotal = stages.reduce((sum, stage) => sum + stage.count, 0);
  const updatedAt = data
    ? new Intl.DateTimeFormat("pt-BR", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      }).format(new Date(data.generated_at))
    : "--:--:--";
  const metrics = [
    {
      label: "Na fila do template",
      value: data?.totals.awaiting_template ?? 0,
      icon: Send,
      color: "text-amber-600",
      background: "bg-amber-50",
    },
    {
      label: "Templates enviados",
      value: data?.totals.template_sent ?? 0,
      icon: CheckCircle2,
      color: "text-blue-600",
      background: "bg-blue-50",
    },
    {
      label: "Responderam ao template",
      value: data?.totals.template_replied ?? 0,
      icon: MessageCircle,
      color: "text-violet-600",
      background: "bg-violet-50",
    },
    {
      label: "Não responderam",
      value: data?.totals.template_not_replied ?? 0,
      icon: MessageCircle,
      color: "text-rose-600",
      background: "bg-rose-50",
    },
    {
      label: "Em atendimento",
      value: data?.totals.engaged ?? 0,
      icon: Users,
      color: "text-sky-600",
      background: "bg-sky-50",
    },
    {
      label: "Agendados",
      value: data?.totals.scheduled ?? 0,
      icon: CalendarDays,
      color: "text-emerald-600",
      background: "bg-emerald-50",
    },
    {
      label: "Concluídos",
      value: data?.totals.completed ?? 0,
      icon: Bot,
      color: "text-[#FF0636]",
      background: "bg-rose-50",
    },
  ];

  return (
    <Card className="overflow-hidden rounded-3xl" padding="lg">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Activity size={18} className="text-[#FF0636]" />
            <h2 className="text-base font-semibold tracking-tight text-zinc-950">
              Termômetro do Rubinho
            </h2>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-emerald-700">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
              </span>
              Atualização 5s
            </span>
          </div>
          <p className="mt-1 text-xs text-zinc-500">
            Posição atual dos leads em cada pergunta do credenciamento. Última
            leitura às {updatedAt}.
          </p>
        </div>

        <label className="w-full shrink-0 lg:max-w-sm">
          <span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-400">
            Evento analisado
          </span>
          <div className="relative">
            <select
              value={selectedEventId}
              onChange={(event) => onSelectEvent(event.target.value)}
              className={clsx(
                "w-full appearance-none rounded-2xl border px-4 py-2.5 pr-10 text-sm font-medium outline-none transition-colors focus:border-[#FF0636]",
                isDarkMode
                  ? "border-zinc-700 bg-zinc-900 text-zinc-100"
                  : "border-zinc-200 bg-white text-zinc-950",
              )}
            >
              <option value="">Todos os eventos</option>
              {events.map((event) => (
                <option key={event.id} value={event.id}>
                  {event.name}
                </option>
              ))}
            </select>
            <ChevronDown
              size={16}
              className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-zinc-400"
            />
          </div>
        </label>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
        {metrics.map((metric) => {
          const Icon = metric.icon;
          return (
            <div
              key={metric.label}
              className={clsx(
                "rounded-2xl border p-3.5",
                isDarkMode
                  ? "border-zinc-800 bg-zinc-900/60"
                  : "border-zinc-100 bg-white",
              )}
            >
              <div className="flex items-center justify-between gap-3">
                <span
                  className={clsx(
                    "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl",
                    isDarkMode ? "bg-zinc-800" : metric.background,
                  )}
                >
                  <Icon size={16} className={metric.color} />
                </span>
                <span
                  className={clsx(
                    "text-2xl font-black tracking-tight tabular-nums",
                    isDarkMode ? "text-zinc-50" : "text-zinc-950",
                  )}
                >
                  {loading && !data ? "–" : metric.value}
                </span>
              </div>
              <p
                className={clsx(
                  "mt-3 text-xs font-semibold",
                  isDarkMode ? "text-zinc-400" : "text-zinc-600",
                )}
              >
                {metric.label}
              </p>
            </div>
          );
        })}
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_280px]">
        {/* Grade que quebra em linhas: antes a faixa tinha largura minima de
            900px e virava rolagem lateral em qualquer tela menor. */}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-8">
          {stages.map((stage, index) => {
            const share =
              stageTotal > 0 ? Math.round((stage.count / stageTotal) * 100) : 0;
            return (
              <div
                key={stage.key}
                title={`${index + 1}. ${stage.short_label} — ${stage.count} lead(s)`}
                className={clsx(
                  "flex min-h-[120px] flex-col rounded-2xl border p-3",
                  isDarkMode
                    ? "border-zinc-800 bg-zinc-900/60"
                    : "border-zinc-100 bg-zinc-50/70",
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span
                    className={clsx(
                      "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold",
                      isDarkMode
                        ? "bg-zinc-700 text-zinc-100"
                        : "bg-zinc-950 text-white",
                    )}
                  >
                    {index + 1}
                  </span>
                  <span
                    className={clsx(
                      "text-xl font-black tabular-nums",
                      isDarkMode ? "text-zinc-50" : "text-zinc-950",
                    )}
                  >
                    {stage.count}
                  </span>
                </div>
                <p
                  className={clsx(
                    "mt-2.5 text-xs font-semibold leading-snug",
                    isDarkMode ? "text-zinc-300" : "text-zinc-700",
                  )}
                >
                  {stage.short_label}
                </p>
                <div className="mt-auto pt-2.5">
                  <div className="mb-1 flex items-center justify-between">
                    {/* A barra sozinha nao dizia quanto representa do total. */}
                    <span className="text-[10px] font-semibold tabular-nums text-zinc-400">
                      {share}% do total
                    </span>
                  </div>
                  <div
                    className={clsx(
                      "h-1.5 overflow-hidden rounded-full",
                      isDarkMode ? "bg-zinc-800" : "bg-zinc-200/80",
                    )}
                  >
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-[#FF0636] to-[#ff6b87] transition-[width] duration-500"
                      style={{
                        width: `${Math.max(
                          stage.count > 0
                            ? (stage.count / maxStageCount) * 100
                            : 0,
                          stage.count > 0 ? 8 : 0,
                        )}%`,
                      }}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div
          className={clsx(
            "rounded-2xl border p-4",
            isDarkMode
              ? "border-zinc-800 bg-zinc-900/60"
              : "border-zinc-100 bg-zinc-50",
          )}
        >
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-400">
            Conversão ao vivo
          </p>
          <div className="mt-4 space-y-4">
            {[
              ["Resposta ao template", data?.rates.template_reply ?? 0],
              ["Atendimento para agendamento", data?.rates.scheduling ?? 0],
              ["Atendimento concluído", data?.rates.completion ?? 0],
            ].map(([label, value]) => {
              const numeric = Number(value);
              const overflow = numeric > 100;
              return (
                <div key={String(label)}>
                  <div className="flex items-start justify-between gap-2 text-xs">
                    <span
                      className={clsx(
                        "leading-snug",
                        isDarkMode ? "text-zinc-400" : "text-zinc-600",
                      )}
                    >
                      {label}
                    </span>
                    <span
                      className={clsx(
                        "shrink-0 font-bold tabular-nums",
                        overflow
                          ? "text-amber-600"
                          : isDarkMode
                            ? "text-zinc-50"
                            : "text-zinc-950",
                      )}
                    >
                      {numeric}%
                    </span>
                  </div>
                  <div
                    className={clsx(
                      "mt-1.5 h-1.5 overflow-hidden rounded-full",
                      isDarkMode ? "bg-zinc-800" : "bg-zinc-200/80",
                    )}
                  >
                    <div
                      className={clsx(
                        "h-full rounded-full transition-[width] duration-500",
                        overflow
                          ? "bg-gradient-to-r from-[#FF0636] to-amber-500"
                          : "bg-[#FF0636]",
                      )}
                      style={{ width: `${Math.min(numeric, 100)}%` }}
                    />
                  </div>
                  {overflow ? (
                    <p className="mt-1 text-[10px] leading-snug text-amber-600">
                      Base inconsistente. Atualize os dados operacionais.
                    </p>
                  ) : null}
                </div>
              );
            })}
          </div>
          {(data?.totals.template_failed ?? 0) > 0 ||
          (data?.totals.handoff ?? 0) > 0 ? (
            <div className="mt-4 rounded-xl bg-amber-50 px-3 py-2 text-[11px] font-medium text-amber-800">
              {data?.totals.template_failed ?? 0} falhas de template ·{" "}
              {data?.totals.handoff ?? 0} aguardando humano
            </div>
          ) : null}
        </div>
      </div>
    </Card>
  );
}

export function DashboardGestorPage() {
  const navigate = useNavigate();
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
      // A API pagina em blocos de ate 200. Total e grafico diario precisam
      // usar a colecao completa, nao apenas a primeira pagina.
      fetchAllLeads({}, t, { maxItems: 10_000 })
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
  const rubinhoLeads = leads.filter(
    (lead) => lead.source === "facebook_ads",
  ).length;
  const vendorLeads = leads.filter((lead) => lead.source === "manual").length;
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
  const rubinhoLeadsThisWeek = leads.filter(
    (lead) =>
      lead.source === "facebook_ads" &&
      new Date(lead.created_at).getTime() >= weekAgoMs,
  ).length;
  const vendorLeadsThisWeek = leads.filter(
    (lead) =>
      lead.source === "manual" &&
      new Date(lead.created_at).getTime() >= weekAgoMs,
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
  const [rubinhoThermometer, setRubinhoThermometer] =
    useState<RubinhoThermometer | null>(null);
  const [rubinhoThermometerLoading, setRubinhoThermometerLoading] =
    useState(true);
  const [activeMetricKey, setActiveMetricKey] =
    useState<CampaignMetricKey>("totalLeads");
  const [periodDays, setPeriodDays] = useState<7 | 15 | 30>(7);

  useEffect(() => {
    const token = readStoredSession()?.accessToken;
    if (!token) return;
    const controller = new AbortController();
    let requestRunning = false;

    const load = async () => {
      if (requestRunning) return;
      requestRunning = true;
      try {
        const data = await getRubinhoThermometer(
          token,
          selectedCampaignId ? { event_id: selectedCampaignId } : {},
          controller.signal,
        );
        setRubinhoThermometer(data);
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          // Mantém a última leitura válida para o painel não piscar durante
          // uma indisponibilidade curta da API.
        }
      } finally {
        requestRunning = false;
        setRubinhoThermometerLoading(false);
      }
    };

    setRubinhoThermometerLoading(true);
    void load();
    const timer = window.setInterval(() => void load(), 5_000);
    return () => {
      window.clearInterval(timer);
      controller.abort();
    };
  }, [selectedCampaignId]);

  const topPerformerEventId = activeEventsSummary.reduce<string | null>(
    (topId, current) => {
      if (!current.funnel.leads) return topId;
      const currentRate = (current.funnel.sold / current.funnel.leads) * 100;
      if (currentRate <= 0) return topId;
      if (!topId) return current.id;
      const topEvent = activeEventsSummary.find((e) => e.id === topId);
      const topRate = topEvent
        ? (topEvent.funnel.sold / Math.max(topEvent.funnel.leads, 1)) * 100
        : 0;
      return currentRate > topRate ? current.id : topId;
    },
    null,
  );

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
    periodDays,
  );
  // Pilula do cabecalho: o ultimo dia do periodo.
  const campaignSummary = campaignChartData[campaignChartData.length - 1] ?? {
    day: "--",
    totalLeads: 0,
    scheduledLeads: 0,
    confirmedLeads: 0,
    cancelledLeads: 0,
    checkedInLeads: 0,
  };
  // Cards embaixo do grafico: total da campanha, sem recorte de periodo.
  const campaignTotals = countCampaignMetrics(
    leads.filter((lead) => lead.event_id === (selectedCampaign?.id ?? "")),
  );
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
          className="relative flex flex-wrap items-center gap-2"
        >
          <button
            type="button"
            onClick={() => navigate("/gestor/crm")}
            className={clsx(
              "inline-flex items-center gap-1.5 rounded-full border px-3.5 py-2 text-xs font-semibold shadow-sm transition-all hover:scale-[1.02]",
              isDarkMode
                ? "border-zinc-700 bg-zinc-900 text-zinc-100 hover:bg-zinc-800"
                : "border-zinc-200 bg-white text-zinc-800 hover:bg-zinc-50",
            )}
          >
            <Sparkles size={14} className="text-[#FF0636]" />
            <span>CRM & Leads</span>
          </button>

          <button
            type="button"
            onClick={() => {
              const firstActive = events.find((e) => e.status === "active");
              if (firstActive) {
                window.open(`/eventos/${firstActive.id}/tv`, "_blank");
              } else {
                navigate("/gestor/eventos");
              }
            }}
            className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-zinc-900 to-zinc-800 px-3.5 py-2 text-xs font-semibold text-white shadow-sm transition-all hover:opacity-95 hover:scale-[1.02]"
          >
            <span>📺 Painel TV</span>
          </button>

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
        {/* 1. Top Row: origem dos contatos separada entre Rubinho e vendedores */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
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
            title="Leads do Rubinho"
            value={String(rubinhoLeads)}
            subtitle={
              rubinhoLeadsThisWeek > 0
                ? `+${rubinhoLeadsThisWeek} na semana`
                : "Sem novos na semana"
            }
            icon={<Sparkles size={18} />}
            accent="bg-white/15"
            highlight
          />
          <MetricCard
            title="Leads dos vendedores"
            value={String(vendorLeads)}
            subtitle={
              vendorLeadsThisWeek > 0
                ? `+${vendorLeadsThisWeek} na semana`
                : "Sem novos na semana"
            }
            icon={<Users size={18} className="text-sky-600" />}
            accent="bg-sky-50"
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
            icon={
              <div className="relative flex items-center justify-center">
                <CheckCircle2 size={18} className="text-[#FF0636]" />
                {criticalAlerts > 0 && (
                  <span className="absolute -right-1 -top-1 flex h-2.5 w-2.5">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
                    <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-[#FF0636]" />
                  </span>
                )}
              </div>
            }
            accent="bg-[#FF0636]/10"
          />
        </div>

        {/* 2. Active Events Row */}
        {activeEventsSummary.length > 0 && (
          <div className="space-y-3">
            <SectionTitle title="Eventos ativos" />
            <div className="-mx-1 flex gap-4 overflow-x-auto px-1 pb-2">
              {activeEventsSummary.map((event) => (
                <ActiveEventFunnelCard
                  key={event.id}
                  event={event}
                  isTopPerformer={event.id === topPerformerEventId}
                />
              ))}
            </div>
          </div>
        )}

        <RubinhoThermometerCard
          data={rubinhoThermometer}
          events={events.filter(
            (event) => event.status === "active" || event.status === "draft",
          )}
          selectedEventId={selectedCampaignId}
          onSelectEvent={setSelectedCampaignId}
          isDarkMode={isDarkMode}
          loading={rubinhoThermometerLoading}
        />

        {/* 3. Balanced 2-Column Grid: Ranking & Engagement / Progress */}
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Ranking de Confirmações */}
          <Card
            className="flex flex-col justify-between overflow-hidden rounded-3xl"
            padding="lg"
          >
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
          <Card
            className="flex flex-col justify-between overflow-hidden rounded-3xl"
            padding="lg"
          >
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
                  title={`Contatos por campanha - últimos ${periodDays} dias`}
                  action={
                    <span className="rounded-full bg-[#FF0636]/10 px-3 py-1 text-xs font-semibold text-[#FF0636]">
                      Meta selecionada
                    </span>
                  }
                />
                <div className="flex items-center gap-1 rounded-2xl border border-zinc-200 bg-zinc-50 p-1 text-xs font-semibold">
                  {([7, 15, 30] as const).map((days) => (
                    <button
                      key={days}
                      type="button"
                      onClick={() => setPeriodDays(days)}
                      className={clsx(
                        "rounded-xl px-3 py-1 transition-all",
                        periodDays === days
                          ? "bg-white text-zinc-950 shadow-sm"
                          : "text-zinc-500 hover:text-zinc-950",
                      )}
                    >
                      {days} dias
                    </button>
                  ))}
                </div>
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
                <DeferredCampaignPerformanceChart
                  data={campaignChartData}
                  metrics={campaignMetrics}
                  activeMetricKey={activeMetricKey}
                  dark={isDarkMode}
                />
              </div>
            </div>
          </div>

          <div className="mt-5 grid gap-3 grid-cols-2 sm:grid-cols-3 xl:grid-cols-5">
            {campaignMetrics.map((metric) => {
              const isActive = metric.key === activeMetricKey;
              return (
                <div
                  key={`kpi-${metric.key}`}
                  onClick={() => setActiveMetricKey(metric.key)}
                  className={clsx(
                    "cursor-pointer rounded-2xl border p-3.5 transition-all hover:scale-[1.02]",
                    isActive
                      ? isDarkMode
                        ? "border-zinc-500 bg-zinc-800/90 shadow-md ring-2 ring-white/20"
                        : "border-zinc-300 bg-zinc-50/90 shadow-md ring-2 ring-black/10"
                      : isDarkMode
                        ? "border-zinc-800 bg-[#15161b] opacity-85 hover:opacity-100"
                        : "border-zinc-100 bg-white opacity-85 hover:opacity-100",
                  )}
                >
                  <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-zinc-400">
                    {metric.label}
                  </p>
                  <p
                    className="mt-1.5 text-2xl font-black tracking-tight"
                    style={{ color: metric.stroke }}
                  >
                    {campaignTotals[metric.key]}
                  </p>
                </div>
              );
            })}
          </div>
        </Card>
      </div>
    </div>
  );
}
