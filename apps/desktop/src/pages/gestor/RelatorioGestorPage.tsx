import { useCallback, useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import { ChevronDown, ChevronRight, Megaphone } from "lucide-react";
import { API_BASE } from "../../services/http";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  LabelList,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { PageHeader } from "../../components/shared/PageHeader";
import type { Campaign, Client, Event, Lead, LeadSource } from "../../types";
import { readStoredSession } from "../../services/auth";
import { listClients, mapApiClientToClient } from "../../services/clients";
import {
  getMetaCampaignsReport,
  type MetaCampaignsReportItem,
} from "../../services/meta";
import {
  getCrmStageCounts,
  listCrmPipelines,
  listPipelineStages,
} from "../../services/crm";
import {
  apiStagesToColumns,
  defaultKanbanStages,
  pickDefaultPipeline,
  type KanbanColumn,
} from "../../lib/crm-kanban";
import {
  listCampaigns,
  mapApiCampaignToCampaign,
} from "../../services/campaigns";
import { listEvents, mapApiEventToEvent } from "../../services/events";
import { listLeads, mapApiLeadToLead } from "../../services/leads";
import { useGestorClient } from "../../hooks/useGestorClient";
import { useLeadRealtimeSync } from "../../hooks/useLeadRealtimeSync";
import { saveOrShareBlob } from "../../utils/nativeDownload";
import {
  DASHBOARD_DARK_CHANGE_EVENT,
  readDashboardDarkEnabled,
} from "../../lib/dashboard-dark-mode";

type AudienceType = "Segmentado" | "Amplo";

type ReportTabId = "cliente" | "eventos" | "campanhas";

type ReportRecord = {
  id: string;
  nome: string;
  campaign: string;
  content: string;
  term: string;
  audience: AudienceType;
};

type CampaignCost = {
  spend: number;
  results: number;
};

type ReportBase = {
  records: ReportRecord[];
  costs: Record<string, CampaignCost>;
  meta: {
    total: number;
    evento: string;
    fase: string;
  };
  budgetTotal: number;
};

const emptyReportBase: ReportBase = {
  records: [],
  costs: {},
  meta: { total: 0, evento: "", fase: "Presenca agendada" },
  budgetTotal: 20000,
};

type ApiDashboardReportResponse = {
  client: {
    id: string;
    company_name: string;
    plan: string;
    status: string;
  };
  meta: {
    total: number;
    evento: string;
    fase: string;
  };
  budget_total: number;
  records: ReportRecord[];
  costs: Record<string, CampaignCost>;
};

const cardClass =
  "report-card rounded-[28px] border border-white/90 bg-white/95 p-6 shadow-[0_16px_40px_rgba(15,23,42,0.06)]";

const reportSectionClass = "space-y-5";
const reportPanelClass =
  "report-panel rounded-[28px] border border-white/85 bg-white/95 p-5 shadow-[0_16px_40px_rgba(15,23,42,0.06)]";
const reportTableClass =
  "report-table overflow-hidden rounded-[24px] border border-[#eadfce] bg-white/95 shadow-[0_12px_32px_rgba(15,23,42,0.05)]";
const sourceLabels: Record<LeadSource, string> = {
  facebook_ads: "Facebook Ads",
  whatsapp: "WhatsApp",
  form_page: "Formulario",
  manual: "Manual",
  import_excel: "Importacao Excel",
};

const sourceAudienceMap: Record<LeadSource, AudienceType> = {
  facebook_ads: "Segmentado",
  whatsapp: "Amplo",
  form_page: "Segmentado",
  manual: "Amplo",
  import_excel: "Amplo",
};

const sourceTermLabelMap: Record<LeadSource, string> = {
  facebook_ads: "Campanha digital",
  whatsapp: "Base WhatsApp",
  form_page: "Landing page",
  manual: "Captacao manual",
  import_excel: "Planilha",
};

const reportTabs: Array<{ id: ReportTabId; label: string }> = [
  { id: "cliente", label: "Cliente" },
  { id: "eventos", label: "Eventos" },
  { id: "campanhas", label: "Campanhas" },
];

const stateCodes = [
  "AC",
  "AL",
  "AP",
  "AM",
  "BA",
  "CE",
  "DF",
  "ES",
  "GO",
  "MA",
  "MT",
  "MS",
  "MG",
  "PA",
  "PB",
  "PR",
  "PE",
  "PI",
  "RJ",
  "RN",
  "RS",
  "RO",
  "RR",
  "SC",
  "SP",
  "SE",
  "TO",
];

function formatBRL(value: number) {
  return `R$ ${value.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatPercent(value: number) {
  return `${value.toFixed(2)}%`;
}

function inferStateCode(value: string) {
  const upper = value.toUpperCase();
  const matched = stateCodes.find(
    (code) =>
      upper.includes(`-${code}`) ||
      upper.includes(`/${code}`) ||
      upper.includes(` ${code}`) ||
      upper.endsWith(code),
  );
  return matched ?? "SP";
}

function inferEventType(name: string) {
  const firstChunk = name.split(/[-|/]/)[0]?.trim();
  return firstChunk || "Evento";
}

function downloadCsv(filename: string, rows: string[][]) {
  const csv = rows
    .map((row) =>
      row
        .map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`)
        .join(","),
    )
    .join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  void saveOrShareBlob(blob, filename).catch((err) => {
    console.error("Falha ao exportar CSV", err);
  });
}

function getWeekRangeLabel(dateString: string) {
  const date = new Date(dateString);
  const day = date.getUTCDate();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const start = day <= 7 ? "01" : day <= 15 ? "08" : day <= 22 ? "16" : "23";
  const end = day <= 7 ? "07" : day <= 15 ? "15" : day <= 22 ? "22" : "30";
  return `${start} a ${end}/${month}`;
}

function shortCampaign(value: string) {
  return value.length > 44 ? `${value.slice(0, 44)}...` : value;
}

function getLeadDisplayName(lead: Lead) {
  return lead.name.trim();
}

function buildClientRecords(
  client: Client,
  allLeads: Lead[],
  clientCampaigns: Campaign[],
  clientEvents: Event[],
): ReportBase {
  const clientLeads = allLeads.filter((lead) => lead.client_id === client.id);

  const records: ReportRecord[] = clientLeads.map((lead, index) => {
    const fallbackCampaign =
      clientCampaigns.find((campaign) => campaign.sources.includes(lead.source))
        ?.name ??
      clientEvents.find((event) => event.id === lead.event_id)?.name ??
      `${client.company_name} · CRM`;

    const audience = sourceAudienceMap[lead.source];
    const primaryTag = lead.tags[0]
      ? lead.tags[0].replace(/_/g, " ")
      : "Padrao";
    const termSuffix = sourceTermLabelMap[lead.source];
    const createdRange = getWeekRangeLabel(lead.created_at);

    return {
      id: lead.id,
      nome: getLeadDisplayName(lead),
      campaign: fallbackCampaign,
      content: `${sourceLabels[lead.source]} - ${primaryTag} ${String((index % 4) + 1).padStart(2, "0")}`,
      term: `${createdRange} - ${audience} - ${termSuffix}`,
      audience,
    };
  });

  const campaignCounts = new Map<string, number>();
  records.forEach((record) => {
    campaignCounts.set(
      record.campaign,
      (campaignCounts.get(record.campaign) ?? 0) + 1,
    );
  });

  // Sem dados reais de investimento: não fabricar spend/orçamento (custo só vem da API/Meta).
  const costs = Object.fromEntries(
    Array.from(campaignCounts.entries()).map(([campaign, total]) => {
      return [campaign, { spend: 0, results: total }];
    }),
  ) as Record<string, CampaignCost>;

  return {
    records,
    costs,
    meta: {
      total: records.length,
      evento: client.company_name,
      fase: "Presenca agendada",
    },
    budgetTotal: 0,
  };
}

function normalizeApiReport(data: ApiDashboardReportResponse): ReportBase {
  return {
    records: data.records,
    costs: data.costs,
    meta: data.meta,
    budgetTotal: data.budget_total,
  };
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
  dark,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ label: string; value: string }>;
  dark?: boolean;
}) {
  const resolvedDark =
    dark ??
    (typeof document !== "undefined" &&
      document.body.classList.contains("dashboard-dark-active"));
  return (
    <div>
      <label
        className={clsx(
          "mr-1.5 text-[13px]",
          resolvedDark ? "text-zinc-400" : "text-zinc-500",
        )}
      >
        {label}
      </label>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={clsx(
          "min-w-[180px] cursor-pointer rounded-[12px] border px-3 py-2 text-[13px] outline-none transition-colors focus:border-[#E51838]",
          resolvedDark
            ? "border-zinc-700 bg-[#111111] text-zinc-100"
            : "border-zinc-200 bg-white text-zinc-800",
        )}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function OverviewMetricCard({
  label,
  value,
  helper,
  valueClassName,
  dark,
}: {
  label: string;
  value: string;
  helper: string;
  valueClassName: string;
  dark?: boolean;
}) {
  const resolvedDark =
    dark ??
    (typeof document !== "undefined" &&
      document.body.classList.contains("dashboard-dark-active"));
  return (
    <div
      className={clsx(
        "rounded-[24px] border px-5 py-5 shadow-[0_14px_34px_rgba(15,23,42,0.06)]",
        resolvedDark
          ? "border-zinc-700 bg-[#111111]"
          : "border-white/85 bg-white/95",
      )}
    >
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-400">
        {label}
      </p>
      <p
        className={`mt-2 text-[22px] font-black tracking-tight ${valueClassName}`}
      >
        {value}
      </p>
      <p
        className={clsx(
          "mt-1 text-sm",
          resolvedDark ? "text-zinc-400" : "text-zinc-500",
        )}
      >
        {helper}
      </p>
    </div>
  );
}

type MetaMetricRow = {
  id: string;
  name: string;
  spend: number;
  leads: number;
  cost_per_lead: number;
  impressions: number;
  conversations: number;
  cost_per_conversation: number;
  reach: number;
};

function MetaMetricCells({ row }: { row: MetaMetricRow }) {
  return (
    <>
      <td className="px-4 py-3">{formatBRL(row.spend)}</td>
      <td className="px-4 py-3">{row.leads.toLocaleString("pt-BR")}</td>
      <td className="px-4 py-3">{formatBRL(row.cost_per_lead)}</td>
      <td className="px-4 py-3">{row.impressions.toLocaleString("pt-BR")}</td>
      <td className="px-4 py-3">{row.conversations.toLocaleString("pt-BR")}</td>
      <td className="px-4 py-3">{formatBRL(row.cost_per_conversation)}</td>
      <td className="px-4 py-3">{row.reach.toLocaleString("pt-BR")}</td>
    </>
  );
}

function FragmentCampaignRow({
  campaign,
  expanded,
  onToggle,
  expandedAdSetIds,
  onToggleAdSet,
  isDarkMode,
}: {
  campaign: MetaCampaignsReportItem;
  expanded: boolean;
  onToggle: () => void;
  expandedAdSetIds: Set<string>;
  onToggleAdSet: (adSetId: string) => void;
  isDarkMode: boolean;
}) {
  const rowTextClass = isDarkMode ? "text-zinc-200" : "text-zinc-800";
  return (
    <>
      <tr
        className={clsx(
          "cursor-pointer border-t border-[#f0e7db] font-semibold",
          rowTextClass,
        )}
        onClick={onToggle}
      >
        <td className="px-4 py-3">
          <span className="flex items-center gap-2">
            {campaign.ad_sets.length > 0 ? (
              expanded ? (
                <ChevronDown size={16} className="text-zinc-400" />
              ) : (
                <ChevronRight size={16} className="text-zinc-400" />
              )
            ) : (
              <Megaphone size={14} className="text-zinc-400" />
            )}
            {campaign.name}
          </span>
        </td>
        <MetaMetricCells row={campaign} />
      </tr>
      {expanded &&
        campaign.ad_sets.map((adSet) => (
          <FragmentAdSetRow
            key={adSet.id}
            adSet={adSet}
            expanded={expandedAdSetIds.has(adSet.id)}
            onToggle={() => onToggleAdSet(adSet.id)}
            isDarkMode={isDarkMode}
          />
        ))}
    </>
  );
}

function FragmentAdSetRow({
  adSet,
  expanded,
  onToggle,
  isDarkMode,
}: {
  adSet: MetaCampaignsReportItem["ad_sets"][number];
  expanded: boolean;
  onToggle: () => void;
  isDarkMode: boolean;
}) {
  const rowTextClass = isDarkMode ? "text-zinc-300" : "text-zinc-700";
  return (
    <>
      <tr
        className={clsx(
          "cursor-pointer border-t border-[#f0e7db]/70",
          rowTextClass,
        )}
        onClick={onToggle}
      >
        <td className="px-4 py-3 pl-9">
          <span className="flex items-center gap-2">
            {adSet.ads.length > 0 ? (
              expanded ? (
                <ChevronDown size={15} className="text-zinc-400" />
              ) : (
                <ChevronRight size={15} className="text-zinc-400" />
              )
            ) : (
              <span className="inline-block w-[15px]" />
            )}
            {adSet.name}
          </span>
        </td>
        <MetaMetricCells row={adSet} />
      </tr>
      {expanded &&
        adSet.ads.map((ad) => (
          <tr
            key={ad.id}
            className={clsx(
              "border-t border-[#f0e7db]/50 text-sm",
              isDarkMode ? "text-zinc-400" : "text-zinc-600",
            )}
          >
            <td className="px-4 py-3 pl-16">{ad.name}</td>
            <MetaMetricCells row={ad} />
          </tr>
        ))}
    </>
  );
}

export function RelatorioGestorPage() {
  const { user, gestorClientId, setGestorClientId } = useGestorClient();
  const [isDarkMode, setIsDarkMode] = useState(() =>
    readDashboardDarkEnabled(user.id),
  );
  const [clients, setClients] = useState<Client[]>([]);
  const [allLeads, setAllLeads] = useState<Lead[]>([]);
  const [campaignsForClient, setCampaignsForClient] = useState<Campaign[]>([]);
  const [eventsForClient, setEventsForClient] = useState<Event[]>([]);
  const [activeTab, setActiveTab] = useState<ReportTabId>("cliente");
  const [selectedEventId, setSelectedEventId] = useState<string>("all");
  const [apiReports, setApiReports] = useState<Record<string, ReportBase>>({});
  const [loadError, setLoadError] = useState("");
  const [pipelineStages, setPipelineStages] = useState<KanbanColumn[]>([]);
  const [stageCounts, setStageCounts] = useState<Record<string, number>>({});
  const [metaCampaignsTree, setMetaCampaignsTree] = useState<
    MetaCampaignsReportItem[]
  >([]);
  const [metaConnected, setMetaConnected] = useState(false);
  const [expandedCampaignIds, setExpandedCampaignIds] = useState<Set<string>>(
    new Set(),
  );
  const [expandedAdSetIds, setExpandedAdSetIds] = useState<Set<string>>(
    new Set(),
  );
  const toggleCampaignExpanded = useCallback((campaignId: string) => {
    setExpandedCampaignIds((prev) => {
      const next = new Set(prev);
      if (next.has(campaignId)) {
        next.delete(campaignId);
      } else {
        next.add(campaignId);
      }
      return next;
    });
  }, []);
  const toggleAdSetExpanded = useCallback((adSetId: string) => {
    setExpandedAdSetIds((prev) => {
      const next = new Set(prev);
      if (next.has(adSetId)) {
        next.delete(adSetId);
      } else {
        next.add(adSetId);
      }
      return next;
    });
  }, []);
  const selectedClientId = gestorClientId;
  const chartGridColor = isDarkMode ? "#2a2a2a" : "#ebe4d8";
  const chartAxisColor = isDarkMode ? "#3f3f46" : "#c8b9a3";
  const chartTickColor = isDarkMode ? "#a1a1aa" : "#8c7d6a";
  const chartTooltipStyle = isDarkMode
    ? {
        backgroundColor: "#101010",
        borderColor: "#3f3f46",
        borderRadius: 16,
        color: "#f4f4f5",
      }
    : {
        backgroundColor: "#fffdf8",
        borderColor: "#eadfce",
        borderRadius: 16,
        color: "#18181b",
      };

  useEffect(() => {
    setIsDarkMode(readDashboardDarkEnabled(user.id));
  }, [user.id]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const syncTheme = () => {
      setIsDarkMode(readDashboardDarkEnabled(user.id));
    };

    syncTheme();
    window.addEventListener("storage", syncTheme);
    window.addEventListener("focus", syncTheme);
    window.addEventListener(DASHBOARD_DARK_CHANGE_EVENT, syncTheme);

    return () => {
      window.removeEventListener("storage", syncTheme);
      window.removeEventListener("focus", syncTheme);
      window.removeEventListener(DASHBOARD_DARK_CHANGE_EVENT, syncTheme);
    };
  }, [user.id]);

  useEffect(() => {
    const t = readStoredSession()?.accessToken;
    if (!t) return;
    void listClients(t)
      .then((rows) => {
        const mapped = rows.map(mapApiClientToClient);
        setClients(mapped);
        if (selectedClientId && mapped.some((c) => c.id === selectedClientId))
          return;
        if (mapped[0]?.id) {
          setGestorClientId(mapped[0].id);
        }
      })
      .catch(() =>
        setLoadError(
          "Não foi possível carregar a lista de clientes. Atualize a página.",
        ),
      );
  }, [selectedClientId, setGestorClientId]);

  const refreshAllLeads = useCallback(() => {
    const t = readStoredSession()?.accessToken;
    if (!t) return;
    void listLeads({}, t)
      .then((rows) => setAllLeads(rows.map(mapApiLeadToLead)))
      .catch(() =>
        setLoadError("Não foi possível carregar os leads. Atualize a página."),
      );
  }, []);

  useEffect(() => {
    refreshAllLeads();
  }, [refreshAllLeads]);

  useLeadRealtimeSync(selectedClientId, refreshAllLeads);

  useEffect(() => {
    const t = readStoredSession()?.accessToken;
    if (!t || !selectedClientId) return;
    void Promise.all([
      listCampaigns(selectedClientId, t),
      listEvents({ client_id: selectedClientId }, t),
    ])
      .then(([camps, evs]) => {
        setCampaignsForClient(camps.map(mapApiCampaignToCampaign));
        setEventsForClient(evs.map(mapApiEventToEvent));
      })
      .catch(() =>
        setLoadError(
          "Não foi possível carregar campanhas/eventos. Atualize a página.",
        ),
      );
  }, [selectedClientId]);

  useEffect(() => {
    const t = readStoredSession()?.accessToken;
    if (!t || !selectedClientId) {
      setPipelineStages([]);
      setStageCounts({});
      return;
    }

    let active = true;

    void (async () => {
      try {
        const pipelines = await listCrmPipelines(selectedClientId, t);
        const pipeline = pickDefaultPipeline(pipelines, selectedClientId);
        const stages = pipeline
          ? (pipeline.stages ?? (await listPipelineStages(pipeline.id, t)))
          : defaultKanbanStages();
        const countsResponse = await getCrmStageCounts(selectedClientId, t);
        if (!active) return;
        setPipelineStages(apiStagesToColumns(stages));
        setStageCounts(countsResponse.counts);
      } catch {
        if (!active) return;
        setPipelineStages([]);
        setStageCounts({});
      }
    })();

    return () => {
      active = false;
    };
  }, [selectedClientId]);

  useEffect(() => {
    const t = readStoredSession()?.accessToken;
    if (!t || !selectedClientId) {
      setMetaCampaignsTree([]);
      setMetaConnected(false);
      return;
    }

    let active = true;

    void getMetaCampaignsReport(selectedClientId, t)
      .then((response) => {
        if (!active) return;
        setMetaCampaignsTree(response.campaigns);
        setMetaConnected(response.connected);
      })
      .catch(() => {
        if (!active) return;
        setMetaCampaignsTree([]);
        setMetaConnected(false);
      });

    return () => {
      active = false;
    };
  }, [selectedClientId]);

  const selectedClient =
    clients.find((client) => client.id === selectedClientId) ?? clients[0];
  const selectedClientIdSafe = selectedClient?.id ?? "";
  const selectedClientAddress = selectedClient?.address ?? "";
  const selectedClientCompanyName = selectedClient?.company_name ?? "";
  const fallbackReport = useMemo(
    () =>
      selectedClient
        ? buildClientRecords(
            selectedClient,
            allLeads,
            campaignsForClient,
            eventsForClient,
          )
        : emptyReportBase,
    [selectedClient, allLeads, campaignsForClient, eventsForClient],
  );
  const reportBase = selectedClient
    ? (apiReports[selectedClient.id] ?? fallbackReport)
    : emptyReportBase;

  useEffect(() => {
    if (!selectedClient) return;
    if (apiReports[selectedClientIdSafe]) return;

    let active = true;
    const apiBase = API_BASE;

    async function loadReport() {
      if (!apiBase) return;
      try {
        const token = readStoredSession()?.accessToken;
        const response = await fetch(
          `${apiBase}/crm/reports/dashboard?client_id=${encodeURIComponent(selectedClientIdSafe)}`,
          token ? { headers: { Authorization: `Bearer ${token}` } } : undefined,
        );

        if (!response.ok) return;

        const data = (await response.json()) as ApiDashboardReportResponse;
        if (!active) return;

        setApiReports((current) => ({
          ...current,
          [selectedClientIdSafe]: normalizeApiReport(data),
        }));
      } catch {
        // fallback local
      }
    }

    void loadReport();

    return () => {
      active = false;
    };
  }, [apiReports, selectedClient, selectedClientIdSafe]);

  const filteredRecords = reportBase.records;

  const clientEvents = useMemo(() => eventsForClient, [eventsForClient]);

  const eventSummary = useMemo(() => {
    if (!selectedClient) {
      return { totalLeads: 0, confirmed: 0, checkedIn: 0, active: 0 };
    }
    const totalLeads = allLeads.filter(
      (lead) => lead.client_id === selectedClientIdSafe && lead.event_id,
    ).length;
    const confirmed = allLeads.filter(
      (lead) =>
        lead.client_id === selectedClientIdSafe &&
        lead.event_id &&
        (lead.confirmation_status === "confirmed" ||
          lead.confirmation_status === "checked_in"),
    ).length;
    const checkedIn = allLeads.filter(
      (lead) =>
        lead.client_id === selectedClientIdSafe &&
        lead.event_id &&
        lead.confirmation_status === "checked_in",
    ).length;
    const active = clientEvents.filter(
      (event) => event.status === "active",
    ).length;

    return { totalLeads, confirmed, checkedIn, active };
  }, [allLeads, clientEvents, selectedClient, selectedClientIdSafe]);

  const eventCards = clientEvents.map((event) => {
    const eventLeads = allLeads.filter((lead) => lead.event_id === event.id);
    const confirmed = eventLeads.filter(
      (lead) =>
        lead.confirmation_status === "confirmed" ||
        lead.confirmation_status === "checked_in",
    ).length;
    const checkedIn = eventLeads.filter(
      (lead) => lead.confirmation_status === "checked_in",
    ).length;
    const attendanceRate =
      confirmed > 0 ? Math.min(100, (checkedIn / confirmed) * 100) : 0;

    return {
      id: event.id,
      name: event.name,
      status: event.status,
      date: new Intl.DateTimeFormat("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        timeZone: "UTC",
      }).format(new Date(event.event_date)),
      location: event.location ?? "Local nao informado",
      leads: eventLeads.length,
      confirmed,
      checkedIn,
      attendanceRate,
      capacity: event.capacity ?? 0,
    };
  });

  const eventDashboardRows = useMemo(
    () =>
      clientEvents.map((event) => {
        const eventLeads = allLeads.filter(
          (lead) => lead.event_id === event.id,
        );
        const engaged = eventLeads.filter(
          (lead) => lead.crm_stage !== "novo" && lead.crm_stage !== "perdido",
        ).length;
        const agendados = eventLeads.filter(
          (lead) =>
            lead.crm_stage === "agendado" || lead.crm_stage === "convertido",
        ).length;
        const confirmados = eventLeads.filter(
          (lead) =>
            lead.confirmation_status === "confirmed" ||
            lead.confirmation_status === "checked_in",
        ).length;
        const checkedIn = eventLeads.filter(
          (lead) => lead.confirmation_status === "checked_in",
        ).length;
        const optOut = eventLeads.filter(
          (lead) => lead.crm_stage === "perdido",
        ).length;
        const ausentes = Math.max(confirmados - checkedIn, 0);
        const total = eventLeads.length;
        const engajPct = total > 0 ? (engaged / total) * 100 : 0;
        const taxaRubinhoEvento = engaged > 0 ? (agendados / engaged) * 100 : 0;

        return {
          id: event.id,
          name: event.name,
          tipo: inferEventType(event.name),
          uf: inferStateCode(
            `${event.location ?? ""} ${selectedClientAddress}`,
          ),
          total,
          engaged,
          agendados,
          confirmados,
          optOut,
          ausentes,
          engajPct,
          taxaRubinhoEvento,
          status: event.status,
        };
      }),
    [allLeads, clientEvents, selectedClientAddress],
  );

  useEffect(() => {
    if (
      selectedEventId !== "all" &&
      !eventDashboardRows.some((row) => row.id === selectedEventId)
    ) {
      setSelectedEventId("all");
    }
  }, [eventDashboardRows, selectedEventId]);

  const filteredEventDashboardRows = useMemo(
    () =>
      selectedEventId === "all"
        ? eventDashboardRows
        : eventDashboardRows.filter((row) => row.id === selectedEventId),
    [eventDashboardRows, selectedEventId],
  );

  const finishedEventsCount = useMemo(
    () => clientEvents.filter((event) => event.status === "completed").length,
    [clientEvents],
  );

  const overviewStats = useMemo(() => {
    const baseRecords = reportBase.records;
    const totalLeads = baseRecords.length;
    const engagedRubinho = allLeads.filter(
      (lead) =>
        lead.client_id === selectedClientIdSafe &&
        lead.crm_stage !== "novo" &&
        lead.crm_stage !== "perdido",
    ).length;
    const agendados = allLeads.filter(
      (lead) =>
        lead.client_id === selectedClientIdSafe &&
        (lead.crm_stage === "agendado" || lead.crm_stage === "convertido"),
    ).length;
    const confirmados = allLeads.filter(
      (lead) =>
        lead.client_id === selectedClientIdSafe &&
        (lead.confirmation_status === "confirmed" ||
          lead.confirmation_status === "checked_in"),
    ).length;
    const optOut = allLeads.filter(
      (lead) =>
        lead.client_id === selectedClientIdSafe && lead.crm_stage === "perdido",
    ).length;
    const optInMeta = allLeads.filter(
      (lead) =>
        lead.client_id === selectedClientIdSafe &&
        (lead.source === "facebook_ads" || lead.source === "form_page"),
    ).length;
    const desengajados = Math.max(totalLeads - engagedRubinho, 0);
    const engagedNotScheduled = Math.max(engagedRubinho - agendados, 0);
    const taxaRubinho =
      engagedRubinho > 0 ? (agendados / engagedRubinho) * 100 : 0;
    const metaPct = totalLeads > 0 ? (optInMeta / totalLeads) * 100 : 0;
    const engagedPct = totalLeads > 0 ? (engagedRubinho / totalLeads) * 100 : 0;
    const agendadosPct = totalLeads > 0 ? (agendados / totalLeads) * 100 : 0;
    const confirmadosPct =
      totalLeads > 0 ? (confirmados / totalLeads) * 100 : 0;
    const optOutPct = totalLeads > 0 ? (optOut / totalLeads) * 100 : 0;
    const desengajadosPct =
      totalLeads > 0 ? (desengajados / totalLeads) * 100 : 0;

    const leadsSourceCount = allLeads.filter(
      (lead) =>
        lead.client_id === selectedClientIdSafe &&
        (lead.source === "facebook_ads" || lead.source === "form_page"),
    ).length;
    const ligacaoCount = allLeads.filter(
      (lead) =>
        lead.client_id === selectedClientIdSafe &&
        (lead.source === "whatsapp" ||
          lead.source === "manual" ||
          lead.source === "import_excel"),
    ).length;

    return {
      totalLeads,
      engagedRubinho,
      agendados,
      confirmados,
      optOut,
      desengajados,
      engagedNotScheduled,
      taxaRubinho,
      optInMeta,
      metaPct,
      engagedPct,
      agendadosPct,
      confirmadosPct,
      optOutPct,
      desengajadosPct,
      leadsSourceCount,
      ligacaoCount,
    };
  }, [allLeads, reportBase.records, selectedClientIdSafe]);

  const summaryFunnel = useMemo(() => {
    const checkin = allLeads.filter(
      (lead) =>
        lead.client_id === selectedClientIdSafe &&
        lead.confirmation_status === "checked_in",
    ).length;
    const compraramStage = pipelineStages.find(
      (stage) => stage.label.trim().toLowerCase() === "compraram",
    );
    const compraram = compraramStage
      ? (stageCounts[compraramStage.id] ?? 0)
      : 0;

    const stages = [
      { label: "Leads", value: overviewStats.totalLeads, color: "#3b82f6" },
      {
        label: "Confirmados",
        value: overviewStats.confirmados,
        color: "#22c55e",
      },
      { label: "Check-in", value: checkin, color: "#a855f7" },
      { label: "Compraram", value: compraram, color: "#E51838" },
    ];
    const base = Math.max(stages[0].value, 1);

    return stages.map((stage, index) => ({
      ...stage,
      pct: (stage.value / base) * 100,
      conversionFromPrevious:
        index === 0
          ? 100
          : stages[index - 1].value > 0
            ? (stage.value / stages[index - 1].value) * 100
            : 0,
    }));
  }, [
    allLeads,
    overviewStats.confirmados,
    overviewStats.totalLeads,
    pipelineStages,
    selectedClientIdSafe,
    stageCounts,
  ]);

  const overviewFunnelData = useMemo(
    () => [
      {
        label: "Total Leads",
        value: overviewStats.totalLeads,
        pct: 100,
        color: "#3b82f6",
      },
      {
        label: "Engajados",
        value: overviewStats.engagedRubinho,
        pct: overviewStats.engagedPct,
        color: "#a855f7",
      },
      {
        label: "Agendados",
        value: overviewStats.agendados,
        pct: overviewStats.agendadosPct,
        color: "#22c55e",
      },
      {
        label: "Confirmados",
        value: overviewStats.confirmados,
        pct: overviewStats.confirmadosPct,
        color: "#34d399",
      },
      {
        label: "Opt-out",
        value: overviewStats.optOut,
        pct: overviewStats.optOutPct,
        color: "#ef4444",
      },
      {
        label: "Desengajados",
        value: overviewStats.desengajados,
        pct: overviewStats.desengajadosPct,
        color: "#f59e0b",
      },
    ],
    [overviewStats],
  );

  const overviewDistributionData = useMemo(
    () =>
      [
        { name: "Agendados", value: overviewStats.agendados, color: "#22c55e" },
        {
          name: "Desengajados",
          value: overviewStats.desengajados,
          color: "#f59e0b",
        },
        { name: "Opt-out", value: overviewStats.optOut, color: "#ef4444" },
        {
          name: "Engajados nao agend.",
          value: overviewStats.engagedNotScheduled,
          color: "#a855f7",
        },
      ].filter((item) => item.value > 0),
    [overviewStats],
  );

  const overviewDistributionTotal = useMemo(
    () => overviewDistributionData.reduce((sum, item) => sum + item.value, 0),
    [overviewDistributionData],
  );

  const overviewMonthlyData = useMemo(() => {
    const monthMap = new Map<string, number>();
    const sourceItems = allLeads.filter(
      (lead) => lead.client_id === selectedClientIdSafe,
    );
    sourceItems.forEach((lead) => {
      const date = new Date(lead.created_at);
      const key = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
      monthMap.set(key, (monthMap.get(key) ?? 0) + 1);
    });

    const sorted = Array.from(monthMap.entries()).sort((a, b) =>
      a[0].localeCompare(b[0]),
    );
    const tail = sorted.slice(-4);
    if (tail.length === 1) {
      const [key] = tail[0];
      const date = new Date(`${key}-01T00:00:00Z`);
      date.setUTCMonth(date.getUTCMonth() - 1);
      const prevKey = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
      tail.unshift([prevKey, 0]);
    }

    return tail.map(([month, total]) => ({ month, total }));
  }, [allLeads, selectedClientIdSafe]);

  const isClientTab = activeTab === "cliente";
  const isCampaignsTab = activeTab === "campanhas";
  const isEventsTab = activeTab === "eventos";

  const leadById = useMemo(
    () => new Map(allLeads.map((lead) => [lead.id, lead])),
    [allLeads],
  );

  const qualityScopedLeads = useMemo(
    () =>
      filteredRecords
        .map((record) => leadById.get(record.id))
        .filter((lead): lead is Lead => Boolean(lead)),
    [filteredRecords, leadById],
  );

  const leadQualityStats = useMemo(() => {
    const engaged = qualityScopedLeads.filter(
      (lead) => lead.crm_stage !== "novo" && lead.crm_stage !== "perdido",
    ).length;
    const desengajados = Math.max(qualityScopedLeads.length - engaged, 0);
    const agendados = qualityScopedLeads.filter(
      (lead) =>
        lead.crm_stage === "agendado" || lead.crm_stage === "convertido",
    ).length;
    const confirmados = qualityScopedLeads.filter(
      (lead) =>
        lead.confirmation_status === "confirmed" ||
        lead.confirmation_status === "checked_in",
    ).length;
    const optOut = qualityScopedLeads.filter(
      (lead) => lead.crm_stage === "perdido",
    ).length;
    const optInMeta = qualityScopedLeads.filter(
      (lead) => lead.source === "facebook_ads" || lead.source === "form_page",
    ).length;
    const taxaRubinhoLeads = engaged > 0 ? (agendados / engaged) * 100 : 0;
    const perdidosCadencia = qualityScopedLeads.filter(
      (lead) => lead.crm_stage === "novo" && lead.notes.trim().length === 0,
    ).length;
    const perdidosEngajamento = qualityScopedLeads.filter(
      (lead) =>
        lead.crm_stage === "contactado" && lead.store_visit_datetime == null,
    ).length;
    const ausentes = Math.max(agendados - confirmados, 0);

    return {
      engaged,
      desengajados,
      taxaRubinhoLeads,
      optOut,
      perdidosCadencia,
      perdidosEngajamento,
      ausentes,
      optInMeta,
      engagedPct:
        qualityScopedLeads.length > 0
          ? (engaged / qualityScopedLeads.length) * 100
          : 0,
      desengajadosPct:
        qualityScopedLeads.length > 0
          ? (desengajados / qualityScopedLeads.length) * 100
          : 0,
      optOutPct:
        qualityScopedLeads.length > 0
          ? (optOut / qualityScopedLeads.length) * 100
          : 0,
      optInMetaPct:
        qualityScopedLeads.length > 0
          ? (optInMeta / qualityScopedLeads.length) * 100
          : 0,
      agendados,
      confirmados,
    };
  }, [qualityScopedLeads]);

  const rubinhoOnOffChartData = useMemo(
    () => [
      {
        status: "Engajados (Rubinho)",
        agendados: leadQualityStats.agendados,
        perdidos: leadQualityStats.perdidosEngajamento,
        optOut: leadQualityStats.optOut,
      },
      {
        status: "Desengajados",
        agendados: Math.max(
          leadQualityStats.desengajados - leadQualityStats.optOut,
          0,
        ),
        perdidos: leadQualityStats.perdidosCadencia,
        optOut: leadQualityStats.optOut,
      },
    ],
    [leadQualityStats],
  );

  const funnelStageRows = useMemo(() => {
    const totalBase = Math.max(
      pipelineStages.reduce(
        (sum, stage) => sum + (stageCounts[stage.id] ?? 0),
        0,
      ),
      1,
    );

    return pipelineStages.map((stage) => {
      const count = stageCounts[stage.id] ?? 0;
      return {
        label: stage.label,
        count,
        color: stage.color,
        pct: (count / totalBase) * 100,
      };
    });
  }, [pipelineStages, stageCounts]);

  const funnelMaxCount = useMemo(
    () => Math.max(...funnelStageRows.map((row) => row.count), 1),
    [funnelStageRows],
  );

  const pageSubtitle = useMemo(() => {
    if (isEventsTab) {
      return `${selectedClientCompanyName} · Eventos e presenca`;
    }

    if (isCampaignsTab) {
      return `${selectedClientCompanyName} · Investimento e resultado por campanha`;
    }

    return `${selectedClientCompanyName} · Visao geral do cliente`;
  }, [isCampaignsTab, isEventsTab, selectedClientCompanyName]);

  const handleExport = () => {
    const safeClientName = selectedClientCompanyName
      .toLowerCase()
      .replace(/\s+/g, "-");

    if (isEventsTab) {
      downloadCsv(`relatorio-eventos-${safeClientName}.csv`, [
        [
          "Evento",
          "Status",
          "Data",
          "Local",
          "Leads",
          "Confirmados",
          "Check-ins",
          "Taxa presenca",
          "Capacidade",
        ],
        ...eventCards.map((event) => [
          event.name,
          event.status,
          event.date,
          event.location,
          String(event.leads),
          String(event.confirmed),
          String(event.checkedIn),
          formatPercent(event.attendanceRate),
          String(event.capacity),
        ]),
      ]);
      return;
    }

    if (isCampaignsTab) {
      downloadCsv(`relatorio-campanhas-${safeClientName}.csv`, [
        [
          "Campanha",
          "Valor investido",
          "Leads",
          "Custo por lead",
          "Impressoes",
          "Conversas",
          "Custo por conversa",
          "Contas alcancadas",
        ],
        ...metaCampaignsTree.map((row) => [
          row.name,
          formatBRL(row.spend),
          String(row.leads),
          formatBRL(row.cost_per_lead),
          String(row.impressions),
          String(row.conversations),
          formatBRL(row.cost_per_conversation),
          String(row.reach),
        ]),
      ]);
      return;
    }

    downloadCsv(`relatorio-${activeTab}-${safeClientName}.csv`, [
      ["ID", "Nome", "Campanha", "Criativo", "Publico", "Termo"],
      ...filteredRecords.map((record) => [
        record.id,
        record.nome,
        record.campaign,
        record.content,
        record.audience,
        record.term,
      ]),
    ]);
  };

  if (!clients.length) {
    return (
      <div
        className={clsx(
          "flex min-h-[240px] items-center justify-center text-sm",
          loadError
            ? "text-red-600"
            : isDarkMode
              ? "bg-black text-zinc-400"
              : "text-zinc-500",
        )}
      >
        {loadError || "Carregando clientes..."}
      </div>
    );
  }

  if (!selectedClient) {
    return (
      <div
        className={clsx(
          "flex min-h-[240px] items-center justify-center text-sm",
          isDarkMode ? "bg-black text-zinc-400" : "text-zinc-500",
        )}
      >
        Nenhum cliente disponivel para relatorios.
      </div>
    );
  }

  return (
    <div
      className={clsx(
        "space-y-6 report-page",
        isDarkMode && "dashboard-dark report-dark bg-black",
      )}
    >
      <PageHeader
        title="Relatorio"
        subtitle={pageSubtitle}
        breadcrumbs={[{ label: "Gestor" }, { label: "Relatorio" }]}
        dark={isDarkMode}
        actions={
          <FilterSelect
            label="Cliente"
            value={selectedClientId}
            onChange={(value) => setGestorClientId(value)}
            options={clients.map((client) => ({
              label: client.company_name,
              value: client.id,
            }))}
            dark={isDarkMode}
          />
        }
      />

      {loadError && (
        <div
          className={clsx(
            "rounded-2xl border px-4 py-3 text-sm font-medium",
            isDarkMode
              ? "border-red-900 bg-red-950/40 text-red-300"
              : "border-red-200 bg-red-50 text-red-700",
          )}
        >
          {loadError}
        </div>
      )}

      <div
        className={clsx(
          "overflow-hidden rounded-[26px] border shadow-[0_16px_40px_rgba(15,23,42,0.06)]",
          isDarkMode
            ? "border-zinc-700 bg-[#0f0f0f]"
            : "border-white/85 bg-white/95",
        )}
      >
        <div className="flex flex-wrap items-center justify-between gap-3 px-3">
          <div className="flex min-w-0 flex-1 overflow-x-auto">
            {reportTabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={clsx(
                  "whitespace-nowrap border-b-2 px-4 py-3 text-sm font-semibold transition-colors",
                  activeTab === tab.id
                    ? "border-[#E51838] text-[#E51838]"
                    : isDarkMode
                      ? "border-transparent text-zinc-400 hover:text-zinc-100"
                      : "border-transparent text-zinc-500 hover:text-zinc-900",
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={handleExport}
            className={clsx(
              "px-4 py-3 text-sm font-semibold transition-colors",
              isDarkMode
                ? "text-emerald-400 hover:text-emerald-300"
                : "text-[#15803d] hover:text-[#166534]",
            )}
          >
            Exportar
          </button>
        </div>
      </div>

      <div className={reportPanelClass}>
        <h2 className="mb-5 text-lg font-semibold text-zinc-950">
          Resumo — Leads → Confirmados → Check-in → Compraram
        </h2>
        <div className="space-y-4">
          {summaryFunnel.map((item, index) => (
            <div
              key={item.label}
              className="grid items-center gap-3 md:grid-cols-[170px_minmax(0,1fr)_150px]"
            >
              <div className="text-right text-sm font-medium text-zinc-500">
                {item.label}
              </div>
              <div className="flex items-center">
                <div className="relative h-10 w-full overflow-hidden rounded-[8px] bg-[#f3eee6]">
                  <div
                    className="flex h-full items-center rounded-[4px] px-3 text-[20px] font-black text-white"
                    style={{
                      width: `${Math.max(item.pct, item.value > 0 ? 6 : 0)}%`,
                      background: `linear-gradient(90deg, ${item.color}, ${item.color}dd)`,
                    }}
                  >
                    {item.value.toLocaleString("pt-BR")}
                  </div>
                </div>
              </div>
              <div className="text-right text-sm text-zinc-400">
                {index === 0
                  ? "—"
                  : `${item.conversionFromPrevious.toFixed(1)}% do anterior`}
              </div>
            </div>
          ))}
        </div>
      </div>

      {isClientTab ? (
        <div className={reportSectionClass}>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-3">
            <OverviewMetricCard
              label="Total Leads"
              value={overviewStats.totalLeads.toLocaleString("pt-BR")}
              helper={`Leads: ${overviewStats.leadsSourceCount.toLocaleString("pt-BR")} | Ligacao: ${overviewStats.ligacaoCount.toLocaleString("pt-BR")}`}
              valueClassName="text-[#4f8cff]"
            />
            <OverviewMetricCard
              label="Engajados (Rubinho)"
              value={overviewStats.engagedRubinho.toLocaleString("pt-BR")}
              helper={`${overviewStats.engagedPct.toFixed(1)}% de todos os leads`}
              valueClassName="text-[#b15cff]"
            />
            <OverviewMetricCard
              label="Agendados"
              value={overviewStats.agendados.toLocaleString("pt-BR")}
              helper={`${overviewStats.agendadosPct.toFixed(1)}% de todos os leads`}
              valueClassName="text-[#22c55e]"
            />
            <OverviewMetricCard
              label="Confirmados"
              value={overviewStats.confirmados.toLocaleString("pt-BR")}
              helper={`${overviewStats.confirmadosPct.toFixed(1)}% de todos os leads`}
              valueClassName="text-[#3ddc84]"
            />
            <OverviewMetricCard
              label="Opt-out"
              value={overviewStats.optOut.toLocaleString("pt-BR")}
              helper={`${overviewStats.optOutPct.toFixed(1)}% de todos os leads`}
              valueClassName="text-[#ff5b5b]"
            />
            <OverviewMetricCard
              label="Desengajados"
              value={overviewStats.desengajados.toLocaleString("pt-BR")}
              helper={`${overviewStats.desengajadosPct.toFixed(1)}% de todos os leads`}
              valueClassName="text-[#f59e0b]"
            />
            <OverviewMetricCard
              label="Taxa Rubinho"
              value={`${overviewStats.taxaRubinho.toFixed(1)}%`}
              helper={`${overviewStats.agendados.toLocaleString("pt-BR")} agend / ${overviewStats.engagedRubinho.toLocaleString("pt-BR")} engaj`}
              valueClassName="text-[#22d3ee]"
            />
            <OverviewMetricCard
              label="Opt-in Meta"
              value={overviewStats.optInMeta.toLocaleString("pt-BR")}
              helper={`${overviewStats.metaPct.toFixed(1)}% de todos os leads`}
              valueClassName="text-[#4f8cff]"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.15fr_0.85fr]">
            <div className={reportPanelClass}>
              <h2 className="mb-5 text-lg font-semibold text-zinc-950">
                Funil de Conversao
              </h2>
              <div className="space-y-4">
                {overviewFunnelData.map((item) => (
                  <div
                    key={item.label}
                    className="grid items-center gap-3 md:grid-cols-[170px_minmax(0,1fr)_56px]"
                  >
                    <div className="text-right text-sm font-medium text-zinc-500">
                      {item.label}
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="relative h-8 flex-1 overflow-hidden rounded-[8px] bg-[#f3eee6]">
                        <div
                          className="flex h-full items-center rounded-[4px] px-3 text-sm font-bold text-white"
                          style={{
                            width: `${Math.max(item.pct, item.value > 0 ? 6 : 0)}%`,
                            background: `linear-gradient(90deg, ${item.color}, ${item.color}dd)`,
                          }}
                        >
                          {item.value.toLocaleString("pt-BR")}
                        </div>
                      </div>
                    </div>
                    <div className="text-right text-sm text-zinc-400">
                      {item.pct.toFixed(1)}%
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className={reportPanelClass}>
              <h2 className="mb-5 text-lg font-semibold text-zinc-950">
                Distribuicao
              </h2>
              <div className="relative h-[250px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={overviewDistributionData}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={56}
                      outerRadius={98}
                      stroke="#f8fafc"
                      strokeWidth={2}
                      label={({ percent }) =>
                        `${((percent ?? 0) * 100).toFixed(1)}%`
                      }
                      labelLine={false}
                    >
                      {overviewDistributionData.map((entry) => (
                        <Cell key={entry.name} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value: number, name) => [
                        `${value.toLocaleString("pt-BR")} (${overviewDistributionTotal > 0 ? ((value / overviewDistributionTotal) * 100).toFixed(1) : "0.0"}%)`,
                        name,
                      ]}
                      contentStyle={{
                        ...chartTooltipStyle,
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                  <div className="text-center">
                    <div className="text-[15px] font-medium text-zinc-500">
                      Total
                    </div>
                    <div className="mt-1 text-[20px] font-black text-zinc-950">
                      {overviewDistributionTotal.toLocaleString("pt-BR")}
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
                {overviewDistributionData.map((item) => (
                  <div
                    key={item.name}
                    className="flex items-center gap-1.5 text-sm text-zinc-500"
                  >
                    <span
                      className="h-3 w-3 rounded-full"
                      style={{ backgroundColor: item.color }}
                    />
                    <span>{item.name}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className={reportPanelClass}>
            <h2 className="mb-5 text-lg font-semibold text-zinc-950">
              Leads por Mes
            </h2>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={overviewMonthlyData}
                  margin={{ top: 16, right: 24, left: 12, bottom: 8 }}
                >
                  <CartesianGrid
                    stroke={chartGridColor}
                    strokeDasharray="3 4"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="month"
                    tick={{ fill: chartTickColor, fontSize: 12 }}
                    axisLine={{ stroke: chartAxisColor }}
                    tickLine={{ stroke: chartAxisColor }}
                  />
                  <YAxis
                    tick={{ fill: chartTickColor, fontSize: 12 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    cursor={{ fill: "rgba(59,130,246,0.08)" }}
                    contentStyle={{
                      ...chartTooltipStyle,
                    }}
                    formatter={(value: number) => [
                      `${value.toLocaleString("pt-BR")} leads`,
                      "Total",
                    ]}
                  />
                  <Bar
                    dataKey="total"
                    fill="#3b82f6"
                    radius={[4, 4, 0, 0]}
                    maxBarSize={180}
                  >
                    <LabelList
                      dataKey="total"
                      position="inside"
                      fill="#ffffff"
                      formatter={(value: number) =>
                        value.toLocaleString("pt-BR")
                      }
                    />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="grid grid-cols-[repeat(auto-fit,minmax(190px,1fr))] gap-3">
            <OverviewMetricCard
              label="Engajados"
              value={leadQualityStats.engaged.toLocaleString("pt-BR")}
              helper={`${leadQualityStats.engagedPct.toFixed(1)}%`}
              valueClassName="text-[#b15cff]"
            />
            <OverviewMetricCard
              label="Desengajados"
              value={leadQualityStats.desengajados.toLocaleString("pt-BR")}
              helper={`${leadQualityStats.desengajadosPct.toFixed(1)}%`}
              valueClassName="text-[#f59e0b]"
            />
            <OverviewMetricCard
              label="Taxa Rubinho"
              value={`${leadQualityStats.taxaRubinhoLeads.toFixed(1)}%`}
              helper={`${leadQualityStats.agendados.toLocaleString("pt-BR")} agend / ${leadQualityStats.engaged.toLocaleString("pt-BR")} engaj`}
              valueClassName="text-[#22c55e]"
            />
            <OverviewMetricCard
              label="Opt-out"
              value={leadQualityStats.optOut.toLocaleString("pt-BR")}
              helper={`${leadQualityStats.optOutPct.toFixed(1)}%`}
              valueClassName="text-[#ff5b5b]"
            />
            <OverviewMetricCard
              label="Perdidos Cadencia"
              value={leadQualityStats.perdidosCadencia.toLocaleString("pt-BR")}
              helper="Nao engajou"
              valueClassName="text-[#ef4444]"
            />
            <OverviewMetricCard
              label="Perdidos Engaj."
              value={leadQualityStats.perdidosEngajamento.toLocaleString(
                "pt-BR",
              )}
              helper="Engajou, nao agendou"
              valueClassName="text-[#f59e0b]"
            />
            <OverviewMetricCard
              label="Ausentes"
              value={leadQualityStats.ausentes.toLocaleString("pt-BR")}
              helper="Agendou, nao confirmou"
              valueClassName="text-[#fbbf24]"
            />
            <OverviewMetricCard
              label="Opt-in Meta"
              value={leadQualityStats.optInMeta.toLocaleString("pt-BR")}
              helper={`${leadQualityStats.optInMetaPct.toFixed(1)}%`}
              valueClassName="text-[#22d3ee]"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <div className={reportPanelClass}>
              <h2 className="mb-5 text-lg font-semibold text-zinc-950">
                Rubinho ON vs OFF
              </h2>
              <div className="h-[270px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={rubinhoOnOffChartData}
                    margin={{ top: 16, right: 24, left: 12, bottom: 8 }}
                  >
                    <CartesianGrid
                      stroke={chartGridColor}
                      strokeDasharray="3 4"
                      vertical={false}
                    />
                    <XAxis
                      dataKey="status"
                      tick={{ fill: chartTickColor, fontSize: 12 }}
                      axisLine={{ stroke: chartAxisColor }}
                      tickLine={{ stroke: chartAxisColor }}
                    />
                    <YAxis
                      tick={{ fill: chartTickColor, fontSize: 12 }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip
                      contentStyle={{
                        ...chartTooltipStyle,
                      }}
                    />
                    <Legend wrapperStyle={{ color: chartTickColor }} />
                    <Bar
                      dataKey="agendados"
                      stackId="a"
                      fill="#22c55e"
                      radius={[4, 4, 0, 0]}
                    />
                    <Bar
                      dataKey="perdidos"
                      stackId="a"
                      fill="#ef4444"
                      radius={[4, 4, 0, 0]}
                    />
                    <Bar
                      dataKey="optOut"
                      stackId="a"
                      fill="#f97316"
                      radius={[4, 4, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          <details className={reportPanelClass}>
            <summary className="cursor-pointer text-lg font-semibold text-zinc-950">
              Funil detalhado do CRM (todas as etapas)
            </summary>
            <div className="mt-5 space-y-4">
              {funnelStageRows.map((row) => (
                <div
                  key={row.label}
                  className="grid items-center gap-3 md:grid-cols-[170px_minmax(0,1fr)_64px]"
                >
                  <div className="text-right text-[15px] font-medium text-zinc-600">
                    {row.label}
                  </div>
                  <div className="flex items-center">
                    <div className="h-9 w-full overflow-hidden rounded-[4px] bg-transparent">
                      <div
                        className="flex h-full items-center rounded-[4px] px-3 text-[22px] font-black tracking-tight text-white"
                        style={{
                          width: `${Math.max((row.count / funnelMaxCount) * 100, row.count > 0 ? 6 : 2)}%`,
                          backgroundColor: row.color,
                        }}
                      >
                        <span className="text-[22px] leading-none">
                          {row.count.toLocaleString("pt-BR")}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="text-right text-[18px] text-zinc-400">
                    {row.pct.toFixed(1)}%
                  </div>
                </div>
              ))}
            </div>
          </details>
        </div>
      ) : isEventsTab ? (
        <div className={reportSectionClass}>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-3">
            <OverviewMetricCard
              label="Eventos"
              value={clientEvents.length.toLocaleString("pt-BR")}
              helper="Total de eventos no cliente selecionado"
              valueClassName="text-[#4f8cff]"
            />
            <OverviewMetricCard
              label="Ativos"
              value={eventSummary.active.toLocaleString("pt-BR")}
              helper="Eventos com status ativo"
              valueClassName="text-[#22c55e]"
            />
            <OverviewMetricCard
              label="Finalizados"
              value={finishedEventsCount.toLocaleString("pt-BR")}
              helper="Eventos concluídos"
              valueClassName="text-[#b15cff]"
            />
          </div>

          <div className={reportTableClass}>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#eadfce] px-5 py-4">
              <h2 className="text-lg font-semibold text-zinc-950">
                Performance por Evento
              </h2>
              <FilterSelect
                label="Evento"
                value={selectedEventId}
                onChange={setSelectedEventId}
                options={[
                  { label: "Todos os eventos", value: "all" },
                  ...clientEvents.map((event) => ({
                    label: event.name,
                    value: event.id,
                  })),
                ]}
                dark={isDarkMode}
              />
            </div>

            {filteredEventDashboardRows.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-[#fbf7f2]">
                    <tr className="text-left text-[12px] font-semibold uppercase tracking-[0.12em] text-zinc-400">
                      <th className="px-4 py-3">Evento</th>
                      <th className="px-4 py-3">Tipo</th>
                      <th className="px-4 py-3">UF</th>
                      <th className="px-4 py-3">Total</th>
                      <th className="px-4 py-3">Engajados</th>
                      <th className="px-4 py-3">Agendados</th>
                      <th className="px-4 py-3">Confirmados</th>
                      <th className="px-4 py-3">Opt-out</th>
                      <th className="px-4 py-3">Ausentes</th>
                      <th className="px-4 py-3">Engaj%</th>
                      <th className="px-4 py-3">Taxa Rub.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredEventDashboardRows.map((row) => (
                      <tr
                        key={row.id}
                        className={clsx(
                          "border-t border-[#f0e7db]",
                          isDarkMode ? "text-zinc-200" : "text-zinc-800",
                        )}
                      >
                        <td className="px-4 py-3 font-semibold">{row.name}</td>
                        <td className="px-4 py-3">
                          <span className="rounded-[8px] bg-[#e9ecfb] px-2.5 py-1 text-xs font-semibold text-[#3D56A2]">
                            {row.tipo}
                          </span>
                        </td>
                        <td className="px-4 py-3">{row.uf}</td>
                        <td className="px-4 py-3 font-semibold">
                          {row.total.toLocaleString("pt-BR")}
                        </td>
                        <td className="px-4 py-3 font-semibold text-[#b15cff]">
                          {row.engaged.toLocaleString("pt-BR")}
                        </td>
                        <td className="px-4 py-3 font-semibold text-[#22c55e]">
                          {row.agendados.toLocaleString("pt-BR")}
                        </td>
                        <td className="px-4 py-3 font-semibold text-[#3ddc84]">
                          {row.confirmados.toLocaleString("pt-BR")}
                        </td>
                        <td className="px-4 py-3 font-semibold text-[#ff5b5b]">
                          {row.optOut.toLocaleString("pt-BR")}
                        </td>
                        <td className="px-4 py-3 font-semibold text-[#f59e0b]">
                          {row.ausentes.toLocaleString("pt-BR")}
                        </td>
                        <td className="px-4 py-3">
                          {row.engajPct.toFixed(1)}%
                        </td>
                        <td className="px-4 py-3">
                          {row.taxaRubinhoEvento.toFixed(1)}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="px-5 py-8 text-sm text-zinc-500">
                Esse cliente ainda nao possui eventos cadastrados para exibicao
                no relatorio.
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <div className={reportPanelClass}>
              <h2 className="mb-5 text-lg font-semibold text-zinc-950">
                Volume por Evento
              </h2>
              <div className="h-[330px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={filteredEventDashboardRows.map((row) => ({
                      name: shortCampaign(row.name),
                      total: row.total,
                    }))}
                    layout="vertical"
                    margin={{ top: 8, right: 24, left: 12, bottom: 8 }}
                  >
                    <CartesianGrid
                      stroke={chartGridColor}
                      strokeDasharray="3 4"
                      horizontal={true}
                      vertical={false}
                    />
                    <XAxis
                      type="number"
                      tick={{ fill: chartTickColor, fontSize: 12 }}
                      axisLine={{ stroke: chartAxisColor }}
                      tickLine={{ stroke: chartAxisColor }}
                    />
                    <YAxis
                      dataKey="name"
                      type="category"
                      width={140}
                      tick={{ fill: chartTickColor, fontSize: 12 }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip
                      cursor={{ fill: "rgba(59,130,246,0.08)" }}
                      contentStyle={{
                        ...chartTooltipStyle,
                      }}
                      formatter={(value: number) => [
                        `${value.toLocaleString("pt-BR")}`,
                        "Volume",
                      ]}
                    />
                    <Bar
                      dataKey="total"
                      fill="#3b82f6"
                      radius={[0, 6, 6, 0]}
                      maxBarSize={40}
                    >
                      <LabelList
                        dataKey="total"
                        position="inside"
                        fill="#ffffff"
                        formatter={(value: number) =>
                          value.toLocaleString("pt-BR")
                        }
                      />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className={reportPanelClass}>
              <h2 className="mb-5 text-lg font-semibold text-zinc-950">
                Engajamento por Evento
              </h2>
              <div className="h-[330px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={filteredEventDashboardRows.map((row) => ({
                      name: shortCampaign(row.name),
                      percentual: Number(row.engajPct.toFixed(1)),
                    }))}
                    layout="vertical"
                    margin={{ top: 8, right: 24, left: 12, bottom: 8 }}
                  >
                    <CartesianGrid
                      stroke={chartGridColor}
                      strokeDasharray="3 4"
                      horizontal={true}
                      vertical={false}
                    />
                    <XAxis
                      type="number"
                      domain={[0, 100]}
                      tick={{ fill: chartTickColor, fontSize: 12 }}
                      axisLine={{ stroke: chartAxisColor }}
                      tickLine={{ stroke: chartAxisColor }}
                    />
                    <YAxis
                      dataKey="name"
                      type="category"
                      width={140}
                      tick={{ fill: chartTickColor, fontSize: 12 }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip
                      cursor={{ fill: "rgba(168,85,247,0.08)" }}
                      contentStyle={{
                        ...chartTooltipStyle,
                      }}
                      formatter={(value: number) => [
                        `${value.toFixed(1)}%`,
                        "Engajamento",
                      ]}
                    />
                    <Bar
                      dataKey="percentual"
                      fill="#a855f7"
                      radius={[0, 6, 6, 0]}
                      maxBarSize={40}
                    >
                      <LabelList
                        dataKey="percentual"
                        position="inside"
                        fill="#ffffff"
                        formatter={(value: number) => `${value.toFixed(1)}%`}
                      />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </div>
      ) : isCampaignsTab ? (
        <div className={reportSectionClass}>
          {!metaConnected ? (
            <div className={cardClass}>
              <h2 className="text-[18px] font-extrabold tracking-tight text-zinc-950">
                Meta Ads nao conectado
              </h2>
              <p className="mt-2 max-w-3xl text-sm text-zinc-500">
                Conecte a integracao com o Facebook/Instagram Ads nas
                configuracoes do cliente para ver campanhas, conjuntos de
                anuncios e anuncios com investimento, leads e conversas.
              </p>
            </div>
          ) : metaCampaignsTree.length === 0 ? (
            <div className={cardClass}>
              <h2 className="text-[18px] font-extrabold tracking-tight text-zinc-950">
                Nenhuma campanha encontrada
              </h2>
              <p className="mt-2 max-w-3xl text-sm text-zinc-500">
                A integracao Meta esta conectada, mas ainda nao ha dados de
                campanhas sincronizados para este cliente.
              </p>
            </div>
          ) : (
            <div className={reportTableClass}>
              <div className="border-b border-[#eadfce] px-5 py-4 text-lg font-semibold text-zinc-950">
                Campanhas · Conjuntos · Anuncios
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-[#fbf7f2]">
                    <tr className="text-left text-[12px] font-semibold uppercase tracking-[0.12em] text-zinc-400">
                      <th className="px-4 py-3">Nome</th>
                      <th className="px-4 py-3">Investido</th>
                      <th className="px-4 py-3">Leads</th>
                      <th className="px-4 py-3">Custo/Lead</th>
                      <th className="px-4 py-3">Impressoes</th>
                      <th className="px-4 py-3">Conversas</th>
                      <th className="px-4 py-3">Custo/Conversa</th>
                      <th className="px-4 py-3">Alcance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {metaCampaignsTree.map((campaign) => {
                      const campaignExpanded = expandedCampaignIds.has(
                        campaign.id,
                      );
                      return (
                        <FragmentCampaignRow
                          key={campaign.id}
                          campaign={campaign}
                          expanded={campaignExpanded}
                          onToggle={() => toggleCampaignExpanded(campaign.id)}
                          expandedAdSetIds={expandedAdSetIds}
                          onToggleAdSet={toggleAdSetExpanded}
                          isDarkMode={isDarkMode}
                        />
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
