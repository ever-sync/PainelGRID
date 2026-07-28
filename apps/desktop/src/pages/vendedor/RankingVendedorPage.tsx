import { useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { Crown, Trophy } from "lucide-react";
import clsx from "clsx";
import { PageHeader } from "../../components/shared/PageHeader";
import { Select } from "../../components/ui/Select";
import { Notice } from "../../components/ui/Notice";
import { Card } from "../../components/ui/Card";
import { TeamRanking } from "../../components/tv/TeamRanking";
import { VendorRanking } from "../../components/tv/VendorRanking";
import { avatarColor, vendorInitials } from "../../components/tv/shared";
import type { User } from "../../types";
import { resolveClientId } from "../../utils/userContext";
import { readStoredSession } from "../../services/auth";
import {
  DASHBOARD_DARK_CHANGE_EVENT,
  readDashboardDarkEnabled,
} from "../../lib/dashboard-dark-mode";
import { getVendorScoreRanking } from "../../services/vendorScore";
import {
  listEvents,
  getEventDashboardTv,
  type ApiEvent,
  type EventDashboardTvResponse,
} from "../../services/events";

type OutletContext = {
  user: User;
};

type VendorRow = EventDashboardTvResponse["vendors"][number];
type TeamRow = EventDashboardTvResponse["teams"][number];

const PODIUM_PLACE_META: Record<
  1 | 2 | 3,
  {
    avatarSize: string;
    pedestalHeight: string;
    gradient: string;
    ring: string;
    darkLabel: string;
    lightLabel: string;
  }
> = {
  1: {
    avatarSize: "h-16 w-16 text-xl",
    pedestalHeight: "h-20",
    gradient: "from-amber-300 to-yellow-500",
    ring: "ring-amber-300",
    darkLabel: "text-amber-300",
    lightLabel: "text-amber-600",
  },
  2: {
    avatarSize: "h-14 w-14 text-lg",
    pedestalHeight: "h-14",
    gradient: "from-zinc-300 to-zinc-400",
    ring: "ring-zinc-300",
    darkLabel: "text-zinc-300",
    lightLabel: "text-zinc-500",
  },
  3: {
    avatarSize: "h-14 w-14 text-lg",
    pedestalHeight: "h-10",
    gradient: "from-orange-400 to-orange-600",
    ring: "ring-orange-400",
    darkLabel: "text-orange-300",
    lightLabel: "text-orange-600",
  },
};

function PodiumStep({
  place,
  vendor,
  dark,
}: {
  place: 1 | 2 | 3;
  vendor: VendorRow;
  dark: boolean;
}) {
  const meta = PODIUM_PLACE_META[place];
  const palette = avatarColor(vendor.vendor_id);
  return (
    <div className="flex flex-1 flex-col items-center">
      {place === 1 && <Crown size={22} className="mb-1 text-amber-400" />}
      <span
        className={clsx(
          "flex items-center justify-center rounded-full bg-gradient-to-br font-black text-white ring-2",
          meta.avatarSize,
          palette[0],
          palette[1],
          meta.ring,
        )}
      >
        {vendorInitials(vendor.vendor_name)}
      </span>
      <p
        className={clsx(
          "mt-2 max-w-[5.5rem] truncate text-center text-xs font-bold",
          dark ? "text-zinc-100" : "text-gray-900",
        )}
      >
        {vendor.vendor_name}
      </p>
      <p
        className={clsx(
          "text-lg font-black tabular-nums",
          dark ? meta.darkLabel : meta.lightLabel,
        )}
      >
        {vendor.sold}
      </p>
      <p
        className={clsx(
          "mb-2 text-[10px] uppercase tracking-wide",
          dark ? "text-zinc-500" : "text-gray-400",
        )}
      >
        vendas
      </p>
      <div
        className={clsx(
          "flex w-full items-start justify-center rounded-t-xl bg-gradient-to-b pt-1 shadow-lg",
          meta.pedestalHeight,
          meta.gradient,
        )}
      >
        <span className="font-black text-black/30">{place}º</span>
      </div>
    </div>
  );
}

function VendorPodium({
  vendors,
  dark,
}: {
  vendors: VendorRow[];
  dark: boolean;
}) {
  const [first, second, third] = vendors;
  if (!first) return null;
  return (
    <div
      className={clsx(
        "mb-4 flex items-end justify-center gap-3 rounded-2xl px-4 pb-4 pt-5",
        dark
          ? "border border-zinc-800 bg-gradient-to-b from-[#161616] to-[#0b0b0b]"
          : "card-surface border border-white/80 bg-white/95 shadow-[0_10px_30px_rgba(15,23,42,0.05)]",
      )}
    >
      {second ? (
        <PodiumStep place={2} vendor={second} dark={dark} />
      ) : (
        <div className="flex-1" />
      )}
      <PodiumStep place={1} vendor={first} dark={dark} />
      {third ? (
        <PodiumStep place={3} vendor={third} dark={dark} />
      ) : (
        <div className="flex-1" />
      )}
    </div>
  );
}

function LightVendorList({ vendors }: { vendors: VendorRow[] }) {
  return (
    <Card padding="sm">
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
        Ranking de vendedores
      </h3>
      <ul className="space-y-2">
        {vendors.map((vendor, idx) => {
          const palette = avatarColor(vendor.vendor_id);
          return (
            <li
              key={vendor.vendor_id}
              className="flex items-center gap-3 rounded-xl bg-gray-50 p-2.5"
            >
              <span className="w-4 shrink-0 text-center text-xs font-bold text-gray-400">
                {idx + 1}
              </span>
              <span
                className={clsx(
                  "flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br text-xs font-bold text-white",
                  palette[0],
                  palette[1],
                )}
              >
                {vendorInitials(vendor.vendor_name)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-gray-900">
                  {vendor.vendor_name}
                </p>
                <p className="truncate text-xs text-gray-500">
                  {vendor.team_name ?? "Sem equipe"}
                </p>
              </div>
              <span className="shrink-0 text-lg font-black tabular-nums text-emerald-600">
                {vendor.sold}
              </span>
            </li>
          );
        })}
        {vendors.length === 0 && (
          <p className="py-4 text-center text-sm text-gray-400">
            Sem vendedores cadastrados nas equipes do evento.
          </p>
        )}
      </ul>
    </Card>
  );
}

function LightTeamList({ teams }: { teams: TeamRow[] }) {
  return (
    <Card padding="sm">
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
        Ranking de equipes
      </h3>
      <ul className="space-y-2">
        {teams.map((team, idx) => (
          <li
            key={team.team_id}
            className="flex items-center gap-3 rounded-xl bg-gray-50 p-3"
          >
            <span className="w-4 shrink-0 text-center text-xs font-bold text-gray-400">
              {idx + 1}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold text-gray-900">
                {team.team_name}
              </p>
              <p className="text-xs text-gray-500">
                {team.scheduled} agendados · {team.checked_in} compareceram
              </p>
            </div>
            <span className="shrink-0 text-xl font-black tabular-nums text-emerald-600">
              {team.sold}
            </span>
          </li>
        ))}
        {teams.length === 0 && (
          <p className="py-4 text-center text-sm text-gray-400">
            Sem equipes cadastradas no evento.
          </p>
        )}
      </ul>
    </Card>
  );
}

export function RankingVendedorPage() {
  const { user } = useOutletContext<OutletContext>();
  const clientId = resolveClientId(user);
  const [isDarkMode, setIsDarkMode] = useState(() =>
    readDashboardDarkEnabled(user.id),
  );
  const [events, setEvents] = useState<ApiEvent[]>([]);
  const [selectedEventId, setSelectedEventId] = useState("");
  const [data, setData] = useState<EventDashboardTvResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

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
    const token = readStoredSession()?.accessToken;
    if (!clientId || !token) return;
    void listEvents({ client_id: clientId }, token)
      .then((rows) => {
        const sorted = [...rows].sort(
          (a, b) =>
            new Date(b.event_date).getTime() - new Date(a.event_date).getTime(),
        );
        setEvents(sorted);
        setSelectedEventId((prev) => {
          if (prev === "all" || (prev && sorted.some((event) => event.id === prev))) return prev;
          const active = sorted.find((event) => event.status === "active");
          return active?.id ?? "all";
        });
      })
      .catch(() => setEvents([]));
  }, [clientId]);

  useEffect(() => {
    const sessionToken = readStoredSession()?.accessToken;
    if (!sessionToken || !clientId) {
      setData(null);
      return;
    }
    const token: string = sessionToken;

    let active = true;
    const controller = new AbortController();
    setLoading(true);
    setError("");

    async function loadRankingData() {
      try {
        if (!selectedEventId || selectedEventId === "all") {
          // Ranking Geral da Empresa (Todos os Vendedores e Times Reais)
          const scoreItems = await getVendorScoreRanking(
            token,
            clientId ? { client_id: clientId } : {},
          );

          if (!active) return;

          const vendors: VendorRow[] = scoreItems.map((item) => ({
            vendor_id: item.vendor_id,
            vendor_name: item.vendor_name,
            client_id: clientId ?? null,
            team_id: null,
            team_name: "Equipe de Vendas",
            leads: item.assigned,
            scheduled: item.scheduled.count,
            confirmed: item.checked_in.count,
            checked_in: item.checked_in.count,
            sold: item.sold.count,
            points: item.total_points,
          }));

          const totalSales = vendors.reduce((acc, v) => acc + v.sold, 0);
          const totalScheduled = vendors.reduce((acc, v) => acc + v.scheduled, 0);
          const totalCheckedIn = vendors.reduce((acc, v) => acc + v.checked_in, 0);
          const totalPoints = vendors.reduce((acc, v) => acc + v.points, 0);

          const teams: TeamRow[] = vendors.length > 0 ? [
            {
              team_id: "geral",
              team_name: "Equipe Geral de Vendas",
              logo_url: null,
              leads: vendors.reduce((acc, v) => acc + v.leads, 0),
              scheduled: totalScheduled,
              confirmed: totalCheckedIn,
              checked_in: totalCheckedIn,
              sold: totalSales,
              points: totalPoints,
            },
          ] : [];

          setData({
            event: {
              id: "all",
              name: "Geral da Empresa",
              event_date: new Date().toISOString(),
              event_end_date: null,
              location: null,
              capacity: null,
              sales_target: null,
              status: "active",
              participant_client_ids: clientId ? [clientId] : [],
            },
            funnel: {
              leads: vendors.reduce((acc, v) => acc + v.leads, 0),
              scheduled: totalScheduled,
              confirmed: totalCheckedIn,
              checked_in: totalCheckedIn,
              sold: totalSales,
            },
            teams,
            vendors,
            cars: {
              by_segment: [],
              top_models: [],
              total_value: "0",
            },
            daily: [],
            checkin_by_source: [],
            generated_at: new Date().toISOString(),
          });
        } else {
          // Ranking por Evento Selecionado
          const response = await getEventDashboardTv(
            selectedEventId,
            token,
            controller.signal,
          );
          if (!active) return;
          setData(response);
        }
      } catch (err) {
        if (!active) return;
        setData(null);
        setError(
          err instanceof Error ? err.message : "Falha ao carregar ranking",
        );
      } finally {
        if (active) setLoading(false);
      }
    }

    void loadRankingData();

    return () => {
      active = false;
      controller.abort();
    };
  }, [selectedEventId, clientId]);

  const leaderTeam = data?.teams[0] ?? null;

  const eventOptions = [
    { value: "all", label: "Geral da Empresa (Todos os Vendedores)" },
    ...events.map((event) => ({
      value: event.id,
      label: event.name,
    })),
  ];

  return (
    <div>
      <PageHeader
        title="Ranking"
        breadcrumbs={[{ label: "Vendedor" }, { label: "Ranking" }]}
        subtitle="Equipe na frente e ranking individual dos vendedores."
      />

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div className="w-full sm:w-80">
          <Select
            label="Visualização do Ranking"
            value={selectedEventId || "all"}
            onChange={(e) => setSelectedEventId(e.target.value)}
            options={eventOptions}
          />
        </div>

        <div className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-400 dark:border-emerald-900 shrink-0">
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse" />
          <span>Ranking Atualizado em Tempo Real</span>
        </div>
      </div>

      {error && (
        <Notice tone="error" className="mb-4">
          {error}
        </Notice>
      )}

      {!selectedEventId && !loading && events.length === 0 ? (
        <Notice tone="info">
          Nenhum evento encontrado para exibir o ranking no momento.
        </Notice>
      ) : null}

      {leaderTeam && (
        <div className="mb-6 flex items-center gap-4 rounded-2xl bg-gradient-to-r from-[#FF0636] to-[#b3102b] p-4 text-white shadow-lg shadow-[#FF0636]/20">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/20 text-white font-black text-xl shadow-inner">
            🏆
          </span>
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-wider text-white/80">
              Equipe Líder no Evento
            </p>
            <p className="truncate text-lg font-black text-white">
              {leaderTeam.team_name}
            </p>
            <p className="text-xs font-semibold text-white/90">
              {leaderTeam.sold} vendas registradas
            </p>
          </div>
        </div>
      )}

      {loading && !data ? (
        <div className="py-12 text-center text-xs text-gray-400 dark:text-zinc-500">
          Carregando ranking oficial do evento...
        </div>
      ) : data ? (
        <>
          <VendorPodium vendors={data.vendors} dark={isDarkMode} />
          {isDarkMode ? (
            <div className="rounded-3xl bg-[#0b0b0b] p-3 border border-zinc-800">
              <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                <TeamRanking teams={data.teams} />
                <VendorRanking vendors={data.vendors} />
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <LightTeamList teams={data.teams} />
              <LightVendorList vendors={data.vendors} />
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}
