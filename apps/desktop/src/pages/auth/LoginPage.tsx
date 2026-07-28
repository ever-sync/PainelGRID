import { useEffect, useState, type FormEvent } from "react";
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
import clsx from "clsx";
import { Notice } from "../../components/ui/Notice";
import type { UserRole } from "../../types";
import gpLogo from "../../assets/logo.png";
import loginCharacterAvif from "../../assets/login-character.avif";
import loginCharacterWebp from "../../assets/login-character.webp";
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

const loginSlides = [
  {
    title: "Venda Mais na Loja",
    description: "Ranking, metas e premiações para impulsionar resultados.",
  },
  {
    title: "Sua Meta, Sua Venda",
    description: "Competição, performance e time motivado na loja.",
  },
  {
    title: "Mais Ranking. Mais Resultado.",
    description: "Eventos com pontuação e metas em tempo real.",
  },
] as const;

// O fallback embutido evita baixar a ilustração em telas onde o painel está oculto.
// Em desktop, <picture> escolhe AVIF ou WebP conforme o suporte do navegador.
const transparentPixel =
  "data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=";

export function LoginPage({ onLogin }: LoginPageProps) {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loginError, setLoginError] = useState("");
  const [currentSlide, setCurrentSlide] = useState(0);
  const [isSlideVisible, setIsSlideVisible] = useState(true);
  const [isCapsLockOn, setIsCapsLockOn] = useState(false);

  // Estados do fluxo de 2FA obrigatório
  const [step2fa, setStep2fa] = useState(false);
  const [tempToken2fa, setTempToken2fa] = useState("");
  const [code2fa, setCode2fa] = useState("");

  useEffect(() => {
    let timeoutId: number | undefined;
    const timer = window.setInterval(() => {
      setIsSlideVisible(false);
      timeoutId = window.setTimeout(() => {
        setCurrentSlide((value) => (value + 1) % loginSlides.length);
        setIsSlideVisible(true);
      }, 140);
    }, 4400);

    return () => {
      window.clearInterval(timer);
      if (timeoutId) window.clearTimeout(timeoutId);
    };
  }, []);

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
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
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
                  className="text-sm font-semibold text-[#FF0636] hover:underline"
                >
                  Esqueceu a senha?
                </button>
              </div>

              {/* Entrar */}
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full text-white py-3 rounded-xl text-sm font-semibold transition-all flex items-center justify-center gap-2 disabled:opacity-75 disabled:cursor-not-allowed shadow-sm"
                style={{ backgroundColor: "#FF0636" }}
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

      {/* ── Direita: Personagem + Copy ── */}
      <div className="relative hidden min-h-screen w-1/2 overflow-hidden bg-[#060816] lg:flex lg:flex-col lg:items-center lg:justify-end">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(255,6,54,0.14),_transparent_35%),radial-gradient(circle_at_70%_30%,_rgba(61,86,162,0.18),_transparent_30%)]" />
        <div className="relative flex w-full flex-1 items-end justify-center px-10 pt-12">
          <picture>
            <source
              media="(min-width: 1024px)"
              srcSet={loginCharacterAvif}
              type="image/avif"
            />
            <source
              media="(min-width: 1024px)"
              srcSet={loginCharacterWebp}
              type="image/webp"
            />
            <img
              src={transparentPixel}
              alt="Personagem GP de Vendas"
              width={800}
              height={755}
              decoding="async"
              fetchPriority="high"
              className="pointer-events-none relative z-10 w-[min(100%,370px)] max-w-none -translate-y-4 drop-shadow-[0_30px_60px_rgba(0,0,0,0.5)] xl:w-[400px] xl:-translate-y-6"
            />
          </picture>
        </div>

        <div className="relative z-10 mb-8 flex flex-col items-center px-8 text-center">
          <div
            className={clsx(
              "transition-all duration-500 ease-out",
              isSlideVisible
                ? "translate-y-0 scale-100 opacity-100"
                : "translate-y-2 scale-[0.98] opacity-0",
            )}
          >
            <h2 className="mx-auto max-w-[380px] text-balance text-[1.55rem] font-bold tracking-tight text-white xl:max-w-[420px] xl:text-[1.8rem]">
              {loginSlides[currentSlide].title}
            </h2>
            <p className="mx-auto mt-3 max-w-[360px] text-balance text-sm leading-relaxed text-zinc-400 xl:max-w-[420px] xl:text-[0.95rem]">
              {loginSlides[currentSlide].description}
            </p>
          </div>

          <div className="mt-6 flex gap-2">
            {loginSlides.map((_, index) => (
              <button
                key={index}
                type="button"
                aria-label={`Ir para o slide ${index + 1}`}
                onClick={() => setCurrentSlide(index)}
                className="h-2 w-2 rounded-full transition-all"
                style={{
                  backgroundColor:
                    index === currentSlide ? "#FF0636" : "#4b5563",
                  transform: index === currentSlide ? "scale(1.2)" : "scale(1)",
                }}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
