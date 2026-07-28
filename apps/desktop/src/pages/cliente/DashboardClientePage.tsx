import {
  lazy,
  type ComponentType,
  useCallback,
  useEffect,
  useState,
} from "react";
import clsx from "clsx";
import { Users, TrendingUp, Calendar, Target } from "lucide-react";
import { useOutletContext } from "react-router-dom";
import { PageHeader } from "../../components/shared/PageHeader";
import { StatsCard } from "../../components/shared/StatsCard";
import { Card } from "../../components/ui/Card";
import type { Lead, User } from "../../types";
import { resolveClientId } from "../../utils/userContext";
import { MissingClientScope } from "../../components/shared/MissingClientScope";
import {
  DASHBOARD_DARK_CHANGE_EVENT,
  readDashboardDarkEnabled,
} from "../../lib/dashboard-dark-mode";
import { readStoredSession } from "../../services/auth";
import { listLeads, mapApiLeadToLead } from "../../services/leads";
import { listClientStaff, mapStaffToUser } from "../../services/staff";
import { useLeadRealtimeSync } from "../../hooks/useLeadRealtimeSync";
import { DeferredContent } from "../../components/shared/DeferredContent";

type OutletContext = {
  user: User;
};

const PIE_COLORS = ["#3b82f6", "#22c55e", "#a855f7", "#9ca3af"];

function lazyRechart(name: keyof typeof import("recharts")) {
  return lazy(() =>
    import("recharts").then((module) => ({
      default: module[name] as ComponentType<any>,
    })),
  );
}

const PieChart = lazyRechart("PieChart");
const Pie = lazyRechart("Pie");
const Cell = lazyRechart("Cell");
const BarChart = lazyRechart("BarChart");
const Bar = lazyRechart("Bar");
const XAxis = lazyRechart("XAxis");
const YAxis = lazyRechart("YAxis");
const CartesianGrid = lazyRechart("CartesianGrid");
const Tooltip = lazyRechart("Tooltip");
const ResponsiveContainer = lazyRechart("ResponsiveContainer");

export function DashboardClientePage() {
  const { user } = useOutletContext<OutletContext>();
  const clientId = resolveClientId(user);
  const [isDarkMode, setIsDarkMode] = useState(() =>
    readDashboardDarkEnabled(user.id),
  );
  const [clientLeads, setClientLeads] = useState<Lead[]>([]);
  const [staffVendors, setStaffVendors] = useState<User[]>([]);

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

  const refreshDashboard = useCallback(() => {
    const t = readStoredSession()?.accessToken;
    if (!clientId || !t) return;
    void Promise.all([
      listLeads({ client_id: clientId }, t),
      listClientStaff(clientId, t),
    ]).then(([lr, sr]) => {
      setClientLeads(lr.map(mapApiLeadToLead));
      setStaffVendors(
        sr.map(mapStaffToUser).filter((u) => u.role === "vendedor"),
      );
    });
  }, [clientId]);

  useEffect(() => {
    refreshDashboard();
  }, [refreshDashboard]);

  useLeadRealtimeSync(clientId, refreshDashboard);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const startOfWeek = new Date(today);
  startOfWeek.setDate(today.getDate() - today.getDay());
  const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

  const leadsToday = clientLeads.filter(
    (l) => new Date(l.created_at) >= today,
  ).length;

  const leadsWeek = clientLeads.filter(
    (l) => new Date(l.created_at) >= startOfWeek,
  ).length;

  const leadsMonth = clientLeads.filter(
    (l) => new Date(l.created_at) >= startOfMonth,
  ).length;

  const converted = clientLeads.filter(
    (l) => l.crm_stage === "convertido",
  ).length;
  const conversionRate =
    clientLeads.length > 0
      ? Math.round((converted / clientLeads.length) * 100)
      : 0;

  // Pie data
  const sourceCounts = clientLeads.reduce<Record<string, number>>((acc, l) => {
    acc[l.source] = (acc[l.source] || 0) + 1;
    return acc;
  }, {});
  const pieData = Object.entries(sourceCounts).map(([name, value]) => ({
    name:
      name === "facebook_ads"
        ? "Facebook Ads"
        : name === "whatsapp"
          ? "WhatsApp"
          : name === "form_page"
            ? "Formulário"
            : "Manual",
    value,
  }));

  // Funnel data
  const funnelData = [
    {
      stage: "Novo",
      count: clientLeads.filter((l) => l.crm_stage === "novo").length,
    },
    {
      stage: "Contactado",
      count: clientLeads.filter((l) => l.crm_stage === "contactado").length,
    },
    {
      stage: "Não responde",
      count: clientLeads.filter((l) => l.crm_stage === "nao_responde").length,
    },
    {
      stage: "Agendado",
      count: clientLeads.filter((l) => l.crm_stage === "agendado").length,
    },
    {
      stage: "Check-in",
      count: clientLeads.filter((l) => l.crm_stage === "checkin").length,
    },
    {
      stage: "Convertido",
      count: clientLeads.filter((l) => l.crm_stage === "convertido").length,
    },
    {
      stage: "Perdido",
      count: clientLeads.filter((l) => l.crm_stage === "perdido").length,
    },
  ];

  const vendorStats = staffVendors
    .map((v) => {
      const assigned = clientLeads.filter((l) => l.assigned_vendor_id === v.id);
      const conv = assigned.filter((l) => l.crm_stage === "convertido").length;
      return {
        id: v.id,
        name: v.name,
        assigned: assigned.length,
        converted: conv,
        rate:
          assigned.length > 0 ? Math.round((conv / assigned.length) * 100) : 0,
      };
    })
    .sort((a, b) => b.rate - a.rate);

  if (!clientId) return <MissingClientScope />;

  const chartAxisStroke = isDarkMode ? "#52525b" : "#e5e7eb";
  const chartTickFill = isDarkMode ? "#a1a1aa" : "#6b7280";
  const chartTooltipBg = isDarkMode ? "#18181b" : "#fffdf8";
  const chartTooltipStyle = {
    border: isDarkMode ? "1px solid #3f3f46" : "1px solid #eadfce",
    borderRadius: 12,
    color: isDarkMode ? "#f4f4f5" : "#18181b",
  };

  return (
    <div
      className={clsx(
        "space-y-6",
        isDarkMode &&
          "dashboard-dark cliente-detail-dark -mx-4 -mt-4 rounded-none px-4 pb-8 pt-4 md:-mx-6 md:-mt-6 md:px-6 xl:-mx-8 xl:-mt-8 xl:px-8",
        isDarkMode && "bg-black",
      )}
    >
      <PageHeader
        title="Dashboard"
        breadcrumbs={[{ label: "TechStore" }, { label: "Dashboard" }]}
        subtitle="Visão geral da sua empresa"
        dark={isDarkMode}
      />

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatsCard
          title="Leads Hoje"
          value={leadsToday}
          icon={<Users size={20} />}
          iconColor="bg-blue-100 text-blue-600"
          change="+2 vs ontem"
          changeType="positive"
        />
        <StatsCard
          title="Esta Semana"
          value={leadsWeek}
          icon={<Calendar size={20} />}
          iconColor="bg-indigo-100 text-indigo-600"
        />
        <StatsCard
          title="Este Mês"
          value={leadsMonth}
          icon={<TrendingUp size={20} />}
          iconColor="bg-green-100 text-green-600"
        />
        <StatsCard
          title="Taxa de Conversão"
          value={`${conversionRate}%`}
          icon={<Target size={20} />}
          iconColor="bg-orange-100 text-orange-600"
          change="+3% vs mês anterior"
          changeType="positive"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Pie chart */}
        <Card>
          <h3 className="text-base font-semibold text-gray-900 mb-4">
            Leads por Fonte
          </h3>
          <DeferredContent height={220} label="Carregando leads por fonte">
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={90}
                  paddingAngle={3}
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
                  {pieData.map((_, index) => (
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
                  formatter={(value: number | string) => [value, "Leads"]}
                />
              </PieChart>
            </ResponsiveContainer>
          </DeferredContent>
        </Card>

        {/* Funnel bar chart */}
        <Card>
          <h3 className="text-base font-semibold text-gray-900 mb-4">
            Funil CRM por Etapa
          </h3>
          <DeferredContent height={220} label="Carregando funil por etapa">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={funnelData} layout="vertical">
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
                  width={70}
                  stroke={chartAxisStroke}
                />
                <Tooltip
                  contentStyle={{
                    ...chartTooltipStyle,
                    background: chartTooltipBg,
                  }}
                  formatter={(value: number | string) => [value, "Leads"]}
                />
                <Bar
                  dataKey="count"
                  name="Leads"
                  fill="#3b82f6"
                  radius={[0, 4, 4, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </DeferredContent>
        </Card>
      </div>

      {/* Top vendors table */}
      <Card>
        <h3 className="text-base font-semibold text-gray-900 mb-4">
          Top Vendedores
        </h3>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100">
              <th className="text-left px-2 py-2 text-gray-500 font-medium">
                #
              </th>
              <th className="text-left px-2 py-2 text-gray-500 font-medium">
                Vendedor
              </th>
              <th className="text-left px-2 py-2 text-gray-500 font-medium">
                Leads Atribuídos
              </th>
              <th className="text-left px-2 py-2 text-gray-500 font-medium">
                Convertidos
              </th>
              <th className="text-left px-2 py-2 text-gray-500 font-medium">
                Taxa
              </th>
            </tr>
          </thead>
          <tbody>
            {vendorStats.slice(0, 3).map((v, i) => (
              <tr key={v.id} className="border-b border-gray-50 last:border-0">
                <td className="px-2 py-3">
                  <span
                    className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                      i === 0
                        ? "bg-yellow-100 text-yellow-700"
                        : i === 1
                          ? "bg-gray-100 text-gray-600"
                          : "bg-orange-100 text-orange-600"
                    }`}
                  >
                    {i + 1}
                  </span>
                </td>
                <td className="px-2 py-3 font-medium text-gray-900">
                  {v.name}
                </td>
                <td className="px-2 py-3 text-gray-600">{v.assigned}</td>
                <td className="px-2 py-3 text-green-600 font-semibold">
                  {v.converted}
                </td>
                <td className="px-2 py-3">
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 w-16 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-green-400 rounded-full"
                        style={{ width: `${v.rate}%` }}
                      />
                    </div>
                    <span className="text-xs text-gray-500">{v.rate}%</span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
