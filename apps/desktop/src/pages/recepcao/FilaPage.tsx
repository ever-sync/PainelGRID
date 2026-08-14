import { useCallback, useEffect, useMemo, useState } from "react";
import { Clock, UserCheck, Users } from "lucide-react";
import { useOutletContext } from "react-router-dom";
import type { User } from "../../types";
import { PageHeader } from "../../components/shared/PageHeader";
import { Notice } from "../../components/ui/Notice";
import { readStoredSession } from "../../services/auth";
import { listEvents, mapApiEventToEvent } from "../../services/events";
import { fetchAllLeads, type ApiLead } from "../../services/leads";
import { resolveClientId } from "../../utils/userContext";
import { useLeadRealtimeSync } from "../../hooks/useLeadRealtimeSync";

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

      {eventName ? (
        <div className="flex items-center justify-between rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
              Evento
            </p>
            <p className="font-bold text-zinc-900 dark:text-white">
              {eventName}
            </p>
          </div>
          <span className="rounded-full bg-amber-500/10 px-3 py-1 text-sm font-bold text-amber-600 dark:text-amber-400">
            {waitingQueue.length} aguardando
          </span>
        </div>
      ) : null}

      {error ? <Notice tone="error">{error}</Notice> : null}

      <div className="space-y-3">
        {loading ? (
          <p className="py-12 text-center text-sm text-zinc-500">
            Carregando fila...
          </p>
        ) : leads.length === 0 && !error ? (
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-zinc-300 py-14 text-zinc-500 dark:border-zinc-700">
            <Users size={36} />
            <p className="text-sm font-medium">
              {user.role === "vendedor"
                ? "Nenhum cliente está aguardando você."
                : "Ninguém aguardando atendimento."}
            </p>
          </div>
        ) : (
          <>
            {waitingQueue.map((lead, index) => (
              <QueueLeadRow
                key={lead.id}
                lead={lead}
                position={index + 1}
                state="waiting"
              />
            ))}

            {activeService.length > 0 ? (
              <div className="pt-3">
                <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-zinc-500">
                  Em atendimento
                </p>
                <div className="space-y-3">
                  {activeService.map((lead) => (
                    <QueueLeadRow key={lead.id} lead={lead} state="active" />
                  ))}
                </div>
              </div>
            ) : null}
          </>
        )}
      </div>
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
    <div className="flex items-center gap-4 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <span
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-sm font-black ${
          active ? "bg-blue-500 text-white" : "bg-amber-500 text-black"
        }`}
      >
        {active ? <UserCheck size={18} /> : position}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate font-bold text-zinc-900 dark:text-white">
          {lead.name}
        </p>
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
            ? "bg-blue-500/10 text-blue-600 dark:text-blue-400"
            : "bg-amber-500/10 text-amber-600 dark:text-amber-400"
        }`}
      >
        <UserCheck size={14} />
        {active ? "Em atendimento" : "Aguardando"}
      </span>
    </div>
  );
}
