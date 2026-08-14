import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { Clock, Flag, UserCheck, Users } from "lucide-react";
import { useOutletContext } from "react-router-dom";
import type { User } from "../../types";
import { PageHeader } from "../../components/shared/PageHeader";
import { Notice } from "../../components/ui/Notice";
import { readStoredSession } from "../../services/auth";
import { listEvents, mapApiEventToEvent } from "../../services/events";
import { fetchAllLeads, type ApiLead } from "../../services/leads";
import { resolveClientId } from "../../utils/userContext";
import { useLeadRealtimeSync } from "../../hooks/useLeadRealtimeSync";
import gpLogo from "../../assets/logo.png";

type OutletContext = { user: User };

function arrivalTime(lead: ApiLead) {
  return new Date(
    lead.confirmation_date ||
      lead.updated_at ||
      lead.store_visit_datetime ||
      lead.created_at,
  );
}

export function FilaPage() {
  const { user } = useOutletContext<OutletContext>();
  const clientId = resolveClientId(user);
  const [eventName, setEventName] = useState("");
  const [leads, setLeads] = useState<ApiLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const token = readStoredSession()?.accessToken;
    if (!token || !clientId) {
      setError("Não foi possível identificar a empresa deste acesso.");
      setLoading(false);
      return;
    }

    try {
      const events = (await listEvents({ client_id: clientId }, token)).map(
        mapApiEventToEvent,
      );
      const event =
        events.find((item) => item.status === "active") ?? events[0];
      if (!event) {
        setError("Nenhum evento disponível para exibir a fila.");
        setLoading(false);
        return;
      }

      const rows = await fetchAllLeads(
        {
          client_id: clientId,
          event_id: event.id,
          confirmation_status: "checked_in",
        },
        token,
      );
      setEventName(event.name);
      setLeads(
        user.role === "vendedor"
          ? rows.filter((lead) => lead.assigned_vendor_id === user.id)
          : rows,
      );
      setError("");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Não foi possível carregar a fila de atendimento.",
      );
    } finally {
      setLoading(false);
    }
  }, [clientId, user.id, user.role]);

  useEffect(() => {
    void load();
    const interval = window.setInterval(() => void load(), 15_000);
    return () => window.clearInterval(interval);
  }, [load]);

  useLeadRealtimeSync(clientId, load);

  const { waitingQueue, activeService } = useMemo(() => {
    const sorted = [...leads].sort(
      (a, b) => arrivalTime(a).getTime() - arrivalTime(b).getTime(),
    );
    return {
      waitingQueue: sorted.filter((lead) => !lead.assigned_vendor_id),
      activeService: sorted.filter((lead) => Boolean(lead.assigned_vendor_id)),
    };
  }, [leads]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Fila de Atendimento"
        breadcrumbs={[
          {
            label: user.role === "recepcao" ? "Recepção" : "Vendedor",
          },
          { label: "Fila" },
        ]}
      />

      {error ? <Notice tone="error">{error}</Notice> : null}

      <div className="relative overflow-hidden rounded-3xl border border-zinc-800 bg-[#09090b] p-4 text-white shadow-[0_24px_60px_rgba(0,0,0,0.28)] sm:p-6">
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(115deg,rgba(255,0,56,0.09),transparent_32%),repeating-linear-gradient(135deg,transparent_0,transparent_28px,rgba(255,255,255,0.015)_29px,transparent_30px)]" />
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-[#ff0038] via-[#ff0038]/50 to-transparent" />

        {eventName ? (
          <div className="relative mb-5 flex flex-col justify-between gap-4 border-b border-white/[0.08] pb-5 sm:flex-row sm:items-center">
            <div className="flex items-center gap-4">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl border border-[#ff0038]/30 bg-[#ff0038]/10">
                <img
                  src={gpLogo}
                  alt="GP de Vendas"
                  className="h-10 w-10 object-contain"
                />
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-[#ff3159]">
                  GP de Vendas · Atendimento ao vivo
                </p>
                <p className="mt-1 text-xl font-black uppercase tracking-tight sm:text-2xl">
                  {eventName}
                </p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <QueueMetric
                label="Aguardando"
                value={waitingQueue.length}
                tone="waiting"
              />
              <QueueMetric
                label="Em atendimento"
                value={activeService.length}
                tone="active"
              />
            </div>
          </div>
        ) : null}

        <div className="relative">
          {loading ? (
            <div className="flex items-center justify-center gap-3 py-16 text-sm text-zinc-500">
              <span className="h-5 w-5 animate-spin rounded-full border-2 border-zinc-700 border-t-[#ff0038]" />
              Carregando fila...
            </div>
          ) : leads.length === 0 && !error ? (
            <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-white/10 bg-white/[0.02] py-16 text-zinc-500">
              <Users size={38} className="text-zinc-700" />
              <p className="text-sm font-medium">
                {user.role === "vendedor"
                  ? "Nenhum cliente está aguardando você."
                  : "Ninguém aguardando atendimento."}
              </p>
            </div>
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              <QueueSection
                title="Fila de espera"
                subtitle="Por ordem de chegada"
                icon={<Clock size={19} />}
                count={waitingQueue.length}
                tone="waiting"
              >
                {waitingQueue.length ? (
                  waitingQueue.map((lead, index) => (
                    <QueueLeadRow
                      key={lead.id}
                      lead={lead}
                      position={index + 1}
                      state="waiting"
                    />
                  ))
                ) : (
                  <QueueEmpty icon={<Flag size={28} />}>
                    Ninguém aguardando no momento.
                  </QueueEmpty>
                )}
              </QueueSection>

              <QueueSection
                title="Em atendimento"
                subtitle="Clientes com vendedor"
                icon={<UserCheck size={19} />}
                count={activeService.length}
                tone="active"
              >
                {activeService.length ? (
                  activeService.map((lead) => (
                    <QueueLeadRow key={lead.id} lead={lead} state="active" />
                  ))
                ) : (
                  <QueueEmpty icon={<UserCheck size={28} />}>
                    Nenhum atendimento iniciado.
                  </QueueEmpty>
                )}
              </QueueSection>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function QueueMetric({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "waiting" | "active";
}) {
  return (
    <div className="min-w-[118px] rounded-xl border border-white/[0.08] bg-white/[0.035] px-3 py-2">
      <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-zinc-500">
        {label}
      </p>
      <p
        className={`mt-0.5 text-2xl font-black tabular-nums ${
          tone === "waiting" ? "text-amber-400" : "text-[#ff3159]"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function QueueSection({
  title,
  subtitle,
  icon,
  count,
  tone,
  children,
}: {
  title: string;
  subtitle: string;
  icon: ReactNode;
  count: number;
  tone: "waiting" | "active";
  children: ReactNode;
}) {
  const active = tone === "active";
  return (
    <section className="min-h-[280px] rounded-2xl border border-white/[0.08] bg-[#111114]/95 p-4 shadow-[0_18px_45px_rgba(0,0,0,0.25)]">
      <div className="mb-4 flex items-center justify-between border-b border-white/[0.07] pb-4">
        <div className="flex items-center gap-3">
          <span
            className={`flex h-10 w-10 items-center justify-center rounded-xl border ${
              active
                ? "border-[#ff0038]/25 bg-[#ff0038]/10 text-[#ff3159]"
                : "border-amber-400/20 bg-amber-400/10 text-amber-400"
            }`}
          >
            {icon}
          </span>
          <div>
            <h2 className="font-black uppercase tracking-tight text-zinc-100">
              {title}
            </h2>
            <p className="text-[11px] text-zinc-500">{subtitle}</p>
          </div>
        </div>
        <span
          className={`rounded-lg px-3 py-1 text-lg font-black tabular-nums ${
            active
              ? "bg-[#ff0038]/10 text-[#ff3159]"
              : "bg-amber-400/10 text-amber-400"
          }`}
        >
          {count}
        </span>
      </div>
      <div className="space-y-2.5">{children}</div>
    </section>
  );
}

function QueueEmpty({
  icon,
  children,
}: {
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-44 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-white/[0.08] text-center text-sm text-zinc-600">
      <span className="text-zinc-700">{icon}</span>
      {children}
    </div>
  );
}

function QueueLeadRow({
  lead,
  position,
  state,
}: {
  lead: ApiLead;
  position?: number;
  state: "waiting" | "active";
}) {
  const active = state === "active";
  return (
    <div
      className={`group relative flex items-center gap-3 overflow-hidden rounded-xl border p-3.5 transition-colors ${
        active
          ? "border-[#ff0038]/15 bg-[#ff0038]/[0.045] hover:border-[#ff0038]/30"
          : "border-white/[0.07] bg-white/[0.025] hover:border-amber-400/20"
      }`}
    >
      <span
        className={`absolute inset-y-0 left-0 w-0.5 ${active ? "bg-[#ff0038]" : "bg-amber-400"}`}
      />
      <span
        className={`ml-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border text-sm font-black ${
          active
            ? "border-[#ff0038]/25 bg-[#ff0038]/10 text-[#ff3159]"
            : "border-amber-400/25 bg-amber-400/10 text-amber-300"
        }`}
      >
        {active ? <UserCheck size={18} /> : position}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate font-bold text-zinc-100">{lead.name}</p>
        <p className="mt-1 flex items-center gap-1.5 text-xs text-zinc-500">
          <Clock size={13} />
          Check-in às{" "}
          {arrivalTime(lead).toLocaleTimeString("pt-BR", {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </p>
      </div>
      <span
        className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold ${
          active
            ? "bg-[#ff0038]/10 text-[#ff6684]"
            : "bg-amber-400/10 text-amber-300"
        }`}
      >
        <UserCheck size={14} />
        {active ? "Em atendimento" : "Aguardando"}
      </span>
    </div>
  );
}
