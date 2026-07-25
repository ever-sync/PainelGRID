import { useEffect, useMemo, useState, Fragment } from "react";
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
  Layers,
  Award,
  Ticket,
  UserCheck,
  Trophy,
} from "lucide-react";
import { PageHeader } from "../../components/shared/PageHeader";
import { StatsCard } from "../../components/shared/StatsCard";
import { Card } from "../../components/ui/Card";
import { Tabs } from "../../components/ui/Tabs";
import { readStoredSession } from "../../services/auth";
import { listClients, mapApiClientToClient } from "../../services/clients";
import { listEvents } from "../../services/events";
import { listLeads, mapApiLeadToLead } from "../../services/leads";
import { listCrmPipelines, type ApiCrmStage } from "../../services/crm";
import type { AppOutletContext } from "../../layouts/AppLayout";
import type { Client, Event, Lead } from "../../types";
import {
  DASHBOARD_DARK_CHANGE_EVENT,
  readDashboardDarkEnabled,
} from "../../lib/dashboard-dark-mode";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";

type RelatorioTab = "visao_geral" | "evento" | "campanhas" | "campanha_x_evento";

const RELATORIO_TABS = [
  { id: "visao_geral", label: "Visão Geral", icon: <LayoutDashboard size={16} /> },
  { id: "evento", label: "Evento", icon: <Calendar size={16} /> },
  { id: "campanhas", label: "Campanhas", icon: <Megaphone size={16} /> },
  { id: "campanha_x_evento", label: "Campanha x Evento", icon: <GitCompare size={16} /> },
];

const PIE_COLORS = ["#FF0636", "#3b82f6", "#10b981", "#f59e0b", "#8b5cf6", "#64748b"];

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

export function RelatorioGestorPage() {
  const { user } = useOutletContext<AppOutletContext>();
  const [isDarkMode, setIsDarkMode] = useState(() =>
    readDashboardDarkEnabled(user.id),
  );

  const [activeTab, setActiveTab] = useState<RelatorioTab>("visao_geral");
  const [clients, setClients] = useState<Client[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [crmStages, setCrmStages] = useState<ApiCrmStage[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Filtros seletores superiores do lado direito
  const [selectedClientId, setSelectedClientId] = useState<string>("all");
  const [selectedEventId, setSelectedEventId] = useState<string>("all");

  // Estado da Paginação dos Leads
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(10);

  // Reseta paginação para 1 quando os seletores mudarem
  useEffect(() => {
    setCurrentPage(1);
  }, [selectedClientId, selectedEventId]);

  // Estado para expansão da tabela hierárquica de campanhas (Campanha -> Conjuntos -> Anúncios)
  const [expandedCampaigns, setExpandedCampaigns] = useState<Record<string, boolean>>({
    "camp-1": true,
  });
  const [expandedAdSets, setExpandedAdSets] = useState<Record<string, boolean>>({
    "adset-101": true,
  });

  const toggleCampaign = (id: string) => {
    setExpandedCampaigns((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const toggleAdSet = (id: string) => {
    setExpandedAdSets((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  // Dados estruturados em árvore para a Aba de Campanhas (Campanha -> Conjunto -> Anúncio)
  const campaignTreeData = useMemo(() => {
    return [
      {
        id: "camp-1",
        name: "Campanha Feirão Seminovos Premium Meta Ads",
        status: "active",
        valorInvestido: 12500,
        quantidadeLeads: 310,
        custoPorLead: 40.32,
        impressoes: 145000,
        numeroConversas: 185,
        custoConversasIniciadas: 67.56,
        contasAlcancadas: 89000,
        adSets: [
          {
            id: "adset-101",
            name: "Conjunto 01 - Público Aberto Concessionária (25-54 anos)",
            valorInvestido: 7500,
            quantidadeLeads: 195,
            custoPorLead: 38.46,
            impressoes: 85000,
            numeroConversas: 110,
            custoConversasIniciadas: 68.18,
            contasAlcancadas: 52000,
            ads: [
              {
                id: "ad-1001",
                name: "Anúncio 01 - Carrossel de Veículos 0km",
                valorInvestido: 4000,
                quantidadeLeads: 110,
                custoPorLead: 36.36,
                impressoes: 48000,
                numeroConversas: 65,
                custoConversasIniciadas: 61.53,
                contasAlcancadas: 31000,
              },
              {
                id: "ad-1002",
                name: "Anúncio 02 - Vídeo Feirão de Ofertas 15s",
                valorInvestido: 3500,
                quantidadeLeads: 85,
                custoPorLead: 41.17,
                impressoes: 37000,
                numeroConversas: 45,
                custoConversasIniciadas: 77.77,
                contasAlcancadas: 21000,
              },
            ],
          },
          {
            id: "adset-102",
            name: "Conjunto 02 - Remarketing Visitantes & WhatsApp",
            valorInvestido: 5000,
            quantidadeLeads: 115,
            custoPorLead: 43.47,
            impressoes: 60000,
            numeroConversas: 75,
            custoConversasIniciadas: 66.66,
            contasAlcancadas: 37000,
            ads: [
              {
                id: "ad-1003",
                name: "Anúncio 03 - Imagem Única Taxa Zero Feirão",
                valorInvestido: 5000,
                quantidadeLeads: 115,
                custoPorLead: 43.47,
                impressoes: 60000,
                numeroConversas: 75,
                custoConversasIniciadas: 66.66,
                contasAlcancadas: 37000,
              },
            ],
          },
        ],
      },
      {
        id: "camp-2",
        name: "Campanha WhatsApp Direct - Lançamento SUV",
        status: "active",
        valorInvestido: 8400,
        quantidadeLeads: 210,
        custoPorLead: 40.0,
        impressoes: 98000,
        numeroConversas: 140,
        custoConversasIniciadas: 60.0,
        contasAlcancadas: 64000,
        adSets: [
          {
            id: "adset-201",
            name: "Conjunto 01 - Interesse Automotivo & Financiamento",
            valorInvestido: 8400,
            quantidadeLeads: 210,
            custoPorLead: 40.0,
            impressoes: 98000,
            numeroConversas: 140,
            custoConversasIniciadas: 60.0,
            contasAlcancadas: 64000,
            ads: [
              {
                id: "ad-2001",
                name: "Anúncio 01 - CTA Direto para o WhatsApp",
                valorInvestido: 4800,
                quantidadeLeads: 125,
                custoPorLead: 38.4,
                impressoes: 55000,
                numeroConversas: 85,
                custoConversasIniciadas: 56.47,
                contasAlcancadas: 36000,
              },
              {
                id: "ad-2002",
                name: "Anúncio 02 - Vídeo Test Drive SUV",
                valorInvestido: 3600,
                quantidadeLeads: 85,
                custoPorLead: 42.35,
                impressoes: 43000,
                numeroConversas: 55,
                custoConversasIniciadas: 65.45,
                contasAlcancadas: 28000,
              },
            ],
          },
        ],
      },
    ];
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

  // Carrega pipelines e etapas reais do CRM para o cliente selecionado ou padrão
  useEffect(() => {
    const session = readStoredSession();
    if (!session?.accessToken) return;

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
  }, [selectedClientId, clients]);

  // Carrega Clientes, Eventos e Leads
  useEffect(() => {
    const session = readStoredSession();
    if (!session?.accessToken) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    Promise.all([
      listClients(session.accessToken),
      listEvents({}, session.accessToken),
      listLeads({ take: 500 }, session.accessToken),
    ])
      .then(([apiClients, apiEvents, apiLeads]) => {
        setClients(apiClients.map(mapApiClientToClient));
        setEvents(
          apiEvents.map((e) => ({
            id: e.id,
            name: e.name,
            client_id: e.client_id,
            participant_client_ids: e.participant_client_ids ?? [e.client_id],
            event_type: (e.event_type ?? "feirao") as any,
            description: e.description ?? "",
            launch_date: e.launch_date ?? e.created_at,
            event_date: e.event_date,
            event_end_date: e.event_end_date ?? e.event_date,
            location: e.location ?? "",
            capacity: e.capacity ?? 0,
            sales_target: e.sales_target ?? 0,
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
        setLeads(apiLeads.map(mapApiLeadToLead));
      })
      .catch((err) => {
        console.error("Erro ao carregar dados do relatório:", err);
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, []);

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

  // Leads filtrados conforme seleções de cliente e evento
  const filteredLeads = useMemo(() => {
    return leads.filter((lead) => {
      // Filtro de Cliente
      if (selectedClientId !== "all" && lead.client_id !== selectedClientId) {
        return false;
      }
      // Filtro de Evento
      if (selectedEventId !== "all") {
        const targetEvent = events.find((e) => e.id === selectedEventId);
        if (targetEvent) {
          const leadBelongsToEvent =
            lead.event_id === selectedEventId ||
            targetEvent.participant_client_ids?.includes(lead.client_id);
          if (!leadBelongsToEvent) return false;
        }
      }
      return true;
    });
  }, [leads, selectedClientId, selectedEventId, events]);

  // Métricas calculadas
  const totalLeads = filteredLeads.length;
  const leadsAgendados = filteredLeads.filter(
    (l) => l.crm_stage === "agendado" || l.crm_stage === "checkin" || l.crm_stage === "convertido",
  ).length;
  const leadsCheckin = filteredLeads.filter(
    (l) => l.crm_stage === "checkin" || l.crm_stage === "convertido",
  ).length;
  const leadsConvertidos = filteredLeads.filter(
    (l) => l.crm_stage === "convertido",
  ).length;
  const taxaConversao =
    totalLeads > 0 ? Math.round((leadsConvertidos / totalLeads) * 100) : 0;

  // Dados do gráfico de funil baseados nas etapas REAIS do CRM
  const crmFunnelData = useMemo(() => {
    if (crmStages.length > 0) {
      return crmStages.map((stg) => {
        const count = filteredLeads.filter((l) => {
          if (l.crm_stage_id && l.crm_stage_id === stg.id) return true;
          if (l.crm_stage_code && l.crm_stage_code.toLowerCase() === stg.code.toLowerCase()) return true;
          if (l.crm_stage && l.crm_stage.toLowerCase() === stg.code.toLowerCase()) return true;
          if (l.crm_stage_name && l.crm_stage_name.toLowerCase() === stg.name.toLowerCase()) return true;
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
  }, [filteredLeads, crmStages]);

  // Dados do gráfico por Origem (Source)
  const sourcePieData = useMemo(() => {
    const map: Record<string, number> = {};
    filteredLeads.forEach((l) => {
      const srcRaw = (l.source || "").toLowerCase();
      let srcName = "Outros Canais";
      if (srcRaw.includes("facebook") || srcRaw.includes("meta") || srcRaw.includes("ig") || srcRaw === "facebook_ads") {
        srcName = "Facebook Ads (Meta)";
      } else if (srcRaw.includes("whatsapp")) {
        srcName = "WhatsApp Direct";
      } else if (srcRaw.includes("form") || srcRaw.includes("site") || srcRaw.includes("web") || srcRaw === "form_page") {
        srcName = "Formulário Web";
      } else if (srcRaw.includes("manual") || srcRaw.includes("balcao")) {
        srcName = "Manual / Balcão";
      }
      map[srcName] = (map[srcName] || 0) + 1;
    });
    return Object.entries(map).map(([name, value]) => ({ name, value }));
  }, [filteredLeads]);

  // Cálculos da Paginação da Tabela de Leads
  const totalPages = Math.max(1, Math.ceil(filteredLeads.length / pageSize));
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, filteredLeads.length);
  const paginatedLeads = useMemo(() => {
    return filteredLeads.slice(startIndex, startIndex + pageSize);
  }, [filteredLeads, startIndex, pageSize]);

  // Dados para a Aba de Eventos
  const eventMetrics = useMemo(() => {
    return availableEvents.map((ev) => {
      const evLeads = leads.filter(
        (l) =>
          l.event_id === ev.id ||
          ev.participant_client_ids?.includes(l.client_id),
      );
      const evCheckins = evLeads.filter(
        (l) => l.crm_stage === "checkin" || l.crm_stage === "convertido",
      ).length;
      const evVendas = evLeads.filter((l) => l.crm_stage === "convertido").length;

      const salesTarget = ev.sales_target || 0;
      const audienceTarget = ev.capacity || 0;

      const salesProgressPercent =
        salesTarget > 0 ? Math.min(100, Math.round((evVendas / salesTarget) * 100)) : 0;

      const audienceProgressPercent =
        audienceTarget > 0 ? Math.min(100, Math.round((evCheckins / audienceTarget) * 100)) : 0;

      // Estimativas Financeiras e CAC do Evento
      const valorInvestido = (ev.capacity || 100) * 150; // Orçamento alocado (ex: R$ 15.000)
      const ticketMedio = 75000;
      const valorTotalVendas = evVendas * ticketMedio;
      const cac = evVendas > 0 ? Math.round(valorInvestido / evVendas) : 0;
      const nomeResumido = ev.name.length > 20 ? `${ev.name.slice(0, 20)}...` : ev.name;

      return {
        ...ev,
        nomeResumido,
        totalLeads: evLeads.length,
        totalCheckins: evCheckins,
        totalVendas: evVendas,
        salesTarget,
        audienceTarget,
        salesProgressPercent,
        audienceProgressPercent,
        valorInvestido,
        valorTotalVendas,
        cac,
      };
    });
  }, [availableEvents, leads]);

  // Eventos destaques (Campeões de Venda e Público)
  const topSalesEvent = useMemo(() => {
    if (eventMetrics.length === 0) return null;
    return [...eventMetrics].sort((a, b) => b.totalVendas - a.totalVendas)[0];
  }, [eventMetrics]);

  const topAttendanceEvent = useMemo(() => {
    if (eventMetrics.length === 0) return null;
    return [...eventMetrics].sort((a, b) => b.totalCheckins - a.totalCheckins)[0];
  }, [eventMetrics]);

  // Dados para a Aba de Cruzamento: Campanha x Evento
  const campaignEventCrossData = useMemo(() => {
    const sources = ["facebook_ads", "whatsapp", "form_page", "manual"];
    return availableEvents.map((ev) => {
      const evLeads = leads.filter(
        (l) =>
          l.event_id === ev.id ||
          ev.participant_client_ids?.includes(l.client_id),
      );
      const fbLeads = evLeads.filter((l) => l.source === "facebook_ads").length;
      const waLeads = evLeads.filter((l) => l.source === "whatsapp").length;
      const formLeads = evLeads.filter((l) => l.source === "form_page").length;
      const manualLeads = evLeads.filter((l) => l.source === "manual" || !l.source).length;
      const vendas = evLeads.filter((l) => l.crm_stage === "convertido").length;

      return {
        eventoId: ev.id,
        eventoNome: ev.name,
        totalLeads: evLeads.length,
        facebook_ads: fbLeads,
        whatsapp: waLeads,
        form_page: formLeads,
        manual: manualLeads,
        vendas,
      };
    });
  }, [availableEvents, leads]);

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
      <PageHeader
        title="Relatório de Desempenho"
        breadcrumbs={[{ label: "Gestor" }, { label: "Relatórios" }]}
        subtitle="Análise consolidada de leads, eventos e campanhas"
        dark={isDarkMode}
        actions={
          <div className="flex flex-wrap items-center gap-3">
            {/* Seletor de Cliente */}
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
          </div>
        }
      />

      {/* Abas Internas abaixo do Título e Seletores */}
      <Tabs
        tabs={RELATORIO_TABS}
        active={activeTab}
        onChange={(tab) => setActiveTab(tab as RelatorioTab)}
      />

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
              change={selectedClientId === "all" ? "Todas as concessionárias" : "Filtrado"}
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
            />
            <StatsCard
              title="Vendas / Conversões"
              value={leadsConvertidos}
              icon={<CheckCircle2 size={20} />}
              iconColor="bg-emerald-100 text-emerald-600"
            />
            <StatsCard
              title="Taxa de Conversão"
              value={`${taxaConversao}%`}
              icon={<Target size={20} />}
              iconColor="bg-rose-100 text-rose-600"
              change="+4.2% em relação à média"
              changeType="positive"
            />
          </div>

          {/* Gráficos de Resultados */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Card className="lg:col-span-2">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-base font-bold text-gray-900 dark:text-zinc-100">
                    Funil de Vendas do CRM
                  </h3>
                  <p className="text-xs text-gray-500 dark:text-zinc-400">
                    Distribuição dos leads por etapa do processo comercial
                  </p>
                </div>
                <BarChart3 size={18} className="text-gray-400" />
              </div>

              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={crmFunnelData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke={chartAxisStroke} vertical={false} />
                  <XAxis type="number" tick={{ fontSize: 11, fill: chartTickFill }} stroke={chartAxisStroke} />
                  <YAxis
                    dataKey="stage"
                    type="category"
                    tick={{ fontSize: 11, fill: chartTickFill }}
                    width={100}
                    stroke={chartAxisStroke}
                  />
                  <Tooltip
                    contentStyle={{ ...chartTooltipStyle, background: chartTooltipBg }}
                    formatter={(val: number) => [val, "Leads"]}
                  />
                  <Bar dataKey="quantidade" radius={[0, 6, 6, 0]}>
                    {crmFunnelData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color || "#FF0636"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
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
                      label={({ name, percent }) => `${name} ${Math.round(percent * 100)}%`}
                      labelLine={false}
                    >
                      {sourcePieData.map((_, index) => (
                        <Cell key={index} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ ...chartTooltipStyle, background: chartTooltipBg }} />
                  </PieChart>
                </ResponsiveContainer>
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
                  Resumo dos Leads Atendidos ({filteredLeads.length})
                </h3>
                <p className="text-xs text-gray-500 dark:text-zinc-400">
                  Visualização detalhada dos contatos filtrados por Cliente e Evento
                </p>
              </div>
              <button
                onClick={() => alert("Exportação de relatório iniciada!")}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-gray-100 hover:bg-gray-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-gray-700 dark:text-zinc-200 transition-colors"
              >
                <Download size={14} />
                <span>Exportar Relatório</span>
              </button>
            </div>

            {filteredLeads.length === 0 ? (
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
                    {paginatedLeads.map((l) => {
                      const clientObj = clients.find((c) => c.id === l.client_id);
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
                            {clientObj?.company_name ?? "Não informada"}
                          </td>
                          <td className="py-3 px-3 text-gray-600 dark:text-zinc-400 font-medium">
                            <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] bg-gray-100 dark:bg-zinc-800 text-gray-700 dark:text-zinc-300">
                              {l.source === "facebook_ads"
                                ? "Facebook Ads"
                                : l.source === "whatsapp"
                                  ? "WhatsApp"
                                  : l.source === "form_page"
                                    ? "Formulário Web"
                                    : l.source || "Outros"}
                            </span>
                          </td>
                          <td className="py-3 px-3">
                            <span
                              className={clsx(
                                "inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider",
                                l.crm_stage === "convertido"
                                  ? "bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-900"
                                  : l.crm_stage === "agendado" || l.crm_stage === "checkin"
                                    ? "bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-950/40 dark:text-blue-400 dark:border-blue-900"
                                    : "bg-gray-100 text-gray-700 border border-gray-200 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-700",
                              )}
                            >
                              {l.crm_stage_name || l.crm_stage}
                            </span>
                          </td>
                          <td className="py-3 px-3 text-gray-500 dark:text-zinc-400">
                            {new Date(l.created_at).toLocaleDateString("pt-BR")}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Rodapé de Paginação */}
            {filteredLeads.length > 0 && (
              <div className="mt-4 pt-4 border-t border-gray-100 dark:border-zinc-800 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs">
                <div className="text-gray-500 dark:text-zinc-400">
                  Exibindo <span className="font-semibold text-gray-900 dark:text-zinc-100">{startIndex + 1}</span> a{" "}
                  <span className="font-semibold text-gray-900 dark:text-zinc-100">{endIndex}</span> de{" "}
                  <span className="font-semibold text-gray-900 dark:text-zinc-100">{filteredLeads.length}</span> leads
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
                      onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
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
                  {topSalesEvent ? topSalesEvent.name : "Nenhum evento registrado"}
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
                  {topAttendanceEvent ? topAttendanceEvent.name : "Nenhum evento registrado"}
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

              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={eventMetrics}>
                  <CartesianGrid strokeDasharray="3 3" stroke={chartAxisStroke} vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: chartTickFill }} stroke={chartAxisStroke} />
                  <YAxis tick={{ fontSize: 11, fill: chartTickFill }} stroke={chartAxisStroke} />
                  <Tooltip contentStyle={{ ...chartTooltipStyle, background: chartTooltipBg }} />
                  <Legend wrapperStyle={{ fontSize: "12px" }} />
                  <Bar dataKey="totalLeads" name="Leads Captados" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="totalCheckins" name="Pessoas / Check-ins" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="totalVendas" name="Vendas Concluídas" fill="#10b981" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
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
                  <div key={ev.id} className="space-y-2 border-b border-gray-100 dark:border-zinc-800/80 pb-3 last:border-none last:pb-0">
                    <span className="text-xs font-bold text-gray-900 dark:text-zinc-100 block">
                      {ev.name}
                    </span>

                    {/* Meta de Público */}
                    <div className="space-y-1">
                      <div className="flex justify-between text-[11px]">
                        <span className="text-gray-500 dark:text-zinc-400">Público (Pessoas):</span>
                        <span className="text-purple-600 font-semibold">
                          {ev.totalCheckins} / {ev.audienceTarget || 0} ({ev.audienceProgressPercent}%)
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
                        <span className="text-gray-500 dark:text-zinc-400">Vendas:</span>
                        <span className="text-emerald-600 font-semibold">
                          {ev.totalVendas} / {ev.salesTarget || 0} ({ev.salesProgressPercent}%)
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
                    <th className="pb-3 px-3">Quantas Compraram</th>
                    <th className="pb-3 px-3">Valor Total Vendas</th>
                    <th className="pb-3 px-3">CAC</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 dark:divide-zinc-800/60">
                  {eventMetrics.map((ev) => (
                    <tr key={ev.id} className="hover:bg-gray-50/50 dark:hover:bg-zinc-900/50">
                      <td className="py-3 px-3 font-semibold text-gray-900 dark:text-zinc-100" title={ev.name}>
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
          {/* Card de Métricas Globais da Campanha */}
          <Card>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-base font-bold text-gray-900 dark:text-zinc-100">
                  Desempenho Hierárquico de Campanhas Meta Ads
                </h3>
                <p className="text-xs text-gray-500 dark:text-zinc-400">
                  Clique na linha para expandir e visualizar os Conjuntos de Anúncios e Anúncios individuais
                </p>
              </div>
              <Megaphone size={18} className="text-[#FF0636]" />
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-gray-100 dark:border-zinc-800 text-gray-500 dark:text-zinc-400 font-semibold uppercase tracking-wider">
                    <th className="pb-3 px-3">Nome (Campanha / Conjunto / Anúncio)</th>
                    <th className="pb-3 px-3">Valor Investido</th>
                    <th className="pb-3 px-3">Quantidade Leads</th>
                    <th className="pb-3 px-3">Custo por Lead</th>
                    <th className="pb-3 px-3">Impressões</th>
                    <th className="pb-3 px-3">Nº Conversas</th>
                    <th className="pb-3 px-3">Custo / Conversa</th>
                    <th className="pb-3 px-3">Contas Alcançadas</th>
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
                              {isCampExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                            </span>
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-extrabold uppercase bg-rose-100 text-[#FF0636] dark:bg-rose-950/60 dark:text-rose-400">
                              Campanha
                            </span>
                            <span>{camp.name}</span>
                          </td>
                          <td className="py-3 px-3 text-amber-600 dark:text-amber-400 font-bold font-mono">
                            {formatCurrency(camp.valorInvestido)}
                          </td>
                          <td className="py-3 px-3 font-bold text-gray-800 dark:text-zinc-200">
                            {camp.quantidadeLeads}
                          </td>
                          <td className="py-3 px-3 text-rose-600 dark:text-rose-400 font-bold font-mono">
                            {formatCurrency(camp.custoPorLead)}
                          </td>
                          <td className="py-3 px-3 text-gray-600 dark:text-zinc-400 font-mono">
                            {formatNumber(camp.impressoes)}
                          </td>
                          <td className="py-3 px-3 text-blue-600 font-bold">
                            {camp.numeroConversas}
                          </td>
                          <td className="py-3 px-3 text-blue-700 dark:text-blue-400 font-mono">
                            {formatCurrency(camp.custoConversasIniciadas)}
                          </td>
                          <td className="py-3 px-3 text-gray-600 dark:text-zinc-400 font-mono">
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
                                      {isAdSetExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                    </span>
                                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold uppercase bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-400">
                                      Conjunto
                                    </span>
                                    <span>{adSet.name}</span>
                                  </td>
                                  <td className="py-2.5 px-3 text-amber-600 dark:text-amber-400 font-mono">
                                    {formatCurrency(adSet.valorInvestido)}
                                  </td>
                                  <td className="py-2.5 px-3 font-semibold text-gray-800 dark:text-zinc-200">
                                    {adSet.quantidadeLeads}
                                  </td>
                                  <td className="py-2.5 px-3 text-rose-600 dark:text-rose-400 font-mono">
                                    {formatCurrency(adSet.custoPorLead)}
                                  </td>
                                  <td className="py-2.5 px-3 text-gray-500 font-mono">
                                    {formatNumber(adSet.impressoes)}
                                  </td>
                                  <td className="py-2.5 px-3 text-blue-600 font-semibold">
                                    {adSet.numeroConversas}
                                  </td>
                                  <td className="py-2.5 px-3 text-blue-700 dark:text-blue-400 font-mono">
                                    {formatCurrency(adSet.custoConversasIniciadas)}
                                  </td>
                                  <td className="py-2.5 px-3 text-gray-500 font-mono">
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
                                      <td className="py-2 px-3 font-mono">{formatCurrency(ad.valorInvestido)}</td>
                                      <td className="py-2 px-3 font-medium text-gray-700 dark:text-zinc-300">
                                        {ad.quantidadeLeads}
                                      </td>
                                      <td className="py-2 px-3 font-mono text-rose-600 dark:text-rose-400">
                                        {formatCurrency(ad.custoPorLead)}
                                      </td>
                                      <td className="py-2 px-3 font-mono">{formatNumber(ad.impressoes)}</td>
                                      <td className="py-2 px-3 text-blue-600 font-medium">{ad.numeroConversas}</td>
                                      <td className="py-2 px-3 font-mono">{formatCurrency(ad.custoConversasIniciadas)}</td>
                                      <td className="py-2 px-3 font-mono">{formatNumber(ad.contasAlcancadas)}</td>
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
          <Card>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-base font-bold text-gray-900 dark:text-zinc-100">
                  Matriz Cruzada: Campanha de Origem x Eventos Atribuidos
                </h3>
                <p className="text-xs text-gray-500 dark:text-zinc-400">
                  Cruzamento direto entre o canal de origem do lead e o evento em que ele participou
                </p>
              </div>
              <GitCompare size={18} className="text-[#FF0636]" />
            </div>

            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={campaignEventCrossData}>
                <CartesianGrid strokeDasharray="3 3" stroke={chartAxisStroke} vertical={false} />
                <XAxis dataKey="eventoNome" tick={{ fontSize: 11, fill: chartTickFill }} stroke={chartAxisStroke} />
                <YAxis tick={{ fontSize: 11, fill: chartTickFill }} stroke={chartAxisStroke} />
                <Tooltip contentStyle={{ ...chartTooltipStyle, background: chartTooltipBg }} />
                <Legend wrapperStyle={{ fontSize: "12px" }} />
                <Bar dataKey="facebook_ads" name="Facebook Ads" fill="#FF0636" stackId="a" />
                <Bar dataKey="whatsapp" name="WhatsApp" fill="#3b82f6" stackId="a" />
                <Bar dataKey="form_page" name="Formulário" fill="#10b981" stackId="a" />
                <Bar dataKey="manual" name="Manual / Outros" fill="#9ca3af" stackId="a" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Card>

          {/* Tabela de Matriz Cruzada */}
          <Card>
            <h3 className="text-base font-bold text-gray-900 dark:text-zinc-100 mb-4">
              Detalhamento de Conversão: Fonte de Anúncio → Evento → Venda
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-gray-100 dark:border-zinc-800 text-gray-500 dark:text-zinc-400 font-semibold uppercase tracking-wider">
                    <th className="pb-3 px-3">Evento</th>
                    <th className="pb-3 px-3">Facebook Ads</th>
                    <th className="pb-3 px-3">WhatsApp</th>
                    <th className="pb-3 px-3">Formulário</th>
                    <th className="pb-3 px-3">Manual / Outros</th>
                    <th className="pb-3 px-3">Total Leads</th>
                    <th className="pb-3 px-3">Vendas Finais</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 dark:divide-zinc-800/60">
                  {campaignEventCrossData.map((row) => (
                    <tr key={row.eventoId} className="hover:bg-gray-50/50 dark:hover:bg-zinc-900/50">
                      <td className="py-3 px-3 font-semibold text-gray-900 dark:text-zinc-100">
                        {row.eventoNome}
                      </td>
                      <td className="py-3 px-3 text-rose-600 font-semibold">{row.facebook_ads}</td>
                      <td className="py-3 px-3 text-blue-600 font-semibold">{row.whatsapp}</td>
                      <td className="py-3 px-3 text-emerald-600 font-semibold">{row.form_page}</td>
                      <td className="py-3 px-3 text-gray-500 font-medium">{row.manual}</td>
                      <td className="py-3 px-3 font-bold text-gray-900 dark:text-zinc-100">
                        {row.totalLeads}
                      </td>
                      <td className="py-3 px-3 font-bold text-emerald-600">
                        {row.vendas}
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
