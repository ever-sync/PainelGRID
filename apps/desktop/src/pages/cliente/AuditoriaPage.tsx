import { useEffect, useMemo, useState } from "react";
import { useOutletContext } from "react-router-dom";
import clsx from "clsx";
import { Download, Search, ShieldCheck } from "lucide-react";
import { PageHeader } from "../../components/shared/PageHeader";
import type { AppOutletContext } from "../../layouts/AppLayout";
import { readDashboardDarkEnabled } from "../../lib/dashboard-dark-mode";
import { readStoredSession } from "../../services/auth";
import { listAuditLogs, type AuditLogItem } from "../../services/audit";
import { listClients, type ApiClient } from "../../services/clients";
import { listEvents, type ApiEvent } from "../../services/events";

type Scope = "cliente" | "evento";

const roleNames: Record<string, string> = {
  gestor: "Gestor",
  vendor: "Vendedor",
  cliente: "Cliente",
  recepcao: "Recepção",
  system: "Sistema",
  crm: "CRM",
  automation: "Automação",
  integration: "Integração",
  n8n: "N8N",
  whatsapp: "WhatsApp",
};

function csvCell(value: unknown) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

export function AuditoriaPage() {
  const { user } = useOutletContext<AppOutletContext>();
  const isDarkMode = readDashboardDarkEnabled(user.id);
  const [scope, setScope] = useState<Scope>("evento");
  const [clients, setClients] = useState<ApiClient[]>([]);
  const [events, setEvents] = useState<ApiEvent[]>([]);
  const [clientId, setClientId] = useState(user.client_id ?? "");
  const [eventId, setEventId] = useState("");
  const [search, setSearch] = useState("");
  const [logs, setLogs] = useState<AuditLogItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const token = readStoredSession()?.accessToken ?? "";

  useEffect(() => {
    if (!token) return;
    if (user.role === "gestor") {
      void listClients(token).then((items) => {
        setClients(items);
        setClientId((current) => current || items[0]?.id || "");
      });
    } else if (user.client_id) {
      setClients([
        {
          id: user.client_id,
          company_name: user.company_name || "Minha empresa",
        } as ApiClient,
      ]);
    }
  }, [token, user.client_id, user.company_name, user.role]);

  useEffect(() => {
    setEventId("");
    if (!token || !clientId) {
      setEvents([]);
      return;
    }
    void listEvents({ client_id: clientId }, token).then(setEvents);
  }, [clientId, token]);

  useEffect(() => {
    if (!token || !clientId || (scope === "evento" && !eventId)) {
      setLogs([]);
      return;
    }
    let active = true;
    setLoading(true);
    setError("");
    const timer = window.setTimeout(() => {
      void listAuditLogs(token, {
        client_id: clientId,
        event_id: scope === "evento" ? eventId : undefined,
        search: search.trim() || undefined,
      })
        .then((items) => active && setLogs(items))
        .catch((reason: unknown) => {
          if (active) setError(reason instanceof Error ? reason.message : "Falha ao carregar os logs.");
        })
        .finally(() => active && setLoading(false));
    }, 250);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [clientId, eventId, scope, search, token]);

  const selectedName = useMemo(() => {
    if (scope === "evento") return events.find((event) => event.id === eventId)?.name;
    return clients.find((client) => client.id === clientId)?.company_name;
  }, [clientId, clients, eventId, events, scope]);

  const exportCsv = () => {
    const header = ["Data/Hora", "Usuário", "Perfil/Origem", "Ação", "Lead", "Evento", "Detalhes"];
    const rows = logs.map((log) => [
      new Date(log.timestamp).toLocaleString("pt-BR"),
      log.actor,
      roleNames[log.role] || log.role,
      log.action,
      log.lead.name,
      log.event?.name || "",
      log.details,
    ]);
    const content = [header, ...rows].map((row) => row.map(csvCell).join(";")).join("\n");
    const url = URL.createObjectURL(new Blob([`\uFEFF${content}`], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `auditoria-${selectedName || "logs"}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const inputClass = clsx(
    "h-11 rounded-full border px-4 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-[#FF7A00]",
    isDarkMode ? "border-zinc-800 bg-[#121212] text-white" : "border-zinc-200 bg-white text-zinc-900",
  );

  return (
    <div className="space-y-6">
      <PageHeader title="Logs de auditoria" subtitle="Consulte todas as movimentações registradas por evento ou por cliente." />

      <section className={clsx("rounded-3xl border p-4 sm:p-5", isDarkMode ? "border-zinc-800 bg-[#121212]" : "border-zinc-200 bg-white")}>
        <div className="mb-4 flex items-center gap-2">
          <ShieldCheck size={18} className="text-[#FF7A00]" />
          <span className="text-sm font-bold">Escopo da consulta</span>
        </div>
        <div className="grid gap-3 md:grid-cols-[auto_minmax(180px,1fr)_minmax(180px,1fr)]">
          <div className={clsx("flex rounded-full p-1", isDarkMode ? "bg-zinc-900" : "bg-zinc-100")}>
            {(["evento", "cliente"] as Scope[]).map((item) => (
              <button key={item} type="button" onClick={() => setScope(item)} className={clsx("rounded-full px-4 py-2 text-xs font-bold capitalize", scope === item ? "bg-[#FF7A00] text-white" : "text-zinc-500")}>
                Por {item}
              </button>
            ))}
          </div>
          <select value={clientId} onChange={(event) => setClientId(event.target.value)} disabled={user.role !== "gestor"} className={inputClass}>
            <option value="">Selecione o cliente</option>
            {clients.map((client) => <option key={client.id} value={client.id}>{client.company_name}</option>)}
          </select>
          {scope === "evento" ? (
            <select value={eventId} onChange={(event) => setEventId(event.target.value)} className={inputClass}>
              <option value="">Selecione o evento</option>
              {events.map((event) => <option key={event.id} value={event.id}>{event.name}</option>)}
            </select>
          ) : <div />}
        </div>
      </section>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 sm:max-w-md">
          <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400" />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar pelo nome, e-mail ou telefone do lead..." className={clsx(inputClass, "w-full pl-11 pr-4 font-normal")} />
        </div>
        <button type="button" onClick={exportCsv} disabled={!logs.length} className="inline-flex h-11 items-center justify-center gap-2 rounded-full border border-zinc-200 px-5 text-xs font-bold disabled:opacity-40 dark:border-zinc-700">
          <Download size={15} /> Exportar CSV
        </button>
      </div>

      <div className={clsx("overflow-x-auto rounded-3xl border shadow-sm", isDarkMode ? "border-zinc-800 bg-[#121212]" : "border-zinc-200 bg-white")}>
        <table className="w-full min-w-[850px] text-left text-xs sm:text-sm">
          <thead className={isDarkMode ? "bg-zinc-900/50 text-zinc-400" : "bg-zinc-50 text-zinc-500"}>
            <tr className="text-[11px] uppercase tracking-wider">
              <th className="px-4 py-3.5">Data / hora</th><th className="px-4 py-3.5">Usuário</th><th className="px-4 py-3.5">Ação</th><th className="px-4 py-3.5">Lead</th><th className="px-4 py-3.5">Evento</th><th className="px-4 py-3.5">Detalhes</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {logs.map((log) => (
              <tr key={log.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-900/50">
                <td className="whitespace-nowrap px-4 py-4 font-mono text-xs text-zinc-500">{new Date(log.timestamp).toLocaleString("pt-BR")}</td>
                <td className="whitespace-nowrap px-4 py-4 font-bold">{log.actor}<span className="block text-[10px] font-normal text-zinc-400">{roleNames[log.role] || log.role}</span></td>
                <td className="px-4 py-4 font-semibold">{log.action}</td><td className="px-4 py-4">{log.lead.name}</td><td className="px-4 py-4">{log.event?.name || "Sem evento"}</td><td className="max-w-sm px-4 py-4 text-xs text-zinc-500">{log.details}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!loading && !error && !logs.length && <div className="p-10 text-center text-sm text-zinc-500">{scope === "evento" && !eventId ? "Selecione um evento para visualizar os logs." : "Nenhum registro encontrado neste período."}</div>}
        {loading && <div className="p-10 text-center text-sm text-zinc-500">Carregando logs...</div>}
        {error && <div className="p-10 text-center text-sm text-red-500">{error}</div>}
      </div>
    </div>
  );
}
