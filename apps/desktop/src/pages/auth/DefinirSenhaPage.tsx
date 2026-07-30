import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { CheckCircle2, Eye, EyeOff, Loader2, Lock } from "lucide-react";
import gpLogo from "../../assets/logo.png";
import { Notice } from "../../components/ui/Notice";
import { fetchPasswordSetupPreview, setupPassword } from "../../services/auth";
import {
  PASSWORD_REQUIREMENTS_HINT,
  isLocallyReasonablePassword,
} from "../../lib/passwordPolicy";

export function DefinirSenhaPage() {
  const { token = "" } = useParams();
  const navigate = useNavigate();

  const [firstName, setFirstName] = useState("");
  const [loading, setLoading] = useState(true);
  const [invalid, setInvalid] = useState(false);

  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!token) {
      setLoading(false);
      setInvalid(true);
      return;
    }
    let active = true;
    void fetchPasswordSetupPreview(token)
      .then((row) => {
        if (active) setFirstName(row.first_name);
      })
      .catch(() => {
        if (active) setInvalid(true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [token]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (!isLocallyReasonablePassword(password)) {
      setError(PASSWORD_REQUIREMENTS_HINT);
      return;
    }
    if (password !== confirmation) {
      setError("As senhas não conferem.");
      return;
    }

    setSubmitting(true);
    try {
      await setupPassword(token, password);
      setDone(true);
      window.setTimeout(() => navigate("/login", { replace: true }), 2000);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Não foi possível criar a senha. O link pode ter expirado.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[linear-gradient(165deg,#fff7f0_0%,#faf9f7_45%,#f4f4f5_100%)] px-4 py-12">
      <div className="w-full max-w-sm rounded-3xl border border-zinc-200/80 bg-white/95 p-8 shadow-sm">
        <img src={gpLogo} alt="GP de Vendas" className="mb-6 h-12 w-auto" />

        {loading ? (
          <p className="text-center text-sm text-zinc-500">Carregando...</p>
        ) : invalid ? (
          <>
            <h1 className="text-xl font-bold text-gray-900">
              Link expirado ou já utilizado
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-gray-600">
              Este link de criação de senha não é mais válido. Ele vale por 7
              dias e só pode ser usado uma vez. Peça um novo à empresa.
            </p>
            <Link
              to="/login"
              className="mt-6 block text-center text-sm font-semibold text-[#FF0636]"
            >
              Ir para o login
            </Link>
          </>
        ) : done ? (
          <>
            <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
              <CheckCircle2 size={32} />
            </div>
            <h1 className="text-center text-xl font-bold text-gray-900">
              Senha criada!
            </h1>
            <p className="mt-3 text-center text-sm leading-relaxed text-gray-600">
              Redirecionando para o login...
            </p>
          </>
        ) : (
          <>
            <h1 className="text-xl font-bold text-gray-900">
              Seu cadastro foi ativado, {firstName}!
            </h1>
            <p className="mt-1 text-sm text-gray-500">
              Seja bem-vindo ao PainelGRID. Crie sua senha para entrar.
            </p>

            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
              <div className="relative">
                <Lock
                  size={15}
                  className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-gray-400"
                />
                <input
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  placeholder="Nova senha"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-xl border border-gray-200 py-3 pr-10 pl-9 text-sm text-gray-900 transition outline-none placeholder:text-gray-400 focus:border-transparent focus:ring-2 focus:ring-[#FF0636]"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                  className="absolute top-1/2 right-1 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-gray-100"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>

              <div className="relative">
                <Lock
                  size={15}
                  className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-gray-400"
                />
                <input
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  placeholder="Confirme a senha"
                  value={confirmation}
                  onChange={(e) => setConfirmation(e.target.value)}
                  className="w-full rounded-xl border border-gray-200 py-3 pr-4 pl-9 text-sm text-gray-900 transition outline-none placeholder:text-gray-400 focus:border-transparent focus:ring-2 focus:ring-[#FF0636]"
                />
              </div>

              <p className="text-xs leading-relaxed text-gray-500">
                {PASSWORD_REQUIREMENTS_HINT}
              </p>

              {error ? (
                <Notice tone="error" className="text-xs">
                  {error}
                </Notice>
              ) : null}

              <button
                type="submit"
                disabled={submitting}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#C9002B] py-3 text-sm font-semibold text-white transition-all disabled:cursor-not-allowed disabled:opacity-75"
              >
                {submitting ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    <span>Criando...</span>
                  </>
                ) : (
                  "Criar senha e entrar"
                )}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
