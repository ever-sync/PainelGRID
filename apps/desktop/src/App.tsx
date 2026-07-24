import { Suspense, lazy, useEffect, useState } from "react";
import {
  BrowserRouter,
  HashRouter,
  Routes,
  Route,
  Navigate,
} from "react-router-dom";
import type { User } from "./types";
import { isNativePlatform } from "./utils/platform";
import { isProtectedRoutePath } from "./routing/route-policy";

import { RoleGuard } from "./routing/RoleGuard";
import {
  clearStoredSession,
  fetchMe,
  logoutSession,
  readStoredSession,
  refreshAuthSession,
  writeStoredSession,
  type AuthSession,
} from "./services/auth";
import {
  AUTH_SESSION_UPDATED_EVENT,
  AUTH_STORAGE_KEY,
  type PersistedAuthSession,
} from "./services/auth-session";
import { ToastHost } from "./components/ui/Toast";
import { useNativeShell } from "./hooks/useNativeShell";

const AppLayout = lazy(() =>
  import("./layouts/AppLayout").then((module) => ({
    default: module.AppLayout,
  })),
);
const LoginPage = lazy(() =>
  import("./pages/auth/LoginPage").then((module) => ({
    default: module.LoginPage,
  })),
);
const ForgotPasswordPage = lazy(() =>
  import("./pages/auth/ForgotPasswordPage").then((module) => ({
    default: module.ForgotPasswordPage,
  })),
);
const DashboardGestorPage = lazy(() =>
  import("./pages/gestor/DashboardPage").then((module) => ({
    default: module.DashboardGestorPage,
  })),
);
const ClientesPage = lazy(() =>
  import("./pages/gestor/ClientesPage").then((module) => ({
    default: module.ClientesPage,
  })),
);
const ClienteDetailPage = lazy(() =>
  import("./pages/gestor/ClienteDetailPage").then((module) => ({
    default: module.ClienteDetailPage,
  })),
);
const VendedorPerfilPage = lazy(() =>
  import("./pages/gestor/VendedorPerfilPage").then((module) => ({
    default: module.VendedorPerfilPage,
  })),
);
const CRMPage = lazy(() =>
  import("./pages/gestor/CRMPage").then((module) => ({
    default: module.CRMPage,
  })),
);
const RelatorioGestorPage = lazy(() =>
  import("./pages/gestor/RelatorioGestorPage").then((module) => ({
    default: module.RelatorioGestorPage,
  })),
);
const RubinhoPage = lazy(() =>
  import("./pages/gestor/RubinhoPage").then((module) => ({
    default: module.RubinhoPage,
  })),
);
const EventosPage = lazy(() =>
  import("./pages/gestor/EventosPage").then((module) => ({
    default: module.EventosPage,
  })),
);
const EventDetailPage = lazy(() =>
  import("./pages/gestor/EventDetailPage").then((module) => ({
    default: module.EventDetailPage,
  })),
);
const EventTVDashboardPage = lazy(() =>
  import("./pages/gestor/EventTVDashboardPage").then((module) => ({
    default: module.EventTVDashboardPage,
  })),
);
const EventTVQueuePage = lazy(() =>
  import("./pages/gestor/EventTVQueuePage").then((module) => ({
    default: module.EventTVQueuePage,
  })),
);
const ChatPage = lazy(() =>
  import("./pages/gestor/ChatPage").then((module) => ({
    default: module.ChatPage,
  })),
);
const CursosGestorPage = lazy(() =>
  import("./pages/gestor/CursosGestorPage").then((module) => ({
    default: module.CursosGestorPage,
  })),
);
const DashboardClientePage = lazy(() =>
  import("./pages/cliente/DashboardClientePage").then((module) => ({
    default: module.DashboardClientePage,
  })),
);
const LeadsPage = lazy(() =>
  import("./pages/cliente/LeadsPage").then((module) => ({
    default: module.LeadsPage,
  })),
);
const ClienteEventosPage = lazy(() =>
  import("./pages/cliente/EventosClientePage").then((module) => ({
    default: module.EventosClientePage,
  })),
);
const VendedoresPage = lazy(() =>
  import("./pages/cliente/VendedoresPage").then((module) => ({
    default: module.VendedoresPage,
  })),
);
const CampanhasPage = lazy(() =>
  import("./pages/cliente/CampanhasPage").then((module) => ({
    default: module.CampanhasPage,
  })),
);
const CursosClientePage = lazy(() =>
  import("./pages/cliente/CursosClientePage").then((module) => ({
    default: module.CursosClientePage,
  })),
);
const VeiculosPage = lazy(() =>
  import("./pages/cliente/VeiculosPage").then((module) => ({
    default: module.VeiculosPage,
  })),
);
const DashboardVendedorPage = lazy(() =>
  import("./pages/vendedor/DashboardVendedorPage").then((module) => ({
    default: module.DashboardVendedorPage,
  })),
);
const LeadsVendedorPage = lazy(() =>
  import("./pages/vendedor/LeadsVendedorPage").then((module) => ({
    default: module.LeadsVendedorPage,
  })),
);
const CursosVendedorPage = lazy(() =>
  import("./pages/vendedor/CursosVendedorPage").then((module) => ({
    default: module.CursosVendedorPage,
  })),
);
const VendasVendedorPage = lazy(() =>
  import("./pages/vendedor/VendasVendedorPage").then((module) => ({
    default: module.VendasVendedorPage,
  })),
);
const RankingVendedorPage = lazy(() =>
  import("./pages/vendedor/RankingVendedorPage").then((module) => ({
    default: module.RankingVendedorPage,
  })),
);
const CheckinPage = lazy(() =>
  import("./pages/recepcao/CheckinPage").then((module) => ({
    default: module.CheckinPage,
  })),
);
const ConvitePage = lazy(() =>
  import("./pages/public/ConvitePage").then((module) => ({
    default: module.ConvitePage,
  })),
);
const AvaliacaoPage = lazy(() =>
  import("./pages/public/AvaliacaoPage").then((module) => ({
    default: module.AvaliacaoPage,
  })),
);
const ConfiguracaoPage = lazy(() =>
  import("./pages/shared/ConfiguracaoPage").then((module) => ({
    default: module.ConfiguracaoPage,
  })),
);

function ProtectedRoute({
  user,
  loading,
  children,
}: {
  user: User | null;
  loading: boolean;
  children: React.ReactNode;
}) {
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-zinc-500">
        Carregando sessão...
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function RouteLoadingFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center text-sm text-zinc-500">
      Carregando tela...
    </div>
  );
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<AuthSession | null>(null);
  const [loadingAuth, setLoadingAuth] = useState(true);

  useNativeShell(!loadingAuth);

  useEffect(() => {
    let active = true;

    async function bootstrapAuth() {
      const stored = readStoredSession();

      if (stored) {
        // Carregamento otimista: libera a UI imediatamente com o usuário em cache
        // e revalida em segundo plano. Evita travar em "Carregando sessão..." quando
        // a API está lenta/fria (ex.: cold start do Railway).
        setUser(stored.user);
        setSession(stored);
        setLoadingAuth(false);
        void import("./layouts/AppLayout");

        try {
          const me = await fetchMe(stored.accessToken);
          if (!active) return;
          const resolvedSession = { ...stored, user: me };
          setUser(me);
          setSession(resolvedSession);
          writeStoredSession(resolvedSession);
        } catch {
          try {
            const refreshed = await refreshAuthSession();
            if (!active) return;
            setUser(refreshed.user);
            setSession(refreshed);
            writeStoredSession(refreshed);
          } catch {
            // Falha na revalidação em segundo plano (ex.: API fria/instável).
            // Mantém a sessão otimista em cache — um 401 real numa requisição
            // protegida é tratado pelo http.ts (refresh + redirect ao /login).
          }
        }
      } else {
        /**
         * Evita POST /refresh na tela pública e resolve deep-link com cookie mas sem localStorage.
         * No app nativo (HashRouter) a rota fica em location.hash, não em pathname.
         */
        const routePath =
          typeof window !== "undefined"
            ? window.location.hash
              ? window.location.hash.replace(/^#/, "")
              : window.location.pathname
            : "";
        if (isProtectedRoutePath(routePath)) {
          try {
            const refreshed = await refreshAuthSession();
            if (!active) return;
            setUser(refreshed.user);
            setSession(refreshed);
            writeStoredSession(refreshed);
          } catch {
            /* cookie ausente ou inválido */
          }
        }
      }

      if (active) setLoadingAuth(false);
    }

    void bootstrapAuth();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    function syncAuthFromStorage(event: StorageEvent) {
      if (event.key !== AUTH_STORAGE_KEY) {
        return;
      }

      const stored = readStoredSession();
      if (!stored) {
        setSession(null);
        setUser(null);
        setLoadingAuth(false);
        return;
      }

      setSession(stored);
      setUser(stored.user);
      setLoadingAuth(false);
    }

    /** Após refresh silencioso no `http.ts`, outras abas já recebem `storage`; na mesma aba usamos este evento. */
    function syncAuthAfterHttpRefresh(event: Event) {
      const ce = event as CustomEvent<PersistedAuthSession>;
      if (!ce.detail?.accessToken || !ce.detail?.user) return;
      setSession(ce.detail);
      setUser(ce.detail.user);
    }

    window.addEventListener("storage", syncAuthFromStorage);
    window.addEventListener(
      AUTH_SESSION_UPDATED_EVENT,
      syncAuthAfterHttpRefresh,
    );
    return () => {
      window.removeEventListener("storage", syncAuthFromStorage);
      window.removeEventListener(
        AUTH_SESSION_UPDATED_EVENT,
        syncAuthAfterHttpRefresh,
      );
    };
  }, []);

  const handleLogin = (nextSession: AuthSession, rememberMe: boolean) => {
    setSession(nextSession);
    setUser(nextSession.user);
    writeStoredSession(nextSession, rememberMe);
  };

  const handleLogout = async () => {
    try {
      await logoutSession();
    } catch {
      /* rede ou API: ainda assim encerra localmente */
    } finally {
      clearStoredSession();
      setSession(null);
      setUser(null);
    }
  };

  /** Capacitor serve o build a partir de uma origem local sem rewrite de servidor: HashRouter evita 404 em deep link/refresh. */
  const Router = isNativePlatform() ? HashRouter : BrowserRouter;

  return (
    <Router
      future={{
        v7_startTransition: true,
        v7_relativeSplatPath: true,
      }}
    >
      <Suspense fallback={<RouteLoadingFallback />}>
        <Routes>
          {/* Auth */}
          <Route path="/login" element={<LoginPage onLogin={handleLogin} />} />
          <Route path="/esqueci-senha" element={<ForgotPasswordPage />} />
          <Route path="/convite" element={<ConvitePage />} />
          <Route path="/avaliacao/:token" element={<AvaliacaoPage />} />

          {/* TV mode (fullscreen, sem AppLayout) — qualquer usuário logado */}
          <Route
            path="/eventos/:id/tv"
            element={
              <ProtectedRoute user={user} loading={loadingAuth}>
                <EventTVDashboardPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/eventos/:id/tv-fila"
            element={
              <ProtectedRoute user={user} loading={loadingAuth}>
                <EventTVQueuePage />
              </ProtectedRoute>
            }
          />

          {/* Gestor routes */}
          <Route
            element={
              <ProtectedRoute user={user} loading={loadingAuth}>
                <AppLayout user={user!} onLogout={handleLogout} />
              </ProtectedRoute>
            }
          >
            <Route element={<RoleGuard allow="gestor" />}>
              <Route
                path="/gestor/dashboard"
                element={<DashboardGestorPage />}
              />
              <Route path="/gestor/clientes" element={<ClientesPage />} />
              <Route
                path="/gestor/clientes/:id"
                element={<ClienteDetailPage />}
              />
              <Route
                path="/gestor/vendedores/:id"
                element={<VendedorPerfilPage />}
              />
              <Route path="/gestor/crm" element={<CRMPage />} />
              <Route
                path="/gestor/relatorio"
                element={<RelatorioGestorPage />}
              />
              <Route path="/gestor/eventos" element={<EventosPage />} />
              <Route path="/gestor/eventos/:id" element={<EventDetailPage />} />
              <Route path="/gestor/rubinho" element={<RubinhoPage />} />
              <Route
                path="/gestor/eventos/:eventId/operacao/:clientId"
                element={<ClienteEventosPage />}
              />
              <Route path="/gestor/chat" element={<ChatPage />} />
              <Route path="/gestor/cursos" element={<CursosGestorPage />} />
              <Route
                path="/gestor/configuracao"
                element={<ConfiguracaoPage />}
              />
            </Route>

            <Route element={<RoleGuard allow="cliente" />}>
              <Route
                path="/cliente/dashboard"
                element={<DashboardClientePage />}
              />
              <Route path="/cliente/eventos" element={<ClienteEventosPage />} />
              <Route path="/cliente/leads" element={<LeadsPage />} />
              <Route path="/cliente/vendedores" element={<VendedoresPage />} />
              <Route path="/cliente/campanhas" element={<CampanhasPage />} />
              <Route path="/cliente/veiculos" element={<VeiculosPage />} />
              <Route path="/cliente/cursos" element={<CursosClientePage />} />
              <Route
                path="/cliente/configuracao"
                element={<ConfiguracaoPage />}
              />
            </Route>

            <Route element={<RoleGuard allow="vendedor" />}>
              <Route
                path="/vendedor/dashboard"
                element={<DashboardVendedorPage />}
              />
              <Route path="/vendedor/leads" element={<LeadsVendedorPage />} />
              <Route path="/vendedor/vendas" element={<VendasVendedorPage />} />
              <Route
                path="/vendedor/ranking"
                element={<RankingVendedorPage />}
              />
              <Route path="/vendedor/chat" element={<ChatPage />} />
              <Route path="/vendedor/cursos" element={<CursosVendedorPage />} />
              <Route
                path="/vendedor/configuracao"
                element={<ConfiguracaoPage />}
              />
            </Route>

            <Route element={<RoleGuard allow="recepcao" />}>
              <Route path="/recepcao/checkin" element={<CheckinPage />} />
              <Route
                path="/recepcao/configuracao"
                element={<ConfiguracaoPage />}
              />
            </Route>
          </Route>

          {/* Default redirect */}
          <Route path="/" element={<Navigate to="/login" replace />} />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </Suspense>
      <ToastHost />
    </Router>
  );
}
