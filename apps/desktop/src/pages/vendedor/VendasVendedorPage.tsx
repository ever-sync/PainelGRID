import { useEffect, useMemo, useState } from "react";
import { useNavigate, useOutletContext } from "react-router-dom";
import { DollarSign, Plus } from "lucide-react";
import { PageHeader } from "../../components/shared/PageHeader";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { readStoredSession } from "../../services/auth";
import {
  listVendorSales,
  type SaleType,
  type VendorSaleListItem,
} from "../../services/sales";
import type { User } from "../../types";

type OutletContext = {
  user: User;
};

function formatCurrency(value: string) {
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
  if (type === "VENDA_DIRETA") return "Venda direta";
  return "PCD";
}

export function VendasVendedorPage() {
  const navigate = useNavigate();
  const { user } = useOutletContext<OutletContext>();
  const [sales, setSales] = useState<VendorSaleListItem[]>([]);
  const [loading, setLoading] = useState(true);

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

  return (
    <div>
      <PageHeader
        title="Vendas"
        breadcrumbs={[{ label: "Vendedor" }, { label: "Vendas" }]}
        subtitle={`Todas as vendas de ${user.name.split(" ")[0]}.`}
        actions={
          <Button
            className="hidden md:inline-flex"
            icon={<Plus size={16} />}
            onClick={() => navigate("/vendedor/leads?acao=sale")}
          >
            Criar venda
          </Button>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3">
        <Card padding="sm">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
            Total de vendas
          </p>
          <p className="mt-2 text-2xl font-bold text-gray-900">
            {sales.length}
          </p>
        </Card>
        <Card padding="sm">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
            Valor vendido
          </p>
          <p className="mt-2 text-2xl font-bold text-green-700">
            {formatCurrency(totalValue.toFixed(2))}
          </p>
        </Card>
      </div>

      <Card padding="sm" className="md:p-6">
        <div className="mb-4 flex items-center gap-2">
          <span className="rounded-full bg-green-100 p-2 text-green-700">
            <DollarSign size={16} />
          </span>
          <h3 className="text-lg font-semibold text-gray-900">
            Histórico de vendas
          </h3>
        </div>

        {loading ? (
          <p className="py-8 text-center text-sm text-gray-400">
            Carregando vendas...
          </p>
        ) : sales.length === 0 ? (
          <p className="py-8 text-center text-sm text-gray-400">
            Nenhuma venda registrada ainda.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-gray-100">
            <table className="w-full min-w-[780px] text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="px-4 py-3 text-left font-medium text-gray-500">
                    Lead
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-gray-500">
                    Evento
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-gray-500">
                    Tipo
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-gray-500">
                    Produto
                  </th>
                  <th className="px-4 py-3 text-right font-medium text-gray-500">
                    Valor
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-gray-500">
                    Data da venda
                  </th>
                </tr>
              </thead>
              <tbody>
                {sales.map((sale, index) => (
                  <tr
                    key={sale.id}
                    className={
                      index % 2 === 0
                        ? "border-b border-gray-50 bg-white"
                        : "border-b border-gray-50 bg-gray-50/30"
                    }
                  >
                    <td className="px-4 py-3 text-gray-800">
                      <p className="font-medium">
                        {sale.lead?.name ?? "Lead removido"}
                      </p>
                      <p className="text-xs text-gray-400">
                        {sale.lead?.phone ?? "Sem telefone"}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-gray-700">
                      {sale.appointment?.event?.name ?? "Sem evento"}
                    </td>
                    <td className="px-4 py-3 text-gray-700">
                      {saleTypeLabel(sale.type)}
                    </td>
                    <td className="px-4 py-3 text-gray-700">{sale.product}</td>
                    <td className="px-4 py-3 text-right font-semibold text-gray-900">
                      {formatCurrency(sale.value)}
                    </td>
                    <td className="px-4 py-3 text-gray-700">
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
