import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { Star, CheckCircle2 } from "lucide-react";
import clsx from "clsx";
import {
  fetchRatingTarget,
  submitServiceRating,
  type RatingTarget,
} from "../../services/serviceRatings";
import { API_BASE } from "../../services/http";

export function AvaliacaoPage() {
  const { token = "" } = useParams();
  const [data, setData] = useState<RatingTarget | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [score, setScore] = useState(0);
  const [hoverScore, setHoverScore] = useState(0);
  const [eventScore, setEventScore] = useState(0);
  const [npsScore, setNpsScore] = useState<number | null>(null);
  const [comment, setComment] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [sent, setSent] = useState(false);

  useEffect(() => {
    if (!token || !API_BASE) {
      setLoading(false);
      setError(true);
      return;
    }
    let active = true;
    void fetchRatingTarget(token)
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
  }, [token]);

  const handleSubmit = async () => {
    if (score < 1) {
      setSubmitError("Escolha uma nota de 1 a 5 estrelas.");
      return;
    }
    setSubmitting(true);
    setSubmitError("");
    try {
      await submitServiceRating(token, {
        score,
        event_score: eventScore || undefined,
        nps_score: npsScore ?? undefined,
        comment: comment.trim() || undefined,
        customer_name: customerName.trim() || undefined,
      });
      setSent(true);
    } catch (err) {
      setSubmitError(
        err instanceof Error ? err.message : "Falha ao enviar avaliação",
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (!token) {
    return (
      <div className="min-h-screen bg-[#faf9f7] px-4 py-16 text-center text-zinc-600">
        <p className="text-sm">Link de avaliação incompleto.</p>
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
          <p className="text-center text-sm text-zinc-500">Carregando...</p>
        ) : error || !data ? (
          <>
            <p className="text-center text-sm text-zinc-600">
              Este link de avaliação não foi encontrado ou está inativo.
            </p>
            <Link
              to="/login"
              className="mt-6 block text-center text-sm font-medium text-[#FF0636]"
            >
              Área da equipe — login
            </Link>
          </>
        ) : sent ? (
          <>
            <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
              <CheckCircle2 size={32} />
            </div>
            <h1 className="text-center text-xl font-semibold tracking-tight text-zinc-900">
              Obrigado pela avaliação!
            </h1>
            <p className="mt-3 text-center text-sm leading-relaxed text-zinc-600">
              Seu feedback foi enviado com sucesso.
            </p>
          </>
        ) : (
          <>
            <h1 className="text-center text-xl font-semibold tracking-tight text-zinc-900">
              Como foi seu atendimento?
            </h1>
            <p className="mt-2 text-center text-sm leading-relaxed text-zinc-600">
              Avalie o atendimento de{" "}
              <span className="font-medium text-zinc-800">
                {data.vendor_name}
              </span>
              {data.company_name ? (
                <>
                  {" "}
                  na{" "}
                  <span className="font-medium text-zinc-800">
                    {data.company_name}
                  </span>
                </>
              ) : null}
              .
            </p>

            <div className="mt-6 flex items-center justify-center gap-2">
              {[1, 2, 3, 4, 5].map((value) => {
                const filled = value <= (hoverScore || score);
                return (
                  <button
                    key={value}
                    type="button"
                    aria-label={`${value} estrela${value > 1 ? "s" : ""}`}
                    onClick={() => setScore(value)}
                    onMouseEnter={() => setHoverScore(value)}
                    onMouseLeave={() => setHoverScore(0)}
                    className="transition-transform active:scale-90"
                  >
                    <Star
                      size={36}
                      className={clsx(
                        filled
                          ? "fill-amber-400 text-amber-400"
                          : "text-zinc-300",
                      )}
                    />
                  </button>
                );
              })}
            </div>

            <div className="mt-7 border-t border-zinc-100 pt-6">
              <p className="text-center text-sm font-medium text-zinc-800">
                E como foi sua experiência geral no evento?
              </p>
              <div className="mt-3 flex items-center justify-center gap-2">
                {[1, 2, 3, 4, 5].map((value) => (
                  <button
                    key={value}
                    type="button"
                    aria-label={`Nota ${value} para o evento`}
                    onClick={() => setEventScore(value)}
                    className={clsx(
                      "h-9 w-9 rounded-xl border text-sm font-semibold transition-colors",
                      eventScore === value
                        ? "border-[#FF0636] bg-[#FF0636] text-white"
                        : "border-zinc-200 text-zinc-600 hover:border-zinc-300",
                    )}
                  >
                    {value}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-6">
              <p className="text-center text-sm font-medium text-zinc-800">
                De 0 a 10, quanto você indicaria este evento?
              </p>
              <div className="mt-3 grid grid-cols-11 gap-1">
                {Array.from({ length: 11 }, (_, value) => (
                  <button
                    key={value}
                    type="button"
                    aria-label={`NPS ${value}`}
                    onClick={() => setNpsScore(value)}
                    className={clsx(
                      "h-8 rounded-lg border text-xs font-semibold transition-colors",
                      npsScore === value
                        ? "border-[#FF0636] bg-[#FF0636] text-white"
                        : "border-zinc-200 text-zinc-600 hover:border-zinc-300",
                    )}
                  >
                    {value}
                  </button>
                ))}
              </div>
              <div className="mt-1 flex justify-between text-[10px] text-zinc-400">
                <span>Não indicaria</span>
                <span>Indicaria muito</span>
              </div>
            </div>

            <input
              type="text"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder="Seu nome (opcional)"
              maxLength={255}
              className="mt-5 w-full rounded-2xl border border-zinc-200 px-4 py-3 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-[#FF0636]"
            />

            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Deixe um comentário (opcional)"
              rows={3}
              maxLength={1000}
              className="mt-3 w-full resize-none rounded-2xl border border-zinc-200 px-4 py-3 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-[#FF0636]"
            />

            {submitError && (
              <p className="mt-3 text-center text-xs font-medium text-red-500">
                {submitError}
              </p>
            )}

            <button
              type="button"
              disabled={submitting}
              onClick={() => void handleSubmit()}
              className="mt-5 w-full rounded-xl py-3 text-sm font-semibold text-white transition-colors disabled:opacity-60"
              style={{ backgroundColor: "#FF0636" }}
            >
              {submitting ? "Enviando..." : "Enviar avaliação"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
