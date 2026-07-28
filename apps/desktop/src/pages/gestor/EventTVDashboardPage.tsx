import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useParams } from "react-router-dom";
import { Maximize2, Minimize2 } from "lucide-react";
import {
  getEventDashboardTv,
  type EventDashboardTvResponse,
} from "../../services/events";
import { readStoredSession } from "../../services/auth";
import { connectRealtime } from "../../services/realtime";
import {
  VendorCallAlert,
  type VendorCallEvent,
} from "../../components/tv/VendorCallAlert";
import { ConnectionDot } from "../../components/tv/ConnectionDot";
import { Funnel } from "../../components/tv/Funnel";
import { PodiumSlide } from "../../components/tv/PodiumSlide";
import { SaleCelebration } from "../../components/tv/SaleCelebration";
import { TeamRanking } from "../../components/tv/TeamRanking";
import { TopModelsLeaderboard } from "../../components/tv/TopModelsLeaderboard";
import { VendorRanking } from "../../components/tv/VendorRanking";
import {
  ago,
  POLLING_INTERVAL_MS,
  SLIDES,
  triggerSaleCelebration,
  type CelebrationEvent,
  type ConnectionStatus,
} from "../../components/tv/shared";

const CELEBRATION_DURATION_MS = 9000;

const SegmentDonut = lazy(() =>
  import("../../components/tv/SegmentDonut").then((module) => ({
    default: module.SegmentDonut,
  })),
);
const SourceBars = lazy(() =>
  import("../../components/tv/SourceBars").then((module) => ({
    default: module.SourceBars,
  })),
);

function TvChartFallback({ className }: { className: string }) {
  return (
    <div
      className={`${className} min-h-[260px] animate-pulse rounded-2xl border border-zinc-800 bg-zinc-900/50`}
      aria-label="Carregando gráfico"
    />
  );
}

const STATUS_META: Record<
  ConnectionStatus,
  { color: string; label: string; shadow: string }
> = {
  online: { color: "#10b981", label: "ONLINE", shadow: "rgba(16,185,129,0.6)" },
  stale: {
    color: "#f59e0b",
    label: "DADOS DESATUALIZADOS",
    shadow: "rgba(245,158,11,0.65)",
  },
  offline: {
    color: "#ef4444",
    label: "SEM CONEXÃO",
    shadow: "rgba(239,68,68,0.7)",
  },
};

export function EventTVDashboardPage() {
  const { id: eventId } = useParams<{ id: string }>();
  const [data, setData] = useState<EventDashboardTvResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [agoLabel, setAgoLabel] = useState("agora");
  const [consecutiveErrors, setConsecutiveErrors] = useState(0);
  const abortRef = useRef<AbortController | null>(null);

  const [vendorCallEvent, setVendorCallEvent] =
    useState<VendorCallEvent | null>(null);
  const shownCallIds = useRef<Set<string>>(new Set());

  // ── WebSockets / Tempo real ───────────────────────────────────────────────
  useEffect(() => {
    const clientId = data?.event.participant_client_ids?.[0];
    if (!clientId) return;

    const socket = connectRealtime(clientId);

    socket.on("vendor_called", (payload: VendorCallEvent) => {
      const callId = payload.id || Date.now().toString();
      shownCallIds.current.add(callId);
      // payload.id para o React renderizar novamente se for a mesma chamada logo depois
      setVendorCallEvent({
        ...payload,
        id: callId,
      });
    });

    return () => {
      socket.disconnect();
    };
  }, [data?.event.participant_client_ids]);

  // ── Fetch + polling ───────────────────────────────────────────────────────
  const fetchSnapshot = useCallback(async () => {
    if (!eventId) return;
    const session = readStoredSession();
    if (!session?.accessToken) {
      setError("Sessão expirada — faça login novamente.");
      setLoading(false);
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const snapshot = await getEventDashboardTv(
        eventId,
        session.accessToken,
        controller.signal,
      );
      if (controller.signal.aborted) return;
      setData(snapshot);

      // Processar chamadas de vendedor ativas vindas do snapshot
      if (snapshot.activeCalls && snapshot.activeCalls.length > 0) {
        const now = Date.now();
        const freshCalls = snapshot.activeCalls.filter((call) => {
          // Apenas chamadas feitas nos últimos 60 segundos
          const callTime = new Date(call.timestamp).getTime();
          const ageSec = (now - callTime) / 1000;
          return ageSec < 60 && !shownCallIds.current.has(call.id);
        });

        if (freshCalls.length > 0) {
          // Mostrar a chamada mais recente
          const latest = freshCalls[freshCalls.length - 1];
          shownCallIds.current.add(latest.id);
          setVendorCallEvent(latest);
        }
      }

      setLastUpdated(new Date());
      setError(null);
      setConsecutiveErrors(0);
    } catch (err) {
      if (controller.signal.aborted) return;
      const message =
        err instanceof Error ? err.message : "Falha ao carregar dashboard";
      setError(message);
      setConsecutiveErrors((current) => current + 1);
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [eventId]);

  useEffect(() => {
    void fetchSnapshot();
    const interval = setInterval(
      () => void fetchSnapshot(),
      POLLING_INTERVAL_MS,
    );
    return () => {
      clearInterval(interval);
      abortRef.current?.abort();
    };
  }, [fetchSnapshot]);

  useEffect(() => {
    if (!lastUpdated) return;
    setAgoLabel(ago(lastUpdated));
    const interval = setInterval(() => setAgoLabel(ago(lastUpdated)), 5_000);
    return () => clearInterval(interval);
  }, [lastUpdated]);

  // ── Fila de celebrações ────────────────────────────────────────────────────
  const prevSoldRef = useRef<number | null>(null);
  const prevVendorSoldRef = useRef<Map<string, number>>(new Map());
  const playingIdRef = useRef<string | null>(null);
  const [celebrationQueue, setCelebrationQueue] = useState<CelebrationEvent[]>(
    [],
  );
  const activeCelebration = celebrationQueue[0] ?? null;
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const audio = new Audio("/senna-vitoria.mp3");
    audio.preload = "auto";
    audio.volume = 0.8;
    audioRef.current = audio;
    return () => {
      audio.pause();
      audioRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!data) return;
    const currentSold = data.funnel.sold;
    const prev = prevSoldRef.current;

    if (prev !== null && currentSold > prev) {
      const newEvents: CelebrationEvent[] = [];
      for (const vendor of data.vendors) {
        const previousSold =
          prevVendorSoldRef.current.get(vendor.vendor_id) ?? 0;
        const diff = vendor.sold - previousSold;
        if (diff > 0) {
          newEvents.push({
            id: `${vendor.vendor_id}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            vendor_name: vendor.vendor_name,
            team_name: vendor.team_name,
            sales_count: diff,
          });
        }
      }
      if (newEvents.length > 0) {
        setCelebrationQueue((current) => [...current, ...newEvents]);
      }
    }

    prevSoldRef.current = currentSold;
    prevVendorSoldRef.current = new Map(
      data.vendors.map((vendor) => [vendor.vendor_id, vendor.sold]),
    );
  }, [data]);

  useEffect(() => {
    const head = celebrationQueue[0];
    if (!head) {
      playingIdRef.current = null;
      return;
    }
    if (playingIdRef.current === head.id) return;
    playingIdRef.current = head.id;

    triggerSaleCelebration();
    const audio = audioRef.current;
    if (audio) {
      audio.currentTime = 0;
      audio.play().catch(() => {
        // Browser bloqueou autoplay — destrava clicando no botão de teste.
      });
    }
    const timer = setTimeout(() => {
      setCelebrationQueue((current) => current.slice(1));
    }, CELEBRATION_DURATION_MS);
    return () => clearTimeout(timer);
  }, [celebrationQueue]);

  const enqueueTestCelebration = useCallback(() => {
    if (!data) return;
    const topVendor = [...data.vendors].sort((a, b) => b.sold - a.sold)[0];
    setCelebrationQueue((current) => [
      ...current,
      {
        id: `test-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        vendor_name: topVendor?.vendor_name ?? "Vendedor",
        team_name: topVendor?.team_name ?? null,
        sales_count: 1,
      },
    ]);
  }, [data]);

  // ── Cronômetro / clock tick ───────────────────────────────────────────────
  const eventEnd = useMemo(() => {
    if (!data) return null;
    const raw = data.event.event_end_date ?? data.event.event_date;
    return raw ? new Date(raw) : null;
  }, [data]);
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  // ── Fullscreen ────────────────────────────────────────────────────────────
  const [fullscreen, setFullscreen] = useState(false);
  useEffect(() => {
    const handler = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);
  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) {
      void document.exitFullscreen();
    } else {
      void document.documentElement.requestFullscreen().catch(() => {
        // Silencioso — o gesto pode não estar diretamente atrelado ao clique.
      });
    }
  }, []);

  // ── Slideshow ─────────────────────────────────────────────────────────────
  const [slide, setSlide] = useState(0);
  useEffect(() => {
    const timer = setTimeout(() => {
      setSlide((s) => (s + 1) % SLIDES.length);
    }, SLIDES[slide].durationMs);
    return () => clearTimeout(timer);
  }, [slide]);

  // ── Cabeçalho: dia X/Y ────────────────────────────────────────────────────
  const dayInfo = useMemo(() => {
    if (!data) return null;
    const start = new Date(data.event.event_date);
    const end = data.event.event_end_date
      ? new Date(data.event.event_end_date)
      : start;
    const totalDays = Math.max(
      1,
      Math.round((end.getTime() - start.getTime()) / 86400000) + 1,
    );
    const today = new Date();
    const currentDay = Math.min(
      totalDays,
      Math.max(
        1,
        Math.round((today.getTime() - start.getTime()) / 86400000) + 1,
      ),
    );
    return { currentDay, totalDays };
  }, [data]);

  // ── Estados de loading / erro ─────────────────────────────────────────────
  if (loading && !data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-950 text-zinc-400">
        Carregando dashboard…
      </div>
    );
  }
  if (error && !data) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-zinc-950 text-center text-zinc-200">
        <p className="text-lg font-semibold text-rose-400">
          Não foi possível carregar o dashboard
        </p>
        <p className="text-sm text-zinc-500">{error}</p>
      </div>
    );
  }
  if (!data) return null;

  // ── Status de conexão (derivado) ──────────────────────────────────────────
  const secondsSinceUpdate = lastUpdated
    ? Math.floor((now.getTime() - lastUpdated.getTime()) / 1000)
    : null;
  const connectionStatus: ConnectionStatus =
    consecutiveErrors >= 2 ||
    (secondsSinceUpdate !== null && secondsSinceUpdate > 120)
      ? "offline"
      : (secondsSinceUpdate !== null && secondsSinceUpdate > 60) ||
          consecutiveErrors >= 1
        ? "stale"
        : "online";
  const statusMeta = STATUS_META[connectionStatus];

  return (
    <div
      className={`flex h-screen flex-col gap-3 overflow-hidden bg-zinc-950 text-zinc-100 ${
        fullscreen ? "px-16 py-8" : "p-4"
      }`}
    >
      {/* Header (oculto em modo tela cheia) */}
      {!fullscreen && (
        <header className="flex shrink-0 flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.32em] text-zinc-500">
              Grand Prix de Vendas
            </p>
            <h1 className="mt-1 text-4xl font-black tracking-tight">
              {data.event.name}
            </h1>
            {data.event.location && (
              <p className="mt-1 text-sm text-zinc-400">
                {data.event.location}
              </p>
            )}
          </div>
          <div className="flex flex-col items-end text-right">
            <div className="flex items-center gap-3">
              {dayInfo && (
                <p className="text-lg font-bold text-zinc-200">
                  Dia {dayInfo.currentDay} / {dayInfo.totalDays}
                </p>
              )}
              <button
                type="button"
                onClick={enqueueTestCelebration}
                className="inline-flex items-center gap-2 rounded-lg border border-emerald-700 bg-emerald-900/40 px-3 py-1.5 text-xs font-semibold text-emerald-200 hover:border-emerald-500 hover:bg-emerald-900/60"
                title="Enfileira uma celebração de teste"
              >
                🏎️ Testar celebração
                {celebrationQueue.length > 0 && (
                  <span className="rounded-full bg-emerald-500 px-1.5 text-[10px] text-zinc-900">
                    {celebrationQueue.length}
                  </span>
                )}
              </button>
              <button
                type="button"
                onClick={toggleFullscreen}
                className="inline-flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs font-semibold text-zinc-200 hover:border-zinc-500 hover:bg-zinc-800"
              >
                <Maximize2 size={14} />
                Modo tela cheia
              </button>
            </div>
            <div className="mt-1 flex items-center justify-end gap-2 text-xs text-zinc-500">
              <ConnectionDot status={connectionStatus} />
              <span
                className="font-bold tracking-widest"
                style={{ color: statusMeta.color }}
              >
                {statusMeta.label}
              </span>
              <span className="text-zinc-700">·</span>
              <span>Atualizado {agoLabel}</span>
              <span className="text-zinc-700">·</span>
              <span>refresh em {POLLING_INTERVAL_MS / 1000}s</span>
            </div>
            {connectionStatus === "offline" && error && (
              <p className="mt-1 text-xs text-rose-400">{error}</p>
            )}
          </div>
        </header>
      )}

      {/* Celebração de venda */}
      {activeCelebration && (
        <SaleCelebration
          key={activeCelebration.id}
          vendorName={activeCelebration.vendor_name}
          teamName={activeCelebration.team_name}
          salesCount={activeCelebration.sales_count}
          pendingCount={celebrationQueue.length - 1}
        />
      )}

      {/* Alerta de Vendedor Chamado */}
      <VendorCallAlert
        event={vendorCallEvent}
        onClose={() => setVendorCallEvent(null)}
      />

      {/* Indicador de conexão flutuante (sempre visível em fullscreen) */}
      {fullscreen && (
        <div
          className="pointer-events-none fixed bottom-4 right-4 z-40 flex items-center gap-2 rounded-full border bg-zinc-950/80 px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest backdrop-blur"
          style={{
            borderColor: `${statusMeta.color}55`,
            color: statusMeta.color,
          }}
        >
          <ConnectionDot status={connectionStatus} />
          {statusMeta.label}
          {secondsSinceUpdate !== null && connectionStatus !== "online" && (
            <span className="font-normal text-zinc-500">· há {agoLabel}</span>
          )}
        </div>
      )}

      {/* Overlay quando offline */}
      {connectionStatus === "offline" && (
        <div className="pointer-events-none fixed inset-x-0 top-0 z-40 flex justify-center pt-2">
          <div className="rounded-full border-2 border-rose-500 bg-rose-950/95 px-5 py-2 text-sm font-bold uppercase tracking-widest text-rose-200 shadow-[0_0_30px_rgba(239,68,68,0.5)] animate-pulse">
            ⚠ Sem conexão com o servidor · exibindo dados de há {agoLabel}
          </div>
        </div>
      )}

      {/* Botão flutuante em modo tela cheia */}
      {fullscreen && (
        <button
          type="button"
          onClick={toggleFullscreen}
          className="fixed right-4 top-4 z-50 inline-flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-900/80 px-3 py-1.5 text-xs font-semibold text-zinc-200 opacity-40 hover:opacity-100"
          title="Sair de tela cheia (ESC)"
        >
          <Minimize2 size={14} />
          Sair
        </button>
      )}

      {/* Slides */}
      {slide === 0 && (
        <>
          <Funnel
            funnel={data.funnel}
            meta={data.event.sales_target}
            eventEnd={eventEnd}
            now={now}
          />
          <div className="grid min-h-0 flex-1 grid-cols-12 gap-3">
            <VendorRanking vendors={data.vendors} className="col-span-7" />
            <TeamRanking teams={data.teams} className="col-span-5" />
            <Suspense fallback={<TvChartFallback className="col-span-4" />}>
              <SegmentDonut
                bySegment={data.cars.by_segment}
                totalSold={data.funnel.sold}
                totalValue={data.cars.total_value}
                className="col-span-4"
              />
            </Suspense>
            <TopModelsLeaderboard
              topModels={data.cars.top_models}
              className="col-span-4"
            />
            <Suspense fallback={<TvChartFallback className="col-span-4" />}>
              <SourceBars
                data={data.checkin_by_source}
                className="col-span-4"
              />
            </Suspense>
          </div>
        </>
      )}

      {slide === 1 && (
        <PodiumSlide
          title="Pódio de Vendas"
          subtitle="Top vendedores por número de vendas neste evento"
          accent="emerald"
          items={[...data.vendors]
            .filter((vendor) => vendor.sold > 0)
            .sort(
              (a, b) =>
                b.sold - a.sold || a.vendor_name.localeCompare(b.vendor_name),
            )
            .slice(0, 3)
            .map((vendor) => ({
              id: vendor.vendor_id,
              name: vendor.vendor_name,
              sub: vendor.team_name ?? undefined,
              metric: vendor.sold,
              metricLabel: vendor.sold === 1 ? "venda" : "vendas",
            }))}
        />
      )}

      {slide === 2 && (
        <PodiumSlide
          title="Pódio Grand Prix de Vendas"
          subtitle="Top vendedores por pontuação acumulada"
          accent="amber"
          items={[...data.vendors]
            .filter((vendor) => vendor.points > 0)
            .sort(
              (a, b) =>
                b.points - a.points ||
                a.vendor_name.localeCompare(b.vendor_name),
            )
            .slice(0, 3)
            .map((vendor) => ({
              id: vendor.vendor_id,
              name: vendor.vendor_name,
              sub: vendor.team_name ?? undefined,
              metric: vendor.points,
              metricLabel: "pts",
            }))}
        />
      )}

      {slide === 3 && (
        <PodiumSlide
          title="Pódio de Equipes"
          subtitle="Equipes ranqueadas pelo total de vendas"
          accent="sky"
          items={[...data.teams]
            .sort(
              (a, b) =>
                b.sold - a.sold || a.team_name.localeCompare(b.team_name),
            )
            .slice(0, 3)
            .map((team) => ({
              id: team.team_id,
              name: team.team_name,
              sub: `${team.points} pts`,
              metric: team.sold,
              metricLabel: team.sold === 1 ? "venda" : "vendas",
              logoUrl: team.logo_url,
            }))}
        />
      )}

      {/* Slideshow nav */}
      <div className="flex shrink-0 items-center justify-center gap-2 pb-1">
        {SLIDES.map((s, idx) => (
          <button
            key={s.key}
            type="button"
            onClick={() => setSlide(idx)}
            className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-widest transition-all ${
              idx === slide
                ? "bg-zinc-100 text-zinc-900"
                : "bg-zinc-900 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
            }`}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                idx === slide ? "bg-emerald-500" : "bg-zinc-600"
              }`}
            />
            {s.label}
          </button>
        ))}
        <span className="ml-2 text-[10px] uppercase tracking-widest text-zinc-600">
          auto · {SLIDES[slide].durationMs / 1000}s
        </span>
      </div>
    </div>
  );
}
