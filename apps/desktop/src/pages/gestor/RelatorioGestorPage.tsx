import {
  lazy,
  type ComponentType,
  type CSSProperties,
  type ReactNode,
  useEffect,
  useMemo,
  useState,
  Fragment,
} from "react";
import { useOutletContext } from "react-router-dom";
import clsx from "clsx";
import {
  Building2,
  Calendar,
  BarChart3,
  Users,
  TrendingUp,
  Target,
  Download,
  CheckCircle2,
  Clock,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  LayoutDashboard,
  Megaphone,
  GitCompare,
  Award,
  UserCheck,
  Trophy,
  Shield,
  Printer,
} from "lucide-react";
import { PageHeader } from "../../components/shared/PageHeader";
import { StatsCard } from "../../components/shared/StatsCard";
import { DeferredContent } from "../../components/shared/DeferredContent";
import { mediaUrl } from "../../components/tv/shared";
import { Card } from "../../components/ui/Card";
import { Tabs } from "../../components/ui/Tabs";
import { readStoredSession } from "../../services/auth";
import { listClients, mapApiClientToClient } from "../../services/clients";
import {
  listEvents,
  getEventDashboardTv,
  getEventExecutiveReport,
  getOperationalReport,
} from "../../services/events";
import type {
  EventDashboardTvResponse,
  ExecutiveReportResponse,
  OperationalReportResponse,
} from "../../services/events";
import { fetchAllLeads, mapApiLeadToLead } from "../../services/leads";
import { listCrmPipelines, type ApiCrmStage } from "../../services/crm";
import type { AppOutletContext } from "../../layouts/AppLayout";
import type { Client, Event, Lead } from "../../types";
import {
  filterOperationalReportLeads,
  groupOperationalLeadsBySource,
  leadsForOperationalEvent,
  operationalLeadSourceLabel,
  summarizeOperationalLeads,
  buildOperationalReportCsv,
} from "./relatorio-gestor.model";
import {
  DASHBOARD_DARK_CHANGE_EVENT,
  readDashboardDarkEnabled,
} from "../../lib/dashboard-dark-mode";
type RelatorioTab =
  "overview" | "visao_geral" | "evento" | "campanhas" | "campanha_x_evento";

const RELATORIO_TABS = [
  {
    id: "overview",
    label: "Overview",
    icon: <BarChart3 size={16} />,
  },
  {
    id: "visao_geral",
    label: "Visão Geral",
    icon: <LayoutDashboard size={16} />,
  },
  { id: "evento", label: "Evento", icon: <Calendar size={16} /> },
  { id: "campanhas", label: "Campanhas", icon: <Megaphone size={16} /> },
  {
    id: "campanha_x_evento",
    label: "Campanha x Evento",
    icon: <GitCompare size={16} />,
  },
];

const PIE_COLORS = [
  "#FF0636",
  "#3b82f6",
  "#10b981",
  "#f59e0b",
  "#8b5cf6",
  "#64748b",
];

function lazyRechart(
  name: keyof typeof import("../../components/shared/RechartsDeferred"),
) {
  return lazy(() =>
    import("../../components/shared/RechartsDeferred").then((module) => ({
      default: module[name] as ComponentType<
        import("../../components/shared/RechartsDeferred").DeferredChartProps
      >,
    })),
  );
}

const BarChart = lazyRechart("BarChart");
const Bar = lazyRechart("Bar");
const XAxis = lazyRechart("XAxis");
const YAxis = lazyRechart("YAxis");
const CartesianGrid = lazyRechart("CartesianGrid");
const Tooltip = lazyRechart("Tooltip");
const ResponsiveContainer = lazyRechart("ResponsiveContainer");
const PieChart = lazyRechart("PieChart");
const Pie = lazyRechart("Pie");
const Cell = lazyRechart("Cell");
const Legend = lazyRechart("Legend");

function formatCurrency(val: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  }).format(val);
}

function formatNumber(val: number) {
  return new Intl.NumberFormat("pt-BR").format(val);
}

type OverviewBreakdownItem = { name: string; value: number };

function OverviewDonut({ data }: { data: OverviewBreakdownItem[] }) {
  const total = data.reduce((sum, item) => sum + item.value, 0);
  let cursor = 0;
  const stops = data.map((item, index) => {
    const start = cursor;
    cursor += total ? (item.value / total) * 100 : 0;
    return `${PIE_COLORS[index % PIE_COLORS.length]} ${start}% ${cursor}%`;
  });

  return (
    <div className="overview-donut grid min-h-[300px] grid-cols-1 items-center gap-8 py-5 md:grid-cols-[220px_minmax(0,1fr)]">
      <div
        className="relative mx-auto h-44 w-44 shrink-0 rounded-full"
        style={{ background: `conic-gradient(${stops.join(", ")})` }}
        role="img"
        aria-label={`${formatNumber(total)} agendamentos`}
      >
        <div className="absolute inset-7 flex flex-col items-center justify-center rounded-full bg-white dark:bg-zinc-900">
          <strong className="text-3xl text-gray-950 dark:text-white">
            {formatNumber(total)}
          </strong>
          <span className="text-[11px] text-gray-500 dark:text-zinc-400">
            agendamentos
          </span>
        </div>
      </div>
      <div className="grid w-full grid-cols-1 gap-2 2xl:grid-cols-2">
        {data.map((item, index) => (
          <div
            key={item.name}
            className="flex min-w-0 items-center gap-3 rounded-xl border border-gray-100 bg-gray-50/80 px-3 py-2.5 text-xs dark:border-zinc-800 dark:bg-zinc-800/60"
          >
            <span
              className="h-3.5 w-3.5 shrink-0 rounded-full ring-4 ring-white dark:ring-zinc-900"
              style={{ backgroundColor: PIE_COLORS[index % PIE_COLORS.length] }}
            />
            <div className="min-w-0 flex-1">
              <p className="break-words font-semibold text-gray-700 dark:text-zinc-200">
                {item.name}
              </p>
              <p className="mt-0.5 text-[10px] text-gray-400 dark:text-zinc-500">
                {total ? Math.round((item.value / total) * 100) : 0}% do total
              </p>
            </div>
            <strong className="rounded-lg bg-white px-2 py-1 text-sm tabular-nums text-gray-950 shadow-sm dark:bg-zinc-900 dark:text-white">
              {formatNumber(item.value)}
            </strong>
          </div>
        ))}
      </div>
    </div>
  );
}

function OverviewMetricCard({
  title,
  value,
  subtitle,
  icon,
  tone,
}: {
  title: string;
  value: string;
  subtitle: string;
  icon: ReactNode;
  tone: "blue" | "amber" | "emerald";
}) {
  const styles = {
    blue: {
      card: "from-blue-50 via-white to-white dark:from-blue-950/40 dark:via-zinc-900 dark:to-zinc-900",
      icon: "bg-blue-600 text-white shadow-blue-200 dark:shadow-none",
      accent: "bg-blue-500",
      glow: "bg-blue-300/30",
    },
    amber: {
      card: "from-amber-50 via-white to-white dark:from-amber-950/40 dark:via-zinc-900 dark:to-zinc-900",
      icon: "bg-amber-500 text-white shadow-amber-200 dark:shadow-none",
      accent: "bg-amber-400",
      glow: "bg-amber-300/30",
    },
    emerald: {
      card: "from-emerald-50 via-white to-white dark:from-emerald-950/40 dark:via-zinc-900 dark:to-zinc-900",
      icon: "bg-emerald-600 text-white shadow-emerald-200 dark:shadow-none",
      accent: "bg-emerald-500",
      glow: "bg-emerald-300/30",
    },
  }[tone];

  return (
    <div
      className={clsx(
        "relative min-h-[155px] overflow-hidden rounded-[26px] border border-gray-200/80 bg-gradient-to-br p-6 shadow-[0_10px_30px_rgba(15,23,42,0.05)] dark:border-zinc-800",
        styles.card,
      )}
    >
      <div
        className={clsx(
          "absolute -right-8 -top-10 h-32 w-32 rounded-full blur-2xl",
          styles.glow,
        )}
      />
      <div
        className={clsx(
          "absolute inset-x-6 top-0 h-1 rounded-b-full",
          styles.accent,
        )}
      />
      <div className="relative flex h-full items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-gray-500 dark:text-zinc-400">
            {title}
          </p>
          <p className="mt-3 text-4xl font-black tracking-tight text-gray-950 dark:text-white md:text-5xl">
            {value}
          </p>
          <p className="mt-2 truncate text-xs text-gray-500 dark:text-zinc-400">
            {subtitle}
          </p>
        </div>
        <div
          className={clsx(
            "flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl shadow-lg",
            styles.icon,
          )}
        >
          {icon}
        </div>
      </div>
    </div>
  );
}

type OverviewTeamItem = {
  name: string;
  value: number;
  logoUrl: string | null;
};

function OverviewTeamBattle({ teams }: { teams: OverviewTeamItem[] }) {
  const [left, right] = teams;
  if (!left || !right) return null;
  const total = left.value + right.value;
  const leftPercent = total ? (left.value / total) * 100 : 50;

  const Team = ({
    team,
    side,
  }: {
    team: OverviewTeamItem;
    side: "left" | "right";
  }) => (
    <div className="flex min-w-0 flex-1 flex-col items-center text-center">
      <div
        className={clsx(
          "flex h-24 w-24 items-center justify-center overflow-hidden rounded-[24px] border-2 bg-white p-2 shadow-xl md:h-28 md:w-28",
          side === "left"
            ? "border-blue-400 shadow-blue-950/40"
            : "border-rose-400 shadow-rose-950/40",
        )}
      >
        {team.logoUrl ? (
          <img
            src={team.logoUrl}
            alt={`Logo da equipe ${team.name}`}
            className="h-full w-full object-contain"
          />
        ) : (
          <Shield
            size={42}
            className={side === "left" ? "text-blue-500" : "text-rose-500"}
          />
        )}
      </div>
      <p className="mt-3 max-w-[220px] text-sm font-black uppercase tracking-wide text-white md:text-base">
        {team.name}
      </p>
      <strong
        className={clsx(
          "mt-1 text-5xl font-black tabular-nums md:text-6xl",
          side === "left" ? "text-blue-400" : "text-rose-400",
        )}
      >
        {formatNumber(team.value)}
      </strong>
      <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">
        agendamentos
      </span>
    </div>
  );

  return (
    <div className="team-battle relative mt-5 overflow-hidden rounded-[28px] bg-[radial-gradient(circle_at_center,#1e3a5f_0%,#0f172a_52%,#020617_100%)] px-5 py-7 shadow-inner md:px-10">
      <div className="absolute left-0 top-0 h-1 w-1/2 bg-blue-500" />
      <div className="absolute right-0 top-0 h-1 w-1/2 bg-rose-500" />
      <div className="relative flex items-center justify-between gap-3 md:gap-8">
        <Team team={left} side="left" />
        <div className="flex shrink-0 flex-col items-center">
          <div className="flex h-14 w-14 rotate-[-6deg] items-center justify-center rounded-2xl border border-amber-300/60 bg-gradient-to-br from-amber-300 to-orange-500 text-xl font-black italic text-slate-950 shadow-[0_0_30px_rgba(251,191,36,0.35)] md:h-16 md:w-16 md:text-2xl">
            VS
          </div>
          <span className="mt-3 whitespace-nowrap text-[9px] font-bold uppercase tracking-[0.18em] text-slate-500">
            Head to head
          </span>
        </div>
        <Team team={right} side="right" />
      </div>
      <div className="mt-6">
        <div className="mb-2 flex justify-between text-[10px] font-bold text-slate-300">
          <span>{Math.round(leftPercent)}%</span>
          <span>{Math.round(100 - leftPercent)}%</span>
        </div>
        <div className="flex h-3 overflow-hidden rounded-full bg-slate-800 ring-1 ring-white/10">
          <div
            className="bg-gradient-to-r from-blue-600 to-cyan-400"
            style={{ width: `${leftPercent}%` }}
          />
          <div
            className="bg-gradient-to-r from-orange-400 to-rose-600"
            style={{ width: `${100 - leftPercent}%` }}
          />
        </div>
      </div>
    </div>
  );
}

export function RelatorioGestorPage() {
  const { user } = useOutletContext<AppOutletContext>();
  const [isDarkMode, setIsDarkMode] = useState(() =>
    readDashboardDarkEnabled(user.id),
  );

  const [activeTab, setActiveTab] = useState<RelatorioTab>("overview");
  const [clients, setClients] = useState<Client[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [crmStages, setCrmStages] = useState<ApiCrmStage[]>([]);
  const [operationalReport, setOperationalReport] =
    useState<OperationalReportResponse | null>(null);
  const [executiveReport, setExecutiveReport] =
    useState<ExecutiveReportResponse | null>(null);
  const [, setIsLoading] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  // Filtros seletores superiores do lado direito
  const isClientView = user.role === "cliente";
  const [selectedClientId, setSelectedClientId] = useState<string>(() =>
    user.role === "cliente" && user.client_id ? user.client_id : "all",
  );
  const [selectedEventId, setSelectedEventId] = useState<string>("all");
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(10);

  // Estado de sincronia com a API do Modo TV do Evento (/events/:id/dashboard-tv)
  const [tvVendors, setTvVendors] = useState<
    EventDashboardTvResponse["vendors"]
  >([]);
  const [tvTeams, setTvTeams] = useState<EventDashboardTvResponse["teams"]>([]);
  const [eventDashboard, setEventDashboard] =
    useState<EventDashboardTvResponse | null>(null);

  useEffect(() => {
    const session = readStoredSession();
    if (!session?.accessToken || selectedEventId === "all") {
      setTvVendors([]);
      setTvTeams([]);
      setEventDashboard(null);
      return;
    }

    getEventDashboardTv(selectedEventId, session.accessToken)
      .then((tvData) => {
        setEventDashboard(tvData);
        if (tvData?.vendors) setTvVendors(tvData.vendors);
        if (tvData?.teams) setTvTeams(tvData.teams);
      })
      .catch((err) => {
        setEventDashboard(null);
        console.warn("Snapshot do Modo TV não disponível para o evento:", err);
      });
  }, [selectedEventId]);

  useEffect(() => {
    const session = readStoredSession();
    if (!session?.accessToken || selectedEventId === "all") {
      setExecutiveReport(null);
      return;
    }
    const controller = new AbortController();
    setExecutiveReport(null);
    getEventExecutiveReport(
      selectedEventId,
      session.accessToken,
      controller.signal,
    )
      .then(setExecutiveReport)
      .catch((err) => {
        if (!controller.signal.aborted) {
          console.warn("Métricas Meta do evento indisponíveis:", err);
        }
      });
    return () => controller.abort();
  }, [selectedEventId]);

  useEffect(() => {
    const session = readStoredSession();
    if (!session?.accessToken || activeTab === "overview") {
      setOperationalReport(null);
      return;
    }
    const controller = new AbortController();
    setOperationalReport(null);
    getOperationalReport(
      {
        client_id: selectedClientId === "all" ? undefined : selectedClientId,
        event_id: selectedEventId === "all" ? undefined : selectedEventId,
        page: currentPage,
        page_size: pageSize,
      },
      session.accessToken,
      controller.signal,
    )
      .then(setOperationalReport)
      .catch((err) => {
        if (!controller.signal.aborted) {
          console.warn("Relatório operacional indisponível:", err);
        }
      });
    return () => controller.abort();
  }, [activeTab, currentPage, pageSize, selectedClientId, selectedEventId]);

  useEffect(() => {
    const lastPage = operationalReport?.pagination.total_pages;
    if (lastPage && currentPage > lastPage) setCurrentPage(lastPage);
  }, [currentPage, operationalReport]);

  const exportOperationalReport = async () => {
    const session = readStoredSession();
    if (!session?.accessToken || isExporting) return;

    setIsExporting(true);
    setExportError(null);
    try {
      const params = {
        client_id: selectedClientId === "all" ? undefined : selectedClientId,
        event_id: selectedEventId === "all" ? undefined : selectedEventId,
        page_size: 100,
      };
      const firstPage = await getOperationalReport(
        { ...params, page: 1 },
        session.accessToken,
      );
      const items = [...firstPage.items];
      for (let page = 2; page <= firstPage.pagination.total_pages; page += 1) {
        const response = await getOperationalReport(
          { ...params, page },
          session.accessToken,
        );
        items.push(...response.items);
      }

      const csv = buildOperationalReportCsv(items);
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      const selectedEvent = events.find(({ id }) => id === selectedEventId);
      const scope = (selectedEvent?.name ?? "todos-os-leads")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-zA-Z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
        .toLowerCase();
      link.href = url;
      link.download = `relatorio-gestor-${scope || "leads"}-${new Date()
        .toISOString()
        .slice(0, 10)}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Erro ao exportar relatório operacional:", error);
      setExportError("Não foi possível exportar. Tente novamente.");
    } finally {
      setIsExporting(false);
    }
  };

  // Reseta paginação para 1 quando os seletores mudarem
  useEffect(() => {
    setCurrentPage(1);
  }, [selectedClientId, selectedEventId]);

  // Estado para expansão da tabela hierárquica de campanhas (Campanha -> Conjuntos -> Anúncios)
  const [expandedCampaigns, setExpandedCampaigns] = useState<
    Record<string, boolean>
  >({
    "camp-1": true,
  });
  const [expandedAdSets, setExpandedAdSets] = useState<Record<string, boolean>>(
    {
      "adset-101": true,
    },
  );

  const toggleCampaign = (id: string) => {
    setExpandedCampaigns((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const toggleAdSet = (id: string) => {
    setExpandedAdSets((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const expandAllCampaigns = () => {
    const campAcc: Record<string, boolean> = {};
    const adSetAcc: Record<string, boolean> = {};
    campaignTreeData.forEach((c) => {
      campAcc[c.id] = true;
      c.adSets.forEach((a) => {
        adSetAcc[a.id] = true;
      });
    });
    setExpandedCampaigns(campAcc);
    setExpandedAdSets(adSetAcc);
  };

  const collapseAllCampaigns = () => {
    setExpandedCampaigns({});
    setExpandedAdSets({});
  };

  // Dados estruturados em árvore para a Aba de Campanhas (Campanha -> Conjunto -> Anúncio)
  const campaignTreeData = useMemo(() => {
    const levels = executiveReport?.attribution_by_level;
    if (!levels) return [];
    const mapRow = (row: (typeof levels.campaigns)[number]) => ({
      id: row.entity_id,
      name: row.name,
      status: "synced",
      valorInvestido: row.spend,
      quantidadeLeads: row.leads,
      metaLeads: row.meta_leads,
      custoPorLead: row.system_cpl ?? row.cpl,
      custoPorLeadMeta: row.meta_cpl ?? 0,
      impressoes: row.impressions,
      numeroConversas: row.conversations,
      custoConversasIniciadas: row.cost_per_conversation,
      contasAlcancadas: row.reach,
    });

    return levels.campaigns.map((campaign) => ({
      ...mapRow(campaign),
      adSets: levels.ad_sets
        .filter((adSet) => adSet.meta_campaign_id === campaign.entity_id)
        .map((adSet) => ({
          ...mapRow(adSet),
          ads: levels.ads
            .filter(
              (ad) =>
                ad.meta_campaign_id === campaign.entity_id &&
                ad.meta_ad_set_id === adSet.entity_id,
            )
            .map(mapRow),
        })),
    }));
  }, [executiveReport]);

  // Totais consolidados para o cabeçalho da Aba Campanhas
  const campaignTotals = useMemo(() => {
    let investido = 0;
    let leadsCount = 0;
    let metaLeadsCount = 0;
    let conversasCount = 0;
    let impressoesCount = 0;

    campaignTreeData.forEach((c) => {
      investido += c.valorInvestido;
      leadsCount += c.quantidadeLeads;
      metaLeadsCount += c.metaLeads;
      conversasCount += c.numeroConversas;
      impressoesCount += c.impressoes;
    });

    const cplMedio = leadsCount > 0 ? investido / leadsCount : 0;
    const metaCplMedio = metaLeadsCount > 0 ? investido / metaLeadsCount : 0;

    return {
      investido,
      leadsCount,
      metaLeadsCount,
      conversasCount,
      impressoesCount,
      cplMedio,
      metaCplMedio,
    };
  }, [campaignTreeData]);

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

  // Carrega pipelines e etapas reais do CRM para o cliente selecionado ou padrão
  useEffect(() => {
    const session = readStoredSession();
    if (!session?.accessToken || activeTab === "overview") return;

    const clientIdToFetch =
      selectedClientId !== "all" ? selectedClientId : clients[0]?.id;
    if (!clientIdToFetch) return;

    listCrmPipelines(clientIdToFetch, session.accessToken)
      .then((pipelines) => {
        if (pipelines && pipelines.length > 0 && pipelines[0].stages) {
          setCrmStages(pipelines[0].stages);
        }
      })
      .catch((err) => {
        console.warn("Pipeline personalizado do CRM não encontrado:", err);
      });
  }, [activeTab, selectedClientId, clients]);

  // Carrega apenas o necessário para abrir o Overview rapidamente.
  useEffect(() => {
    const session = readStoredSession();
    if (!session?.accessToken) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    Promise.allSettled([
      listClients(session.accessToken),
      listEvents({}, session.accessToken),
    ])
      .then(([clientsResult, eventsResult]) => {
        if (clientsResult.status === "fulfilled") {
          setClients(clientsResult.value.map(mapApiClientToClient));
        } else {
          console.error(
            "Erro ao carregar clientes do relatório:",
            clientsResult.reason,
          );
        }

        if (eventsResult.status === "fulfilled") {
          setEvents(
            eventsResult.value.map((e) => ({
              id: e.id,
              name: e.name,
              client_id: e.client_id,
              participant_client_ids: e.participant_client_ids ?? [e.client_id],
              event_type: e.event_type ?? "feirao",
              description: e.description ?? "",
              launch_date: e.launch_date ?? e.created_at,
              event_date: e.event_date,
              event_end_date: e.event_end_date ?? e.event_date,
              location: e.location ?? "",
              capacity: e.capacity ?? 0,
              sales_target: e.sales_target ?? 0,
              scheduled_target: e.scheduled_target ?? 0,
              status: e.status,
              cover_image_url: e.cover_image_url ?? undefined,
              image_urls: e.image_urls,
              leads_count: e.leads_count ?? 0,
              confirmed_count: e.confirmed_count ?? 0,
              checkin_count: e.checkin_count ?? 0,
              created_at: e.created_at,
              updated_at: e.updated_at,
            })),
          );
        } else {
          console.error(
            "Erro ao carregar eventos do relatório:",
            eventsResult.reason,
          );
        }
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, []);

  // As demais abas ainda usam a base detalhada e a carregam somente quando o
  // usuário realmente as abre.
  useEffect(() => {
    if (activeTab === "overview" || leads.length > 0) return;
    const session = readStoredSession();
    if (!session?.accessToken) return;
    fetchAllLeads({}, session.accessToken)
      .then((apiLeads) => setLeads(apiLeads.map(mapApiLeadToLead)))
      .catch((error) =>
        console.error("Erro ao carregar leads do relatório:", error),
      );
  }, [activeTab, leads.length]);

  // Eventos filtrados com base no cliente selecionado
  const availableEvents = useMemo(() => {
    if (selectedClientId === "all") return events;
    return events.filter(
      (e) =>
        e.client_id === selectedClientId ||
        e.participant_client_ids?.includes(selectedClientId),
    );
  }, [events, selectedClientId]);

  // Se alterar o cliente e o evento selecionado não pertencer mais, reseta para "all"
  useEffect(() => {
    if (
      selectedEventId !== "all" &&
      !availableEvents.some((e) => e.id === selectedEventId)
    ) {
      setSelectedEventId("all");
    }
  }, [selectedClientId, availableEvents, selectedEventId]);

  // O Overview é sempre individual por evento. Ao entrar na aba (ou trocar o
  // cliente), abre o primeiro evento disponível em vez de deixar a tela vazia.
  useEffect(() => {
    if (
      activeTab === "overview" &&
      selectedEventId === "all" &&
      availableEvents.length > 0
    ) {
      setSelectedEventId(availableEvents[0].id);
    }
  }, [activeTab, availableEvents, selectedEventId]);

  // Leads filtrados conforme seleções de cliente e evento
  const filteredLeads = useMemo(() => {
    return filterOperationalReportLeads(
      leads,
      selectedClientId,
      selectedEventId,
    );
  }, [leads, selectedClientId, selectedEventId, events]);

  // Métricas calculadas
  const localOperationalSummary = useMemo(
    () => summarizeOperationalLeads(filteredLeads),
    [filteredLeads],
  );
  const realSummary = operationalReport?.summary;
  const totalLeads = realSummary?.leads ?? localOperationalSummary.totalLeads;
  const leadsAgendados =
    realSummary?.funnel.scheduled ?? localOperationalSummary.scheduled;
  const leadsCheckin =
    realSummary?.funnel.checked_in ?? localOperationalSummary.checkedIn;
  const leadsConvertidos =
    realSummary?.funnel.sold ?? localOperationalSummary.converted;
  const taxaConversao =
    realSummary?.rates.lead_to_sale ?? localOperationalSummary.conversionRate;
  const taxaCheckinGeral =
    realSummary?.rates.appointment_to_checkin ??
    localOperationalSummary.checkinRate;

  // Dados do gráfico de funil baseados nas etapas REAIS do CRM
  const crmFunnelData = useMemo(() => {
    if (realSummary) {
      return [
        {
          stage: "Leads",
          quantidade: realSummary.funnel.leads,
          color: "#3b82f6",
        },
        {
          stage: "Agendados",
          quantidade: realSummary.funnel.scheduled,
          color: "#f59e0b",
        },
        {
          stage: "Confirmados",
          quantidade: realSummary.funnel.confirmed,
          color: "#6366f1",
        },
        {
          stage: "Compareceram",
          quantidade: realSummary.funnel.checked_in,
          color: "#8b5cf6",
        },
        {
          stage: "Vendas",
          quantidade: realSummary.funnel.sold,
          color: "#10b981",
        },
      ];
    }
    if (crmStages.length > 0) {
      return crmStages.map((stg) => {
        const count = filteredLeads.filter((l) => {
          if (l.crm_stage_id && l.crm_stage_id === stg.id) return true;
          if (
            l.crm_stage_code &&
            l.crm_stage_code.toLowerCase() === stg.code.toLowerCase()
          )
            return true;
          if (
            l.crm_stage &&
            l.crm_stage.toLowerCase() === stg.code.toLowerCase()
          )
            return true;
          if (
            l.crm_stage_name &&
            l.crm_stage_name.toLowerCase() === stg.name.toLowerCase()
          )
            return true;
          return false;
        }).length;

        return {
          stage: stg.name,
          quantidade: count,
          color: stg.color || "#FF0636",
        };
      });
    }

    const defaultStages = [
      { key: "novo", label: "Novo Lead", color: "#3b82f6" },
      { key: "contactado", label: "Contactado", color: "#6366f1" },
      { key: "nao_responde", label: "Não Responde", color: "#64748b" },
      { key: "agendado", label: "Agendado", color: "#f59e0b" },
      { key: "checkin", label: "Check-in", color: "#8b5cf6" },
      { key: "convertido", label: "Convertido", color: "#10b981" },
      { key: "perdido", label: "Perdido", color: "#ef4444" },
    ];

    return defaultStages.map((s) => ({
      stage: s.label,
      quantidade: filteredLeads.filter(
        (l) => l.crm_stage === s.key || l.crm_stage_code === s.key,
      ).length,
      color: s.color,
    }));
  }, [filteredLeads, crmStages, realSummary]);

  // Dados do gráfico por Origem (Source)
  const sourcePieData = useMemo(() => {
    if (realSummary) {
      const grouped = new Map<string, number>();
      for (const row of realSummary.by_source) {
        const label = operationalLeadSourceLabel(row.source);
        grouped.set(label, (grouped.get(label) ?? 0) + row.count);
      }
      return [...grouped.entries()].map(([name, value]) => ({ name, value }));
    }
    return groupOperationalLeadsBySource(filteredLeads);
  }, [filteredLeads, realSummary]);

  // A tabela usa a mesma consulta paginada das métricas. O fallback local só
  // existe durante indisponibilidade transitória do endpoint operacional.
  const reportTotal =
    operationalReport?.pagination.total ?? filteredLeads.length;
  const totalPages =
    operationalReport?.pagination.total_pages ??
    Math.max(1, Math.ceil(filteredLeads.length / pageSize));
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, reportTotal);
  const operationalTableRows = useMemo(() => {
    if (operationalReport) {
      return operationalReport.items.map((lead) => ({
        id: lead.id,
        name: lead.name,
        phone: lead.phone,
        clientName: lead.client.company_name,
        sourceLabel: operationalLeadSourceLabel(lead.source),
        stageName: lead.crm_stage?.name ?? "Sem etapa",
        stageCode: lead.crm_stage?.code ?? "",
        createdAt: lead.created_at,
      }));
    }
    return filteredLeads
      .slice(startIndex, startIndex + pageSize)
      .map((lead) => ({
        id: lead.id,
        name: lead.name,
        phone: lead.phone,
        clientName:
          clients.find((client) => client.id === lead.client_id)
            ?.company_name ?? "Não informada",
        sourceLabel: operationalLeadSourceLabel(lead.source),
        stageName: lead.crm_stage_name || lead.crm_stage || "Sem etapa",
        stageCode: lead.crm_stage_code || lead.crm_stage || "",
        createdAt: lead.created_at,
      }));
  }, [clients, filteredLeads, operationalReport, pageSize, startIndex]);

  // Dados para a Aba de Eventos
  const eventMetrics = useMemo(() => {
    return availableEvents.map((ev) => {
      const evLeads = leadsForOperationalEvent(leads, ev.id);
      const evCheckins = evLeads.filter(
        (l) => l.crm_stage === "checkin" || l.crm_stage === "convertido",
      ).length;
      const evVendas = evLeads.filter(
        (l) => l.crm_stage === "convertido",
      ).length;

      const salesTarget = ev.sales_target || 0;
      const audienceTarget = ev.capacity || 0;

      const salesProgressPercent =
        salesTarget > 0
          ? Math.min(100, Math.round((evVendas / salesTarget) * 100))
          : 0;

      const audienceProgressPercent =
        audienceTarget > 0
          ? Math.min(100, Math.round((evCheckins / audienceTarget) * 100))
          : 0;

      const isSelectedEvent = executiveReport?.event_id === ev.id;
      const valorInvestido = isSelectedEvent
        ? campaignTotals.investido
        : (ev.paid_traffic_investment ?? 0);
      const valorTotalVendas = isSelectedEvent
        ? (executiveReport.commercial_revenue?.total_revenue ?? 0)
        : 0;
      const realSales = isSelectedEvent
        ? (executiveReport.commercial_revenue?.total_sales ?? 0)
        : evVendas;
      const cac = realSales > 0 ? valorInvestido / realSales : 0;
      const nomeResumido =
        ev.name.length > 20 ? `${ev.name.slice(0, 20)}...` : ev.name;
      const taxaCheckin =
        evLeads.length > 0
          ? Math.round((evCheckins / evLeads.length) * 100)
          : 0;

      return {
        ...ev,
        nomeResumido,
        totalLeads: evLeads.length,
        totalCheckins: evCheckins,
        totalVendas: realSales,
        salesTarget,
        audienceTarget,
        salesProgressPercent,
        audienceProgressPercent,
        valorInvestido,
        valorTotalVendas,
        cac,
        taxaCheckin,
      };
    });
  }, [availableEvents, campaignTotals.investido, executiveReport, leads]);

  // Eventos destaques (Campeões de Venda e Público)
  const topSalesEvent = useMemo(() => {
    if (eventMetrics.length === 0) return null;
    return [...eventMetrics].sort((a, b) => b.totalVendas - a.totalVendas)[0];
  }, [eventMetrics]);

  const topAttendanceEvent = useMemo(() => {
    if (eventMetrics.length === 0) return null;
    return [...eventMetrics].sort(
      (a, b) => b.totalCheckins - a.totalCheckins,
    )[0];
  }, [eventMetrics]);

  // Ranking de Vendedores do Evento/Filtro (Integrado com o Modo TV)
  const rankedVendors = useMemo(() => {
    if (tvVendors.length > 0) {
      return tvVendors
        .map((v) => ({
          id: v.vendor_id,
          name: v.vendor_name,
          teamName: v.team_name,
          sales: v.sold ?? 0,
          checkins: v.checked_in ?? 0,
          leads: v.scheduled ?? 0,
        }))
        .sort((a, b) => b.sales - a.sales || b.checkins - a.checkins);
    }

    return [];
  }, [tvVendors]);

  // Ranking de Equipes / Times do Evento (Integrado com o Modo TV)
  const rankedTeams = useMemo(() => {
    if (tvTeams.length > 0) {
      return tvTeams
        .map((t) => ({
          id: t.team_id,
          name: t.team_name,
          sales: t.sold ?? 0,
          checkins: t.checked_in ?? 0,
          leads: t.scheduled ?? 0,
        }))
        .sort((a, b) => b.sales - a.sales || b.checkins - a.checkins);
    }

    return [];
  }, [tvTeams]);

  const overviewSellerAppointments = useMemo(
    () =>
      (eventDashboard?.seller_appointments ?? []).filter(
        (appointment) =>
          selectedClientId === "all" ||
          appointment.client_id === selectedClientId,
      ),
    [eventDashboard, selectedClientId],
  );

  const overviewVendorData = useMemo(() => {
    const visibleVendors = tvVendors.filter(
      (vendor) =>
        selectedClientId === "all" || vendor.client_id === selectedClientId,
    );
    const vendorDetails = new Map(
      visibleVendors.map((vendor) => [vendor.vendor_id, vendor] as const),
    );
    const appointmentDetails = new Map(
      overviewSellerAppointments.map(
        (appointment) => [appointment.vendor_id, appointment] as const,
      ),
    );
    // Todos os vendedores vinculados ao evento entram no ranking, mesmo que
    // ainda não tenham realizado nenhum agendamento.
    const counts = new Map<string, number>(
      visibleVendors.map((vendor) => [vendor.vendor_id, 0] as const),
    );
    for (const appointment of overviewSellerAppointments) {
      const vendorId = appointment.vendor_id;
      counts.set(vendorId, (counts.get(vendorId) ?? 0) + 1);
    }
    return [...counts.entries()]
      .map(([vendorId, value]) => {
        const vendor = vendorDetails.get(vendorId);
        const appointment = appointmentDetails.get(vendorId);
        return {
          id: vendorId,
          name:
            appointment?.vendor_name ??
            vendor?.vendor_name ??
            "Vendedor não identificado",
          team: appointment?.team_name ?? vendor?.team_name ?? "Sem equipe",
          teamId: appointment?.team_id ?? vendor?.team_id ?? null,
          value,
        };
      })
      .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name));
  }, [overviewSellerAppointments, selectedClientId, tvVendors]);

  const overviewTeamData = useMemo(() => {
    const counts = new Map<string, number>();
    const teamDetails = new Map(
      tvTeams.map((team) => [team.team_name, team] as const),
    );
    for (const vendor of overviewVendorData) {
      // Vendedores sem equipe continuam no ranking individual e nos totais do
      // evento, mas não representam uma equipe participante.
      if (!vendor.teamId) continue;
      counts.set(vendor.team, (counts.get(vendor.team) ?? 0) + vendor.value);
    }
    return [...counts.entries()]
      .map(([name, value]) => ({
        name,
        value,
        logoUrl: mediaUrl(teamDetails.get(name)?.logo_url),
      }))
      .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name));
  }, [overviewVendorData, tvTeams]);

  const overviewDailyData = useMemo(() => {
    const counts = new Map<string, OverviewBreakdownItem>();
    for (const appointment of overviewSellerAppointments) {
      if (!appointment.created_at) continue;
      const createdAt = new Date(appointment.created_at);
      const label = createdAt.toLocaleDateString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
      });
      const key = createdAt.toISOString().slice(0, 10);
      counts.set(key, {
        name: label,
        value: (counts.get(key)?.value ?? 0) + 1,
      });
    }
    return [...counts.entries()]
      .sort(([dateA], [dateB]) => dateA.localeCompare(dateB))
      .map(([, value]) => value);
  }, [overviewSellerAppointments]);

  const overviewSegmentData = useMemo(() => {
    if (selectedEventId === "all") return [];
    const counts = new Map<string, number>();
    for (const appointment of overviewSellerAppointments) {
      counts.set(
        appointment.segment,
        (counts.get(appointment.segment) ?? 0) + 1,
      );
    }

    return [...counts.entries()]
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [overviewSellerAppointments, selectedEventId]);

  const overviewScheduled = overviewSellerAppointments.length;
  const overviewTargetPerVendor = eventDashboard?.event.scheduled_target ?? 0;
  const overviewTarget = overviewTargetPerVendor * overviewVendorData.length;
  const overviewTargetPercent =
    overviewTarget > 0
      ? Math.round((overviewScheduled / overviewTarget) * 100)
      : 0;

  // Dados para a Aba de Cruzamento: Campanha x Evento
  const campaignEventCrossData = useMemo(() => {
    if (!executiveReport || selectedEventId === "all") return [];
    const eventName = events.find(
      (event) => event.id === selectedEventId,
    )?.name;
    return executiveReport.attribution_by_level.campaigns.map((campaign) => ({
      eventoId: selectedEventId,
      eventoNome: eventName ?? "Evento selecionado",
      campanhaId: campaign.entity_id,
      campanhaNome: campaign.name,
      totalLeads: campaign.leads,
      metaLeads: campaign.meta_leads,
      agendados: campaign.scheduled,
      vendas: campaign.sold,
      valorInvestido: campaign.spend,
      custoPorAgendamento: campaign.cost_per_scheduled,
      taxaConversaoAgendamento:
        campaign.scheduled > 0
          ? Math.round((campaign.sold / campaign.scheduled) * 10000) / 100
          : 0,
    }));
  }, [events, executiveReport, selectedEventId]);

  // Totais consolidados para a Aba Campanha x Evento
  const crossTotals = useMemo(() => {
    let metaLeads = 0;
    let totalLeads = 0;
    let agendados = 0;
    let vendas = 0;
    let investido = 0;

    campaignEventCrossData.forEach((row) => {
      metaLeads += row.metaLeads;
      totalLeads += row.totalLeads;
      agendados += row.agendados;
      vendas += row.vendas;
      investido += row.valorInvestido;
    });

    const custoAgendamentoMedio =
      agendados > 0 ? Math.round(investido / agendados) : 0;
    const taxaConversaoAgendamentoGlobal =
      agendados > 0 ? Math.round((vendas / agendados) * 100) : 0;

    return {
      metaLeads,
      totalLeads,
      agendados,
      vendas,
      investido,
      custoAgendamentoMedio,
      taxaConversaoAgendamentoGlobal,
    };
  }, [campaignEventCrossData]);

  const chartAxisStroke = isDarkMode ? "#52525b" : "#e5e7eb";
  const chartTickFill = isDarkMode ? "#a1a1aa" : "#6b7280";
  const chartTooltipBg = isDarkMode ? "#18181b" : "#ffffff";
  const chartTooltipStyle = {
    border: isDarkMode ? "1px solid #3f3f46" : "1px solid #e5e7eb",
    borderRadius: 12,
    color: isDarkMode ? "#f4f4f5" : "#18181b",
    fontSize: "12px",
  };

  return (
    <div
      className={clsx(
        "space-y-6 transition-colors duration-200",
        isDarkMode &&
          "dashboard-dark cliente-detail-dark -mx-4 -mt-4 rounded-none px-4 pb-8 pt-4 md:-mx-6 md:-mt-6 md:px-6 xl:-mx-8 xl:-mt-8 xl:px-8 bg-black",
      )}
    >
      {/* PageHeader com seletores superiores no lado direito */}
      <div className="no-print">
        <PageHeader
          title="Relatório de Desempenho"
          breadcrumbs={[
            { label: isClientView ? "Cliente" : "Gestor" },
            { label: "Relatórios" },
          ]}
          subtitle="Análise consolidada de leads, eventos e campanhas"
          dark={isDarkMode}
          actions={
            <div className="flex flex-wrap items-center gap-3">
              {/* Seletor de Cliente */}
              {!isClientView ? (
                <div className="relative min-w-[200px]">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                    <Building2 size={15} />
                  </div>
                  <select
                    value={selectedClientId}
                    onChange={(e) => setSelectedClientId(e.target.value)}
                    className={clsx(
                      "w-full pl-9 pr-8 py-2 rounded-xl text-xs font-semibold appearance-none border cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#FF0636] transition-all shadow-sm",
                      isDarkMode
                        ? "bg-zinc-900 border-zinc-700 text-zinc-100 hover:border-zinc-600"
                        : "bg-white border-gray-200 text-gray-800 hover:border-gray-300",
                    )}
                  >
                    <option value="all">Todos os Clientes</option>
                    {clients.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.company_name}
                      </option>
                    ))}
                  </select>
                  <div className="absolute inset-y-0 right-0 pr-2.5 flex items-center pointer-events-none text-gray-400">
                    <ChevronDown size={14} />
                  </div>
                </div>
              ) : null}

              {/* Seletor de Evento */}
              <div className="relative min-w-[200px]">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                  <Calendar size={15} />
                </div>
                <select
                  value={selectedEventId}
                  onChange={(e) => setSelectedEventId(e.target.value)}
                  className={clsx(
                    "w-full pl-9 pr-8 py-2 rounded-xl text-xs font-semibold appearance-none border cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#FF0636] transition-all shadow-sm",
                    isDarkMode
                      ? "bg-zinc-900 border-zinc-700 text-zinc-100 hover:border-zinc-600"
                      : "bg-white border-gray-200 text-gray-800 hover:border-gray-300",
                  )}
                >
                  <option value="all">Todos os Eventos</option>
                  {availableEvents.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.name}
                    </option>
                  ))}
                </select>
                <div className="absolute inset-y-0 right-0 pr-2.5 flex items-center pointer-events-none text-gray-400">
                  <ChevronDown size={14} />
                </div>
              </div>
              {activeTab === "overview" && selectedEventId !== "all" ? (
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="no-print inline-flex items-center gap-2 rounded-xl bg-[#FF0636] px-4 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-[#d90530]"
                >
                  <Printer size={15} /> Gerar PDF
                </button>
              ) : null}
            </div>
          }
        />
      </div>

      {/* Abas Internas abaixo do Título e Seletores */}
      <div className="no-print">
        <Tabs
          tabs={RELATORIO_TABS}
          active={activeTab}
          onChange={(tab) => setActiveTab(tab as RelatorioTab)}
        />
      </div>

      {/* ── OVERVIEW DE AGENDAMENTOS ── */}
      {activeTab === "overview" && (
        <div className="overview-report space-y-6">
          {selectedEventId === "all" ? (
            <Card className="py-14 text-center">
              <Calendar size={32} className="mx-auto text-[#FF0636]" />
              <h3 className="mt-3 text-base font-bold text-gray-900 dark:text-zinc-100">
                Selecione um evento para abrir o Overview
              </h3>
              <p className="mt-1 text-sm text-gray-500 dark:text-zinc-400">
                Os totais por equipe, vendedor, dia, segmento e meta são
                calculados individualmente por evento.
              </p>
            </Card>
          ) : (
            <>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <OverviewMetricCard
                  title="Total de agendamentos"
                  value={formatNumber(overviewScheduled)}
                  subtitle={eventDashboard?.event.name ?? "Evento selecionado"}
                  icon={<Calendar size={22} />}
                  tone="blue"
                />
                <OverviewMetricCard
                  title="Equipes participantes"
                  value={formatNumber(overviewTeamData.length)}
                  subtitle="Com vendedores vinculados"
                  icon={<Shield size={22} />}
                  tone="amber"
                />
                <OverviewMetricCard
                  title="Vendedores no evento"
                  value={formatNumber(overviewVendorData.length)}
                  subtitle="Ranking por agendamentos"
                  icon={<UserCheck size={22} />}
                  tone="emerald"
                />
              </div>

              <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                <Card className="lg:col-span-2">
                  <h3 className="text-base font-bold text-gray-900 dark:text-zinc-100">
                    Total de agendamentos por equipe
                  </h3>
                  <p className="mt-1 text-xs text-gray-500 dark:text-zinc-400">
                    Comparativo dos times participantes do evento
                  </p>
                  {overviewTeamData.length === 2 ? (
                    <OverviewTeamBattle teams={overviewTeamData} />
                  ) : overviewTeamData.length ? (
                    <div className="flex min-h-[300px] flex-col justify-center space-y-5 py-6">
                      {overviewTeamData.map((team, index) => {
                        const max = overviewTeamData[0]?.value || 1;
                        return (
                          <div
                            key={team.name}
                            className="grid grid-cols-[64px_minmax(0,1fr)] items-center gap-4"
                          >
                            <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl border border-gray-200 bg-white p-1 shadow-sm dark:border-zinc-700 dark:bg-zinc-800">
                              {team.logoUrl ? (
                                <img
                                  src={team.logoUrl}
                                  alt={`Logo da equipe ${team.name}`}
                                  className="h-full w-full object-contain"
                                  loading="lazy"
                                />
                              ) : (
                                <Shield
                                  size={28}
                                  className="text-gray-300 dark:text-zinc-500"
                                />
                              )}
                            </div>
                            <div className="min-w-0">
                              <div className="mb-2 flex items-center justify-between gap-4 text-sm">
                                <strong className="truncate text-gray-900 dark:text-zinc-100">
                                  {index + 1}. {team.name}
                                </strong>
                                <span className="font-bold text-gray-950 dark:text-white">
                                  {formatNumber(team.value)}
                                </span>
                              </div>
                              <div className="h-5 overflow-hidden rounded-full bg-gray-100 dark:bg-zinc-800">
                                <div
                                  className="h-full rounded-full bg-gradient-to-r from-blue-600 to-[#FF0636]"
                                  style={{
                                    width: `${Math.max((team.value / max) * 100, 2)}%`,
                                  }}
                                />
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="flex h-[300px] items-center justify-center text-sm text-gray-400">
                      Nenhuma equipe com agendamentos neste evento.
                    </div>
                  )}
                </Card>

                <Card className="relative overflow-hidden bg-gradient-to-br from-white via-white to-rose-50/70 dark:from-zinc-900 dark:via-zinc-900 dark:to-rose-950/20">
                  <div className="absolute -right-12 -top-12 h-40 w-40 rounded-full bg-rose-200/30 blur-3xl dark:bg-rose-900/20" />
                  <div className="relative">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="text-base font-bold text-gray-900 dark:text-zinc-100">
                          Progresso da meta
                        </h3>
                        <p className="mt-1 text-xs text-gray-500 dark:text-zinc-400">
                          Objetivo geral de agendamentos do evento
                        </p>
                      </div>
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-rose-100 text-[#FF0636] dark:bg-rose-950/60">
                        <Target size={20} />
                      </div>
                    </div>
                    <div className="flex min-h-[220px] flex-col items-center justify-center py-5 text-center">
                      <div
                        className="relative flex h-40 w-40 items-center justify-center rounded-full bg-[conic-gradient(#FF0636_var(--progress),#e5e7eb_0)] p-3.5 shadow-[0_12px_35px_rgba(255,6,54,0.12)] dark:bg-[conic-gradient(#FF0636_var(--progress),#27272a_0)]"
                        style={
                          {
                            "--progress": `${Math.min(overviewTargetPercent, 100)}%`,
                          } as CSSProperties
                        }
                      >
                        <div className="flex h-full w-full flex-col items-center justify-center rounded-full bg-white dark:bg-zinc-900">
                          <strong className="text-4xl font-black tracking-tight text-gray-950 dark:text-white">
                            {overviewTargetPercent}%
                          </strong>
                          <span className="mt-0.5 text-[10px] font-bold uppercase tracking-[0.14em] text-gray-400 dark:text-zinc-500">
                            concluído
                          </span>
                        </div>
                      </div>
                      {overviewTargetPerVendor > 0 &&
                      overviewVendorData.length > 0 ? (
                        <div className="mt-4 rounded-full border border-rose-100 bg-white/90 px-4 py-2 text-[11px] font-semibold text-gray-600 shadow-sm dark:border-rose-900/40 dark:bg-zinc-900/90 dark:text-zinc-300">
                          {formatNumber(overviewTargetPerVendor)} agendamentos
                          por vendedor
                          <span className="mx-2 text-rose-300">×</span>
                          {formatNumber(overviewVendorData.length)} vendedores
                        </div>
                      ) : null}
                    </div>
                    <div className="grid grid-cols-3 divide-x divide-gray-200 rounded-2xl border border-gray-100 bg-white/80 px-2 py-3 shadow-sm dark:divide-zinc-700 dark:border-zinc-800 dark:bg-zinc-800/50">
                      {[
                        { label: "Realizados", value: overviewScheduled },
                        { label: "Meta total", value: overviewTarget },
                        {
                          label: "Faltam",
                          value: Math.max(
                            overviewTarget - overviewScheduled,
                            0,
                          ),
                        },
                      ].map((item) => (
                        <div key={item.label} className="px-1 text-center">
                          <strong className="block text-lg font-black tabular-nums text-gray-950 dark:text-white">
                            {formatNumber(item.value)}
                          </strong>
                          <span className="text-[9px] font-bold uppercase tracking-wide text-gray-400 dark:text-zinc-500">
                            {item.label}
                          </span>
                        </div>
                      ))}
                    </div>
                    {overviewTarget === 0 ? (
                      <p className="mt-3 text-center text-xs text-gray-500 dark:text-zinc-400">
                        Defina a meta por vendedor na configuração do evento.
                      </p>
                    ) : null}
                  </div>
                </Card>
              </div>

              <Card>
                <h3 className="text-base font-bold text-gray-900 dark:text-zinc-100">
                  Agendamentos entre os vendedores
                </h3>
                <p className="mt-1 text-xs text-gray-500 dark:text-zinc-400">
                  Ranking individual com identificação da equipe
                </p>
                <div className="mt-5 max-h-[520px] space-y-2 overflow-y-auto pr-1">
                  {overviewVendorData.map((vendor, index) => {
                    const max = overviewVendorData[0]?.value || 1;
                    return (
                      <div
                        key={`${vendor.name}-${index}`}
                        className="grid grid-cols-[minmax(130px,240px)_1fr_auto] items-center gap-3"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-xs font-bold text-gray-900 dark:text-zinc-100">
                            {index + 1}. {vendor.name}
                          </p>
                          <p className="truncate text-[10px] text-gray-500 dark:text-zinc-400">
                            {vendor.team}
                          </p>
                        </div>
                        <div className="h-3 overflow-hidden rounded-full bg-gray-100 dark:bg-zinc-800">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-amber-400 to-[#FF0636]"
                            style={{
                              width: `${Math.max((vendor.value / max) * 100, vendor.value ? 2 : 0)}%`,
                            }}
                          />
                        </div>
                        <strong className="w-10 text-right text-sm text-gray-950 dark:text-white">
                          {vendor.value}
                        </strong>
                      </div>
                    );
                  })}
                  {!overviewVendorData.length ? (
                    <p className="py-12 text-center text-sm text-gray-400">
                      Nenhum vendedor com agendamentos neste evento.
                    </p>
                  ) : null}
                </div>
              </Card>

              <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                {[
                  {
                    title: "Agendamentos por dia de criação",
                    subtitle: "Dia em que o vendedor realizou o agendamento",
                    data: overviewDailyData,
                  },
                  {
                    title: "Agendamentos por segmento",
                    subtitle: "Segmento cadastrado para o vendedor",
                    data: overviewSegmentData,
                  },
                ].map((chart) => (
                  <Card key={chart.title}>
                    <h3 className="text-base font-bold text-gray-900 dark:text-zinc-100">
                      {chart.title}
                    </h3>
                    <p className="mt-1 text-xs text-gray-500 dark:text-zinc-400">
                      {chart.subtitle}
                    </p>
                    {chart.data.length ? (
                      <OverviewDonut data={chart.data} />
                    ) : (
                      <div className="flex h-[300px] items-center justify-center text-sm text-gray-400">
                        Nenhum agendamento classificado.
                      </div>
                    )}
                  </Card>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* ── ABA 1: VISÃO GERAL ── */}
      {activeTab === "visao_geral" && (
        <div className="space-y-6">
          {/* Cards de Estatísticas Principais */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
            <StatsCard
              title="Total de Leads"
              value={totalLeads}
              icon={<Users size={20} />}
              iconColor="bg-blue-100 text-blue-600"
              change={
                selectedClientId === "all"
                  ? "Todas as concessionárias"
                  : "Filtrado"
              }
              changeType="positive"
            />
            <StatsCard
              title="Agendamentos"
              value={leadsAgendados}
              icon={<Clock size={20} />}
              iconColor="bg-amber-100 text-amber-600"
            />
            <StatsCard
              title="Check-ins Realizados"
              value={leadsCheckin}
              icon={<UserCheck size={20} />}
              iconColor="bg-purple-100 text-purple-600"
              subtitle={`Taxa Comparecimento: ${taxaCheckinGeral}%`}
            />
            <StatsCard
              title="Vendas registradas"
              value={leadsConvertidos}
              icon={<CheckCircle2 size={20} />}
              iconColor="bg-emerald-100 text-emerald-600"
              subtitle={
                realSummary
                  ? `Receita: ${formatCurrency(realSummary.sales.revenue)}`
                  : undefined
              }
            />
            <StatsCard
              title="Conversão lead → venda"
              value={`${taxaConversao}%`}
              icon={<Target size={20} />}
              iconColor="bg-rose-100 text-rose-600"
            />
          </div>

          {/* Gráficos de Resultados */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Card className="lg:col-span-2">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-base font-bold text-gray-900 dark:text-zinc-100">
                    Funil operacional real
                  </h3>
                  <p className="text-xs text-gray-500 dark:text-zinc-400">
                    Agendamentos, check-ins e vendas registrados no sistema
                  </p>
                </div>
                <BarChart3 size={18} className="text-gray-400" />
              </div>

              <DeferredContent height={260} label="Carregando funil de vendas">
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={crmFunnelData} layout="vertical">
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke={chartAxisStroke}
                      vertical={false}
                    />
                    <XAxis
                      type="number"
                      tick={{ fontSize: 11, fill: chartTickFill }}
                      stroke={chartAxisStroke}
                    />
                    <YAxis
                      dataKey="stage"
                      type="category"
                      tick={{ fontSize: 11, fill: chartTickFill }}
                      width={100}
                      stroke={chartAxisStroke}
                    />
                    <Tooltip
                      contentStyle={{
                        ...chartTooltipStyle,
                        background: chartTooltipBg,
                      }}
                      formatter={(val: number | string) => [val, "Leads"]}
                    />
                    <Bar dataKey="quantidade" radius={[0, 6, 6, 0]}>
                      {crmFunnelData.map((entry, index) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={entry.color || "#FF0636"}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </DeferredContent>
            </Card>

            <Card>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-base font-bold text-gray-900 dark:text-zinc-100">
                    Origem dos Leads
                  </h3>
                  <p className="text-xs text-gray-500 dark:text-zinc-400">
                    Canais de aquisição de contatos
                  </p>
                </div>
                <TrendingUp size={18} className="text-gray-400" />
              </div>

              {sourcePieData.length > 0 ? (
                <DeferredContent
                  height={260}
                  label="Carregando origem dos leads"
                >
                  <ResponsiveContainer width="100%" height={260}>
                    <PieChart>
                      <Pie
                        data={sourcePieData}
                        cx="50%"
                        cy="50%"
                        innerRadius={55}
                        outerRadius={85}
                        paddingAngle={4}
                        dataKey="value"
                        label={({
                          name,
                          percent,
                        }: {
                          name: string;
                          percent: number;
                        }) => `${name} ${Math.round(percent * 100)}%`}
                        labelLine={false}
                      >
                        {sourcePieData.map((_, index) => (
                          <Cell
                            key={index}
                            fill={PIE_COLORS[index % PIE_COLORS.length]}
                          />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{
                          ...chartTooltipStyle,
                          background: chartTooltipBg,
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </DeferredContent>
              ) : (
                <div className="h-[260px] flex items-center justify-center text-xs text-gray-400">
                  Nenhum dado disponível para os filtros selecionados
                </div>
              )}
            </Card>
          </div>

          {/* Tabela Resumo dos Leads Filtrados */}
          <Card>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-base font-bold text-gray-900 dark:text-zinc-100">
                  Resumo dos Leads Atendidos ({reportTotal})
                </h3>
                <p className="text-xs text-gray-500 dark:text-zinc-400">
                  Visualização detalhada dos contatos filtrados por Cliente e
                  Evento
                </p>
              </div>
              <button
                onClick={exportOperationalReport}
                disabled={isExporting}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-gray-100 hover:bg-gray-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-gray-700 dark:text-zinc-200 transition-colors"
              >
                <Download size={14} />
                <span>
                  {isExporting ? "Exportando..." : "Exportar Relatório"}
                </span>
              </button>
            </div>

            {exportError && (
              <p className="mb-4 text-xs font-medium text-red-600 dark:text-red-400">
                {exportError}
              </p>
            )}

            {reportTotal === 0 ? (
              <div className="py-12 text-center text-sm text-gray-500 dark:text-zinc-400">
                Nenhum lead encontrado para a combinação de filtros selecionada.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-gray-100 dark:border-zinc-800 text-gray-500 dark:text-zinc-400 font-semibold uppercase tracking-wider">
                      <th className="pb-3 px-3">Lead</th>
                      <th className="pb-3 px-3">Telefone</th>
                      <th className="pb-3 px-3">Concessionária</th>
                      <th className="pb-3 px-3">Origem</th>
                      <th className="pb-3 px-3">Etapa CRM</th>
                      <th className="pb-3 px-3">Data</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50 dark:divide-zinc-800/60">
                    {operationalTableRows.map((l) => {
                      return (
                        <tr
                          key={l.id}
                          className="hover:bg-gray-50/50 dark:hover:bg-zinc-900/50 transition-colors"
                        >
                          <td className="py-3 px-3 font-semibold text-gray-900 dark:text-zinc-100">
                            {l.name}
                          </td>
                          <td className="py-3 px-3 text-gray-600 dark:text-zinc-400 font-mono">
                            {l.phone}
                          </td>
                          <td className="py-3 px-3 text-gray-700 dark:text-zinc-300 font-medium">
                            {l.clientName}
                          </td>
                          <td className="py-3 px-3 text-gray-600 dark:text-zinc-400 font-medium">
                            <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] bg-gray-100 dark:bg-zinc-800 text-gray-700 dark:text-zinc-300">
                              {l.sourceLabel}
                            </span>
                          </td>
                          <td className="py-3 px-3">
                            <span
                              className={clsx(
                                "inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider",
                                l.stageCode.toLowerCase().includes("convert") ||
                                  l.stageCode.toLowerCase().includes("vend")
                                  ? "bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-900"
                                  : l.stageCode
                                        .toLowerCase()
                                        .includes("agend") ||
                                      l.stageCode
                                        .toLowerCase()
                                        .includes("checkin")
                                    ? "bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-950/40 dark:text-blue-400 dark:border-blue-900"
                                    : "bg-gray-100 text-gray-700 border border-gray-200 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-700",
                              )}
                            >
                              {l.stageName}
                            </span>
                          </td>
                          <td className="py-3 px-3 text-gray-500 dark:text-zinc-400">
                            {new Date(l.createdAt).toLocaleDateString("pt-BR")}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Rodapé de Paginação */}
            {reportTotal > 0 && (
              <div className="mt-4 pt-4 border-t border-gray-100 dark:border-zinc-800 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs">
                <div className="text-gray-500 dark:text-zinc-400">
                  Exibindo{" "}
                  <span className="font-semibold text-gray-900 dark:text-zinc-100">
                    {startIndex + 1}
                  </span>{" "}
                  a{" "}
                  <span className="font-semibold text-gray-900 dark:text-zinc-100">
                    {endIndex}
                  </span>{" "}
                  de{" "}
                  <span className="font-semibold text-gray-900 dark:text-zinc-100">
                    {reportTotal}
                  </span>{" "}
                  leads
                </div>

                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2 text-gray-500 dark:text-zinc-400">
                    <span>Leads por página:</span>
                    <select
                      value={pageSize}
                      onChange={(e) => {
                        setPageSize(Number(e.target.value));
                        setCurrentPage(1);
                      }}
                      className={clsx(
                        "px-2 py-1 rounded-lg text-xs font-semibold border cursor-pointer focus:outline-none",
                        isDarkMode
                          ? "bg-zinc-900 border-zinc-700 text-zinc-100"
                          : "bg-white border-gray-200 text-gray-800",
                      )}
                    >
                      <option value={10}>10</option>
                      <option value={25}>25</option>
                      <option value={50}>50</option>
                      <option value={100}>100</option>
                    </select>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      disabled={currentPage === 1}
                      onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                      className="p-1.5 rounded-lg border border-gray-200 dark:border-zinc-700 text-gray-600 dark:text-zinc-300 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors"
                      title="Página Anterior"
                    >
                      <ChevronLeft size={15} />
                    </button>
                    <span className="px-2 font-semibold text-gray-700 dark:text-zinc-300">
                      Página {currentPage} de {totalPages}
                    </span>
                    <button
                      type="button"
                      disabled={currentPage >= totalPages}
                      onClick={() =>
                        setCurrentPage((p) => Math.min(totalPages, p + 1))
                      }
                      className="p-1.5 rounded-lg border border-gray-200 dark:border-zinc-700 text-gray-600 dark:text-zinc-300 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors"
                      title="Próxima Página"
                    >
                      <ChevronRight size={15} />
                    </button>
                  </div>
                </div>
              </div>
            )}
          </Card>
        </div>
      )}

      {/* ── ABA 2: EVENTO ── */}
      {activeTab === "evento" && (
        <div className="space-y-6">
          {/* Cards de Destaque / Campeões */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 rounded-2xl bg-gradient-to-r from-emerald-500/10 via-emerald-500/5 to-transparent border border-emerald-200 dark:border-emerald-900/50 flex items-center justify-between">
              <div className="space-y-1">
                <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                  <Trophy size={14} />
                  <span>Campeão de Vendas</span>
                </div>
                <h4 className="text-lg font-bold text-gray-900 dark:text-zinc-100">
                  {topSalesEvent
                    ? topSalesEvent.name
                    : "Nenhum evento registrado"}
                </h4>
                <p className="text-xs text-gray-500 dark:text-zinc-400">
                  {topSalesEvent
                    ? `${topSalesEvent.totalVendas} vendas concluídas (${topSalesEvent.salesProgressPercent}% da meta)`
                    : "Sem dados suficientes"}
                </p>
              </div>
              <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-bold text-xl">
                🏆
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-gradient-to-r from-purple-500/10 via-purple-500/5 to-transparent border border-purple-200 dark:border-purple-900/50 flex items-center justify-between">
              <div className="space-y-1">
                <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-purple-600 dark:text-purple-400">
                  <Users size={14} />
                  <span>Campeão de Público / Presença</span>
                </div>
                <h4 className="text-lg font-bold text-gray-900 dark:text-zinc-100">
                  {topAttendanceEvent
                    ? topAttendanceEvent.name
                    : "Nenhum evento registrado"}
                </h4>
                <p className="text-xs text-gray-500 dark:text-zinc-400">
                  {topAttendanceEvent
                    ? `${topAttendanceEvent.totalCheckins} pessoas no evento (${topAttendanceEvent.audienceProgressPercent}% do público alvo)`
                    : "Sem dados suficientes"}
                </p>
              </div>
              <div className="w-12 h-12 rounded-2xl bg-purple-500/10 text-purple-600 dark:text-purple-400 flex items-center justify-center font-bold text-xl">
                📍
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Card className="lg:col-span-2">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-base font-bold text-gray-900 dark:text-zinc-100">
                    Desempenho por Evento / Feirão
                  </h3>
                  <p className="text-xs text-gray-500 dark:text-zinc-400">
                    Comparativo de Leads, Presença (Pessoas/Check-ins) e Vendas
                  </p>
                </div>
                <Award size={18} className="text-gray-400" />
              </div>

              <DeferredContent
                height={300}
                label="Carregando desempenho por evento"
              >
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={eventMetrics}>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke={chartAxisStroke}
                      vertical={false}
                    />
                    <XAxis
                      dataKey="name"
                      tick={{ fontSize: 11, fill: chartTickFill }}
                      stroke={chartAxisStroke}
                    />
                    <YAxis
                      tick={{ fontSize: 11, fill: chartTickFill }}
                      stroke={chartAxisStroke}
                    />
                    <Tooltip
                      contentStyle={{
                        ...chartTooltipStyle,
                        background: chartTooltipBg,
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: "12px" }} />
                    <Bar
                      dataKey="totalLeads"
                      name="Leads Captados"
                      fill="#3b82f6"
                      radius={[4, 4, 0, 0]}
                    />
                    <Bar
                      dataKey="totalCheckins"
                      name="Pessoas / Check-ins"
                      fill="#8b5cf6"
                      radius={[4, 4, 0, 0]}
                    />
                    <Bar
                      dataKey="totalVendas"
                      name="Vendas Concluídas"
                      fill="#10b981"
                      radius={[4, 4, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </DeferredContent>
            </Card>

            <Card>
              <h3 className="text-base font-bold text-gray-900 dark:text-zinc-100 mb-1">
                Atingimento de Metas (Pessoas & Vendas)
              </h3>
              <p className="text-xs text-gray-500 dark:text-zinc-400 mb-4">
                Progresso comparativo das metas de público e metas comerciais
              </p>

              <div className="space-y-5">
                {eventMetrics.slice(0, 4).map((ev) => (
                  <div
                    key={ev.id}
                    className="space-y-2 border-b border-gray-100 dark:border-zinc-800/80 pb-3 last:border-none last:pb-0"
                  >
                    <span className="text-xs font-bold text-gray-900 dark:text-zinc-100 block">
                      {ev.name}
                    </span>

                    {/* Meta de Público */}
                    <div className="space-y-1">
                      <div className="flex justify-between text-[11px]">
                        <span className="text-gray-500 dark:text-zinc-400">
                          Público (Pessoas):
                        </span>
                        <span className="text-purple-600 font-semibold">
                          {ev.totalCheckins} / {ev.audienceTarget || 0} (
                          {ev.audienceProgressPercent}%)
                        </span>
                      </div>
                      <div className="w-full bg-gray-100 dark:bg-zinc-800 h-1.5 rounded-full overflow-hidden">
                        <div
                          className="bg-purple-500 h-full rounded-full transition-all duration-300"
                          style={{ width: `${ev.audienceProgressPercent}%` }}
                        />
                      </div>
                    </div>

                    {/* Meta de Vendas */}
                    <div className="space-y-1">
                      <div className="flex justify-between text-[11px]">
                        <span className="text-gray-500 dark:text-zinc-400">
                          Vendas:
                        </span>
                        <span className="text-emerald-600 font-semibold">
                          {ev.totalVendas} / {ev.salesTarget || 0} (
                          {ev.salesProgressPercent}%)
                        </span>
                      </div>
                      <div className="w-full bg-gray-100 dark:bg-zinc-800 h-1.5 rounded-full overflow-hidden">
                        <div
                          className="bg-emerald-500 h-full rounded-full transition-all duration-300"
                          style={{ width: `${ev.salesProgressPercent}%` }}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </div>

          {/* Rankings de Vendedores e Equipes */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Ranking de Vendedores */}
            <Card>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-base font-bold text-gray-900 dark:text-zinc-100 flex items-center gap-2">
                    <Trophy size={18} className="text-amber-500" />
                    <span>Ranking de Vendedores</span>
                  </h3>
                  <p className="text-xs text-gray-500 dark:text-zinc-400">
                    Desempenho individual por vendas concluídas e check-ins
                    atendidos
                  </p>
                </div>
              </div>

              <div className="space-y-3">
                {rankedVendors.slice(0, 5).map((v, i) => (
                  <div
                    key={v.id}
                    className="flex items-center justify-between p-3 rounded-xl bg-gray-50 dark:bg-zinc-900/60 border border-gray-100 dark:border-zinc-800/80 hover:border-gray-200 dark:hover:border-zinc-700 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className={clsx(
                          "w-7 h-7 rounded-full flex items-center justify-center text-xs font-black shadow-sm",
                          i === 0
                            ? "bg-amber-100 text-amber-800 border border-amber-300 dark:bg-amber-950/80 dark:text-amber-300"
                            : i === 1
                              ? "bg-gray-200 text-gray-800 border border-gray-300 dark:bg-zinc-800 dark:text-zinc-200"
                              : i === 2
                                ? "bg-amber-900/20 text-amber-700 border border-amber-800/30 dark:bg-amber-950/40 dark:text-amber-500"
                                : "bg-gray-100 text-gray-600 dark:bg-zinc-800/60 dark:text-zinc-400",
                        )}
                      >
                        #{i + 1}
                      </span>
                      <div>
                        <h4 className="text-xs font-bold text-gray-900 dark:text-zinc-100">
                          {v.name}
                        </h4>
                        <p className="text-[11px] text-gray-500 dark:text-zinc-400">
                          {v.checkins} check-ins • {v.leads} leads
                        </p>
                      </div>
                    </div>

                    <div className="text-right">
                      <span className="text-sm font-black text-emerald-600 dark:text-emerald-400 block">
                        {v.sales} {v.sales === 1 ? "venda" : "vendas"}
                      </span>
                      <span className="text-[10px] font-semibold text-gray-400 dark:text-zinc-500">
                        {v.leads > 0
                          ? `${Math.round((v.sales / v.leads) * 100)}% conv.`
                          : "0% conv."}
                      </span>
                    </div>
                  </div>
                ))}
                {rankedVendors.length === 0 && (
                  <div className="py-10 text-center text-xs text-gray-500 dark:text-zinc-400">
                    Selecione um evento com atendimentos registrados para ver o
                    ranking real de vendedores.
                  </div>
                )}
              </div>
            </Card>

            {/* Ranking de Equipes / Times */}
            <Card>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-base font-bold text-gray-900 dark:text-zinc-100 flex items-center gap-2">
                    <Shield size={18} className="text-blue-500" />
                    <span>Ranking de Equipes / Times</span>
                  </h3>
                  <p className="text-xs text-gray-500 dark:text-zinc-400">
                    Produtividade consolidada dos times comerciais no evento
                  </p>
                </div>
              </div>

              <div className="space-y-3">
                {rankedTeams.map((team, i) => (
                  <div
                    key={team.id}
                    className="flex items-center justify-between p-3 rounded-xl bg-gray-50 dark:bg-zinc-900/60 border border-gray-100 dark:border-zinc-800/80 hover:border-gray-200 dark:hover:border-zinc-700 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className={clsx(
                          "w-7 h-7 rounded-full flex items-center justify-center text-xs font-black shadow-sm",
                          i === 0
                            ? "bg-blue-100 text-blue-800 border border-blue-300 dark:bg-blue-950/80 dark:text-blue-300"
                            : "bg-gray-100 text-gray-600 dark:bg-zinc-800/60 dark:text-zinc-400",
                        )}
                      >
                        #{i + 1}
                      </span>
                      <div>
                        <h4 className="text-xs font-bold text-gray-900 dark:text-zinc-100">
                          {team.name}
                        </h4>
                        <p className="text-[11px] text-gray-500 dark:text-zinc-400">
                          {team.leads} agendamentos • {team.checkins} presenças
                        </p>
                      </div>
                    </div>

                    <div className="text-right">
                      <span className="text-sm font-black text-emerald-600 dark:text-emerald-400 block">
                        {team.sales} vendas
                      </span>
                      <span className="text-[10px] font-bold text-blue-600 dark:text-blue-400">
                        {team.leads > 0
                          ? `${Math.round((team.sales / team.leads) * 100)}% conv.`
                          : "0% conv."}
                      </span>
                    </div>
                  </div>
                ))}
                {rankedTeams.length === 0 && (
                  <div className="py-10 text-center text-xs text-gray-500 dark:text-zinc-400">
                    Selecione um evento com equipes registradas para ver o
                    ranking real dos times.
                  </div>
                )}
              </div>
            </Card>
          </div>

          {/* Tabela de Eventos */}
          <Card>
            <h3 className="text-base font-bold text-gray-900 dark:text-zinc-100 mb-4">
              Métricas Detalhadas por Evento
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-gray-100 dark:border-zinc-800 text-gray-500 dark:text-zinc-400 font-semibold uppercase tracking-wider">
                    <th className="pb-3 px-3">Evento</th>
                    <th className="pb-3 px-3">Data</th>
                    <th className="pb-3 px-3">Valor Investido</th>
                    <th className="pb-3 px-3">Leads Total</th>
                    <th className="pb-3 px-3">Check-ins</th>
                    <th className="pb-3 px-3">Taxa Check-in</th>
                    <th className="pb-3 px-3">Quantas Compraram</th>
                    <th className="pb-3 px-3">Valor Total Vendas</th>
                    <th className="pb-3 px-3">CAC</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 dark:divide-zinc-800/60">
                  {eventMetrics.map((ev) => (
                    <tr
                      key={ev.id}
                      className="hover:bg-gray-50/50 dark:hover:bg-zinc-900/50"
                    >
                      <td
                        className="py-3 px-3 font-semibold text-gray-900 dark:text-zinc-100"
                        title={ev.name}
                      >
                        {ev.nomeResumido}
                      </td>
                      <td className="py-3 px-3 text-gray-600 dark:text-zinc-400 font-mono">
                        {new Date(ev.event_date).toLocaleDateString("pt-BR")}
                      </td>
                      <td className="py-3 px-3 text-amber-600 dark:text-amber-400 font-semibold font-mono">
                        {formatCurrency(ev.valorInvestido)}
                      </td>
                      <td className="py-3 px-3 font-bold text-gray-800 dark:text-zinc-200">
                        {ev.totalLeads}
                      </td>
                      <td className="py-3 px-3 text-purple-600 font-bold">
                        {ev.totalCheckins}
                      </td>
                      <td className="py-3 px-3 font-mono">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-purple-50 text-purple-700 border border-purple-200 dark:bg-purple-950/40 dark:text-purple-400 dark:border-purple-900">
                          {ev.taxaCheckin}%
                        </span>
                      </td>
                      <td className="py-3 px-3 text-emerald-600 font-bold">
                        {ev.totalVendas}
                      </td>
                      <td className="py-3 px-3 text-emerald-700 dark:text-emerald-400 font-bold font-mono">
                        {formatCurrency(ev.valorTotalVendas)}
                      </td>
                      <td className="py-3 px-3 font-mono">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-950/40 dark:text-blue-400 dark:border-blue-900">
                          {ev.cac > 0 ? formatCurrency(ev.cac) : "—"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {/* ── ABA 3: CAMPANHAS ── */}
      {activeTab === "campanhas" && (
        <div className="space-y-6">
          {selectedEventId === "all" && (
            <Card className="text-sm text-gray-600 dark:text-zinc-300">
              Selecione um evento para visualizar somente as campanhas Meta
              vinculadas a ele, sem misturar investimento de outros eventos.
            </Card>
          )}
          {/* Summary KPI Cards da Aba Campanhas */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
            <StatsCard
              title="Investimento Total (Ads)"
              value={formatCurrency(campaignTotals.investido)}
              icon={<TrendingUp size={20} />}
              subtitle="Meta Ads"
              iconColor="bg-amber-100 text-amber-600 dark:bg-amber-950/60 dark:text-amber-400"
            />
            <StatsCard
              title="Leads importados"
              value={formatNumber(campaignTotals.leadsCount)}
              icon={<Users size={20} />}
              subtitle={`${formatNumber(campaignTotals.metaLeadsCount)} reportados pela Meta`}
              iconColor="bg-blue-100 text-blue-600 dark:bg-blue-950/60 dark:text-blue-400"
            />
            <StatsCard
              title="CPL do sistema"
              value={formatCurrency(campaignTotals.cplMedio)}
              icon={<Target size={20} />}
              subtitle="Investimento ÷ leads importados"
              iconColor="bg-rose-100 text-rose-600 dark:bg-rose-950/60 dark:text-rose-400"
            />
            <StatsCard
              title="CPL reportado pela Meta"
              value={formatCurrency(campaignTotals.metaCplMedio)}
              icon={<Target size={20} />}
              subtitle="Investimento ÷ leads da Meta"
              iconColor="bg-violet-100 text-violet-600 dark:bg-violet-950/60 dark:text-violet-400"
            />
            <StatsCard
              title="Conversas de WhatsApp"
              value={formatNumber(campaignTotals.conversasCount)}
              icon={<Megaphone size={20} />}
              subtitle="Iniciadas"
              iconColor="bg-emerald-100 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400"
            />
          </div>

          {executiveReport?.data_quality?.warnings?.length ? (
            <Card className="border-amber-200 bg-amber-50/80 dark:border-amber-900/60 dark:bg-amber-950/20">
              <div className="flex items-start gap-3">
                <Shield
                  size={20}
                  className="mt-0.5 shrink-0 text-amber-600 dark:text-amber-400"
                />
                <div>
                  <h3 className="text-sm font-bold text-amber-950 dark:text-amber-100">
                    Notas de qualidade dos dados
                  </h3>
                  <ul className="mt-2 space-y-1 text-xs text-amber-900/80 dark:text-amber-200/80">
                    {executiveReport.data_quality.warnings.map((warning) => (
                      <li key={warning}>• {warning}</li>
                    ))}
                  </ul>
                  <p className="mt-2 text-[11px] font-semibold text-amber-800 dark:text-amber-300">
                    Cobertura de atribuição:{" "}
                    {formatNumber(
                      executiveReport.attribution_coverage.attributed_leads,
                    )}{" "}
                    de{" "}
                    {formatNumber(
                      executiveReport.attribution_coverage.total_leads,
                    )}{" "}
                    leads.
                  </p>
                </div>
              </div>
            </Card>
          ) : null}

          {/* Tabela Hierárquica de Campanhas */}
          <Card>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 border-b border-gray-100 dark:border-zinc-800/80 pb-3">
              <div>
                <h3 className="text-base font-bold text-gray-900 dark:text-zinc-100 flex items-center gap-2">
                  <Megaphone size={18} className="text-[#FF0636]" />
                  <span>Desempenho Hierárquico de Campanhas Meta Ads</span>
                </h3>
                <p className="text-xs text-gray-500 dark:text-zinc-400">
                  {executiveReport
                    ? `Período: ${new Date(executiveReport.attribution_period.from).toLocaleDateString("pt-BR")} a ${new Date(executiveReport.attribution_period.to).toLocaleDateString("pt-BR")}`
                    : "Selecione um evento para carregar os dados sincronizados"}
                </p>
              </div>

              {/* Botões de Ação Rápida */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={expandAllCampaigns}
                  className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-gray-100 hover:bg-gray-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-gray-700 dark:text-zinc-300 transition-colors"
                >
                  Expandir Tudo
                </button>
                <button
                  type="button"
                  onClick={collapseAllCampaigns}
                  className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-gray-100 hover:bg-gray-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-gray-700 dark:text-zinc-300 transition-colors"
                >
                  Recolher Tudo
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              {selectedEventId !== "all" && campaignTreeData.length === 0 && (
                <div className="py-10 text-center text-sm text-gray-500 dark:text-zinc-400">
                  Nenhuma campanha Meta vinculada ou sincronizada para este
                  evento.
                </div>
              )}
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-gray-100 dark:border-zinc-800 text-gray-500 dark:text-zinc-400 font-semibold uppercase tracking-wider">
                    <th className="pb-3 px-3">
                      Nome (Campanha / Conjunto / Anúncio)
                    </th>
                    <th className="pb-3 px-3 text-right">Valor Investido</th>
                    <th className="pb-3 px-3 text-right">Quantidade Leads</th>
                    <th className="pb-3 px-3 text-right">CPL sistema</th>
                    <th className="pb-3 px-3 text-right">Impressões</th>
                    <th className="pb-3 px-3 text-right">Nº Conversas</th>
                    <th className="pb-3 px-3 text-right">Custo / Conversa</th>
                    <th className="pb-3 px-3 text-right">
                      Alcance (soma diária)
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-zinc-800/60">
                  {campaignTreeData.map((camp) => {
                    const isCampExpanded = !!expandedCampaigns[camp.id];

                    return (
                      <Fragment key={camp.id}>
                        {/* ── NÍVEL 1: CAMPANHA ── */}
                        <tr
                          onClick={() => toggleCampaign(camp.id)}
                          className="hover:bg-gray-100/70 dark:hover:bg-zinc-800/80 bg-gray-50/80 dark:bg-zinc-900/60 cursor-pointer font-semibold transition-colors"
                        >
                          <td className="py-3 px-3 flex items-center gap-2 text-gray-900 dark:text-zinc-100">
                            <span className="text-gray-400">
                              {isCampExpanded ? (
                                <ChevronDown size={16} />
                              ) : (
                                <ChevronRight size={16} />
                              )}
                            </span>
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-extrabold uppercase bg-rose-100 text-[#FF0636] dark:bg-rose-950/60 dark:text-rose-400">
                              Campanha
                            </span>
                            <span>{camp.name}</span>
                          </td>
                          <td className="py-3 px-3 text-right text-amber-600 dark:text-amber-400 font-bold font-mono">
                            {formatCurrency(camp.valorInvestido)}
                          </td>
                          <td className="py-3 px-3 text-right font-bold text-gray-800 dark:text-zinc-200">
                            {camp.quantidadeLeads}
                          </td>
                          <td className="py-3 px-3 text-right text-rose-600 dark:text-rose-400 font-bold font-mono">
                            {formatCurrency(camp.custoPorLead)}
                          </td>
                          <td className="py-3 px-3 text-right text-gray-600 dark:text-zinc-400 font-mono">
                            {formatNumber(camp.impressoes)}
                          </td>
                          <td className="py-3 px-3 text-right text-blue-600 font-bold">
                            {camp.numeroConversas}
                          </td>
                          <td className="py-3 px-3 text-right text-blue-700 dark:text-blue-400 font-mono">
                            {formatCurrency(camp.custoConversasIniciadas)}
                          </td>
                          <td className="py-3 px-3 text-right text-gray-600 dark:text-zinc-400 font-mono">
                            {formatNumber(camp.contasAlcancadas)}
                          </td>
                        </tr>

                        {/* ── NÍVEL 2: CONJUNTOS DE ANÚNCIOS (AD SETS) ── */}
                        {isCampExpanded &&
                          camp.adSets.map((adSet) => {
                            const isAdSetExpanded = !!expandedAdSets[adSet.id];

                            return (
                              <Fragment key={adSet.id}>
                                <tr
                                  onClick={() => toggleAdSet(adSet.id)}
                                  className="hover:bg-gray-100/40 dark:hover:bg-zinc-800/50 bg-white dark:bg-zinc-950/40 cursor-pointer text-xs transition-colors"
                                >
                                  <td className="py-2.5 px-3 pl-8 flex items-center gap-2 text-gray-800 dark:text-zinc-200">
                                    <span className="text-gray-400">
                                      {isAdSetExpanded ? (
                                        <ChevronDown size={14} />
                                      ) : (
                                        <ChevronRight size={14} />
                                      )}
                                    </span>
                                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold uppercase bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-400">
                                      Conjunto
                                    </span>
                                    <span>{adSet.name}</span>
                                  </td>
                                  <td className="py-2.5 px-3 text-right text-amber-600 dark:text-amber-400 font-mono">
                                    {formatCurrency(adSet.valorInvestido)}
                                  </td>
                                  <td className="py-2.5 px-3 text-right font-semibold text-gray-800 dark:text-zinc-200">
                                    {adSet.quantidadeLeads}
                                  </td>
                                  <td className="py-2.5 px-3 text-right text-rose-600 dark:text-rose-400 font-mono">
                                    {formatCurrency(adSet.custoPorLead)}
                                  </td>
                                  <td className="py-2.5 px-3 text-right text-gray-500 font-mono">
                                    {formatNumber(adSet.impressoes)}
                                  </td>
                                  <td className="py-2.5 px-3 text-right text-blue-600 font-semibold">
                                    {adSet.numeroConversas}
                                  </td>
                                  <td className="py-2.5 px-3 text-right text-blue-700 dark:text-blue-400 font-mono">
                                    {formatCurrency(
                                      adSet.custoConversasIniciadas,
                                    )}
                                  </td>
                                  <td className="py-2.5 px-3 text-right text-gray-500 font-mono">
                                    {formatNumber(adSet.contasAlcancadas)}
                                  </td>
                                </tr>

                                {/* ── NÍVEL 3: ANÚNCIOS INDIVIDUAIS (ADS) ── */}
                                {isAdSetExpanded &&
                                  adSet.ads.map((ad) => (
                                    <tr
                                      key={ad.id}
                                      className="hover:bg-gray-50 dark:hover:bg-zinc-900/30 bg-gray-50/20 dark:bg-zinc-950/20 text-xs text-gray-600 dark:text-zinc-400"
                                    >
                                      <td className="py-2 px-3 pl-14 flex items-center gap-2">
                                        <span className="w-1.5 h-1.5 rounded-full bg-gray-400" />
                                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-100 text-gray-600 dark:bg-zinc-800 dark:text-zinc-400">
                                          Anúncio
                                        </span>
                                        <span>{ad.name}</span>
                                      </td>
                                      <td className="py-2 px-3 text-right font-mono">
                                        {formatCurrency(ad.valorInvestido)}
                                      </td>
                                      <td className="py-2 px-3 text-right font-medium text-gray-700 dark:text-zinc-300">
                                        {ad.quantidadeLeads}
                                      </td>
                                      <td className="py-2 px-3 text-right font-mono text-rose-600 dark:text-rose-400">
                                        {formatCurrency(ad.custoPorLead)}
                                      </td>
                                      <td className="py-2 px-3 text-right font-mono">
                                        {formatNumber(ad.impressoes)}
                                      </td>
                                      <td className="py-2 px-3 text-right text-blue-600 font-medium">
                                        {ad.numeroConversas}
                                      </td>
                                      <td className="py-2 px-3 text-right font-mono">
                                        {formatCurrency(
                                          ad.custoConversasIniciadas,
                                        )}
                                      </td>
                                      <td className="py-2 px-3 text-right font-mono">
                                        {formatNumber(ad.contasAlcancadas)}
                                      </td>
                                    </tr>
                                  ))}
                              </Fragment>
                            );
                          })}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {/* ── ABA 4: CAMPANHA X EVENTO ── */}
      {activeTab === "campanha_x_evento" && (
        <div className="space-y-6">
          {selectedEventId === "all" && (
            <Card className="text-sm text-gray-600 dark:text-zinc-300">
              Selecione um evento para cruzar suas campanhas vinculadas com
              agendamentos e vendas atribuídos.
            </Card>
          )}
          {/* KPI Summary Cards para Atribuição Cruzada */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatsCard
              title="Custo Por Agendamento Médio"
              value={formatCurrency(crossTotals.custoAgendamentoMedio)}
              icon={<Target size={20} />}
              subtitle="CPAgendamento Médio"
              iconColor="bg-rose-100 text-rose-600 dark:bg-rose-950/60 dark:text-rose-400"
            />
            <StatsCard
              title="Taxa Conversão (Venda / Agend.)"
              value={`${crossTotals.taxaConversaoAgendamentoGlobal}%`}
              icon={<TrendingUp size={20} />}
              subtitle="Qtd Venda / Agendamento"
              iconColor="bg-emerald-100 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400"
            />
            <StatsCard
              title="Agendamentos Totais"
              value={formatNumber(crossTotals.agendados)}
              icon={<Calendar size={20} />}
              subtitle="Leads Agendados"
              iconColor="bg-purple-100 text-purple-600 dark:bg-purple-950/60 dark:text-purple-400"
            />
            <StatsCard
              title="Vendas Concluídas"
              value={formatNumber(crossTotals.vendas)}
              icon={<CheckCircle2 size={20} />}
              subtitle="Conversões Finais"
              iconColor="bg-blue-100 text-blue-600 dark:bg-blue-950/60 dark:text-blue-400"
            />
          </div>

          <Card>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-base font-bold text-gray-900 dark:text-zinc-100">
                  Matriz Cruzada: Campanha de Origem x Eventos Atribuídos
                </h3>
                <p className="text-xs text-gray-500 dark:text-zinc-400">
                  Cruzamento direto entre o canal de origem do lead, o volume de
                  agendamentos e o custo por agendamento
                </p>
              </div>
              <GitCompare size={18} className="text-[#FF0636]" />
            </div>

            <DeferredContent
              height={300}
              label="Carregando matriz por campanha"
            >
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={campaignEventCrossData}>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke={chartAxisStroke}
                    vertical={false}
                  />
                  <XAxis
                    dataKey="campanhaNome"
                    tick={{ fontSize: 11, fill: chartTickFill }}
                    stroke={chartAxisStroke}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: chartTickFill }}
                    stroke={chartAxisStroke}
                  />
                  <Tooltip
                    contentStyle={{
                      ...chartTooltipStyle,
                      background: chartTooltipBg,
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: "12px" }} />
                  <Bar
                    dataKey="metaLeads"
                    name="Leads reportados pela Meta"
                    fill="#FF0636"
                    stackId="a"
                  />
                  <Bar
                    dataKey="totalLeads"
                    name="Leads importados"
                    fill="#3b82f6"
                    stackId="a"
                  />
                  <Bar
                    dataKey="agendados"
                    name="Agendamentos"
                    fill="#8b5cf6"
                    stackId="a"
                  />
                  <Bar
                    dataKey="vendas"
                    name="Vendas Concluídas"
                    fill="#10b981"
                    stackId="a"
                    radius={[6, 6, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </DeferredContent>
          </Card>

          {/* Tabela de Matriz Cruzada */}
          <Card>
            <h3 className="text-base font-bold text-gray-900 dark:text-zinc-100 mb-4">
              Detalhamento de Eficiência: Campanha → Agendamento → Venda
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-gray-100 dark:border-zinc-800 text-gray-500 dark:text-zinc-400 font-semibold uppercase tracking-wider">
                    <th className="pb-3 px-3">Campanha / Evento</th>
                    <th className="pb-3 px-3 text-right">Leads Meta</th>
                    <th className="pb-3 px-3 text-right">Leads importados</th>
                    <th className="pb-3 px-3 text-right">Qtd Agendamentos</th>
                    <th className="pb-3 px-3 text-right">
                      Custo / Agendamento
                    </th>
                    <th className="pb-3 px-3 text-right">Vendas (Qtd)</th>
                    <th className="pb-3 px-3 text-right">
                      Taxa Conversão (Qtd / Agend.)
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 dark:divide-zinc-800/60">
                  {campaignEventCrossData.map((row) => (
                    <tr
                      key={row.campanhaId}
                      className="hover:bg-gray-50/50 dark:hover:bg-zinc-900/50"
                    >
                      <td className="py-3 px-3 font-semibold text-gray-900 dark:text-zinc-100">
                        <span className="block">{row.campanhaNome}</span>
                        <span className="block text-[10px] font-normal text-gray-500 dark:text-zinc-400">
                          {row.eventoNome}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-right text-rose-600 font-semibold">
                        {row.metaLeads}
                      </td>
                      <td className="py-3 px-3 text-right text-blue-600 font-semibold">
                        {row.totalLeads}
                      </td>
                      <td className="py-3 px-3 text-right font-bold text-purple-600">
                        {row.agendados}
                      </td>
                      <td className="py-3 px-3 text-right font-mono text-rose-600 dark:text-rose-400 font-bold">
                        {row.custoPorAgendamento > 0
                          ? formatCurrency(row.custoPorAgendamento)
                          : "—"}
                      </td>
                      <td className="py-3 px-3 text-right font-bold text-emerald-600">
                        {row.vendas}
                      </td>
                      <td className="py-3 px-3 text-right font-mono">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-900">
                          {row.taxaConversaoAgendamento}%
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
