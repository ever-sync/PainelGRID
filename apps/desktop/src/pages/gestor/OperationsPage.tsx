import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  ChevronRight,
  Clock3,
  RefreshCw,
  Search,
  ShieldAlert,
  X,
} from "lucide-react";
import clsx from "clsx";
import { PageHeader } from "../../components/shared/PageHeader";
import { readStoredSession } from "../../services/auth";
import {
  AgentAuditEntry,
  getConversationAudit,
  getOperationalDashboard,
  OperationalIssue,
  reopenOperationalIssue,
  resolveOperationalIssue,
} from "../../services/operations";

const GROUPS = {
  exceptions: [
    "UNKNOWN_FORM",
    "CLIENT_NOT_IDENTIFIED",
    "EVENT_NOT_FOUND",
    "LEAD_WITHOUT_STAGE",
    "TEMPLATE_FAILED",
    "FIPE_FAILED",
    "APPOINTMENT_FAILED",
    "QR_NOT_DELIVERED",
    "HANDOFF_REQUIRED",
  ],
  monitoring: [
    "WORKFLOW_STOPPED",
    "META_TOKEN_EXPIRING",
    "WHATSAPP_DISCONNECTED",
    "ERROR_SPIKE",
    "META_LEADS_NOT_IMPORTED",
    "QUEUE_BACKLOG",
    "TEMPLATE_REJECTED",
    "APIBRASIL_UNAVAILABLE",
  ],
};

function JsonValue({ value }: { value: unknown }) {
  if (value == null) return <span className="text-zinc-400">—</span>;
  return (
    <pre className="mt-1 max-h-36 overflow-auto rounded-xl bg-zinc-950 p-3 text-[11px] text-zinc-200">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

export function OperationsPage() {
  const token = readStoredSession()?.accessToken ?? "";
  const [tab, setTab] = useState<"exceptions" | "monitoring">("exceptions");
  const [status, setStatus] = useState("open");
  const [search, setSearch] = useState("");
  const [issues, setIssues] = useState<OperationalIssue[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<OperationalIssue | null>(null);
  const [audit, setAudit] = useState<AgentAuditEntry[]>([]);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      setIssues((await getOperationalDashboard(token, { status })).issues);
    } finally {
      setLoading(false);
    }
  }, [status, token]);

  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    setAudit([]);
    if (selected?.conversation_id && token)
      void getConversationAudit(token, selected.conversation_id).then(setAudit);
  }, [selected, token]);

  const visible = useMemo(
    () =>
      issues.filter(
        (issue) =>
          GROUPS[tab].includes(issue.type) &&
          (!search ||
            `${issue.title} ${issue.message} ${issue.client_name} ${issue.lead?.name}`
              .toLowerCase()
              .includes(search.toLowerCase())),
      ),
    [issues, search, tab],
  );
  const critical = visible.filter(
    (item) => item.severity === "critical",
  ).length;

  async function toggle(issue: OperationalIssue) {
    if (issue.status === "open") await resolveOperationalIssue(token, issue.id);
    else await reopenOperationalIssue(token, issue.id);
    setSelected(null);
    await load();
  }

  return (
    <div className="space-y-6 pb-10">
      <PageHeader
        title="Central de operações"
        subtitle="Exceções, saúde das integrações e auditoria completa do Rubinho em uma única fila."
      />
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-red-100 bg-red-50 p-5">
          <div className="text-xs font-semibold uppercase tracking-wider text-red-600">
            Críticos
          </div>
          <div className="mt-2 text-3xl font-semibold text-red-700">
            {critical}
          </div>
        </div>
        <div className="rounded-2xl border border-amber-100 bg-amber-50 p-5">
          <div className="text-xs font-semibold uppercase tracking-wider text-amber-700">
            Na fila atual
          </div>
          <div className="mt-2 text-3xl font-semibold text-amber-800">
            {visible.length}
          </div>
        </div>
        <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-5">
          <div className="text-xs font-semibold uppercase tracking-wider text-emerald-700">
            Resolvidos
          </div>
          <div className="mt-2 text-3xl font-semibold text-emerald-800">
            {issues.filter((i) => i.status === "resolved").length}
          </div>
        </div>
      </div>
      <section className="overflow-hidden rounded-3xl border border-zinc-200 bg-white shadow-sm">
        <div className="flex flex-col gap-4 border-b border-zinc-100 p-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex rounded-xl bg-zinc-100 p-1">
            {(["exceptions", "monitoring"] as const).map((item) => (
              <button
                key={item}
                onClick={() => setTab(item)}
                className={clsx(
                  "rounded-lg px-4 py-2 text-sm transition",
                  tab === item
                    ? "bg-white font-semibold text-zinc-950 shadow-sm"
                    : "text-zinc-500",
                )}
              >
                {item === "exceptions"
                  ? "Exceções operacionais"
                  : "Monitoramento e alertas"}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <div className="relative">
              <Search
                className="absolute left-3 top-2.5 text-zinc-400"
                size={16}
              />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar cliente, lead ou erro"
                className="h-10 w-64 rounded-xl border border-zinc-200 pl-9 pr-3 text-sm outline-none focus:border-red-400"
              />
            </div>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="rounded-xl border border-zinc-200 px-3 text-sm"
            >
              <option value="open">Em aberto</option>
              <option value="resolved">Resolvidos</option>
              <option value="all">Todos</option>
            </select>
            <button
              onClick={() => void load()}
              className="rounded-xl border border-zinc-200 p-2.5 text-zinc-600"
            >
              <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
            </button>
          </div>
        </div>
        <div className="divide-y divide-zinc-100">
          {!loading && visible.length === 0 && (
            <div className="p-14 text-center text-sm text-zinc-500">
              <CheckCircle2 className="mx-auto mb-3 text-emerald-500" />
              Nenhuma ocorrência nesta visão.
            </div>
          )}
          {visible.map((issue) => (
            <button
              key={issue.id}
              onClick={() => setSelected(issue)}
              className="grid w-full grid-cols-[auto_1fr_auto] items-center gap-4 p-5 text-left transition hover:bg-zinc-50"
            >
              <div
                className={clsx(
                  "rounded-xl p-2.5",
                  issue.severity === "critical"
                    ? "bg-red-100 text-red-600"
                    : "bg-amber-100 text-amber-700",
                )}
              >
                {issue.type === "HANDOFF_REQUIRED" ? (
                  <Bot size={20} />
                ) : issue.severity === "critical" ? (
                  <ShieldAlert size={20} />
                ) : (
                  <AlertTriangle size={20} />
                )}
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <strong className="text-sm text-zinc-900">
                    {issue.title}
                  </strong>
                  <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-zinc-500">
                    {issue.source}
                  </span>
                  {issue.occurrence_count > 1 && (
                    <span className="text-xs text-red-500">
                      {issue.occurrence_count} ocorrências
                    </span>
                  )}
                </div>
                <p className="mt-1 line-clamp-1 text-xs text-zinc-500">
                  {issue.message}
                </p>
                <p className="mt-2 text-xs text-zinc-400">
                  {issue.client_name || "Escopo global"}
                  {issue.lead
                    ? ` · ${issue.lead.name}${issue.lead.phone ? ` · ${issue.lead.phone}` : ""}`
                    : ""}
                </p>
              </div>
              <div className="flex items-center gap-3 text-xs text-zinc-400">
                <Clock3 size={14} />
                {new Date(issue.last_seen_at).toLocaleString("pt-BR")}
                <ChevronRight size={17} />
              </div>
            </button>
          ))}
        </div>
      </section>
      {selected && (
        <div
          className="fixed inset-0 z-[80] bg-black/35"
          onMouseDown={() => setSelected(null)}
        >
          <aside
            className="ml-auto h-full w-full max-w-2xl overflow-y-auto bg-white p-6 shadow-2xl"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-red-500">
                  {selected.type}
                </p>
                <h2 className="mt-1 text-xl font-semibold text-zinc-950">
                  {selected.title}
                </h2>
              </div>
              <button
                onClick={() => setSelected(null)}
                className="rounded-full bg-zinc-100 p-2"
              >
                <X size={18} />
              </button>
            </div>
            <p className="mt-5 rounded-2xl bg-zinc-50 p-4 text-sm text-zinc-600">
              {selected.message}
            </p>
            <div className="mt-5 grid grid-cols-2 gap-3 text-xs">
              <div>
                <span className="text-zinc-400">Cliente</span>
                <p className="mt-1 font-medium">
                  {selected.client_name || "Global"}
                </p>
              </div>
              <div>
                <span className="text-zinc-400">Lead</span>
                <p className="mt-1 font-medium">{selected.lead?.name || "—"}</p>
              </div>
            </div>
            <button
              onClick={() => void toggle(selected)}
              className="mt-6 w-full rounded-xl bg-zinc-950 py-3 text-sm font-semibold text-white"
            >
              {selected.status === "open"
                ? "Marcar como resolvido"
                : "Reabrir ocorrência"}
            </button>
            {selected.conversation_id && (
              <div className="mt-8">
                <h3 className="font-semibold text-zinc-900">
                  Auditoria do Rubinho
                </h3>
                <p className="mt-1 text-xs text-zinc-500">
                  Decisão, ferramenta e transição registradas em ordem
                  cronológica.
                </p>
                <div className="mt-4 space-y-4">
                  {audit.length === 0 && (
                    <p className="rounded-xl border border-dashed p-4 text-xs text-zinc-400">
                      Ainda não há auditoria estruturada para esta conversa.
                    </p>
                  )}
                  {audit.map((entry) => (
                    <article
                      key={entry.id}
                      className="rounded-2xl border border-zinc-200 p-4"
                    >
                      <div className="flex justify-between gap-3">
                        <strong className="text-sm">
                          {entry.decision_type}
                        </strong>
                        <span
                          className={clsx(
                            "text-xs font-semibold",
                            entry.result_status === "success"
                              ? "text-emerald-600"
                              : "text-red-600",
                          )}
                        >
                          {entry.result_status}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-zinc-400">
                        {new Date(entry.created_at).toLocaleString("pt-BR")}
                      </p>
                      {entry.received_message && (
                        <div className="mt-3 text-xs">
                          <span className="text-zinc-400">
                            Mensagem recebida
                          </span>
                          <p className="mt-1">{entry.received_message}</p>
                        </div>
                      )}
                      <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
                        <div>
                          <span className="text-zinc-400">Próxima etapa</span>
                          <p>{entry.next_stage || "—"}</p>
                        </div>
                        <div>
                          <span className="text-zinc-400">Ferramenta</span>
                          <p>{entry.tool_name || "—"}</p>
                        </div>
                      </div>
                      <details className="mt-3 text-xs">
                        <summary className="cursor-pointer font-medium text-zinc-600">
                          Ver estados, dados e resposta
                        </summary>
                        <p className="mt-3 text-zinc-400">Estado anterior</p>
                        <JsonValue value={entry.previous_state} />
                        <p className="mt-3 text-zinc-400">Dados enviados</p>
                        <JsonValue value={entry.tool_input} />
                        <p className="mt-3 text-zinc-400">Resposta da API</p>
                        <JsonValue value={entry.api_response} />
                        <p className="mt-3 text-zinc-400">Estado resultante</p>
                        <JsonValue value={entry.resulting_state} />
                      </details>
                      {(entry.block_reason || entry.error_message) && (
                        <p className="mt-3 rounded-lg bg-red-50 p-2 text-xs text-red-700">
                          {entry.block_reason || entry.error_message}
                        </p>
                      )}
                    </article>
                  ))}
                </div>
              </div>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}
