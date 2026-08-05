import { useMemo, useState } from "react";
import { useOutletContext } from "react-router-dom";
import clsx from "clsx";
import { Search, Download } from "lucide-react";
import { PageHeader } from "../../components/shared/PageHeader";
import type { AppOutletContext } from "../../layouts/AppLayout";
import { readDashboardDarkEnabled } from "../../lib/dashboard-dark-mode";

type AuditLogItem = {
  id: string;
  timestamp: string;
  user: string;
  role: string;
  action: string;
  category: "lead" | "vendedor" | "loja" | "sistema" | "venda";
  ipAddress: string;
  details: string;
};

const MOCK_AUDIT_LOGS: AuditLogItem[] = [
  {
    id: "log-101",
    timestamp: "31/07/2026 11:35:10",
    user: "Carlos Oliveira",
    role: "Vendedor",
    action: "Finalização de Atendimento",
    category: "venda",
    ipAddress: "189.120.45.12",
    details:
      "Atendimento encerrado com venda registrada no valor de R$ 145.000,00 (Nissan Kicks).",
  },
  {
    id: "log-102",
    timestamp: "31/07/2026 11:20:05",
    user: "Recepção Central",
    role: "Recepção",
    action: "Venda Avulsa Lançada",
    category: "venda",
    ipAddress: "189.120.45.10",
    details:
      "Venda avulsa atribuída ao vendedor Ana Souza para o cliente Raphael Silva.",
  },
  {
    id: "log-103",
    timestamp: "31/07/2026 10:50:44",
    user: "Gestor Comercial",
    role: "Gestor",
    action: "Reatribuição de Lead",
    category: "lead",
    ipAddress: "187.65.12.99",
    details: "Lead Mariana Costa reatribuído de Roberto Lima para Ana Souza.",
  },
  {
    id: "log-104",
    timestamp: "31/07/2026 09:15:30",
    user: "Administrador",
    role: "Cliente",
    action: "Cadastro de Nova Loja",
    category: "loja",
    ipAddress: "187.65.12.99",
    details: "Nova loja 'Original BYD | Guarulhos' cadastrada e ativada.",
  },
  {
    id: "log-105",
    timestamp: "31/07/2026 08:00:12",
    user: "Sistema Realtime",
    role: "Sistema",
    action: "Sincronização Socket",
    category: "sistema",
    ipAddress: "127.0.0.1",
    details: "Status de 8 vendedores online sincronizados com sucesso.",
  },
];

export function AuditoriaPage() {
  const { user } = useOutletContext<AppOutletContext>();
  const isDarkMode = readDashboardDarkEnabled(user.id);

  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("todas");

  const filteredLogs = useMemo(() => {
    return MOCK_AUDIT_LOGS.filter((log) => {
      const matchSearch =
        log.user.toLowerCase().includes(search.toLowerCase()) ||
        log.action.toLowerCase().includes(search.toLowerCase()) ||
        log.details.toLowerCase().includes(search.toLowerCase());

      const matchCategory =
        categoryFilter === "todas" ? true : log.category === categoryFilter;

      return matchSearch && matchCategory;
    });
  }, [search, categoryFilter]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Auditoria"
        subtitle="Histórico detalhado e registro inviolável de todas as ações realizadas no sistema."
      />

      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="flex flex-1 items-center gap-3">
          <div className="relative flex-1 sm:max-w-md">
            <Search
              size={16}
              className={clsx(
                "absolute left-4 top-1/2 -translate-y-1/2",
                isDarkMode ? "text-zinc-500" : "text-zinc-400",
              )}
            />
            <input
              type="text"
              placeholder="Buscar por usuário, ação ou detalhe..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className={clsx(
                "w-full h-11 rounded-full border pl-11 pr-4 text-xs focus:outline-none focus:ring-2 focus:ring-[#FF7A00]",
                isDarkMode
                  ? "border-zinc-800 bg-[#121212] text-white placeholder-zinc-500"
                  : "border-zinc-200 bg-white text-zinc-900 placeholder-zinc-400",
              )}
            />
          </div>

          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className={clsx(
              "h-11 rounded-full border px-4 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-[#FF7A00] cursor-pointer",
              isDarkMode
                ? "border-zinc-800 bg-[#121212] text-white"
                : "border-zinc-200 bg-white text-zinc-900",
            )}
          >
            <option value="todas">Todas Categorias</option>
            <option value="venda">Vendas</option>
            <option value="lead">Leads</option>
            <option value="loja">Lojas</option>
            <option value="vendedor">Vendedores</option>
            <option value="sistema">Sistema</option>
          </select>
        </div>

        <button
          type="button"
          onClick={() =>
            alert("Relatório de auditoria exportado em formato CSV.")
          }
          className={clsx(
            "h-11 px-5 rounded-full border text-xs font-bold transition-all active:scale-95 inline-flex items-center gap-2 cursor-pointer",
            isDarkMode
              ? "border-zinc-700 bg-zinc-900 text-zinc-200 hover:bg-zinc-800"
              : "border-zinc-200 bg-white text-zinc-800 hover:bg-zinc-50",
          )}
        >
          <Download size={15} />
          <span>Exportar Relatório</span>
        </button>
      </div>

      <div
        className={clsx(
          "rounded-3xl border overflow-x-auto shadow-sm",
          isDarkMode
            ? "border-zinc-800 bg-[#121212]"
            : "border-zinc-200 bg-white",
        )}
      >
        <table className="w-full text-left text-xs sm:text-sm">
          <thead>
            <tr
              className={clsx(
                "border-b font-semibold uppercase tracking-wider text-[11px]",
                isDarkMode
                  ? "border-zinc-800 bg-zinc-900/50 text-zinc-400"
                  : "border-zinc-100 bg-zinc-50 text-zinc-500",
              )}
            >
              <th className="py-3.5 px-4">DATA / HORA</th>
              <th className="py-3.5 px-4">USUÁRIO</th>
              <th className="py-3.5 px-4">AÇÃO</th>
              <th className="py-3.5 px-4">CATEGORIA</th>
              <th className="py-3.5 px-4">IP</th>
              <th className="py-3.5 px-4">DETALHES DA OPERAÇÃO</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {filteredLogs.map((log) => (
              <tr
                key={log.id}
                className={clsx(
                  "transition-colors",
                  isDarkMode ? "hover:bg-zinc-900/50" : "hover:bg-zinc-50",
                )}
              >
                <td className="py-4 px-4 font-mono text-xs text-zinc-500 dark:text-zinc-400 whitespace-nowrap">
                  {log.timestamp}
                </td>
                <td className="py-4 px-4 font-bold text-zinc-900 dark:text-zinc-100 whitespace-nowrap">
                  {log.user}
                  <span className="block text-[10px] font-normal text-zinc-400">
                    {log.role}
                  </span>
                </td>
                <td className="py-4 px-4 font-semibold text-zinc-800 dark:text-zinc-200">
                  {log.action}
                </td>
                <td className="py-4 px-4">
                  <span
                    className={clsx(
                      "inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider",
                      log.category === "venda"
                        ? "bg-emerald-500/10 text-emerald-500"
                        : log.category === "lead"
                          ? "bg-blue-500/10 text-blue-500"
                          : log.category === "loja"
                            ? "bg-orange-500/10 text-orange-500"
                            : "bg-zinc-500/10 text-zinc-400",
                    )}
                  >
                    {log.category}
                  </span>
                </td>
                <td className="py-4 px-4 font-mono text-xs text-zinc-400">
                  {log.ipAddress}
                </td>
                <td className="py-4 px-4 text-xs text-zinc-600 dark:text-zinc-300">
                  {log.details}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
