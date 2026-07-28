import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Eye, EyeOff, Lock, Mail, ArrowLeft } from "lucide-react";
import gpLogo from "../../assets/logo.png";
import {
  readStoredSession,
  requestPasswordReset,
  resetPassword,
} from "../../services/auth";
import type { UserRole } from "../../types";
import { Button } from "../../components/ui/Button";
import {
  isLocallyReasonablePassword,
  PASSWORD_REQUIREMENTS_HINT,
} from "../../lib/passwordPolicy";

const roleRoutes: Record<UserRole, string> = {
  gestor: "/gestor/dashboard",
  cliente: "/cliente/dashboard",
  vendedor: "/vendedor/dashboard",
  recepcao: "/recepcao/checkin",
};

type Step = "request" | "reset" | "done";

export function ForgotPasswordPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>("request");
  const [email, setEmail] = useState("");
  const [resetToken, setResetToken] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  useEffect(() => {
    const stored = readStoredSession();
    if (stored?.user) {
      navigate(roleRoutes[stored.user.role], { replace: true });
    }
  }, [navigate]);

  const currentSubtitle = useMemo(() => {
    if (step === "reset") {
      return "Agora defina uma nova senha para continuar.";
    }
    if (step === "done") {
      return "Sua senha foi atualizada com sucesso.";
    }
    return "Digite seu e-mail para iniciar a redefinição.";
  }, [step]);

  async function handleRequestReset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSuccessMessage("");

    if (!email.trim()) {
      setError("Informe o e-mail da conta.");
      return;
    }

    setLoading(true);
    try {
      const response = await requestPasswordReset(email.trim());
      if (!response.reset_token) {
        setSuccessMessage(
          response.message ||
            "Se este e-mail existir, enviaremos as instrucoes de recuperacao em alguns minutos.",
        );
        return;
      }
      setResetToken(response.reset_token);
      setStep("reset");
      setSuccessMessage("Conta localizada. Agora crie uma nova senha.");
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Não foi possível iniciar a recuperação.",
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleResetPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSuccessMessage("");

    if (!newPassword) {
      setError("Informe a nova senha.");
      return;
    }

    if (!isLocallyReasonablePassword(newPassword)) {
      setError(PASSWORD_REQUIREMENTS_HINT);
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("A confirmação da nova senha não confere.");
      return;
    }

    if (!resetToken) {
      setError("O token de recuperação não está disponível. Comece novamente.");
      setStep("request");
      return;
    }

    setLoading(true);
    try {
      await resetPassword(resetToken, newPassword);
      setStep("done");
      setSuccessMessage(
        "Senha redefinida com sucesso. Você já pode entrar novamente.",
      );
      setTimeout(() => navigate("/login", { replace: true }), 1400);
    } catch (resetError) {
      setError(
        resetError instanceof Error
          ? resetError.message
          : "Não foi possível redefinir a senha.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-zinc-50 px-6 py-10">
      <div className="mx-auto flex min-h-[calc(100vh-5rem)] w-full max-w-xl items-center">
        <div className="w-full rounded-[28px] border border-zinc-200 bg-white p-8 shadow-[0_24px_60px_rgba(15,23,42,0.08)]">
          <div className="mb-8">
            <img src={gpLogo} alt="GP de Vendas" className="h-12 w-auto" />
            <h1 className="mt-6 text-2xl font-black tracking-tight text-zinc-950">
              Esqueci a senha
            </h1>
            <p className="mt-2 text-sm text-zinc-500">{currentSubtitle}</p>
          </div>

          {successMessage ? (
            <div className="mb-5 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">
              {successMessage}
            </div>
          ) : null}

          {error ? (
            <div className="mb-5 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
              {error}
            </div>
          ) : null}

          {step === "request" ? (
            <form onSubmit={handleRequestReset} className="space-y-4">
              <div className="relative">
                <Mail
                  size={15}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400"
                />
                <input
                  type="email"
                  placeholder="Digite seu e-mail"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="w-full rounded-xl border border-zinc-200 py-3 pl-9 pr-4 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-[#FF0636] focus:outline-none focus:ring-2 focus:ring-[#FF0636]/20"
                />
              </div>

              <Button
                type="submit"
                loading={loading}
                className="w-full rounded-xl py-3 text-white"
                style={{ backgroundColor: "#C9002B" }}
                onMouseOver={(event) =>
                  (event.currentTarget.style.backgroundColor = "#d90030")
                }
                onMouseOut={(event) =>
                  (event.currentTarget.style.backgroundColor = "#C9002B")
                }
              >
                Continuar
              </Button>
            </form>
          ) : step === "reset" ? (
            <form onSubmit={handleResetPassword} className="space-y-4">
              <div className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-600">
                E-mail:{" "}
                <span className="font-semibold text-zinc-900">{email}</span>
              </div>

              <div className="relative">
                <Lock
                  size={15}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400"
                />
                <input
                  type={showPassword ? "text" : "password"}
                  placeholder="Nova senha"
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  className="w-full rounded-xl border border-zinc-200 py-3 pl-9 pr-11 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-[#FF0636] focus:outline-none focus:ring-2 focus:ring-[#FF0636]/20"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((current) => !current)}
                  aria-label={
                    showPassword ? "Ocultar nova senha" : "Mostrar nova senha"
                  }
                  className="absolute right-1 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>

              <div className="relative">
                <Lock
                  size={15}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400"
                />
                <input
                  type={showPassword ? "text" : "password"}
                  placeholder="Confirmar nova senha"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  className="w-full rounded-xl border border-zinc-200 py-3 pl-9 pr-4 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-[#FF0636] focus:outline-none focus:ring-2 focus:ring-[#FF0636]/20"
                />
              </div>

              <div className="flex gap-3 pt-1">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    setStep("request");
                    setError("");
                    setSuccessMessage("");
                  }}
                  icon={<ArrowLeft size={16} />}
                  className="flex-1 rounded-xl py-3"
                >
                  Voltar
                </Button>
                <Button
                  type="submit"
                  loading={loading}
                  className="flex-1 rounded-xl py-3 text-white"
                  style={{ backgroundColor: "#C9002B" }}
                  onMouseOver={(event) =>
                    (event.currentTarget.style.backgroundColor = "#d90030")
                  }
                  onMouseOut={(event) =>
                    (event.currentTarget.style.backgroundColor = "#C9002B")
                  }
                >
                  Redefinir senha
                </Button>
              </div>
            </form>
          ) : (
            <div className="space-y-4">
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                Agora você pode entrar novamente com a nova senha.
              </div>
              <Button
                type="button"
                onClick={() => navigate("/login", { replace: true })}
                className="w-full rounded-xl py-3 text-white"
                style={{ backgroundColor: "#C9002B" }}
                onMouseOver={(event) =>
                  (event.currentTarget.style.backgroundColor = "#d90030")
                }
                onMouseOut={(event) =>
                  (event.currentTarget.style.backgroundColor = "#C9002B")
                }
              >
                Ir para o login
              </Button>
            </div>
          )}

          <div className="mt-6 flex items-center justify-between">
            <button
              type="button"
              onClick={() => navigate("/login")}
              className="text-sm font-semibold text-[#C9002B] hover:underline"
            >
              Voltar ao login
            </button>
            <span className="text-xs text-zinc-400">
              Recuperação temporária no próprio fluxo da conta.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
