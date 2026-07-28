import { useEffect, useMemo, useState } from "react";
import { useNavigate, useOutletContext } from "react-router-dom";
import { DollarSign, Plus, ShoppingBag, TrendingUp, Search, Calendar, Tag } from "lucide-react";
import clsx from "clsx";
import { PageHeader } from "../../components/shared/PageHeader";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { StatsCard } from "../../components/shared/StatsCard";
import { readStoredSession } from "../../services/auth";
import {
  listVendorSales,
  type SaleType,
  type VendorSaleListItem,
} from "../../services/sales";
import type { User } from "../../types";
import {
  DASHBOARD_DARK_CHANGE_EVENT,
  readDashboardDarkEnabled,
} from "../../lib/dashboard-dark-mode";

type OutletContext = {
  user: User;
};

function formatCurrency(value: string | number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(Number(value));
}

function formatDate(date: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(date));
}

function saleTypeLabel(type: SaleType) {
  if (type === "NOVO") return "Novo";
  if (type === "SEMINOVO") return "Seminovo";
  if (type === "VENDA_DIRETA") return "Venda Direta";
  return "PCD";
}

function saleTypeBadge(type: SaleType) {
  switch (type) {
    case "NOVO":
      return "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/60 dark:text-blue-400 dark:border-blue-900";
    case "SEMINOVO":
      return "bg-[#FF0636]/10 text-[#FF0636] border-[#FF0636]/20";
    case "VENDA_DIRETA":
      return "bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/60 dark:text-purple-400 dark:border-purple-900";
    default:
      return "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/60 dark:text-amber-400 dark:border-amber-900";
  }
}

export function VendasVendedorPage() {
  const navigate = useNavigate();
  const { user } = useOutletContext<OutletContext>();
  const [sales, setSales] = useState<VendorSaleListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [isDarkMode, setIsDarkMode] = useState(false);

  useEffect(() => {
    setIsDarkMode(readDashboardDarkEnabled(user.id));
    const syncTheme = () => setIsDarkMode(readDashboardDarkEnabled(user.id));
    window.addEventListener("storage", syncTheme);
    window.addEventListener(DASHBOARD_DARK_CHANGE_EVENT, syncTheme);
    return () => {
      window.removeEventListener("storage", syncTheme);
      window.removeEventListener(DASHBOARD_DARK_CHANGE_EVENT, syncTheme);
    };
  }, [user.id]);

  useEffect(() => {
    const token = readStoredSession()?.accessToken;
    if (!token) {
      setSales([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    void listVendorSales(token)
      .then(setSales)
      .catch(() => setSales([]))
      .finally(() => setLoading(false));
  }, []);

  const totalValue = useMemo(
    () => sales.reduce((acc, sale) => acc + Number(sale.value), 0),
    [sales],
  );

  const averageTicket = useMemo(
    () => (sales.length > 0 ? totalValue / sales.length : 0),
    [sales, totalValue],
  );

  const filteredSales = useMemo(() => {
    const q = search.trim().toLowerCase();
    return sales.filter((s) => {
      const matchQuery =
        !q ||
        s.product.toLowerCase().includes(q) ||
        (s.lead?.name && s.lead.name.toLowerCase().includes(q)) ||
        (s.appointment?.event?.name && s.appointment.event.name.toLowerCase().includes(q));
      const matchType = typeFilter === "all" || s.type === typeFilter;
      return matchQuery && matchType;
    });
  }, [sales, search, typeFilter]);

  const firstName = user.name.split(" ")[0];

  return (
    <div className={clsx("space-y-6", isDarkMode && "dashboard-dark bg-black")}>
      <PageHeader
        title="Minhas Vendas"
        breadcrumbs={[{ label: "Vendedor" }, { label: "Vendas" }]}
        subtitle={`Histórico e consolidação de negócios fechados por ${firstName}.`}
        actions={
          <Button
            className="hidden md:inline-flex"
            icon={<Plus size={16} />}
            onClick={() => navigate("/vendedor/leads?acao=sale")}
          >
            Registrar Nova Venda
          </Button>
        }
      />

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatsCard
          title="Total de Vendas Concluídas"
          value={sales.length}
          icon={<ShoppingBag size={20} />}
          iconColor="bg-[#FF0636]/10 text-[#FF0636]"
          subtitle="Vendas no histórico"
        />
        <StatsCard
          title="Faturamento Bruto Gerado"
          value={formatCurrency(totalValue)}
          icon={<DollarSign size={20} />}
          iconColor="bg-emerald-100 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400"
          subtitle="Volume financeiro"
        />
        <StatsCard
          title="Ticket Médio por Venda"
          value={formatCurrency(averageTicket)}
          icon={<TrendingUp size={20} />}
          iconColor="bg-blue-100 text-blue-600 dark:bg-blue-950/60 dark:text-blue-400"
          subtitle="Valor médio acumulado"
        />
      </div>

      {/* Filtros e Busca */}
      <Card className="p-4 md:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative flex-1 max-w-sm">
            <Search
              size={16}
              className={clsx(
                "absolute left-3.5 top-1/2 -translate-y-1/2",
                isDarkMode ? "text-zinc-500" : "text-zinc-400",
              )}
            />
            <input
              type="text"
              placeholder="Buscar por lead, evento ou produto..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className={clsx(
                "w-full rounded-xl border py-2 pl-9 pr-3 text-xs outline-none transition-colors focus:border-[#FF0636]",
                isDarkMode
                  ? "bg-zinc-900 border-zinc-700 text-zinc-100 placeholder:text-zinc-500"
                  : "bg-white border-zinc-200 text-zinc-900 placeholder:text-zinc-400",
              )}
            />
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {[
              ["all", "Todas"],
              ["NOVO", "Novo"],
              ["SEMINOVO", "Seminovo"],
              ["VENDA_DIRETA", "Venda Direta"],
              ["PCD", "PCD"],
            ].map(([val, label]) => (
              <button
                key={val}
                type="button"
                onClick={() => setTypeFilter(val)}
                className={clsx(
                  "rounded-full px-3 py-1 text-xs font-bold transition-all",
                  typeFilter === val
                    ? "bg-[#FF0636] text-white shadow-sm"
                    : isDarkMode
                      ? "bg-zinc-900 text-zinc-400 hover:text-zinc-200"
                      : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200",
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </Card>

      {/* Histórico de Vendas */}
      <Card className="p-4 md:p-6">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-100 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400">
              <DollarSign size={18} />
            </span>
            <div>
              <h3 className="text-base font-bold text-gray-900 dark:text-zinc-100">
                Histórico Detalhado de Vendas
              </h3>
              <p className="text-xs text-gray-500 dark:text-zinc-400">
                Lista de transações com dados do comprador e do produto
              </p>
            </div>
          </div>
          <span className="text-xs font-semibold text-gray-500 dark:text-zinc-400">
            {filteredSales.length} de {sales.length} vendas
          </span>
        </div>

        {loading ? (
          <div className="py-12 text-center text-xs text-gray-400 dark:text-zinc-500">
            Carregando lista de vendas...
          </div>
        ) : filteredSales.length === 0 ? (
          <div className="py-12 text-center text-xs text-gray-400 dark:text-zinc-500">
            Nenhuma venda encontrada com os filtros atuais.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-gray-100 dark:border-zinc-800 text-gray-500 dark:text-zinc-400 font-semibold uppercase tracking-wider">
                  <th className="pb-3 px-3">Lead / Cliente</th>
                  <th className="pb-3 px-3">Evento</th>
                  <th className="pb-3 px-3">Tipo</th>
                  <th className="pb-3 px-3">Produto</th>
                  <th className="pb-3 px-3 text-right">Valor da Venda</th>
                  <th className="pb-3 px-3 text-right">Data</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-zinc-800/60">
                {filteredSales.map((sale) => (
                  <tr
                    key={sale.id}
                    className="hover:bg-gray-50/50 dark:hover:bg-zinc-900/50 transition-colors"
                  >
                    <td className="py-3 px-3">
                      <p className="font-bold text-gray-900 dark:text-zinc-100">
                        {sale.lead?.name ?? "Lead removido"}
                      </p>
                      <p className="text-[11px] text-gray-400 dark:text-zinc-500 font-mono">
                        {sale.lead?.phone ?? "Sem telefone"}
                      </p>
                    </td>
                    <td className="py-3 px-3 text-gray-600 dark:text-zinc-400 font-medium">
                      {sale.appointment?.event?.name ?? "Venda Direta / Sem Evento"}
                    </td>
                    <td className="py-3 px-3">
                      <span
                        className={clsx(
                          "inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold border",
                          saleTypeBadge(sale.type),
                        )}
                      >
                        {saleTypeLabel(sale.type)}
                      </span>
                    </td>
                    <td className="py-3 px-3 font-semibold text-gray-800 dark:text-zinc-200">
                      {sale.product}
                    </td>
                    <td className="py-3 px-3 text-right font-black text-emerald-600 dark:text-emerald-400 font-mono text-sm">
                      {formatCurrency(sale.value)}
                    </td>
                    <td className="py-3 px-3 text-right text-gray-500 dark:text-zinc-400 font-mono">
                      {formatDate(sale.sold_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
