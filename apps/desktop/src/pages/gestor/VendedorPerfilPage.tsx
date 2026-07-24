import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  MessageSquareText,
  Star,
  Target,
  Trophy,
  Users,
} from "lucide-react";
import { PageHeader } from "../../components/shared/PageHeader";
import { StatsCard } from "../../components/shared/StatsCard";
import { Card } from "../../components/ui/Card";
import { readStoredSession } from "../../services/auth";
import {
  getVendorProfile,
  type VendorProfileResponse,
} from "../../services/serviceRatings";

function formatDateTime(value?: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function Stars({ score }: { score: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((value) => (
        <Star
          key={value}
          size={14}
          className={
            value <= score ? "fill-amber-400 text-amber-400" : "text-gray-200"
          }
        />
      ))}
    </div>
  );
}

export function VendedorPerfilPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState<VendorProfileResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    const token = readStoredSession()?.accessToken;
    if (!token || !id) {
      setLoading(false);
      setError(true);
      return;
    }
    let active = true;
    void getVendorProfile(token, id)
      .then((row) => {
        if (active) setData(row);
      })
      .catch(() => {
        if (active) setError(true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [id]);

  if (loading) {
    return (
      <div className="py-16 text-center text-sm text-gray-400">
        Carregando perfil...
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="py-16 text-center">
        <p className="text-sm text-gray-500">
          Não foi possível carregar este vendedor.
        </p>
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-[#E51838] hover:underline"
        >
          <ArrowLeft size={14} /> Voltar
        </button>
      </div>
    );
  }

  const { vendor, metrics, rank, ratings } = data;

  return (
    <div>
      <PageHeader
        title={vendor.name}
        breadcrumbs={[
          { label: "Gestor" },
          { label: "Equipe" },
          { label: vendor.name },
        ]}
        subtitle={vendor.email}
        actions={
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
          >
            <ArrowLeft size={14} /> Voltar
          </button>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatsCard
          title="Posição no ranking"
          value={rank ? `#${rank.position}` : "—"}
          icon={<Trophy size={20} />}
          iconColor="bg-yellow-100 text-yellow-600"
          subtitle={rank ? `de ${rank.total} vendedores` : undefined}
        />
        <StatsCard
          title="Vendas"
          value={metrics?.sold.count ?? 0}
          icon={<Target size={20} />}
          iconColor="bg-green-100 text-green-600"
        />
        <StatsCard
          title="Pontuação total"
          value={metrics?.total_points ?? 0}
          icon={<Users size={20} />}
          iconColor="bg-blue-100 text-blue-600"
        />
        <StatsCard
          title="Nota de atendimento"
          value={ratings.count > 0 ? ratings.average.toFixed(1) : "—"}
          icon={<Star size={20} />}
          iconColor="bg-amber-100 text-amber-600"
          subtitle={`${ratings.count} avaliaç${ratings.count === 1 ? "ão" : "ões"}`}
        />
      </div>

      <Card padding="sm" className="md:p-6">
        <div className="mb-4 flex items-center gap-2">
          <MessageSquareText size={18} className="text-gray-400" />
          <h3 className="text-lg font-semibold tracking-tight text-gray-900 md:text-base">
            Avaliações de atendimento
          </h3>
        </div>

        {ratings.items.length === 0 ? (
          <p className="py-8 text-center text-sm text-gray-400">
            Nenhuma avaliação recebida ainda.
          </p>
        ) : (
          <div className="divide-y divide-gray-100">
            {ratings.items.map((item) => (
              <div
                key={item.id}
                className="flex flex-col gap-2 py-4 first:pt-0 last:pb-0"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Stars score={item.score} />
                    <span className="text-sm font-semibold text-gray-900">
                      {item.customer_name?.trim() || "Anônimo"}
                    </span>
                  </div>
                  <span className="text-xs text-gray-400">
                    {formatDateTime(item.created_at)}
                  </span>
                </div>
                {item.event_name && (
                  <span className="inline-flex w-fit items-center rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-600">
                    {item.event_name}
                  </span>
                )}
                {item.comment && (
                  <p className="text-sm leading-relaxed text-gray-600">
                    {item.comment}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
