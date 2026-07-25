import { useEffect, useMemo, useState } from "react";
import { useOutletContext } from "react-router-dom";
import clsx from "clsx";
import {
  Building2,
  Calendar,
  Filter,
  BarChart3,
  Users,
  TrendingUp,
  Target,
  FileText,
  Download,
  CheckCircle2,
  Clock,
  ChevronDown,
} from "lucide-react";
import { PageHeader } from "../../components/shared/PageHeader";
import { StatsCard } from "../../components/shared/StatsCard";
import { Card } from "../../components/ui/Card";
import { readStoredSession } from "../../services/auth";
import { listClients, mapApiClientToClient } from "../../services/clients";
import { listEvents } from "../../services/events";
import { listLeads, mapApiLeadToLead } from "../../services/leads";
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
} from "recharts";

const PIE_COLORS = ["#FF0636", "#3b82f6", "#10b981", "#f59e0b", "#8b5cf6", "#64748b"];

export function RelatorioGestorPage() {
  const { user } = useOutletContext<AppOutletContext>();
  const [isDarkMode, setIsDarkMode] = useState(() =>
    readDashboardDarkEnabled(user.id),
  );

  const [clients, setClients] = useState<Client[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Filtros seletores superiores do lado direito
  const [selectedClientId, setSelectedClientId] = useState<string>("all");
  const [selectedEventId, setSelectedEventId] = useState<string>("all");

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
          // Verifica se o lead pertence ao cliente do evento ou se é atribuído ao evento
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
    (l) => l.crm_stage === "agendado" || l.crm_stage === "checkin",
  ).length;
  const leadsConvertidos = filteredLeads.filter(
    (l) => l.crm_stage === "convertido",
  ).length;
  const taxaConversao =
    totalLeads > 0 ? Math.round((leadsConvertidos / totalLeads) * 100) : 0;

  // Dados do gráfico de funil CRM
  const crmFunnelData = useMemo(() => {
    const stages = [
      { key: "novo", label: "Novo Lead" },
      { key: "contactado", label: "Contactado" },
      { key: "nao_responde", label: "Não Responde" },
      { key: "agendado", label: "Agendado" },
      { key: "checkin", label: "Check-in" },
      { key: "convertido", label: "Convertido" },
      { key: "perdido", label: "Perdido" },
    ];
    return stages.map((s) => ({
      stage: s.label,
      quantidade: filteredLeads.filter((l) => l.crm_stage === s.key).length,
    }));
  }, [filteredLeads]);

  // Dados do gráfico por Origem (Source)
  const sourcePieData = useMemo(() => {
    const map: Record<string, number> = {};
    filteredLeads.forEach((l) => {
      const srcName =
        l.source === "facebook_ads"
          ? "Facebook Ads"
          : l.source === "whatsapp"
            ? "WhatsApp"
            : l.source === "form_page"
              ? "Formulário"
              : "Outros";
      map[srcName] = (map[srcName] || 0) + 1;
    });
    return Object.entries(map).map(([name, value]) => ({ name, value }));
  }, [filteredLeads]);

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
        subtitle="Análise consolidada de leads, eventos e conversões"
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

      {/* Cards de Estatísticas Principais */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
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
        {/* Gráfico 1: Funil do CRM */}
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
              <Bar dataKey="quantidade" fill="#FF0636" radius={[0, 6, 6, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        {/* Gráfico 2: Leads por Origem */}
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
                {filteredLeads.slice(0, 15).map((l) => {
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
                      <td className="py-3 px-3 text-gray-600 dark:text-zinc-400 capitalize">
                        {l.source === "facebook_ads" ? "Facebook Ads" : l.source}
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
                          {l.crm_stage}
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
      </Card>
    </div>
  );
}
