import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import {
  Mail,
  Lock,
  Eye,
  EyeOff,
  AlertTriangle,
  Loader2,
  ShieldCheck,
  ArrowLeft,
} from "lucide-react";
import { Notice } from "../../components/ui/Notice";
import type { UserRole } from "../../types";
import gpLogo from "../../assets/logo.png";
import loginPoster from "../../assets/login-poster.jpg";
import {
  loginWithPassword,
  verifyTwoFactorCode,
  type AuthSession,
} from "../../services/auth";
import { isNativePlatform } from "../../utils/platform";

interface LoginPageProps {
  onLogin: (session: AuthSession, rememberMe: boolean) => void;
}

const roleRoutes: Record<UserRole, string> = {
  gestor: "/gestor/dashboard",
  cliente: "/cliente/dashboard",
  vendedor: "/vendedor/dashboard",
  recepcao: "/recepcao/checkin",
};

export function LoginPage({ onLogin }: LoginPageProps) {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loginError, setLoginError] = useState("");
  const [isCapsLockOn, setIsCapsLockOn] = useState(false);

  // Estados do fluxo de 2FA obrigatório
  const [step2fa, setStep2fa] = useState(false);
  const [tempToken2fa, setTempToken2fa] = useState("");
  const [code2fa, setCode2fa] = useState("");

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoginError("");
    setIsSubmitting(true);

    try {
      /** WebView nativa nao tem "fechar o navegador": lembrar-me sempre vale ali. */
      const effectiveRemember = isNativePlatform() ? true : rememberMe;
      const result = await loginWithPassword(
        email,
        password,
        effectiveRemember,
      );

      if (result.requires2fa) {
        setStep2fa(true);
        setTempToken2fa(result.tempToken);
        setIsSubmitting(false);
        return;
      }

      if ("session" in result && result.session) {
        const session = result.session as AuthSession;
        onLogin(session, effectiveRemember);
        navigate(roleRoutes[session.user.role]);
      }
    } catch (error) {
      setLoginError(
        error instanceof Error ? error.message : "Não foi possível entrar",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleVerify2fa = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!code2fa || code2fa.length < 6) {
      setLoginError("Digite o código completo de 6 dígitos.");
      return;
    }
    setLoginError("");
    setIsSubmitting(true);

    try {
      const effectiveRemember = isNativePlatform() ? true : rememberMe;
      const session = await verifyTwoFactorCode(tempToken2fa, code2fa);
      onLogin(session, effectiveRemember);
      navigate(roleRoutes[session.user.role]);
    } catch (error) {
      setLoginError(
        error instanceof Error
          ? error.message
          : "Código de verificação incorreto ou expirado.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex">
      {/* ── Esquerda: Formulário ── */}
      <div className="w-full lg:w-1/2 flex flex-col justify-center bg-white px-8 py-10 lg:px-14 min-h-screen lg:min-h-0">
        <div className="flex flex-col max-w-sm mx-auto w-full">
          {/* Logo */}
          <div className="mb-8">
            <div className="mb-6 flex items-center justify-between">
              <img src={gpLogo} alt="GP de Vendas" className="h-14 w-auto" />
              {step2fa && (
                <button
                  type="button"
                  onClick={() => {
                    setStep2fa(false);
                    setCode2fa("");
                    setLoginError("");
                  }}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-500 hover:text-gray-900 transition-colors"
                >
                  <ArrowLeft size={14} />
                  <span>Voltar</span>
                </button>
              )}
            </div>

            {step2fa ? (
              <div>
                <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-rose-50 px-3 py-1 text-xs font-bold text-[#FF0636] border border-rose-100">
                  <ShieldCheck size={14} />
                  <span>Autenticação de 2 Fatores</span>
                </div>
                <h1 className="text-2xl font-bold text-gray-900 mb-1">
                  Digite o código enviado
                </h1>
                <p className="text-sm text-gray-500">
                  Enviamos um código de 6 dígitos para o e-mail{" "}
                  <strong>{email}</strong>.
                </p>
              </div>
            ) : (
              <div>
                <h1 className="text-2xl font-bold text-gray-900 mb-1">
                  Bem-vindo de volta!
                </h1>
                <p className="text-sm text-gray-500">
                  Digite seu e-mail e senha para continuar.
                </p>
              </div>
            )}
          </div>

          {/* Formulário de 2FA */}
          {step2fa ? (
            <form onSubmit={handleVerify2fa} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1.5 uppercase tracking-wider">
                  Código de Verificação (6 dígitos)
                </label>
                <div className="relative">
                  <input
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    pattern="[0-9]{6}"
                    maxLength={6}
                    autoFocus
                    placeholder="0 0 0 0 0 0"
                    value={code2fa}
                    onChange={(e) => {
                      const val = e.target.value.replace(/\D/g, "");
                      setCode2fa(val);
                    }}
                    className="w-full text-center text-2xl font-black tracking-[12px] py-3.5 rounded-xl border border-gray-200 text-gray-900 placeholder:text-gray-300 focus:outline-none focus:ring-2 focus:ring-[#FF0636] focus:border-transparent transition font-mono"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isSubmitting || code2fa.length < 6}
                className="w-full text-white py-3 rounded-xl text-sm font-semibold transition-all flex items-center justify-center gap-2 disabled:opacity-75 disabled:cursor-not-allowed shadow-sm"
                style={{ backgroundColor: "#FF0636" }}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    <span>Verificando...</span>
                  </>
                ) : (
                  "Confirmar Código"
                )}
              </button>

              {loginError && (
                <Notice tone="error" className="text-xs">
                  {loginError}
                </Notice>
              )}
            </form>
          ) : (
            /* Formulário Principal de Login */
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* E-mail */}
              <div className="relative">
                <Mail
                  size={15}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
                />
                <input
                  type="email"
                  name="email"
                  autoComplete="username"
                  placeholder="Digite seu endereço de e-mail"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-9 pr-4 py-3 rounded-xl border border-gray-200 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#FF0636] focus:border-transparent transition"
                />
              </div>

              {/* Senha */}
              <div>
                <div className="relative">
                  <Lock
                    size={15}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
                  />
                  <input
                    type={showPassword ? "text" : "password"}
                    name="password"
                    autoComplete="current-password"
                    placeholder="Digite sua senha"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onKeyDown={(e) =>
                      setIsCapsLockOn(e.getModifierState("CapsLock"))
                    }
                    onKeyUp={(e) =>
                      setIsCapsLockOn(e.getModifierState("CapsLock"))
                    }
                    className="w-full pl-9 pr-10 py-3 rounded-xl border border-gray-200 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#FF0636] focus:border-transparent transition"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={
                      showPassword ? "Ocultar senha" : "Mostrar senha"
                    }
                    className="absolute right-1 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700"
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
                {isCapsLockOn && (
                  <div className="mt-1.5 flex items-center gap-1.5 text-xs font-semibold text-amber-600">
                    <AlertTriangle size={13} />
                    <span>Atenção: Fixa (Caps Lock) ativada</span>
                  </div>
                )}
              </div>

              {/* Lembrar-me + Esqueceu a senha */}
              <div className="flex items-center justify-between pt-1">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="w-4 h-4 rounded border-gray-300 cursor-pointer accent-[#FF0636]"
                  />
                  <span className="text-sm text-gray-600">Lembrar-me</span>
                </label>
                <button
                  type="button"
                  onClick={() => navigate("/esqueci-senha")}
                  className="text-sm font-semibold text-[#C9002B] hover:underline"
                >
                  Esqueceu a senha?
                </button>
              </div>

              {/* Entrar */}
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full text-white py-3 rounded-xl text-sm font-semibold transition-all flex items-center justify-center gap-2 disabled:opacity-75 disabled:cursor-not-allowed shadow-sm"
                style={{ backgroundColor: "#C9002B" }}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    <span>Entrando...</span>
                  </>
                ) : (
                  "Entrar"
                )}
              </button>
              {loginError && (
                <Notice tone="error" className="text-xs">
                  {loginError}
                </Notice>
              )}
            </form>
          )}
        </div>
      </div>

      {/* ── Direita: arte institucional (copy ja faz parte da imagem) ── */}
      <div className="hidden h-screen w-1/2 items-center justify-center bg-white p-6 lg:flex">
        <img
          src={loginPoster}
          alt="Grand Prix de Vendas — a plataforma de alta performance para concessionárias"
          width={1122}
          height={1402}
          decoding="async"
          className="max-h-full max-w-full rounded-3xl object-contain"
        />
      </div>
    </div>
  );
}
