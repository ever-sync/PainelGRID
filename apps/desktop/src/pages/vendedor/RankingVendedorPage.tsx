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
          if (prev && sorted.some((event) => event.id === prev)) return prev;
          const active = sorted.find((event) => event.status === "active");
          return active?.id ?? sorted[0]?.id ?? "";
        });
      })
      .catch(() => setEvents([]));
  }, [clientId]);

  useEffect(() => {
    const token = readStoredSession()?.accessToken;
    if (!selectedEventId || !token) {
      setData(null);
      return;
    }

    let active = true;
    const controller = new AbortController();
    setLoading(true);
    setError("");

    getEventDashboardTv(selectedEventId, token, controller.signal)
      .then((response) => {
        if (!active) return;
        setData(response);
      })
      .catch((err) => {
        if (!active) return;
        setData(null);
        setError(
          err instanceof Error ? err.message : "Falha ao carregar ranking",
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [selectedEventId]);

  const leaderTeam = data?.teams[0] ?? null;

  return (
    <div>
      <PageHeader
        title="Ranking"
        breadcrumbs={[{ label: "Vendedor" }, { label: "Ranking" }]}
        subtitle="Equipe na frente e ranking individual do evento."
      />

      <div className="mb-4 max-w-xs">
        <Select
          label="Evento"
          value={selectedEventId}
          onChange={(e) => setSelectedEventId(e.target.value)}
          options={events.map((event) => ({
            value: event.id,
            label: event.name,
          }))}
          placeholder={
            events.length === 0
              ? "Nenhum evento disponível"
              : "Selecione um evento"
          }
        />
      </div>

      {error && (
        <Notice tone="error" className="mb-4">
          {error}
        </Notice>
      )}

      {!selectedEventId && !loading && events.length === 0 ? (
        <Notice tone="info">
          Nenhum evento encontrado para exibir ranking.
        </Notice>
      ) : null}

      {leaderTeam && (
        <div className="mb-4 flex items-center gap-3 rounded-2xl bg-gradient-to-r from-[#E51838] to-[#b3102b] p-4 shadow-lg shadow-[#E51838]/20">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/15 text-white">
            <Trophy size={22} />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-white/70">
              Equipe na frente
            </p>
            <p className="truncate text-lg font-bold text-white">
              {leaderTeam.team_name}
            </p>
            <p className="text-xs text-white/80">{leaderTeam.sold} vendas</p>
          </div>
        </div>
      )}

      {loading && !data ? (
        <p className="text-sm text-gray-500">Carregando ranking...</p>
      ) : data ? (
        <>
          <VendorPodium vendors={data.vendors} dark={isDarkMode} />
          {isDarkMode ? (
            <div className="rounded-3xl bg-[#0b0b0b] p-3">
              <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                <TeamRanking teams={data.teams} />
                <VendorRanking vendors={data.vendors} />
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              <LightTeamList teams={data.teams} />
              <LightVendorList vendors={data.vendors} />
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}
