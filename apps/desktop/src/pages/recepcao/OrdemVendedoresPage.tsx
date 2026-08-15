import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronUp, ListOrdered, RefreshCw } from "lucide-react";
import { useOutletContext } from "react-router-dom";
import clsx from "clsx";
import type { User, VendorCategory } from "../../types";
import { PageHeader } from "../../components/shared/PageHeader";
import { Card } from "../../components/ui/Card";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { readStoredSession } from "../../services/auth";
import { listEvents, type ApiEvent } from "../../services/events";
import {
  listSalesTeams,
  reorderTeamMembers,
  type SalesTeam,
  type TeamMember,
} from "../../services/salesTeams";

type OutletContext = { user: User };
type QueueMember = TeamMember & { teamId: string };

const CATEGORIES: Array<{ value: VendorCategory; label: string }> = [
  { value: "novo", label: "Novo" },
  { value: "semininovo", label: "Seminovo" },
  { value: "pdc", label: "PCD" },
  { value: "consorcio", label: "Venda direta" },
  { value: "assinatura", label: "Assinatura" },
];

export function OrdemVendedoresPage() {
  const { user } = useOutletContext<OutletContext>();
  const [events, setEvents] = useState<ApiEvent[]>([]);
  const [eventId, setEventId] = useState(
    () => localStorage.getItem("reception:selected-event") ?? "",
  );
  const [teams, setTeams] = useState<SalesTeam[]>([]);
  const [category, setCategory] = useState<VendorCategory>("novo");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function load(nextEventId = eventId) {
    const token = readStoredSession()?.accessToken;
    if (!token) {
      setError("Faça login novamente para carregar a ordem dos vendedores.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const rows = events.length ? events : await listEvents({}, token);
      setEvents(rows);
      const selected =
        rows.find((item) => item.id === nextEventId) ??
        rows.find((item) => item.status === "active") ??
        rows[0];
      if (!selected) {
        setTeams([]);
        setLoading(false);
        return;
      }
      if (selected.id !== eventId) {
        setEventId(selected.id);
        localStorage.setItem("reception:selected-event", selected.id);
      }
      setTeams(await listSalesTeams(token, selected.id));
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Não foi possível carregar a ordem dos vendedores.",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    const onEventChanged = (event: Event) => {
      const next = (event as CustomEvent<{ eventId?: string }>).detail?.eventId;
      if (next) {
        setEventId(next);
        void load(next);
      }
    };
    window.addEventListener("reception-event-changed", onEventChanged);
    return () =>
      window.removeEventListener("reception-event-changed", onEventChanged);
    // The event selector is controlled by AppLayout; this page only reacts to it.
  }, [user.id]);

  const members = useMemo<QueueMember[]>(
    () =>
      teams
        .flatMap((team) =>
          team.members.map((member) => ({ ...member, teamId: team.id })),
        )
        .filter((member) => {
          const categories = member.user.vendor_categories?.length
            ? member.user.vendor_categories
            : member.user.vendor_category
              ? [member.user.vendor_category]
              : [];
          return categories.includes(category);
        })
        .sort(
          (a, b) =>
            (a.queue_positions?.[category] ??
              a.queue_position ??
              Number.MAX_SAFE_INTEGER) -
              (b.queue_positions?.[category] ??
                b.queue_position ??
                Number.MAX_SAFE_INTEGER) ||
            a.user.name.localeCompare(b.user.name, "pt-BR"),
        ),
    [category, teams],
  );

  async function move(memberId: string, direction: -1 | 1) {
    const index = members.findIndex((item) => item.user_id === memberId);
    const next = index + direction;
    if (index < 0 || next < 0 || next >= members.length || saving) return;
    const ordered = [...members];
    [ordered[index], ordered[next]] = [ordered[next], ordered[index]];
    const token = readStoredSession()?.accessToken;
    if (!token || !eventId) return;
    setSaving(memberId);
    setError("");
    setSuccess("");
    try {
      await reorderTeamMembers(
        token,
        ordered[0].teamId,
        ordered.map((item) => item.user_id),
        category,
      );
      setTeams(await listSalesTeams(token, eventId));
      setSuccess("Ordem salva.");
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Não foi possível salvar a ordem.",
      );
    } finally {
      setSaving(null);
    }
  }

  const selectedEvent = events.find((item) => item.id === eventId);

  return (
    <div className="min-h-full bg-[#fafafa] p-4 md:p-8">
      <PageHeader
        title="Ordem dos vendedores"
        subtitle="Defina a prioridade da fila por categoria para o evento selecionado na recepção."
        actions={
          <Button
            variant="secondary"
            onClick={() => void load()}
            disabled={loading}
          >
            <RefreshCw size={16} className={clsx(loading && "animate-spin")} />
            Atualizar
          </Button>
        }
      />

      {events.length > 0 && (
        <div className="mb-5 max-w-xl">
          <label className="mb-1 block text-xs font-bold uppercase tracking-wide text-zinc-500">
            Evento
          </label>
          <select
            value={eventId}
            onChange={(event) => {
              setEventId(event.target.value);
              localStorage.setItem(
                "reception:selected-event",
                event.target.value,
              );
              void load(event.target.value);
            }}
            className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm font-semibold outline-none focus:border-[#E51838]"
          >
            {events.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </div>
      )}

      <Card className="border border-zinc-100 bg-white" padding="lg">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
          <div>
            <div className="flex items-center gap-2">
              <ListOrdered size={20} className="text-[#E51838]" />
              <h2 className="text-lg font-black text-zinc-950">
                Fila por categoria
              </h2>
            </div>
            <p className="mt-1 text-sm text-zinc-500">
              {selectedEvent?.name ?? "Selecione um evento"}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {CATEGORIES.map((item) => (
              <button
                key={item.value}
                type="button"
                onClick={() => setCategory(item.value)}
                className={clsx(
                  "rounded-full border px-3 py-1.5 text-xs font-semibold",
                  category === item.value
                    ? "border-[#E51838] bg-[#E51838] text-white"
                    : "border-zinc-200 text-zinc-600 hover:bg-zinc-50",
                )}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        {error && (
          <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">
            {error}
          </p>
        )}
        {success && (
          <p className="mt-4 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700">
            {success}
          </p>
        )}
        {loading ? (
          <p className="mt-8 text-sm text-zinc-500">Carregando vendedores…</p>
        ) : members.length === 0 ? (
          <p className="mt-8 rounded-xl border border-dashed border-zinc-200 p-8 text-center text-sm text-zinc-500">
            Nenhum vendedor vinculado a esta categoria neste evento.
          </p>
        ) : (
          <div className="mt-6 space-y-2">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-bold text-zinc-900">
                Ordem geral da categoria
              </p>
              <Badge variant="gray">{members.length} vendedores</Badge>
            </div>
            {members.map((member, index) => (
              <div
                key={`${member.teamId}-${member.user_id}`}
                className="flex items-center gap-3 rounded-xl border border-zinc-200 bg-white px-3 py-2.5"
              >
                <span className="w-5 text-center text-xs font-bold text-zinc-400">
                  {index + 1}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm font-semibold text-zinc-900">
                  {member.user.name}
                </span>
                <div className="flex gap-1">
                  <button
                    type="button"
                    aria-label="Mover para cima"
                    disabled={index === 0 || saving !== null}
                    onClick={() => void move(member.user_id, -1)}
                    className="rounded-lg p-2 text-zinc-500 hover:bg-zinc-100 disabled:opacity-30"
                  >
                    <ChevronUp size={16} />
                  </button>
                  <button
                    type="button"
                    aria-label="Mover para baixo"
                    disabled={index === members.length - 1 || saving !== null}
                    onClick={() => void move(member.user_id, 1)}
                    className="rounded-lg p-2 text-zinc-500 hover:bg-zinc-100 disabled:opacity-30"
                  >
                    <ChevronDown size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
