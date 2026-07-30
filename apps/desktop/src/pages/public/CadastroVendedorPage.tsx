import { useEffect, useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { CheckCircle2, Loader2 } from "lucide-react";
import clsx from "clsx";
import {
  fetchVendorSignupTarget,
  submitVendorSignup,
  type VendorSignupTarget,
} from "../../services/publicVendorSignup";
import {
  VENDOR_CATEGORY_OPTIONS,
  formatPhoneBr,
} from "../../lib/vendorCategories";
import type { VendorCategory } from "../../types";
import { API_BASE } from "../../services/http";

export function CadastroVendedorPage() {
  const { token = "" } = useParams();
  const [target, setTarget] = useState<VendorSignupTarget | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [categories, setCategories] = useState<VendorCategory[]>(["novo"]);
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
    void fetchVendorSignupTarget(token)
      .then((row) => {
        if (active) setTarget(row);
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

  function toggleCategory(value: VendorCategory) {
    setCategories((current) =>
      current.includes(value)
        ? current.filter((item) => item !== value)
        : [...current, value],
    );
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitError("");

    if (!name.trim()) {
      setSubmitError("Informe seu nome completo.");
      return;
    }
    if (!email.trim()) {
      setSubmitError("Informe seu e-mail.");
      return;
    }
    if (phone.replace(/\D/g, "").length < 10) {
      setSubmitError("Informe um WhatsApp válido com DDD.");
      return;
    }
    if (categories.length === 0) {
      setSubmitError("Selecione ao menos uma categoria.");
      return;
    }

    setSubmitting(true);
    try {
      await submitVendorSignup(token, {
        name: name.trim(),
        email: email.trim(),
        phone: phone.replace(/\D/g, ""),
        vendor_categories: categories,
      });
      setSent(true);
    } catch (err) {
      setSubmitError(
        err instanceof Error ? err.message : "Não foi possível enviar.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (!token) {
    return (
      <div className="min-h-screen bg-[#faf9f7] px-4 py-16 text-center text-zinc-600">
        <p className="text-sm">Link de cadastro incompleto.</p>
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
        ) : error || !target ? (
          <>
            <p className="text-center text-sm text-zinc-600">
              Este link de cadastro não foi encontrado ou não está mais válido.
              Peça um link novo à empresa.
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
              Cadastro enviado!
            </h1>
            <p className="mt-3 text-center text-sm leading-relaxed text-zinc-600">
              Assim que a <strong>{target.company_name}</strong> aprovar, você
              recebe um e-mail em <strong>{email.trim()}</strong> para criar sua
              senha e entrar.
            </p>
            <p className="mt-4 text-center text-xs leading-relaxed text-zinc-500">
              Não recebeu em alguns dias? Confira se o e-mail está correto e
              fale com o responsável da equipe.
            </p>
          </>
        ) : (
          <>
            {target.logo_url ? (
              <img
                src={target.logo_url}
                alt={target.company_name}
                className="mx-auto mb-4 h-12 w-auto object-contain"
              />
            ) : null}
            <h1 className="text-center text-xl font-semibold tracking-tight text-zinc-900">
              Cadastro de vendedor
            </h1>
            <p className="mt-2 text-center text-sm leading-relaxed text-zinc-600">
              Você está se cadastrando na equipe da{" "}
              <strong>{target.company_name}</strong>. Depois da aprovação, você
              recebe um e-mail para criar sua senha.
            </p>

            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-zinc-700">
                  Nome completo
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="João da Silva"
                  className="w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-sm text-zinc-900 outline-none placeholder:text-zinc-400 focus:border-transparent focus:ring-2 focus:ring-[#FF0636]"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold text-zinc-700">
                  E-mail
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="joao@email.com"
                  className="w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-sm text-zinc-900 outline-none placeholder:text-zinc-400 focus:border-transparent focus:ring-2 focus:ring-[#FF0636]"
                />
                <p className="mt-1 text-xs text-zinc-500">
                  É neste e-mail que você recebe o link para criar a senha.
                </p>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold text-zinc-700">
                  WhatsApp
                </label>
                <input
                  type="tel"
                  inputMode="numeric"
                  value={phone}
                  onChange={(e) => setPhone(formatPhoneBr(e.target.value))}
                  placeholder="(11) 99999-9999"
                  className="w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-sm text-zinc-900 outline-none placeholder:text-zinc-400 focus:border-transparent focus:ring-2 focus:ring-[#FF0636]"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold text-zinc-700">
                  O que você vende
                </label>
                <div className="flex flex-wrap gap-2">
                  {VENDOR_CATEGORY_OPTIONS.map((option) => {
                    const active = categories.includes(option.value);
                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => toggleCategory(option.value)}
                        className={clsx(
                          "rounded-xl border px-3 py-2 text-xs font-semibold transition-colors",
                          active
                            ? "border-[#FF0636] bg-rose-50 text-[#C9002B]"
                            : "border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300",
                        )}
                      >
                        {option.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {submitError ? (
                <p className="rounded-xl bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">
                  {submitError}
                </p>
              ) : null}

              <button
                type="submit"
                disabled={submitting}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#C9002B] py-3 text-sm font-semibold text-white transition-all disabled:cursor-not-allowed disabled:opacity-75"
              >
                {submitting ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    <span>Enviando...</span>
                  </>
                ) : (
                  "Enviar cadastro"
                )}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
