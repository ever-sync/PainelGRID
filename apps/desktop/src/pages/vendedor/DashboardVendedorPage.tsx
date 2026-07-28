import { useCallback, useEffect, useState } from "react";
import {
  Users,
  Target,
  TrendingUp,
  Trophy,
  ArrowRight,
  Star,
  Sparkles,
  Flame,
} from "lucide-react";
import { useOutletContext, useNavigate } from "react-router-dom";
import clsx from "clsx";
import { StatsCard } from "../../components/shared/StatsCard";
import { Card } from "../../components/ui/Card";
import { StageBadge } from "../../components/ui/Badge";
import type { Lead, User } from "../../types";
import { resolveClientId, resolveVendorId } from "../../utils/userContext";
import { readStoredSession } from "../../services/auth";
import { listLeads, mapApiLeadToLead } from "../../services/leads";
import { listVendorSales } from "../../services/sales";
import { getVendorScoreRanking } from "../../services/vendorScore";
import {
  listEvents,
  getEventDashboardTv,
  type EventDashboardTvResponse,
} from "../../services/events";
import {
  getMyServiceRatingSummary,
  type ServiceRatingSummary,
} from "../../services/serviceRatings";
import { useLeadRealtimeSync } from "../../hooks/useLeadRealtimeSync";
import {
  DASHBOARD_DARK_CHANGE_EVENT,
  readDashboardDarkEnabled,
} from "../../lib/dashboard-dark-mode";

type OutletContext = {
  user: User;
};

export function DashboardVendedorPage() {
  const { user } = useOutletContext<OutletContext>();
  const navigate = useNavigate();
  const vendorId = resolveVendorId(user) ?? user.id;
  const clientId = resolveClientId(user);
  const [myLeads, setMyLeads] = useState<Lead[]>([]);
  const [salesCount, setSalesCount] = useState(0);
  const [rankPosition, setRankPosition] = useState<number | null>(null);
  const [eventRanking, setEventRanking] =
    useState<EventDashboardTvResponse | null>(null);
  const [ratingSummary, setRatingSummary] =
    useState<ServiceRatingSummary | null>(null);
  const [isDarkMode, setIsDarkMode] = useState(false);

  useEffect(() => {
    setIsDarkMode(readDashboardDarkEnabled(user.id));
    const syncTheme = () => setIsDarkMode(readDashboardDarkEnabled(user.id));
    window.addEventListener("storage", syncTheme);
    window.addEventListener(DASHBOARD_DARK_CHANGE_EVENT, syncTheme);
    return () => {
      window.removeEventListener("storage", syncTheme);
      window.removeEventListener(DASHBOARD_DARK_CHANGE_EVENT, syncTheme);
    };
  }, [user.id]);

  const refreshDashboard = useCallback(() => {
    const t = readStoredSession()?.accessToken;
    if (!t) return;
    void listLeads({}, t)
      .then((rows) => {
        const mapped = rows.map(mapApiLeadToLead);
        const matches = mapped.filter(
          (l) =>
            l.assigned_vendor_id === vendorId ||
            l.registered_by_id === vendorId ||
            !l.assigned_vendor_id,
        );
        setMyLeads(matches.length > 0 ? matches : mapped);
      })
      .catch(() => setMyLeads([]));
    void listVendorSales(t)
      .then((sales) => setSalesCount(sales.length))
      .catch(() => setSalesCount(0));
    void getVendorScoreRanking(
      t,
      clientId ? { client_id: clientId, limit: 100 } : { limit: 100 },
    )
      .then((ranking) => {
        const idx = ranking.findIndex((row) => row.vendor_id === vendorId);
        setRankPosition(idx >= 0 ? idx + 1 : null);
      })
      .catch(() => setRankPosition(null));
  }, [vendorId, clientId]);

  useEffect(() => {
    refreshDashboard();
  }, [refreshDashboard]);

  useEffect(() => {
    const t = readStoredSession()?.accessToken;
    if (!t) return;
    void getMyServiceRatingSummary(t)
      .then((summary) => setRatingSummary(summary))
      .catch(() => setRatingSummary(null));
  }, []);

  useEffect(() => {
    const t = readStoredSession()?.accessToken;
    if (!clientId || !t) return;
    let active = true;
    void listEvents({ client_id: clientId }, t)
      .then((rows) => {
        const sorted = [...rows].sort(
          (a, b) =>
            new Date(b.event_date).getTime() - new Date(a.event_date).getTime(),
        );
        const chosen =
          sorted.find((event) => event.status === "active") ?? sorted[0];
        if (!chosen) return null;
        return getEventDashboardTv(chosen.id, t);
      })
      .then((response) => {
        if (active && response) setEventRanking(response);
      })
      .catch(() => {
        if (active) setEventRanking(null);
      });
    return () => {
      active = false;
    };
  }, [clientId]);

  useLeadRealtimeSync(clientId, refreshDashboard);

  const convRate =
    myLeads.length > 0 ? Math.round((salesCount / myLeads.length) * 100) : 0;
  const activeEventName = eventRanking?.event.name ?? null;
  const activeEventSalesTarget = eventRanking?.event.sales_target ?? null;
  const activeEventSalesCount = eventRanking?.funnel.sold ?? 0;
  const eventMetaPct = activeEventSalesTarget
    ? Math.min(
        Math.round((activeEventSalesCount / activeEventSalesTarget) * 100),
        100,
      )
    : 0;
  const leadsThisWeek = (() => {
    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    return myLeads.filter((l) => new Date(l.created_at).getTime() >= weekAgo)
      .length;
  })();

  const firstName = user.name.split(" ")[0];

  return (
    <div className={clsx("space-y-6", isDarkMode && "dashboard-dark bg-black")}>
      {/* Hero Welcome Banner */}
      <div
        className={clsx(
          "relative overflow-hidden rounded-[28px] p-6 border shadow-sm transition-all",
          isDarkMode
            ? "border-zinc-800 bg-gradient-to-r from-[#FF0636]/20 via-[#18181b] to-black text-white"
            : "border-rose-100 bg-gradient-to-r from-rose-50 via-white to-red-50 text-zinc-900",
        )}
      >
        <div className="relative z-10 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold bg-[#FF0636]/10 text-[#FF0636] border border-[#FF0636]/20">
                <Sparkles size={13} />
                <span>Painel Comercial Ativo</span>
              </div>
              {activeEventName ? (
                <div className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                  <Flame size={13} />
                  <span>{activeEventName}</span>
                </div>
              ) : null}
            </div>
            <h2 className="text-xl md:text-2xl font-black tracking-tight">
              Acelere suas conversões hoje, {firstName}! 🚀
            </h2>
            <p className="text-xs md:text-sm text-zinc-500 dark:text-zinc-400">
              Você já atendeu{" "}
              <strong className="text-zinc-900 dark:text-zinc-100">
                {myLeads.length} leads
              </strong>{" "}
              com taxa de conversão de{" "}
              <strong className="text-emerald-600 dark:text-emerald-400">
                {convRate}%
              </strong>
              .
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {eventRanking?.event.id ? (
              <button
                type="button"
                onClick={() =>
                  navigate(`/eventos/${eventRanking.event.id}/tv-fila`)
                }
                className={clsx(
                  "inline-flex items-center justify-center gap-2 rounded-full px-5 py-2.5 text-xs font-bold transition-all hover:scale-105",
                  isDarkMode
                    ? "bg-white/10 text-white hover:bg-white/20 border border-white/20"
                    : "bg-white text-zinc-900 hover:bg-zinc-50 border border-zinc-200 shadow-sm",
                )}
              >
                <Users size={14} />
                <span>Fila de Atendimento</span>
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => navigate("/vendedor/leads")}
              className="inline-flex items-center justify-center gap-2 rounded-full px-5 py-2.5 text-xs font-bold text-white bg-[#FF0636] hover:bg-[#e0052e] shadow-lg shadow-[#FF0636]/25 transition-all hover:scale-105 shrink-0"
            >
              <span>Ver Meus Leads</span>
              <ArrowRight size={14} />
            </button>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatsCard
          title="Meus Leads"
          value={myLeads.length}
          icon={<Users size={20} />}
          iconColor="bg-blue-100 text-blue-600 dark:bg-blue-950/60 dark:text-blue-400"
          change={
            leadsThisWeek > 0 ? `+${leadsThisWeek} esta semana` : undefined
          }
          changeType="positive"
        />
        <StatsCard
          title="Convertidos"
          value={salesCount}
          icon={<Target size={20} />}
          iconColor="bg-emerald-100 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400"
        />
        <StatsCard
          title="Taxa de Conversão"
          value={`${convRate}%`}
          icon={<TrendingUp size={20} />}
          iconColor="bg-amber-100 text-amber-600 dark:bg-amber-950/60 dark:text-amber-400"
        />
        <StatsCard
          title="Posição no Ranking"
          value={rankPosition ? `#${rankPosition}` : "—"}
          icon={<Trophy size={20} />}
          iconColor="bg-yellow-100 text-yellow-600 dark:bg-yellow-950/60 dark:text-yellow-400"
          subtitle="por pontuação"
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Meta progress - 2 Cols */}
        <Card className="lg:col-span-2 p-5 md:p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-gray-900 dark:text-zinc-100 flex items-center gap-2">
                <Flame size={18} className="text-[#FF0636]" />
                <span>Meta de Vendas do Evento</span>
              </h3>
              <p className="text-xs text-gray-500 dark:text-zinc-400">
                {activeEventName
                  ? activeEventSalesTarget
                    ? `${activeEventSalesCount} de ${activeEventSalesTarget} vendas realizadas (${eventMetaPct}%) — ${activeEventName}`
                    : `Meta não definida para ${activeEventName}`
                  : "Nenhum evento ativo no momento"}
              </p>
            </div>
            {activeEventSalesTarget ? (
              <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-black bg-[#FF0636]/10 text-[#FF0636] border border-[#FF0636]/20">
                Faltam{" "}
                {Math.max(0, activeEventSalesTarget - activeEventSalesCount)}{" "}
                vendas
              </span>
            ) : null}
          </div>

          <div className="relative pt-1">
            <div className="h-4 overflow-hidden rounded-full bg-gray-100 dark:bg-zinc-800 p-0.5 border border-gray-200 dark:border-zinc-700">
              <div
                className="h-full rounded-full bg-gradient-to-r from-[#FF0636] via-rose-500 to-amber-500 shadow-md transition-all duration-500"
                style={{ width: `${eventMetaPct}%` }}
              />
            </div>
          </div>

          <div className="pt-2">
            <p className="text-xs font-bold text-gray-700 dark:text-zinc-300 mb-2">
              Leads em Destaque no seu Funil:
            </p>
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
              {myLeads
                .filter((l) => l.crm_stage !== "perdido")
                .slice(0, 3)
                .map((lead) => (
                  <div
                    key={lead.id}
                    className="flex flex-col justify-between rounded-xl bg-gray-50 dark:bg-zinc-900 p-3 border border-gray-100 dark:border-zinc-800 hover:border-gray-200 dark:hover:border-zinc-700 transition-colors"
                  >
                    <p className="truncate text-xs font-bold text-gray-900 dark:text-zinc-100 mb-1">
                      {lead.name}
                    </p>
                    <StageBadge stage={lead.crm_stage} />
                  </div>
                ))}
            </div>
          </div>
        </Card>

        {/* Avaliações de atendimento - 1 Col */}
        <Card className="p-5 md:p-6 flex flex-col justify-between">
          <div>
            <h3 className="mb-4 text-base font-bold text-gray-900 dark:text-zinc-100 flex items-center gap-2">
              <Star size={18} className="text-amber-500 fill-amber-500" />
              <span>Sua Nota de Atendimento</span>
            </h3>

            {ratingSummary && ratingSummary.count > 0 ? (
              <div className="flex items-center gap-4 rounded-2xl bg-gradient-to-br from-amber-500/10 via-amber-500/5 to-transparent p-4 border border-amber-500/20">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-amber-500 text-white shadow-lg shadow-amber-500/30 font-black text-lg">
                  ★
                </span>
                <div className="min-w-0">
                  <p className="text-3xl font-black tabular-nums text-gray-900 dark:text-zinc-100">
                    {ratingSummary.average.toFixed(1)}
                    <span className="ml-1 text-sm font-medium text-gray-400">
                      / 5.0
                    </span>
                  </p>
                  <p className="text-xs text-gray-500 dark:text-zinc-400">
                    {ratingSummary.count} avaliaç
                    {ratingSummary.count === 1 ? "ão" : "ões"} registradas
                  </p>
                </div>
              </div>
            ) : (
              <div className="py-6 text-center text-sm text-gray-400 dark:text-zinc-500">
                Ainda não há avaliações registradas para seu atendimento.
              </div>
            )}
          </div>

          <p className="mt-4 text-[11px] text-gray-400 dark:text-zinc-500 text-center">
            Avaliações coletadas automaticamente após check-in e vendas.
          </p>
        </Card>
      </div>

      {/* Ranking do evento */}
      {eventRanking &&
        (eventRanking.teams.length > 0 || eventRanking.vendors.length > 0) && (
          <Card className="p-5 md:p-6">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-base font-bold text-gray-900 dark:text-zinc-100 flex items-center gap-2">
                <Trophy size={18} className="text-amber-500" />
                <span>Ranking do Evento Ao Vivo</span>
              </h3>
              <button
                type="button"
                onClick={() => navigate("/vendedor/ranking")}
                className="flex items-center gap-1 text-xs font-bold text-[#FF0636] hover:underline"
              >
                Ver Ranking Completo
                <ArrowRight size={14} />
              </button>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {eventRanking.teams[0] && (
                <div className="flex items-center gap-3.5 rounded-2xl bg-gradient-to-r from-[#FF0636] to-[#b3102b] p-4 text-white shadow-md">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/20 text-white font-black">
                    🏆
                  </span>
                  <div className="min-w-0">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-white/80">
                      Equipe Líder no Evento
                    </p>
                    <p className="truncate text-base font-black text-white">
                      {eventRanking.teams[0].team_name}
                    </p>
                    <p className="text-xs text-white/90 font-semibold">
                      {eventRanking.teams[0].sold} vendas concluídas
                    </p>
                  </div>
                </div>
              )}

              {(() => {
                const myIdx = eventRanking.vendors.findIndex(
                  (v) => v.vendor_id === vendorId,
                );
                const me = myIdx >= 0 ? eventRanking.vendors[myIdx] : null;
                return (
                  <div className="flex items-center gap-3.5 rounded-2xl bg-gray-50 dark:bg-zinc-900 p-4 border border-gray-100 dark:border-zinc-800">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-600 dark:bg-amber-950/60 dark:text-amber-400 font-bold">
                      <Trophy size={20} />
                    </span>
                    <div className="min-w-0">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500 dark:text-zinc-400">
                        Sua Posição no Evento
                      </p>
                      <p className="text-base font-black text-gray-900 dark:text-zinc-100">
                        {me
                          ? `#${myIdx + 1} de ${eventRanking.vendors.length} vendedores`
                          : "—"}
                      </p>
                      <p className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                        {me?.sold ?? 0} vendas registradas
                      </p>
                    </div>
                  </div>
                );
              })()}
            </div>
          </Card>
        )}
    </div>
  );
}
