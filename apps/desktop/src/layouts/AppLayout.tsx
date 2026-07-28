import { useCallback, useEffect, useState, type ReactNode } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  Users,
  KanbanSquare,
  Calendar,
  MessageSquare,
  BarChart3,
  UserCheck,
  Megaphone,
  DollarSign,
  CarFront,
  CalendarPlus,
  ShoppingCart,
  X,
  ArrowLeft,
  Menu,
  Moon,
  Sun,
  Sparkles,
  Camera,
  QrCode,
  Settings,
  Trophy,
  Gauge,
} from "lucide-react";
import clsx from "clsx";
import type { User } from "../types";
import sidebarLogo from "../assets/sidebar-logo.png";
import {
  applyDashboardDarkEnabled,
  DASHBOARD_DARK_CHANGE_EVENT,
  readDashboardDarkEnabled,
} from "../lib/dashboard-dark-mode";
import { LazyQrScanner } from "../components/shared/LazyQrScanner";
import { checkInLeadByToken, queryFipeData } from "../services/leads";
import { readStoredSession } from "../services/auth";

interface AppLayoutProps {
  user: User;
  onLogout: () => void;
}

export type AppOutletContext = {
  user: User;
  gestorClientId: string;
  setGestorClientId: (clientId: string) => void;
};

interface NavItem {
  href: string;
  icon: ReactNode;
  label: string;
}

type MobileQuickAction = "appointment" | "sale" | "checkin" | "fipe";

const quickActionSteps: Record<MobileQuickAction, string[]> = {
  appointment: [
    "Escolha o lead que será agendado.",
    "Selecione o evento e a data/hora da visita.",
    "Confirme para somar 1 ponto em Agendou.",
  ],
  sale: [
    "Escolha o lead com agendamento ativo.",
    "Informe tipo, produto e valor da venda.",
    "Confirme para somar Compareceu + Vendeu quando não houver check-in.",
  ],
  checkin: [
    "Escolha um cliente cadastrado ou crie um novo.",
    "Selecione entre escanear o QR Code ou fazer manualmente.",
    "Finalize o check-in na recepção para liberar o status de compareceu.",
  ],
  fipe: [
    "Digite a placa do veículo.",
    "Consulte a avaliação e o valor médio de mercado pela tabela FIPE.",
  ],
};

/** Aceita token/JWT ou URL com `?v=` (ex.: página /convite). */
function normalizeCheckInPaste(raw: string): string {
  const t = raw.trim();
  if (!t) return t;

  if (/^https?:\/\//i.test(t)) {
    try {
      const u = new URL(t);
      const v = u.searchParams.get("v");
      if (v?.trim()) return v.trim();
    } catch {
      /* ignore */
    }
  }

  const q = t.match(/[?&]v=([^&]+)/);
  if (q?.[1]) {
    try {
      return decodeURIComponent(q[1].replace(/\+/g, " ")).trim();
    } catch {
      return q[1].trim();
    }
  }

  return t;
}

function getNavItems(user: User): NavItem[] {
  switch (user.role) {
    case "gestor":
      return [
        {
          href: "/gestor/dashboard",
          icon: <LayoutDashboard size={18} />,
          label: "Dashboard",
        },
        {
          href: "/gestor/chat",
          icon: <MessageSquare size={18} />,
          label: "Chat",
        },
        { href: "/gestor/crm", icon: <KanbanSquare size={18} />, label: "CRM" },
        {
          href: "/gestor/clientes",
          icon: <Users size={18} />,
          label: "Clientes",
        },
        {
          href: "/gestor/eventos",
          icon: <Calendar size={18} />,
          label: "Eventos",
        },
        {
          href: "/gestor/rubinho",
          icon: <Sparkles size={18} />,
          label: "Rubinho",
        },
        {
          href: "/gestor/relatorio",
          icon: <BarChart3 size={18} />,
          label: "Relatório",
        },
        {
          href: "/gestor/relatorio-executivo",
          icon: <Trophy size={18} />,
          label: "Rel. Executivo",
        },
        {
          href: "/gestor/performance",
          icon: <Gauge size={18} />,
          label: "Performance",
        },
      ];
    case "cliente":
      return [
        {
          href: "/cliente/dashboard",
          icon: <LayoutDashboard size={18} />,
          label: "Dashboard",
        },
        {
          href: "/cliente/eventos",
          icon: <Calendar size={18} />,
          label: "Eventos",
        },
        { href: "/cliente/leads", icon: <Users size={18} />, label: "Leads" },
        {
          href: "/cliente/vendedores",
          icon: <UserCheck size={18} />,
          label: "Equipe",
        },
        {
          href: "/cliente/campanhas",
          icon: <Megaphone size={18} />,
          label: "Campanhas",
        },
        {
          href: "/cliente/veiculos",
          icon: <CarFront size={18} />,
          label: "Veículos",
        },
      ];
    case "vendedor":
      return [
        {
          href: "/vendedor/dashboard",
          icon: <LayoutDashboard size={18} />,
          label: "Dashboard",
        },
        { href: "/vendedor/leads", icon: <Users size={18} />, label: "Leads" },
        {
          href: "/vendedor/vendas",
          icon: <DollarSign size={18} />,
          label: "Vendas",
        },
        {
          href: "/vendedor/ranking",
          icon: <Trophy size={18} />,
          label: "Ranking",
        },
      ];
    case "recepcao":
      return [
        {
          href: "/recepcao/checkin",
          icon: <UserCheck size={18} />,
          label: "Check-in",
        },
      ];
    default:
      return [];
  }
}

export function AppLayout({ user, onLogout }: AppLayoutProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const isImmersiveChatRoute =
    location.pathname.startsWith("/gestor/chat") ||
    location.pathname.startsWith("/vendedor/chat");
  const [quickActionOpen, setQuickActionOpen] = useState(false);
  const [quickAction, setQuickAction] = useState<MobileQuickAction | null>(
    null,
  );
  const [profileOpen, setProfileOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [checkinLeadMode, setCheckinLeadMode] = useState<"existing" | "new">(
    "existing",
  );
  const [checkinMethod, setCheckinMethod] = useState<"qr" | "manual">("qr");
  const [checkinToken, setCheckinToken] = useState("");
  const [checkinResult, setCheckinResult] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [checkinLoading, setCheckinLoading] = useState(false);
  const [scannerActive, setScannerActive] = useState(false);

  const handleCheckinSubmit = async (tokenValue: string) => {
    const token = readStoredSession()?.accessToken;
    if (!token) {
      setCheckinResult({
        type: "error",
        text: "Sessão expirada. Faça login novamente.",
      });
      return;
    }
    const normalized = normalizeCheckInPaste(tokenValue);
    if (!normalized) {
      setCheckinResult({
        type: "error",
        text: "Informe um código ou link de convite válido.",
      });
      return;
    }
    setCheckinLoading(true);
    setCheckinResult(null);
    try {
      const response = await checkInLeadByToken(normalized, token);
      setCheckinResult({
        type: "success",
        text: `Check-in realizado! ${response.name} confirmado.`,
      });
      setCheckinToken("");
      setScannerActive(false);
      setTimeout(() => {
        closeQuickAction();
      }, 3000);
    } catch (err: unknown) {
      setCheckinResult({
        type: "error",
        text:
          err instanceof Error
            ? err.message
            : "Falha ao realizar check-in. Código inválido.",
      });
    } finally {
      setCheckinLoading(false);
    }
  };

  const [fipePlate, setFipePlate] = useState("");
  const [fipeLoading, setFipeLoading] = useState(false);
  const [fipeResult, setFipeResult] = useState<{
    brand: string;
    model: string;
    modelYear: string;
    value: string;
  } | null>(null);
  const [fipeError, setFipeError] = useState<string | null>(null);

  const handleFipeSubmit = async (plateValue: string) => {
    const token = readStoredSession()?.accessToken;
    if (!token) {
      setFipeError("Sessão expirada. Faça login novamente.");
      return;
    }
    const cleanPlate = plateValue.replace(/[^A-Z0-9]/gi, "").toUpperCase();
    if (!cleanPlate || cleanPlate.length < 7) {
      setFipeError("Informe uma placa válida (ex: ABC1D23 ou ABC1234).");
      return;
    }
    setFipeLoading(true);
    setFipeError(null);
    setFipeResult(null);
    try {
      const data = await queryFipeData(cleanPlate, token);
      setFipeResult(data);
    } catch (err: unknown) {
      setFipeError(
        err instanceof Error ? err.message : "Falha ao consultar FIPE.",
      );
    } finally {
      setFipeLoading(false);
    }
  };

  const [gestorClientId, setGestorClientIdState] = useState("");
  const [dashboardDark, setDashboardDark] = useState(() =>
    readDashboardDarkEnabled(user.id),
  );
  const navItems = getNavItems(user);
  const settingsPath = `/${user.role}/configuracao`;
  const mobileNavItems =
    user.role === "vendedor"
      ? [navItems[0], navItems[1], null, navItems[2], navItems[3]]
      : user.role === "recepcao"
        ? [
            navItems[0],
            null,
            null,
            null,
            {
              href: settingsPath,
              icon: <Settings size={18} />,
              label: "Ajustes",
            },
          ]
        : navItems;
  const isSettingsRoute = location.pathname.startsWith(settingsPath);

  const handleLogout = () => {
    onLogout();
    navigate("/login");
  };

  const closeQuickAction = () => {
    setQuickActionOpen(false);
    setQuickAction(null);
    setCheckinLeadMode("existing");
    setCheckinMethod("qr");
    setCheckinToken("");
    setCheckinResult(null);
    setScannerActive(false);
    setFipePlate("");
    setFipeResult(null);
    setFipeError(null);
  };

  const goToQuickActionFlow = () => {
    if (quickAction === "checkin") {
      closeQuickAction();
      navigate(
        `/recepcao/checkin?cliente=${checkinLeadMode}&modo=${checkinMethod}`,
      );
      return;
    }
    if (quickAction === "sale") {
      closeQuickAction();
      navigate("/vendedor/leads?acao=sale");
      return;
    }
    const params = quickAction ? `?acao=${quickAction}` : "";
    closeQuickAction();
    navigate(`/vendedor/leads${params}`);
  };

  const runQuickAction = (action: MobileQuickAction) => {
    if (action === "appointment") {
      closeQuickAction();
      navigate("/vendedor/leads?acao=appointment");
      return;
    }
    if (action === "sale") {
      closeQuickAction();
      navigate("/vendedor/leads?acao=sale");
      return;
    }
    setQuickAction(action);
  };

  const setGestorClientId = useCallback((clientId: string) => {
    setGestorClientIdState(clientId);
  }, []);

  useEffect(() => {
    if (user.role !== "gestor") return;
    const saved = localStorage.getItem("gestor:selected-client-id") ?? "";
    if (saved) {
      setGestorClientIdState(saved);
    }
  }, [user.role]);

  useEffect(() => {
    if (user.role !== "gestor") return;
    if (!gestorClientId) {
      localStorage.removeItem("gestor:selected-client-id");
      return;
    }
    localStorage.setItem("gestor:selected-client-id", gestorClientId);
  }, [gestorClientId, user.role]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const syncDarkMode = () => {
      const darkEnabled = readDashboardDarkEnabled(user.id);
      document.body.classList.toggle("dashboard-dark-active", darkEnabled);
      setDashboardDark(darkEnabled);
    };

    syncDarkMode();
    window.addEventListener("storage", syncDarkMode);
    window.addEventListener("focus", syncDarkMode);
    window.addEventListener(DASHBOARD_DARK_CHANGE_EVENT, syncDarkMode);

    return () => {
      window.removeEventListener("storage", syncDarkMode);
      window.removeEventListener("focus", syncDarkMode);
      window.removeEventListener(DASHBOARD_DARK_CHANGE_EVENT, syncDarkMode);
    };
  }, [location.pathname, user.id]);

  const initials = user.name
    .split(" ")
    .slice(0, 2)
    .map((n) => n[0])
    .join("")
    .toUpperCase();

  const roleLabels: Record<string, string> = {
    gestor: "Gestor",
    cliente: "Cliente",
    vendedor: "Vendedor",
    recepcao: "Recepção",
  };

  return (
    <div className="app-layout-root relative min-h-screen overflow-hidden bg-[#fafafa] text-zinc-900">
      <header className="fixed inset-x-0 top-0 z-40 flex h-[calc(4rem+env(safe-area-inset-top))] items-center justify-between border-b border-[#E51838]/10 bg-[#0b0b0b] px-4 pt-[env(safe-area-inset-top)] md:hidden">
        <button
          type="button"
          aria-label="Perfil"
          onClick={() => setProfileOpen(true)}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-[#E51838] text-[11px] font-semibold text-white"
        >
          {initials}
        </button>
        <img
          src={sidebarLogo}
          alt="GP de Vendas"
          className="h-10 w-10 object-contain"
        />
        <button
          type="button"
          aria-label="Menu"
          onClick={() => setMenuOpen(true)}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white"
        >
          <Menu size={18} />
        </button>
      </header>

      <div
        className={clsx(
          "h-screen md:pl-[112px] md:pr-4 md:py-4",
          isImmersiveChatRoute
            ? "overflow-hidden p-2 md:p-0"
            : "overflow-y-auto pt-[calc(4rem+env(safe-area-inset-top))] pb-0 md:pt-0",
        )}
      >
        <main
          className={clsx(
            "min-h-full min-w-0",
            isImmersiveChatRoute ? "p-0" : "p-4 md:p-6 xl:p-8",
          )}
        >
          <Outlet context={{ user, gestorClientId, setGestorClientId }} />
          {!isImmersiveChatRoute && (
            <div
              className="h-32 w-full shrink-0 md:hidden pointer-events-none"
              aria-hidden="true"
            />
          )}
        </main>
      </div>

      <aside
        className={clsx(
          "fixed bottom-4 left-4 top-4 z-50 hidden w-20 flex-col items-center overflow-visible rounded-[28px] py-5 shadow-xl transition-all border md:flex",
          dashboardDark
            ? "border-zinc-800/80 bg-[#0f1015] text-zinc-100"
            : "border-zinc-200/80 bg-white ring-1 ring-[#dfdfdf]/50 text-zinc-900",
        )}
      >
        <div
          className={clsx(
            "mb-6 flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl transition-colors",
            dashboardDark
              ? "bg-zinc-800/80 text-white border border-zinc-700/50"
              : "bg-zinc-900 text-white",
          )}
        >
          <img
            src={sidebarLogo}
            alt="Logo"
            className="h-6 w-6 object-contain"
          />
        </div>

        <nav className="flex min-h-0 w-full flex-1 flex-col items-center gap-1.5 overflow-y-auto">
          {navItems.map((item) => {
            const isChat = item.href.endsWith("/chat");
            return (
              <NavLink
                key={item.href}
                to={item.href}
                title={item.label}
                aria-label={item.label}
                className={({ isActive }) =>
                  clsx(
                    "relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-all",
                    isActive
                      ? dashboardDark
                        ? "bg-[#FF0636] text-white shadow-md"
                        : "bg-zinc-900 text-white"
                      : dashboardDark
                        ? "text-zinc-400 hover:bg-zinc-800/80 hover:text-zinc-200"
                        : "text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700",
                  )
                }
              >
                {item.icon}
                {isChat && (
                  <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#FF0636] px-1 text-[9px] font-black text-white shadow-sm ring-2 ring-white dark:ring-[#0f1015] animate-pulse">
                    3
                  </span>
                )}
              </NavLink>
            );
          })}
        </nav>

        <div
          className={clsx(
            "mt-4 flex w-full shrink-0 flex-col items-center gap-1.5 border-t pt-4",
            dashboardDark ? "border-zinc-800" : "border-zinc-100",
          )}
        >
          <button
            type="button"
            onClick={() => {
              const next = !dashboardDark;
              applyDashboardDarkEnabled(user.id, next);
              setDashboardDark(next);
            }}
            className={clsx(
              "flex h-11 w-11 items-center justify-center rounded-full transition-colors",
              dashboardDark
                ? "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
                : "text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700",
            )}
            title="Alternar modo escuro"
            aria-label="Alternar modo escuro"
          >
            {dashboardDark ? <Sun size={18} /> : <Moon size={18} />}
          </button>

          {/* Avatar + menu de hover */}
          <div className="group relative flex h-11 w-11 items-center justify-center">
            <button
              type="button"
              className={clsx(
                "flex h-11 w-11 select-none items-center justify-center rounded-full text-xs font-bold transition-colors",
                dashboardDark
                  ? "bg-zinc-800 text-zinc-200 hover:bg-zinc-700"
                  : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200",
              )}
              aria-label="Abrir menu de perfil"
            >
              {initials}
            </button>

            <div
              className={clsx(
                "pointer-events-none absolute bottom-0 left-[calc(100%+12px)] z-[200] w-56 rounded-2xl border opacity-0 shadow-xl transition-all duration-200 group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100",
                dashboardDark
                  ? "border-zinc-800 bg-[#15161b] text-zinc-100"
                  : "border-zinc-100 bg-white text-zinc-900",
              )}
            >
              <div
                className={clsx(
                  "absolute -left-1.5 bottom-3 h-3 w-3 rotate-45 border-b border-l",
                  dashboardDark
                    ? "border-zinc-800 bg-[#15161b]"
                    : "border-zinc-100 bg-white",
                )}
              />
              <div
                className={clsx(
                  "border-b px-3 py-2.5",
                  dashboardDark ? "border-zinc-800" : "border-zinc-100",
                )}
              >
                <p
                  className={clsx(
                    "truncate text-sm font-semibold",
                    dashboardDark ? "text-zinc-100" : "text-zinc-900",
                  )}
                >
                  {user.name}
                </p>
                <p className="mt-0.5 text-[11px] text-zinc-400">
                  Perfil {roleLabels[user.role] ?? user.role}
                </p>
              </div>
              <button
                type="button"
                onClick={() => navigate(settingsPath)}
                className={clsx(
                  "flex w-full items-center px-3 py-2 text-left text-sm transition-colors",
                  dashboardDark
                    ? "text-zinc-300 hover:bg-zinc-800/80 hover:text-white"
                    : "text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900",
                )}
              >
                Configuração
              </button>
              <button
                type="button"
                onClick={handleLogout}
                className={clsx(
                  "flex w-full items-center px-3 py-2 text-left text-sm transition-colors",
                  dashboardDark
                    ? "text-zinc-300 hover:bg-zinc-800/80 hover:text-white"
                    : "text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900",
                )}
              >
                Sair
              </button>
            </div>
          </div>
        </div>
      </aside>

      <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-[#E51838]/10 bg-[#0b0b0b] px-3 pb-[max(env(safe-area-inset-bottom),0.75rem)] pt-2 shadow-[0_-18px_40px_rgba(0,0,0,0.22)] md:hidden">
        {user.role === "vendedor" ? (
          <button
            type="button"
            aria-label="Ação de venda"
            onClick={() => setQuickActionOpen(true)}
            className="absolute left-1/2 top-0 flex h-[88px] w-[88px] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-4 border-[#fafafa] bg-[#E51838] text-white shadow-[0_14px_30px_rgba(229,24,56,0.35)] transition-transform active:scale-95"
          >
            <CarFront size={42} />
          </button>
        ) : null}
        {user.role === "recepcao" ? (
          <button
            type="button"
            aria-label="Escanear QR Code"
            onClick={() => {
              setQuickAction("checkin");
              setCheckinMethod("qr");
              setScannerActive(true);
              setQuickActionOpen(true);
            }}
            className="absolute left-1/2 top-0 flex h-[88px] w-[88px] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-4 border-[#fafafa] bg-[#E51838] text-white shadow-[0_14px_30px_rgba(229,24,56,0.35)] transition-transform active:scale-95"
          >
            <QrCode size={42} />
          </button>
        ) : null}

        <div
          className={clsx(
            "grid items-end gap-1",
            user.role === "vendedor" || user.role === "recepcao"
              ? "grid-cols-5"
              : "grid-cols-4",
          )}
        >
          {mobileNavItems.map((item, index) =>
            item ? (
              <NavLink
                key={item.href}
                to={item.href}
                title={item.label}
                aria-label={item.label}
                className={({ isActive }) =>
                  clsx(
                    "flex h-14 min-w-0 flex-col items-center justify-center gap-1 rounded-2xl text-[10px] font-semibold transition-colors",
                    isActive ? "text-white" : "text-zinc-500",
                  )
                }
              >
                {item.icon}
                <span className="max-w-full truncate">{item.label}</span>
              </NavLink>
            ) : (
              <div
                key={`mobile-spacer-${index}`}
                aria-hidden="true"
                className="h-14"
              />
            ),
          )}
        </div>
      </nav>

      {quickActionOpen &&
      (user.role === "vendedor" || user.role === "recepcao") ? (
        <div className="fixed inset-0 z-[60] flex items-end bg-black/45 px-3 pb-[calc(max(env(safe-area-inset-bottom),0rem)+0.75rem)] md:hidden">
          <button
            type="button"
            aria-label="Fechar ações rápidas"
            className="absolute inset-0 cursor-default"
            onClick={closeQuickAction}
          />
          <div className="relative w-full rounded-[28px] bg-white p-4 shadow-2xl">
            <div className="mx-auto mb-3 h-1 w-12 rounded-full bg-zinc-200" />
            <div className="mb-4 flex items-center justify-between">
              <button
                type="button"
                onClick={() => {
                  if (user.role === "recepcao") {
                    closeQuickAction();
                  } else {
                    setQuickAction(null);
                  }
                }}
                className={clsx(
                  "flex h-9 w-9 items-center justify-center rounded-full text-zinc-500 transition-colors",
                  quickAction && user.role !== "recepcao"
                    ? "bg-zinc-100"
                    : "pointer-events-none opacity-0",
                )}
                aria-label="Voltar"
              >
                <ArrowLeft size={18} />
              </button>
              <div className="text-center">
                <p className="text-xs font-semibold uppercase tracking-wide text-[#E51838]">
                  Ação rápida
                </p>
                <h2 className="text-lg font-bold text-zinc-950">
                  {quickAction === "appointment"
                    ? "Criar agendamento"
                    : quickAction === "sale"
                      ? "Criar venda"
                      : quickAction === "checkin"
                        ? "Fazer check-in"
                        : quickAction === "fipe"
                          ? "Consultar Placa (FIPE)"
                          : "O que deseja fazer?"}
                </h2>
              </div>
              <button
                type="button"
                onClick={closeQuickAction}
                className="flex h-9 w-9 items-center justify-center rounded-full bg-zinc-100 text-zinc-500"
                aria-label="Fechar"
              >
                <X size={18} />
              </button>
            </div>

            {!quickAction ? (
              <div className="grid gap-3">
                <button
                  type="button"
                  onClick={() => runQuickAction("appointment")}
                  className="flex items-center gap-3 rounded-2xl border border-zinc-100 bg-zinc-50 p-4 text-left transition-colors active:bg-zinc-100"
                >
                  <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-100 text-blue-600">
                    <CalendarPlus size={22} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-bold text-zinc-950">
                      Criar agendamento
                    </span>
                    <span className="block text-xs leading-relaxed text-zinc-500">
                      Agende visita para um lead e marque o ponto de agendou.
                    </span>
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => runQuickAction("sale")}
                  className="flex items-center gap-3 rounded-2xl border border-zinc-100 bg-zinc-50 p-4 text-left transition-colors active:bg-zinc-100"
                >
                  <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-600">
                    <ShoppingCart size={22} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-bold text-zinc-950">
                      Criar venda
                    </span>
                    <span className="block text-xs leading-relaxed text-zinc-500">
                      Registre uma venda e some os pontos correspondentes.
                    </span>
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => runQuickAction("checkin")}
                  className="flex items-center gap-3 rounded-2xl border border-zinc-100 bg-zinc-50 p-4 text-left transition-colors active:bg-zinc-100"
                >
                  <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-100 text-amber-600">
                    <UserCheck size={22} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-bold text-zinc-950">
                      Fazer check-in
                    </span>
                    <span className="block text-xs leading-relaxed text-zinc-500">
                      Escolha o cliente e o modo de confirmação.
                    </span>
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => runQuickAction("fipe")}
                  className="flex items-center gap-3 rounded-2xl border border-zinc-100 bg-zinc-50 p-4 text-left transition-colors active:bg-zinc-100"
                >
                  <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-purple-100 text-purple-600">
                    <CarFront size={22} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-bold text-zinc-950">
                      Consultar Placa (FIPE)
                    </span>
                    <span className="block text-xs leading-relaxed text-zinc-500">
                      Consulte a FIPE e marca/modelo de qualquer veículo pela
                      placa.
                    </span>
                  </span>
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                {quickAction === "checkin" ? (
                  <div className="space-y-4">
                    {/* Select Mode Tabs */}
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        type="button"
                        onClick={() => {
                          setCheckinMethod("qr");
                          setCheckinResult(null);
                        }}
                        className={clsx(
                          "flex items-center justify-center gap-2 rounded-2xl border py-3 text-sm font-bold transition-colors",
                          checkinMethod === "qr"
                            ? "border-[#E51838] bg-[#E51838]/5 text-[#E51838]"
                            : "border-zinc-100 bg-zinc-50 text-zinc-600",
                        )}
                      >
                        <QrCode size={16} />
                        Escanear QR
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setCheckinMethod("manual");
                          setScannerActive(false);
                          setCheckinResult(null);
                        }}
                        className={clsx(
                          "flex items-center justify-center gap-2 rounded-2xl border py-3 text-sm font-bold transition-colors",
                          checkinMethod === "manual"
                            ? "border-[#E51838] bg-[#E51838]/5 text-[#E51838]"
                            : "border-zinc-100 bg-zinc-50 text-zinc-600",
                        )}
                      >
                        <Menu size={16} />
                        Código Manual
                      </button>
                    </div>

                    {checkinMethod === "qr" ? (
                      <div className="space-y-3">
                        {scannerActive ? (
                          <div className="rounded-2xl border border-zinc-100 bg-zinc-50 p-2 relative">
                            <LazyQrScanner
                              onScan={(val) => void handleCheckinSubmit(val)}
                              onClose={() => setScannerActive(false)}
                            />
                            <button
                              type="button"
                              onClick={() => setScannerActive(false)}
                              className="mt-2 w-full py-2 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 rounded-xl text-xs font-bold transition-colors"
                            >
                              Cancelar Câmera
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              setScannerActive(true);
                              setCheckinResult(null);
                            }}
                            className="flex w-full flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-zinc-200 bg-zinc-50/50 py-10 hover:bg-zinc-50 transition-colors active:scale-[0.99]"
                          >
                            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[#E51838]/10 text-[#E51838]">
                              <Camera size={24} />
                            </span>
                            <div className="text-center">
                              <span className="block text-sm font-bold text-zinc-950">
                                Escanear com Câmera
                              </span>
                              <span className="block text-xs text-zinc-500 mt-1">
                                Toque para abrir a câmera
                              </span>
                            </div>
                          </button>
                        )}
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <div className="flex flex-col gap-1.5">
                          <label className="text-xs font-bold text-zinc-500">
                            Código / Link do Convite
                          </label>
                          <input
                            type="text"
                            placeholder="Digite o código curto ou cole o link inteiro"
                            value={checkinToken}
                            onChange={(e) => setCheckinToken(e.target.value)}
                            disabled={checkinLoading}
                            className="w-full rounded-2xl border border-zinc-200 px-4 py-3 text-sm focus:border-[#E51838] focus:outline-none bg-white text-zinc-950"
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => void handleCheckinSubmit(checkinToken)}
                          disabled={checkinLoading || !checkinToken.trim()}
                          className="flex w-full items-center justify-center rounded-2xl bg-[#E51838] px-4 py-3 text-sm font-bold text-white shadow-[0_12px_28px_rgba(229,24,56,0.25)] hover:bg-[#c91432] disabled:opacity-50 disabled:pointer-events-none transition-colors"
                        >
                          {checkinLoading
                            ? "Verificando..."
                            : "Confirmar Check-in"}
                        </button>
                      </div>
                    )}

                    {checkinResult && (
                      <div
                        className={clsx(
                          "p-3 rounded-2xl text-xs font-semibold text-center border leading-relaxed",
                          checkinResult.type === "success"
                            ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                            : "bg-red-50 border-red-200 text-red-800",
                        )}
                      >
                        {checkinResult.text}
                      </div>
                    )}
                  </div>
                ) : quickAction === "fipe" ? (
                  <div className="space-y-4">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-bold text-zinc-500">
                        Placa do Veículo (Mercosul ou Tradicional)
                      </label>
                      <input
                        type="text"
                        placeholder="Digite a placa (ex: ABC1D23)"
                        value={fipePlate}
                        onChange={(e) => setFipePlate(e.target.value)}
                        disabled={fipeLoading}
                        className="w-full rounded-2xl border border-zinc-200 px-4 py-3 text-sm focus:border-[#E51838] focus:outline-none bg-white text-zinc-950 uppercase"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => void handleFipeSubmit(fipePlate)}
                      disabled={fipeLoading || !fipePlate.trim()}
                      className="flex w-full items-center justify-center rounded-2xl bg-[#E51838] px-4 py-3 text-sm font-bold text-white shadow-[0_12px_28px_rgba(229,24,56,0.25)] hover:bg-[#c91432] disabled:opacity-50 disabled:pointer-events-none transition-colors"
                    >
                      {fipeLoading ? "Consultando..." : "Consultar FIPE"}
                    </button>

                    {fipeError && (
                      <div className="p-3 rounded-2xl text-xs font-semibold text-center border bg-red-50 border-red-200 text-red-800">
                        {fipeError}
                      </div>
                    )}

                    {fipeResult && (
                      <div className="rounded-2xl border border-zinc-150 bg-zinc-50/50 p-4 space-y-2">
                        <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                          Resultado da Consulta
                        </h3>
                        <div className="grid grid-cols-2 gap-2 text-sm text-zinc-900 leading-relaxed">
                          <div>
                            <span className="block text-[10px] font-bold text-zinc-500 uppercase">
                              Marca
                            </span>
                            <span className="font-bold">
                              {fipeResult.brand}
                            </span>
                          </div>
                          <div>
                            <span className="block text-[10px] font-bold text-zinc-500 uppercase">
                              Ano Modelo
                            </span>
                            <span className="font-bold">
                              {fipeResult.modelYear}
                            </span>
                          </div>
                          <div className="col-span-2">
                            <span className="block text-[10px] font-bold text-zinc-500 uppercase">
                              Modelo
                            </span>
                            <span className="font-bold">
                              {fipeResult.model}
                            </span>
                          </div>
                          <div className="col-span-2 mt-1 border-t border-zinc-100 pt-2 flex items-center justify-between">
                            <span className="text-xs font-bold text-zinc-500 uppercase">
                              Valor FIPE
                            </span>
                            <span className="text-base font-extrabold text-[#E51838]">
                              {fipeResult.value}
                            </span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <>
                    <div className="space-y-3">
                      {quickActionSteps[quickAction].map((step, index) => (
                        <div
                          key={step}
                          className="flex gap-3 rounded-2xl bg-zinc-50 p-3"
                        >
                          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#E51838] text-xs font-bold text-white">
                            {index + 1}
                          </span>
                          <p className="pt-1 text-sm leading-relaxed text-zinc-600">
                            {step}
                          </p>
                        </div>
                      ))}
                    </div>

                    <button
                      type="button"
                      onClick={goToQuickActionFlow}
                      className="flex w-full items-center justify-center rounded-2xl bg-[#E51838] px-4 py-3 text-sm font-bold text-white shadow-[0_12px_28px_rgba(229,24,56,0.25)]"
                    >
                      Continuar em Meus Leads
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      ) : null}

      {profileOpen ? (
        <div className="fixed inset-0 z-[70] bg-black/45 px-4 py-6 md:hidden">
          <button
            type="button"
            aria-label="Fechar perfil"
            className="absolute inset-0"
            onClick={() => setProfileOpen(false)}
          />

          <div className="relative ml-auto flex w-full max-w-xs flex-col rounded-3xl border border-white/10 bg-[#121212] p-5 text-white shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-300">
                Perfil
              </h3>
              <button
                type="button"
                onClick={() => setProfileOpen(false)}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-zinc-300"
                aria-label="Fechar"
              >
                <X size={16} />
              </button>
            </div>

            <div className="mb-4 flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 p-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[#E51838] text-sm font-bold text-white">
                {initials}
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-white">
                  {user.name}
                </p>
                <p className="truncate text-xs text-zinc-400">{user.email}</p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                const next = !dashboardDark;
                applyDashboardDarkEnabled(user.id, next);
                setDashboardDark(next);
              }}
              className="mb-3 flex w-full items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/5 py-3 text-sm font-semibold text-zinc-200 transition-colors hover:bg-white/10"
            >
              {dashboardDark ? <Sun size={18} /> : <Moon size={18} />}
              {dashboardDark ? "Modo claro" : "Modo escuro"}
            </button>

            <div className="mb-3 space-y-2 rounded-2xl border border-white/10 bg-white/5 p-3 text-sm">
              <p className="text-zinc-300">
                <span className="text-zinc-500">Função: </span>
                {roleLabels[user.role] ?? user.role}
              </p>
              <p className="text-zinc-300">
                <span className="text-zinc-500">Empresa: </span>
                {user.company_name ?? "Não informada"}
              </p>
              <p className="text-zinc-300">
                <span className="text-zinc-500">Gestor responsável: </span>
                {user.company_name
                  ? user.company_name
                  : "Consulte o cadastro do cliente"}
              </p>
            </div>

            <button
              type="button"
              onClick={() => {
                setProfileOpen(false);
                navigate(settingsPath);
              }}
              className="mb-2 flex w-full items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/5 py-3 text-sm font-semibold text-zinc-200 transition-colors hover:bg-white/10"
            >
              <Settings size={18} />
              Configuração
            </button>
            <button
              type="button"
              onClick={() => {
                setProfileOpen(false);
                handleLogout();
              }}
              className="flex w-full items-center justify-center gap-2 rounded-2xl border border-[#E51838]/20 bg-[#E51838]/10 py-3 text-sm font-semibold text-[#E51838] transition-colors hover:bg-[#E51838]/20"
            >
              Sair
            </button>
          </div>
        </div>
      ) : null}

      {menuOpen ? (
        <div className="fixed inset-0 z-[70] bg-black/45 px-4 py-6 md:hidden">
          <button
            type="button"
            aria-label="Fechar menu"
            className="absolute inset-0"
            onClick={() => setMenuOpen(false)}
          />

          <div className="relative ml-auto flex w-full max-w-xs flex-col rounded-3xl border border-white/10 bg-[#121212] p-5 text-white shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-300">
                Menu
              </h3>
              <button
                type="button"
                onClick={() => setMenuOpen(false)}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-zinc-300"
                aria-label="Fechar"
              >
                <X size={16} />
              </button>
            </div>

            <nav className="space-y-1">
              {navItems.map((item) => (
                <NavLink
                  key={item.href}
                  to={item.href}
                  onClick={() => setMenuOpen(false)}
                  className={({ isActive }) =>
                    clsx(
                      "flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-semibold transition-colors",
                      isActive
                        ? "bg-[#E51838] text-white"
                        : "text-zinc-300 hover:bg-white/10 hover:text-white",
                    )
                  }
                >
                  {item.icon}
                  {item.label}
                </NavLink>
              ))}
            </nav>
          </div>
        </div>
      ) : null}
    </div>
  );
}
