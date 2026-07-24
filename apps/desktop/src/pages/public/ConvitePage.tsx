import { useEffect, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { CheckCircle2 } from "lucide-react";
import {
  fetchCheckInPreview,
  type CheckInPreview,
} from "../../services/publicCheckin";
import { API_BASE } from "../../services/http";

export function ConvitePage() {
  const [params] = useSearchParams();
  const v = params.get("v")?.trim() ?? "";
  const [data, setData] = useState<CheckInPreview | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!v || !API_BASE) {
      setLoading(false);
      setError(true);
      return;
    }
    let active = true;
    void fetchCheckInPreview(v)
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
  }, [v]);

  if (!v) {
    return (
      <div className="min-h-screen bg-[#faf9f7] px-4 py-16 text-center text-zinc-600">
        <p className="text-sm">Link de convite incompleto.</p>
        <Link
          to="/login"
          className="mt-4 inline-block text-sm font-medium text-[#FF0636]"
        >
          Ir para o login
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[linear-gradient(165deg,#fff7f0_0%,#faf9f7_45%,#f4f4f5_100%)] px-4 py-12">
      <div className="mx-auto max-w-md rounded-3xl border border-zinc-200/80 bg-white/95 p-8 shadow-sm">
        {loading ? (
          <p className="text-center text-sm text-zinc-500">
            Carregando convite...
          </p>
        ) : error || !data ? (
          <>
            <p className="text-center text-sm text-zinc-600">
              Este convite não foi encontrado ou expirou. Peça um novo código ao
              consultor.
            </p>
            <Link
              to="/login"
              className="mt-6 block text-center text-sm font-medium text-[#FF0636]"
            >
              Área da equipe — login
            </Link>
          </>
        ) : (
          <>
            <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
              <CheckCircle2 size={32} />
            </div>
            <h1 className="text-center text-xl font-semibold tracking-tight text-zinc-900">
              Olá, {data.lead_first_name}
            </h1>
            <p className="mt-3 text-center text-sm leading-relaxed text-zinc-600">
              Seu convite para a{" "}
              <span className="font-medium text-zinc-800">
                {data.company_name}
              </span>
              {data.event_name ? (
                <>
                  {" "}
                  — evento{" "}
                  <span className="font-medium text-zinc-800">
                    {data.event_name}
                  </span>
                </>
              ) : null}{" "}
              está válido.
            </p>
            <p className="mt-6 rounded-2xl border border-dashed border-amber-200/80 bg-amber-50/60 px-4 py-3 text-center text-xs leading-relaxed text-amber-950/80">
              Na recepção, mostre esta tela ou o QR do seu consultor para
              concluir o check-in na loja.
            </p>
            <Link
              to="/login"
              className="mt-8 block text-center text-xs text-zinc-400 hover:text-zinc-600"
            >
              Acesso recepção / equipe
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
