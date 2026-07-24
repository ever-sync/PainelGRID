import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Mail, Lock, Eye, EyeOff } from "lucide-react";
import clsx from "clsx";
import { Notice } from "../../components/ui/Notice";
import type { UserRole } from "../../types";
import gpLogo from "../../assets/logo.png";
import loginCharacter from "../../assets/login-character.png";
import { loginWithPassword, type AuthSession } from "../../services/auth";
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
      const session = await loginWithPassword(
        email,
        password,
        effectiveRemember,
      );
      onLogin(session, effectiveRemember);
      navigate(roleRoutes[session.user.role]);
    } catch (error) {
      setLoginError(
        error instanceof Error ? error.message : "Não foi possível entrar",
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
            <div className="mb-6">
              <img src={gpLogo} alt="GP de Vendas" className="h-14 w-auto" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900 mb-1">
              Bem-vindo de volta!
            </h1>
            <p className="text-sm text-gray-500">
              Digite seu e-mail e senha para continuar.
            </p>
          </div>

          {/* Formulário */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* E-mail */}
            <div className="relative">
              <Mail
                size={15}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
              />
              <input
                type="email"
                placeholder="Digite seu endereço de e-mail"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full pl-9 pr-4 py-3 rounded-xl border border-gray-200 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#FF0636] focus:border-transparent transition"
              />
            </div>

            {/* Senha */}
            <div className="relative">
              <Lock
                size={15}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
              />
              <input
                type={showPassword ? "text" : "password"}
                placeholder="Digite sua senha"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
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
              className="w-full text-white py-3 rounded-xl text-sm font-semibold transition-colors"
              style={{ backgroundColor: "#FF0636" }}
              onMouseOver={(e) =>
                (e.currentTarget.style.backgroundColor = "#d90030")
              }
              onMouseOut={(e) =>
                (e.currentTarget.style.backgroundColor = "#FF0636")
              }
            >
              {isSubmitting ? "Entrando..." : "Entrar"}
            </button>
            {loginError && (
              <Notice tone="error" className="text-xs">
                {loginError}
              </Notice>
            )}
          </form>
        </div>
      </div>

      {/* ── Direita: Personagem + Copy ── */}
      <div className="relative hidden min-h-screen w-1/2 overflow-hidden bg-[#060816] lg:flex lg:flex-col lg:items-center lg:justify-end">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(255,6,54,0.14),_transparent_35%),radial-gradient(circle_at_70%_30%,_rgba(61,86,162,0.18),_transparent_30%)]" />
        <div className="relative flex w-full flex-1 items-end justify-center px-10 pt-12">
          <img
            src={loginCharacter}
            alt="Personagem GP de Vendas"
            className="pointer-events-none relative z-10 w-[min(100%,370px)] max-w-none -translate-y-4 drop-shadow-[0_30px_60px_rgba(0,0,0,0.5)] xl:w-[400px] xl:-translate-y-6"
          />
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
