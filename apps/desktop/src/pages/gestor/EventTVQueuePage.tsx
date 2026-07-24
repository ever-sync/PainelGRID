import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import {
  Maximize2,
  Users,
  Clock,
  UserCheck,
  ArrowRight,
  Volume2,
  VolumeX,
} from "lucide-react";
import {
  getEventDashboardTv,
  type EventDashboardTvResponse,
} from "../../services/events";
import { fetchAllLeads, type ApiLead } from "../../services/leads";
import { readStoredSession } from "../../services/auth";
import { useLeadRealtimeSync } from "../../hooks/useLeadRealtimeSync";
import { ConnectionDot } from "../../components/tv/ConnectionDot";
import {
  ago,
  POLLING_INTERVAL_MS,
  type ConnectionStatus,
} from "../../components/tv/shared";

const STATUS_META = {
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

// Formata o tempo de espera de forma amigável
function formatWaitingTime(checkedInTime: Date) {
  const diffMs = Date.now() - checkedInTime.getTime();
  const diffMins = Math.max(0, Math.floor(diffMs / 60000));

  if (diffMins < 1) return "agora";
  if (diffMins < 60) return `há ${diffMins} min`;

  const diffHours = Math.floor(diffMins / 60);
  const remainingMins = diffMins % 60;
  if (diffHours < 24) {
    return `há ${diffHours}h ${remainingMins}min`;
  }

  const diffDays = Math.floor(diffHours / 24);
  return `há ${diffDays} dia${diffDays > 1 ? "s" : ""}`;
}

// Retorna uma classe de gradiente única com base na primeira letra para avatares vibrantes
function getAvatarGradient(name: string) {
  const charCode = name.charCodeAt(0) || 0;
  const gradients = [
    "from-red-500 to-rose-600 shadow-rose-500/20",
    "from-orange-400 to-amber-600 shadow-amber-500/20",
    "from-emerald-400 to-teal-600 shadow-teal-500/20",
    "from-blue-500 to-indigo-600 shadow-indigo-500/20",
    "from-purple-500 to-fuchsia-600 shadow-fuchsia-500/20",
    "from-cyan-400 to-sky-600 shadow-sky-500/20",
  ];
  return gradients[charCode % gradients.length];
}

// Estilo de medalha para posições da fila
function getPositionStyle(index: number) {
  if (index === 0) {
    return "bg-gradient-to-r from-amber-400 to-yellow-500 text-zinc-950 font-black shadow-[0_0_12px_rgba(245,158,11,0.4)] ring-2 ring-yellow-400/50";
  }
  if (index === 1) {
    return "bg-gradient-to-r from-zinc-300 to-zinc-400 text-zinc-950 font-black shadow-[0_0_12px_rgba(200,200,200,0.3)] ring-2 ring-zinc-300/40";
  }
  if (index === 2) {
    return "bg-gradient-to-r from-amber-600 to-amber-700 text-amber-50 font-black shadow-[0_0_12px_rgba(180,83,9,0.3)] ring-2 ring-amber-600/30";
  }
  return "bg-zinc-800 text-zinc-400 border border-zinc-700/60";
}

export function EventTVQueuePage() {
  const { id: eventId } = useParams<{ id: string }>();
  const [eventData, setEventData] = useState<EventDashboardTvResponse | null>(
    null,
  );
  const [leads, setLeads] = useState<ApiLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [agoLabel, setAgoLabel] = useState("agora");
  const [consecutiveErrors, setConsecutiveErrors] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);
  const [audioEnabled, setAudioEnabled] = useState(false);
  const [onlineVendorIds, setOnlineVendorIds] = useState<string[]>([]);

  const announcedRef = useRef<Set<string>>(new Set());
  const abortRef = useRef<AbortController | null>(null);

  // ── Browser Fullscreen handler ─────────────────────────────────────────────
  useEffect(() => {
    const handler = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) {
      void document.exitFullscreen();
    } else {
      void document.documentElement.requestFullscreen().catch(() => {});
    }
  }, []);

  // ── Map vendors ────────────────────────────────────────────────────────────
  const vendorsById = useMemo(() => {
    if (!eventData?.vendors) return {};
    return eventData.vendors.reduce<Record<string, string>>((acc, v) => {
      acc[v.vendor_id] = v.vendor_name;
      return acc;
    }, {});
  }, [eventData?.vendors]);

  // ── Fetch leads and event details ──────────────────────────────────────────
  const fetchData = useCallback(async () => {
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
      const [snapshot, allLeads] = await Promise.all([
        getEventDashboardTv(eventId, session.accessToken, controller.signal),
        fetchAllLeads({ event_id: eventId }, session.accessToken, {
          signal: controller.signal,
        }),
      ]);

      if (controller.signal.aborted) return;

      setEventData(snapshot);
      setLeads(allLeads);
      setLastUpdated(new Date());
      setError(null);
      setConsecutiveErrors(0);
    } catch (err) {
      if (controller.signal.aborted) return;
      const message =
        err instanceof Error ? err.message : "Falha ao carregar fila";
      setError(message);
      setConsecutiveErrors((current) => current + 1);
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [eventId]);

  useEffect(() => {
    void fetchData();
    const interval = setInterval(() => void fetchData(), POLLING_INTERVAL_MS);
    return () => {
      clearInterval(interval);
      abortRef.current?.abort();
    };
  }, [fetchData]);

  // Realtime Sync Hook
  const clientId = eventData?.event.participant_client_ids?.[0];
  useLeadRealtimeSync(clientId, fetchData, {
    onOnlineVendors: setOnlineVendorIds,
  });

  useEffect(() => {
    if (!lastUpdated) return;
    setAgoLabel(ago(lastUpdated));
    const interval = setInterval(() => setAgoLabel(ago(lastUpdated)), 5_000);
    return () => clearInterval(interval);
  }, [lastUpdated]);

  // ── Voice Announcement ──────────────────────────────────────────────────────
  const announceLead = useCallback(
    (leadName: string, vendorName: string) => {
      if (
        !audioEnabled ||
        typeof window === "undefined" ||
        !("speechSynthesis" in window)
      )
        return;

      // Play notification sound
      try {
        const context = new (
          window.AudioContext || (window as any).webkitAudioContext
        )();
        const osc = context.createOscillator();
        const gain = context.createGain();
        osc.connect(gain);
        gain.connect(context.destination);
        osc.type = "sine";
        osc.frequency.setValueAtTime(587.33, context.currentTime); // D5
        gain.gain.setValueAtTime(0.1, context.currentTime);
        osc.start();
        osc.stop(context.currentTime + 0.15);

        const osc2 = context.createOscillator();
        osc2.connect(gain);
        osc2.type = "sine";
        osc2.frequency.setValueAtTime(880, context.currentTime + 0.15); // A5
        osc2.start(context.currentTime + 0.15);
        osc2.stop(context.currentTime + 0.4);
      } catch (e) {
        // AudioContext blocks sometimes, ignore
      }

      setTimeout(() => {
        const text = `Atenção, lead ${leadName}, favor dirigir-se ao vendedor ${vendorName}.`;
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = "pt-BR";
        utterance.rate = 1.0;
        utterance.pitch = 1.1;
        window.speechSynthesis.speak(utterance);
      }, 500);
    },
    [audioEnabled],
  );

  // ── Divide leads ───────────────────────────────────────────────────────────
  const checkedInLeads = useMemo(() => {
    return leads.filter((l) => l.confirmation_status === "checked_in");
  }, [leads]);

  // Waiting queue: Checked in but either not assigned, or assigned but no sale yet
  // Em Atendimento: Checked in and assigned a vendor (and no sales registered yet)
  const { waitingLeads, attendingLeads } = useMemo(() => {
    const waiting: ApiLead[] = [];
    const attending: ApiLead[] = [];

    // Sorting by arrival/checkin time:
    const sorted = [...checkedInLeads].sort((a, b) => {
      const timeA = new Date(
        a.confirmation_date ||
          a.updated_at ||
          a.store_visit_datetime ||
          a.created_at,
      ).getTime();
      const timeB = new Date(
        b.confirmation_date ||
          b.updated_at ||
          b.store_visit_datetime ||
          b.created_at,
      ).getTime();
      return timeA - timeB;
    });

    sorted.forEach((lead) => {
      if (lead.assigned_vendor_id) {
        attending.push(lead);
      } else {
        waiting.push(lead);
      }
    });

    return { waitingLeads: waiting, attendingLeads: attending };
  }, [checkedInLeads]);

  // Trigger announcements on change
  useEffect(() => {
    attendingLeads.forEach((lead) => {
      if (lead.assigned_vendor_id) {
        const key = `${lead.id}-${lead.assigned_vendor_id}`;
        if (!announcedRef.current.has(key)) {
          announcedRef.current.add(key);
          const vendorName = vendorsById[lead.assigned_vendor_id] || "Vendedor";
          announceLead(lead.name, vendorName);
        }
      }
    });
  }, [attendingLeads, vendorsById, announceLead]);

  // ── Status de Conexão ──────────────────────────────────────────────────────
  const secondsSinceUpdate = lastUpdated
    ? Math.floor((Date.now() - lastUpdated.getTime()) / 1000)
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

  if (loading && !eventData) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#070708] text-zinc-400 font-sans">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-zinc-800 border-t-red-600" />
          <span>Carregando Fila de Atendimento...</span>
        </div>
      </div>
    );
  }

  if (error && !eventData) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-[#070708] text-center text-zinc-200 font-sans p-6">
        <p className="text-lg font-semibold text-rose-500">
          Não foi possível carregar a fila de atendimento
        </p>
        <p className="text-sm text-zinc-500 max-w-md">{error}</p>
      </div>
    );
  }

  return (
    <div
      className={`flex h-screen flex-col gap-6 overflow-hidden bg-[#070709] text-zinc-100 font-sans transition-all duration-300 ${fullscreen ? "px-16 py-8" : "p-6"}`}
    >
      {/* Header */}
      {!fullscreen && (
        <header className="flex shrink-0 flex-wrap items-end justify-between border-b border-zinc-800/80 pb-5 gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-red-650"></span>
              </span>
              <p className="text-xs font-black uppercase tracking-[0.35em] text-[#e51838]">
                PainelGRID · Fila de Atendimento
              </p>
            </div>
            <h1 className="mt-2 text-4xl font-extrabold tracking-tight text-white">
              {eventData?.event.name}
            </h1>
          </div>

          <div className="flex flex-col items-end gap-2 text-right">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setAudioEnabled(!audioEnabled)}
                className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-xs font-bold transition-all duration-200 ${
                  audioEnabled
                    ? "border-emerald-600/40 bg-emerald-950/60 text-emerald-400 hover:bg-emerald-900/50 shadow-[0_0_15px_rgba(16,185,129,0.1)]"
                    : "border-zinc-800 bg-zinc-900 text-zinc-400 hover:bg-zinc-800 hover:border-zinc-700"
                }`}
              >
                {audioEnabled ? <Volume2 size={15} /> : <VolumeX size={15} />}
                {audioEnabled
                  ? "Voz de Chamada Ativa"
                  : "Ativar Chamada de Voz"}
              </button>

              <button
                type="button"
                onClick={toggleFullscreen}
                className="inline-flex items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-2 text-xs font-bold text-zinc-300 hover:border-zinc-700 hover:bg-zinc-800 transition-colors"
              >
                <Maximize2 size={15} />
                Tela Cheia
              </button>
            </div>

            <div className="flex items-center justify-end gap-2 text-xs text-zinc-500">
              <ConnectionDot status={connectionStatus} />
              <span
                className="font-extrabold tracking-widest text-[10px]"
                style={{ color: statusMeta.color }}
              >
                {statusMeta.label}
              </span>
              <span className="text-zinc-800">·</span>
              <span>Atualizado {agoLabel}</span>
            </div>
          </div>
        </header>
      )}

      {/* Floating Status Indicator for Fullscreen */}
      {fullscreen && (
        <div className="fixed top-6 right-6 z-50 flex items-center gap-4">
          <button
            type="button"
            onClick={() => setAudioEnabled(!audioEnabled)}
            className={`flex h-10 w-10 items-center justify-center rounded-xl border transition-all duration-200 backdrop-blur-md ${
              audioEnabled
                ? "border-emerald-600 bg-emerald-950/80 text-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.2)]"
                : "border-zinc-800 bg-zinc-900/80 text-zinc-400"
            }`}
          >
            {audioEnabled ? <Volume2 size={18} /> : <VolumeX size={18} />}
          </button>
          <div
            className="flex items-center gap-2.5 rounded-xl border bg-zinc-950/90 px-4 py-2 text-xs font-extrabold uppercase tracking-widest backdrop-blur-md shadow-2xl border-zinc-850"
            style={{ color: statusMeta.color }}
          >
            <ConnectionDot status={connectionStatus} />
            {statusMeta.label}
          </div>
        </div>
      )}

      {/* Main Grid View */}
      <main className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-8 min-h-0">
        {/* Waiting List Column (Aguardando Atendimento) */}
        <section className="flex flex-col min-h-0 bg-[#0c0c0e]/80 border border-zinc-900 rounded-3xl p-6 shadow-2xl relative">
          <div className="flex items-center justify-between border-b border-zinc-800/60 pb-5 mb-5">
            <div className="flex items-center gap-3.5">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-400 border border-amber-500/20 shadow-[0_0_20px_rgba(245,158,11,0.05)]">
                <Clock size={22} className="animate-pulse" />
              </div>
              <div>
                <h2 className="text-xl font-black tracking-tight text-white">
                  Fila de Espera
                </h2>
                <p className="text-xs text-zinc-550">
                  Aguardando designação de vendedor
                </p>
              </div>
            </div>
            <span className="rounded-2xl bg-amber-500/10 border border-amber-500/20 px-4 py-1.5 text-base font-black text-amber-400 shadow-[0_0_20px_rgba(245,158,11,0.08)]">
              {waitingLeads.length}
            </span>
          </div>

          <div className="flex-1 overflow-y-auto space-y-4 pr-2.5 custom-scrollbar">
            {waitingLeads.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center text-zinc-600 gap-3 py-16">
                <Users size={48} className="text-zinc-800 opacity-60" />
                <p className="text-base font-semibold">
                  Ninguém na fila de espera no momento
                </p>
              </div>
            ) : (
              waitingLeads.map((lead, idx) => {
                const checkedInTime = new Date(
                  lead.confirmation_date ||
                    lead.updated_at ||
                    lead.store_visit_datetime ||
                    lead.created_at,
                );
                const isTopThree = idx < 3;

                return (
                  <div
                    key={lead.id}
                    className="group relative flex items-center justify-between rounded-2xl bg-[#131317]/80 border border-zinc-800/40 p-5 hover:border-zinc-700/60 hover:bg-[#18181f] transition-all duration-300 shadow-md"
                  >
                    {/* Position Label */}
                    <div className="flex items-center gap-5">
                      <div
                        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-sm font-black shadow-inner ${getPositionStyle(idx)}`}
                      >
                        {idx + 1}
                      </div>

                      <div>
                        <h3 className="text-lg font-black text-white tracking-tight group-hover:text-amber-350 transition-colors">
                          {lead.name}
                        </h3>
                        <div className="mt-1 flex items-center gap-2.5 text-xs text-zinc-500 font-bold">
                          <span className="text-zinc-400">
                            Check-in às{" "}
                            {checkedInTime.toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                          <span>·</span>
                          <span
                            className={`${isTopThree ? "text-amber-500" : "text-zinc-550"} font-black`}
                          >
                            {formatWaitingTime(checkedInTime)}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <span className="inline-flex items-center gap-1.5 rounded-xl bg-amber-500/5 px-3 py-1.5 text-xs font-black uppercase tracking-wider text-amber-400/90 border border-amber-500/10 shadow-[0_0_15px_rgba(245,158,11,0.02)] animate-pulse">
                        Aguardando
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </section>

        {/* Attending / Called Column (Em Atendimento) */}
        <section className="flex flex-col min-h-0 bg-[#0c0c0e]/80 border border-zinc-900 rounded-3xl p-6 shadow-2xl relative">
          <div className="flex items-center justify-between border-b border-zinc-800/60 pb-5 mb-5">
            <div className="flex items-center gap-3.5">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shadow-[0_0_20px_rgba(16,185,129,0.05)]">
                <UserCheck size={22} className="animate-pulse" />
              </div>
              <div>
                <h2 className="text-xl font-black tracking-tight text-white">
                  Em Atendimento
                </h2>
                <p className="text-xs text-zinc-550">
                  Leads sendo atendidos no momento
                </p>
              </div>
            </div>
            <span className="rounded-2xl bg-emerald-500/10 border border-emerald-500/20 px-4 py-1.5 text-base font-black text-emerald-400 shadow-[0_0_20px_rgba(16,185,129,0.08)]">
              {attendingLeads.length}
            </span>
          </div>

          <div className="flex-1 overflow-y-auto space-y-4 pr-2.5 custom-scrollbar">
            {attendingLeads.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center text-zinc-600 gap-3 py-16">
                <UserCheck size={48} className="text-zinc-800 opacity-60" />
                <p className="text-base font-semibold">
                  Nenhum atendimento iniciado no momento
                </p>
              </div>
            ) : (
              attendingLeads.map((lead) => {
                const vendorName = lead.assigned_vendor_id
                  ? vendorsById[lead.assigned_vendor_id]
                  : "Vendedor";
                const checkedInTime = new Date(
                  lead.confirmation_date ||
                    lead.updated_at ||
                    lead.store_visit_datetime ||
                    lead.created_at,
                );

                return (
                  <div
                    key={lead.id}
                    className="group relative flex flex-col sm:flex-row sm:items-center justify-between gap-5 rounded-2xl bg-[#131317]/80 border border-emerald-500/15 p-5 hover:bg-[#18181f] hover:border-emerald-500/30 transition-all duration-300 overflow-hidden shadow-lg"
                  >
                    {/* Visual left colored side indicator */}
                    <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-emerald-400 to-teal-500" />

                    <div className="pl-5">
                      <h3 className="text-lg font-black text-white tracking-tight leading-snug">
                        {lead.name}
                      </h3>
                      <span className="mt-1 block text-xs text-zinc-500 font-bold">
                        Chegada às{" "}
                        {checkedInTime.toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>

                    <div className="flex items-center gap-3 bg-emerald-950/40 border border-emerald-500/20 rounded-2xl py-3 px-4.5 shrink-0 shadow-[0_0_20px_rgba(16,185,129,0.05)]">
                      <ArrowRight size={16} className="text-emerald-400" />
                      <div className="text-left">
                        <span className="block text-[9px] uppercase tracking-wider font-extrabold text-emerald-400/80">
                          VENDEDOR DESIGNADO
                        </span>
                        <span className="text-sm font-black text-emerald-350 tracking-tight">
                          {vendorName}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </section>
      </main>

      {/* Styles for custom scrollbars */}
      <style
        dangerouslySetInnerHTML={{
          __html: `
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: rgba(255, 255, 255, 0.01);
          border-radius: 12px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.08);
          border-radius: 12px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(255, 255, 255, 0.15);
        }
      `,
        }}
      />
    </div>
  );
}
