import { useCallback, useEffect, useState } from "react";
import {
  Users,
  Target,
  TrendingUp,
  Trophy,
  ArrowRight,
  Star,
} from "lucide-react";
import { useOutletContext, useNavigate } from "react-router-dom";
import { PageHeader } from "../../components/shared/PageHeader";
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

const META_CONVERSOES = 15;
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

  const refreshDashboard = useCallback(() => {
    const t = readStoredSession()?.accessToken;
    if (!t) return;
    void listLeads({}, t)
      .then((rows) =>
        setMyLeads(
          rows
            .map(mapApiLeadToLead)
            .filter((l) => l.assigned_vendor_id === vendorId),
        ),
      )
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
  const metaPct = Math.min(
    Math.round((salesCount / META_CONVERSOES) * 100),
    100,
  );
  const leadsThisWeek = (() => {
    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    return myLeads.filter((l) => new Date(l.created_at).getTime() >= weekAgo)
      .length;
  })();

  return (
    <div>
      <PageHeader
        title="Meu Dashboard"
        breadcrumbs={[{ label: "Vendedor" }, { label: "Dashboard" }]}
        subtitle={`Olá, ${user.name.split(" ")[0]} — resumo de hoje.`}
      />

      {/* Stats */}
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatsCard
          title="Meus Leads"
          value={myLeads.length}
          icon={<Users size={20} />}
          iconColor="bg-blue-100 text-blue-600"
          change={
            leadsThisWeek > 0 ? `+${leadsThisWeek} esta semana` : undefined
          }
          changeType="positive"
        />
        <StatsCard
          title="Convertidos"
          value={salesCount}
          icon={<Target size={20} />}
          iconColor="bg-green-100 text-green-600"
        />
        <StatsCard
          title="Taxa de Conversão"
          value={`${convRate}%`}
          icon={<TrendingUp size={20} />}
          iconColor="bg-orange-100 text-orange-600"
        />
        <StatsCard
          title="Posição no Ranking"
          value={rankPosition ? `#${rankPosition}` : "—"}
          icon={<Trophy size={20} />}
          iconColor="bg-yellow-100 text-yellow-600"
          subtitle="por pontuação"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:gap-6">
        {/* Meta progress */}
        <Card padding="sm" className="md:p-6">
          <h3 className="mb-1 text-lg font-semibold tracking-tight text-gray-900 md:text-base">
            Meta do Mês
          </h3>
          <p className="mb-4 text-sm text-gray-500">
            {salesCount} de {META_CONVERSOES} vendas
          </p>

          <div className="relative">
            <div className="h-3 overflow-hidden rounded-full bg-gray-100 md:h-4">
              <div
                className="h-full rounded-full bg-gradient-to-r from-blue-400 to-blue-500 transition-all"
                style={{ width: `${metaPct}%` }}
              />
            </div>
            <p className="mt-1 text-right text-sm font-bold text-blue-600">
              {metaPct}%
            </p>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
            {myLeads
              .filter((l) => l.crm_stage !== "perdido")
              .slice(0, 3)
              .map((lead) => (
                <div key={lead.id} className="rounded-xl bg-gray-50 p-3">
                  <p className="truncate text-xs font-medium text-gray-900">
                    {lead.name.split(" ")[0]}
                  </p>
                  <StageBadge stage={lead.crm_stage} />
                </div>
              ))}
          </div>
        </Card>

        {eventRanking &&
          (eventRanking.teams.length > 0 ||
            eventRanking.vendors.length > 0) && (
            <Card padding="sm" className="md:p-6">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-lg font-semibold tracking-tight text-gray-900 md:text-base">
                  Ranking do evento
                </h3>
                <button
                  type="button"
                  onClick={() => navigate("/vendedor/ranking")}
                  className="flex items-center gap-1 text-xs font-semibold text-[#E51838] hover:underline"
                >
                  Ver completo
                  <ArrowRight size={14} />
                </button>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {eventRanking.teams[0] && (
                  <div className="flex items-center gap-3 rounded-2xl bg-gradient-to-r from-[#E51838] to-[#b3102b] p-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/15 text-white">
                      <Trophy size={18} />
                    </span>
                    <div className="min-w-0">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-white/70">
                        Equipe na frente
                      </p>
                      <p className="truncate text-sm font-bold text-white">
                        {eventRanking.teams[0].team_name}
                      </p>
                      <p className="text-xs text-white/80">
                        {eventRanking.teams[0].sold} vendas
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
                    <div className="flex items-center gap-3 rounded-2xl bg-gray-50 p-3">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-yellow-100 text-yellow-600">
                        <Trophy size={18} />
                      </span>
                      <div className="min-w-0">
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">
                          Sua posição no evento
                        </p>
                        <p className="text-sm font-bold text-gray-900">
                          {me
                            ? `#${myIdx + 1} de ${eventRanking.vendors.length}`
                            : "—"}
                        </p>
                        <p className="text-xs text-gray-500">
                          {me?.sold ?? 0} vendas
                        </p>
                      </div>
                    </div>
                  );
                })()}
              </div>
            </Card>
          )}

        <Card padding="sm" className="md:p-6">
          <h3 className="mb-4 text-lg font-semibold tracking-tight text-gray-900 md:text-base">
            Avaliações de atendimento
          </h3>
          {ratingSummary && ratingSummary.count > 0 ? (
            <div className="flex items-center gap-3 rounded-2xl bg-gray-50 p-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-500">
                <Star size={22} className="fill-amber-500" />
              </span>
              <div className="min-w-0">
                <p className="text-2xl font-black tabular-nums text-gray-900">
                  {ratingSummary.average.toFixed(1)}
                  <span className="ml-1 text-sm font-medium text-gray-400">
                    / 5
                  </span>
                </p>
                <p className="text-xs text-gray-500">
                  {ratingSummary.count} avaliaç
                  {ratingSummary.count === 1 ? "ão" : "ões"} de clientes
                </p>
              </div>
            </div>
          ) : (
            <p className="text-sm text-gray-400">Sem avaliações ainda.</p>
          )}
        </Card>
      </div>
    </div>
  );
}
