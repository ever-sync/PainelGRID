import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  Users,
  KanbanSquare,
  Calendar,
  MessageSquare,
  BarChart3,
  UserCheck,
  DollarSign,
  CarFront,
  CalendarPlus,
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
  BellRing,
  CheckCircle2,
  Clock,
  CheckSquare,
  Home,
  Store,
  BookOpen,
  MessagesSquare,
  FileText,
  Mail,
  HelpCircle,
  ChevronLeft,
  ChevronRight,
  Bell,
  ShieldAlert,
  Plus,
  ListOrdered,
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
import {
  checkInLeadByToken,
  queryFipeData,
  closeLeadAttendance,
  acceptVendorCall,
  expireVendorCall,
  getCurrentVendorAttendance,
  rejectVendorCall,
  updateVendorStatus,
} from "../services/leads";
import { readStoredSession } from "../services/auth";
import {
  clearNotifications as clearNotificationsRequest,
  listNotifications,
  markAllNotificationsRead as markAllNotificationsReadRequest,
  markNotificationRead,
  type ApiNotification,
} from "../services/notifications";
import { listEvents, type ApiEvent } from "../services/events";
import { connectRealtime } from "../services/realtime";
import { resolveClientId } from "../utils/userContext";
import { createAudioContext } from "../utils/audioContext";
import { triggerHapticFeedback } from "../utils/haptics";
import { CommandPalette } from "../components/shared/CommandPalette";
import { QuickSaleModal } from "../components/shared/QuickSaleModal";

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

type MobileQuickAction = "appointment" | "checkin" | "fipe";

const quickActionSteps: Record<MobileQuickAction, string[]> = {
  appointment: [
    "Escolha o lead que será agendado.",
    "Selecione o evento e a data/hora da visita.",
    "Confirme para somar 1 ponto em Agendou.",
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

function formatRelativeTime(iso: string, now: number): string {
  const timestamp = new Date(iso).getTime();
  if (Number.isNaN(timestamp)) return "";
  const seconds = Math.max(0, Math.floor((now - timestamp) / 1000));
  if (seconds < 60) return "Agora";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `Há ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Há ${hours} h`;
  const days = Math.floor(hours / 24);
  return `Há ${days} d`;
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
          href: "/gestor/auditoria",
          icon: <FileText size={18} />,
          label: "Auditoria",
        },
      ];
    case "cliente":
      return [
        {
          href: "/cliente/dashboard",
          icon: <Home size={18} />,
          label: "Início",
        },
        {
          href: "/cliente/eventos",
          icon: <Calendar size={18} />,
          label: "Evento 360",
        },
        {
          href: "/cliente/relatorio",
          icon: <BarChart3 size={18} />,
          label: "Relatório",
        },
        {
          href: "/cliente/lojas",
          icon: <Store size={18} />,
          label: "Lojas",
        },
        {
          href: "/cliente/veiculos",
          icon: <CarFront size={18} />,
          label: "Veículos",
        },
        {
          href: "/cliente/cursos",
          icon: <BookOpen size={18} />,
          label: "Treinamentos",
        },
        {
          href: "/cliente/faq-rag",
          icon: <FileText size={18} />,
          label: "FAQ / RAG",
        },
        {
          href: "/cliente/conversas",
          icon: <MessagesSquare size={18} />,
          label: "Conversas",
        },
        {
          href: "/cliente/leads",
          icon: <Users size={18} />,
          label: "Leads",
        },
        {
          href: "/cliente/vendedores",
          icon: <UserCheck size={18} />,
          label: "Equipe",
        },
        {
          href: "/cliente/auditoria",
          icon: <FileText size={18} />,
          label: "Auditoria",
        },
        {
          href: "/cliente/campanhas",
          icon: <Mail size={18} />,
          label: "Campanhas",
        },
        {
          href: "/cliente/emails",
          icon: <Mail size={18} />,
          label: "E-mails",
        },
        {
          href: "/cliente/ajuda",
          icon: <HelpCircle size={18} />,
          label: "Ajuda",
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
        {
          href: "/vendedor/fila",
          icon: <Users size={18} />,
          label: "Fila de Atendimento",
        },
      ];
    case "recepcao":
      return [
        {
          href: "/recepcao/checkin",
          icon: <UserCheck size={18} />,
          label: "Check-in",
        },
        {
          href: "/recepcao/fila",
          icon: <Users size={18} />,
          label: "Fila",
        },
        {
          href: "/recepcao/ordem-vendedores",
          icon: <ListOrdered size={18} />,
          label: "Ordem vendedores",
        },
      ];
    default:
      return [];
  }
}

/**
 * Itens que saem da barra lateral e vivem dentro do menu de perfil
 * (mesmo lugar de Configuração/Sair).
 */
function getProfileNavItems(user: User): NavItem[] {
  if (user.role !== "gestor") return [];
  return [
    {
      href: "/gestor/rubinho",
      icon: <Sparkles size={16} />,
      label: "Rubinho",
    },
    {
      href: "/gestor/operacoes",
      icon: <ShieldAlert size={16} />,
      label: "Central de operações",
    },
    {
      href: "/gestor/performance",
      icon: <Gauge size={16} />,
      label: "Performance real",
    },
  ];
}

export function AppLayout({ user, onLogout }: AppLayoutProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const isImmersiveChatRoute =
    location.pathname.startsWith("/gestor/chat") ||
    location.pathname.startsWith("/vendedor/chat") ||
    location.pathname.startsWith("/cliente/conversas");
  /** Kanban ocupa a altura toda e rola por dentro (sem scroll da pagina). */
  const isBoardRoute = location.pathname.startsWith("/gestor/crm");
  const [quickActionOpen, setQuickActionOpen] = useState(false);
  const [quickSaleOpen, setQuickSaleOpen] = useState(false);
  const [quickSalePrefill, setQuickSalePrefill] = useState<{
    clientId: string;
    eventId: string;
    vendorId: string;
    leadId: string;
    leadName: string;
    leadPhone: string | null;
    wristband: string | null;
  } | null>(null);

  useEffect(() => {
    const openQuickSale = (event: Event) => {
      const detail = (event as CustomEvent<typeof quickSalePrefill>).detail;
      if (!detail) return;
      setQuickSalePrefill(detail);
      setQuickSaleOpen(true);
    };
    window.addEventListener("open-quick-sale", openQuickSale);
    return () => window.removeEventListener("open-quick-sale", openQuickSale);
  }, []);
  const [quickAction, setQuickAction] = useState<MobileQuickAction | null>(
    null,
  );
  const [profileOpen, setProfileOpen] = useState(false);
  const [receptionEvents, setReceptionEvents] = useState<ApiEvent[]>([]);
  const [receptionEventId, setReceptionEventId] = useState(
    () => localStorage.getItem("reception:selected-event") ?? "",
  );
  const [menuOpen, setMenuOpen] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);

  useEffect(() => {
    if (user.role !== "recepcao") return;
    const token = readStoredSession()?.accessToken;
    if (!token) return;
    void listEvents({}, token)
      .then((rows) => {
        const sorted = [...rows].sort(
          (a, b) =>
            new Date(b.event_date).getTime() - new Date(a.event_date).getTime(),
        );
        setReceptionEvents(sorted);
        setReceptionEventId((current) => {
          const selected = sorted.some((event) => event.id === current)
            ? current
            : (sorted.find((event) => event.status === "active")?.id ??
              sorted[0]?.id ??
              "");
          if (selected)
            localStorage.setItem("reception:selected-event", selected);
          return selected;
        });
      })
      .catch(() => setReceptionEvents([]));
  }, [user.role]);

  const selectedReceptionEvent = receptionEvents.find(
    (event) => event.id === receptionEventId,
  );

  // ── Atalho Global Cmd + K / Ctrl + K ─────────────────────────────────────
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCommandPaletteOpen((prev) => !prev);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // ── Central de Notificações ────────────────────────────────────────────────
  // O historico vive na API: a central acompanha a pessoa entre navegadores e
  // aparelhos, e sobrevive a limpeza de armazenamento do WKWebView no iOS.
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notifications, setNotifications] = useState<ApiNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const notificationsRef = useRef<HTMLDivElement | null>(null);
  /** Rota atual em ref: os handlers do socket sao registrados uma vez so. */
  const currentPathRef = useRef(location.pathname);
  useEffect(() => {
    currentPathRef.current = location.pathname;
  }, [location.pathname]);
  /** Tick so para os rotulos "Há X min" nao congelarem com o painel aberto. */
  const [notificationsClock, setNotificationsClock] = useState(() =>
    Date.now(),
  );

  /** Recarrega a central. Falha em silencio: e um painel acessorio. */
  const refreshNotifications = useCallback(() => {
    const token = readStoredSession()?.accessToken;
    if (!token) return;
    void listNotifications(token)
      .then((page) => {
        setNotifications(page.items);
        setUnreadCount(page.unread_count);
      })
      .catch(() => {
        /* mantem o que ja estava na tela */
      });
  }, []);

  /** Ref: os handlers do socket sao registrados uma vez e nao devem re-assinar. */
  const refreshNotificationsRef = useRef(refreshNotifications);
  useEffect(() => {
    refreshNotificationsRef.current = refreshNotifications;
  }, [refreshNotifications]);

  useEffect(() => {
    refreshNotifications();
  }, [refreshNotifications]);

  const markAllNotificationsRead = useCallback(() => {
    const token = readStoredSession()?.accessToken;
    if (!token) return;
    // Otimista: a marcacao e trivialmente reversivel por um refresh.
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    setUnreadCount(0);
    void markAllNotificationsReadRequest(token)
      .catch(() => undefined)
      .finally(refreshNotifications);
  }, [refreshNotifications]);

  const clearNotifications = useCallback(() => {
    const token = readStoredSession()?.accessToken;
    if (!token) return;
    setNotifications([]);
    setUnreadCount(0);
    void clearNotificationsRequest(token)
      .catch(() => undefined)
      .finally(refreshNotifications);
  }, [refreshNotifications]);

  const openNotification = useCallback(
    (notification: ApiNotification) => {
      const token = readStoredSession()?.accessToken;
      if (!notification.read) {
        setNotifications((prev) =>
          prev.map((n) =>
            n.id === notification.id ? { ...n, read: true } : n,
          ),
        );
        setUnreadCount((count) => Math.max(0, count - 1));
        if (token) {
          void markNotificationRead(notification.id, token).catch(
            () => undefined,
          );
        }
      }
      if (notification.href) {
        setNotificationsOpen(false);
        navigate(notification.href);
      }
    },
    [navigate],
  );

  // Fecha o popover ao clicar fora ou apertar Esc.
  useEffect(() => {
    if (!notificationsOpen) return;

    setNotificationsClock(Date.now());
    const interval = window.setInterval(
      () => setNotificationsClock(Date.now()),
      30000,
    );

    const handlePointerDown = (event: MouseEvent) => {
      if (!notificationsRef.current?.contains(event.target as Node)) {
        setNotificationsOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setNotificationsOpen(false);
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [notificationsOpen]);

  // ── Listener Global de Chamada de Vendedor (Pop-up Vendedor) ───────────────
  const [vendorCallAlert, setVendorCallAlert] = useState<{
    id: string;
    attendance_id?: string;
    lead_id: string;
    lead_name: string;
    vendor_id: string;
    vendor_name: string;
    team_name?: string;
    expires_at?: string | null;
    status?: "pending" | "accepted";
    accepted_at?: string | null;
  } | null>(null);
  const [rejectingVendorCall, setRejectingVendorCall] = useState(false);
  const [acceptingVendorCall, setAcceptingVendorCall] = useState(false);
  const [vendorCallSeconds, setVendorCallSeconds] = useState(30);

  // Solicita permissão para Web Push Notifications ao carregar o aplicativo
  useEffect(() => {
    if (
      typeof window !== "undefined" &&
      "Notification" in window &&
      Notification.permission === "default"
    ) {
      void Notification.requestPermission();
    }
  }, []);

  /**
   * A conexao viva do layout. Sem isto, cada acao solta (trocar status, por
   * exemplo) abria um socket novo que nunca era fechado.
   */
  const realtimeSocketRef = useRef<ReturnType<typeof connectRealtime> | null>(
    null,
  );

  useEffect(() => {
    const clientId = resolveClientId(user);
    if (!clientId) return;

    const socket = connectRealtime(clientId);
    realtimeSocketRef.current = socket;

    const handleVendorCalled = (payload: {
      id: string;
      attendance_id?: string;
      lead_id: string;
      lead_name: string;
      vendor_id: string;
      vendor_name: string;
      team_name?: string;
      expires_at?: string | null;
      status?: "pending" | "accepted";
      accepted_at?: string | null;
    }) => {
      // Exibe pop-up se a chamada for para o usuario logado (ou se for perfil de gestor/testes)
      const vendorIsBusy =
        user.role === "vendedor" &&
        Boolean(localStorage.getItem("active_vendor_attendance"));
      if (payload.vendor_id === user.id && !vendorIsBusy) {
        if (payload.status === "accepted") {
          const session = {
            attendance_id: payload.attendance_id ?? payload.id,
            lead_id: payload.lead_id,
            lead_name: payload.lead_name,
            vendor_id: payload.vendor_id,
            startedAt: payload.accepted_at
              ? new Date(payload.accepted_at).getTime()
              : Date.now(),
          };
          setActiveAttendance(session);
          localStorage.setItem(
            "active_vendor_attendance",
            JSON.stringify(session),
          );
          setVendorCallAlert(null);
          triggerHapticFeedback();
          return;
        }
        setVendorCallAlert(payload);
        triggerHapticFeedback();

        // Dispara notificação nativa do sistema (Web Push) mesmo com aba em segundo plano
        if (
          typeof window !== "undefined" &&
          "Notification" in window &&
          Notification.permission === "granted"
        ) {
          try {
            const notif = new Notification("🚨 CHAMADA DA RECEPÇÃO!", {
              body: `O cliente ${payload.lead_name} chegou na recepção e está aguardando você!`,
              requireInteraction: true,
            });
            notif.onclick = () => {
              window.focus();
              notif.close();
            };
          } catch {
            /* ignore notification error */
          }
        }

        try {
          const ctx = createAudioContext();
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.frequency.setValueAtTime(880, ctx.currentTime);
          gain.gain.setValueAtTime(0.3, ctx.currentTime);
          osc.start();
          osc.stop(ctx.currentTime + 0.4);
        } catch {
          /* ignore audio error */
        }
      }
    };

    // A notificacao ja foi gravada pela API ao emitir o evento. Aqui so
    // recarregamos a central — o texto e o destino sao do servidor.
    const handleNotifiableEvent = () => refreshNotificationsRef.current();

    socket.on("lead_checkin", handleNotifiableEvent);
    socket.on("lead_updated", handleNotifiableEvent);
    socket.on("stage_changed", handleNotifiableEvent);
    socket.on("new_message", handleNotifiableEvent);
    socket.on("vendor_called", handleNotifiableEvent);
    socket.on("vendor_called", handleVendorCalled);
    const handleAttendanceUpdated = (payload: {
      vendor_id: string;
      status: string;
    }) => {
      if (payload.vendor_id !== user.id) return;
      if (["rejected", "expired", "finished"].includes(payload.status)) {
        setVendorCallAlert(null);
        setActiveAttendance(null);
        localStorage.removeItem("active_vendor_attendance");
      }
    };
    socket.on("vendor_attendance_updated", handleAttendanceUpdated);

    return () => {
      socket.off("lead_checkin", handleNotifiableEvent);
      socket.off("lead_updated", handleNotifiableEvent);
      socket.off("stage_changed", handleNotifiableEvent);
      socket.off("new_message", handleNotifiableEvent);
      socket.off("vendor_called", handleNotifiableEvent);
      socket.off("vendor_called", handleVendorCalled);
      socket.off("vendor_attendance_updated", handleAttendanceUpdated);
      socket.disconnect();
      realtimeSocketRef.current = null;
    };
  }, [user]);

  // Loop de alerta sonoro + vibração contínua estilo ligação enquanto vendorCallAlert estiver aberto
  useEffect(() => {
    if (!vendorCallAlert) return;

    const playChime = () => {
      triggerHapticFeedback();
      try {
        const ctx = createAudioContext();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.setValueAtTime(880, ctx.currentTime);
        gain.gain.setValueAtTime(0.4, ctx.currentTime);
        osc.start();
        osc.stop(ctx.currentTime + 0.5);
      } catch {
        /* ignore */
      }
    };

    playChime();
    const interval = setInterval(playChime, 1600);
    return () => clearInterval(interval);
  }, [vendorCallAlert]);

  useEffect(() => {
    if (!vendorCallAlert) return;
    const expiresAt = vendorCallAlert.expires_at
      ? new Date(vendorCallAlert.expires_at).getTime()
      : Date.now() + 30_000;
    const tick = () => {
      const remaining = Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000));
      setVendorCallSeconds(remaining);
      if (remaining === 0) {
        const token = readStoredSession()?.accessToken;
        if (token)
          void expireVendorCall(vendorCallAlert.lead_id, token).catch(
            () => undefined,
          );
        setVendorCallAlert(null);
      }
    };
    tick();
    const interval = window.setInterval(tick, 500);
    return () => window.clearInterval(interval);
  }, [vendorCallAlert]);

  // ── Status do Vendedor (Online / Ausente / Offline) ────────────────────────
  const [vendorStatus, setVendorStatusState] = useState<"online" | "away">(
    () => {
      const saved = localStorage.getItem(`vendor_status_${user.id}`);
      return saved === "away" || saved === "offline" ? "away" : "online";
    },
  );

  const handleUpdateVendorStatus = (newStatus: "online" | "away") => {
    setVendorStatusState(newStatus);
    try {
      localStorage.setItem(`vendor_status_${user.id}`, newStatus);
    } catch {
      /* ignore */
    }
    // Reaproveita a conexao do layout: o socket.io enfileira o emit se ainda
    // estiver conectando, entao nao precisamos abrir outra.
    realtimeSocketRef.current?.emit("vendor_status_change", {
      vendor_id: user.id,
      status: newStatus,
    });
    const token = readStoredSession()?.accessToken;
    if (token) {
      void updateVendorStatus(newStatus, token).catch((error) => {
        console.error("Erro ao atualizar disponibilidade:", error);
      });
    }
  };

  // ── Expand/Collapse Sidebar (Abrir e Fechar em todos os acessos) ──────────────
  const [isSidebarExpanded, setIsSidebarExpanded] = useState<boolean>(() => {
    try {
      return localStorage.getItem(`sidebar_expanded_${user.id}`) === "true";
    } catch {
      return false;
    }
  });

  const toggleSidebarExpanded = () => {
    setIsSidebarExpanded((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(`sidebar_expanded_${user.id}`, String(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  // ── Atendimento Ativo com Cronômetro do Vendedor ───────────────────────────
  const [activeAttendance, setActiveAttendance] = useState<{
    attendance_id: string;
    lead_id: string;
    lead_name: string;
    vendor_id: string;
    startedAt: number; // timestamp ms
  } | null>(() => {
    try {
      const saved = localStorage.getItem("active_vendor_attendance");
      if (saved) return JSON.parse(saved);
    } catch {
      /* ignore */
    }
    return null;
  });

  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [showAttendanceOutcome, setShowAttendanceOutcome] = useState(false);
  const [finishingAttendance, setFinishingAttendance] = useState(false);

  useEffect(() => {
    if (user.role !== "vendedor") return;
    const token = readStoredSession()?.accessToken;
    if (!token) return;
    void getCurrentVendorAttendance(token)
      .then((row) => {
        if (!row) return;
        const leadId = row.lead_id;
        const leadName = row.lead_name;
        if (row.status === "pending") {
          setVendorCallAlert({
            id: row.id,
            attendance_id: row.id,
            lead_id: leadId,
            lead_name: leadName,
            vendor_id: row.vendor_id,
            vendor_name: user.name,
            expires_at: row.expires_at,
          });
        } else if (row.status === "accepted") {
          const session = {
            attendance_id: row.id,
            lead_id: leadId,
            lead_name: leadName,
            vendor_id: row.vendor_id,
            startedAt: row.accepted_at
              ? new Date(row.accepted_at).getTime()
              : Date.now(),
          };
          setActiveAttendance(session);
          localStorage.setItem(
            "active_vendor_attendance",
            JSON.stringify(session),
          );
        }
      })
      .catch(() => undefined);
  }, [user.id, user.name, user.role]);

  // Timer em tempo real
  useEffect(() => {
    if (!activeAttendance) {
      setElapsedSeconds(0);
      return;
    }
    const updateTimer = () => {
      const secs = Math.max(
        0,
        Math.floor((Date.now() - activeAttendance.startedAt) / 1000),
      );
      setElapsedSeconds(secs);
    };
    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [activeAttendance]);

  const handleAcceptAttendance = async (call: typeof vendorCallAlert) => {
    if (!call || acceptingVendorCall) return;
    const token = readStoredSession()?.accessToken;
    if (!token) return;
    setAcceptingVendorCall(true);
    try {
      const accepted = await acceptVendorCall(call.lead_id, token);
      const session = {
        attendance_id: accepted.id ?? call.attendance_id ?? call.id,
        lead_id: call.lead_id,
        lead_name: call.lead_name,
        vendor_id: call.vendor_id,
        startedAt: accepted.accepted_at
          ? new Date(accepted.accepted_at).getTime()
          : Date.now(),
      };
      setActiveAttendance(session);
      try {
        localStorage.setItem(
          "active_vendor_attendance",
          JSON.stringify(session),
        );
      } catch {
        /* ignore */
      }
      setVendorCallAlert(null);
    } catch (error) {
      console.error("Erro ao aceitar atendimento:", error);
    } finally {
      setAcceptingVendorCall(false);
    }
  };

  const handleRejectAttendance = async (call: typeof vendorCallAlert) => {
    if (!call || rejectingVendorCall) return;
    const token = readStoredSession()?.accessToken;
    if (!token) return;
    setRejectingVendorCall(true);
    try {
      await rejectVendorCall(call.lead_id, token);
      setVendorCallAlert(null);
    } catch (error) {
      console.error("Erro ao encaminhar para o próximo vendedor:", error);
    } finally {
      setRejectingVendorCall(false);
    }
  };

  const handleFinishActiveAttendance = async (sold: boolean) => {
    if (!activeAttendance || finishingAttendance) return;
    setFinishingAttendance(true);
    const t = readStoredSession()?.accessToken;
    if (!t) {
      setFinishingAttendance(false);
      return;
    }
    const durationSecs = Math.max(
      1,
      Math.floor((Date.now() - activeAttendance.startedAt) / 1000),
    );
    try {
      await closeLeadAttendance(
        activeAttendance.lead_id,
        {
          sold,
          attendance_duration_seconds: durationSecs,
        },
        t,
      );
    } catch (err) {
      console.error("Erro ao encerrar atendimento:", err);
      setFinishingAttendance(false);
      return;
    }
    setActiveAttendance(null);
    setShowAttendanceOutcome(false);
    try {
      localStorage.removeItem("active_vendor_attendance");
    } catch {
      /* ignore */
    }
    setFinishingAttendance(false);
    setVendorStatusState("online");
    window.alert(
      "Atendimento finalizado. Você voltou para a fila de atendimento.",
    );
  };

  const formatCronometer = (totalSeconds: number) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    const hrs = Math.floor(mins / 60);
    const remMins = mins % 60;

    if (hrs > 0) {
      return `${String(hrs).padStart(2, "0")}:${String(remMins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
    }
    return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  };
  const [checkinResult, setCheckinResult] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [, setCheckinLoading] = useState(false);
  const [scannerActive, setScannerActive] = useState(false);
  const [vendorQuickActionPermissions, setVendorQuickActionPermissions] =
    useState({
      checkin: true,
      fipe: true,
      fipeEventId: null as string | null,
    });

  useEffect(() => {
    if (user.role !== "vendedor") return;
    const token = readStoredSession()?.accessToken;
    if (!token) return;

    let cancelled = false;
    const loadPermissions = () => {
      void listEvents({}, token)
        .then((events) => {
          if (cancelled) return;
          const sortedEvents = [...events].sort(
            (a, b) =>
              new Date(b.event_date).getTime() -
              new Date(a.event_date).getTime(),
          );
          const selectedEvent =
            sortedEvents.find((event) => event.status === "active") ??
            sortedEvents[0] ??
            null;
          const permissionEvents = selectedEvent ? [selectedEvent] : [];

          setVendorQuickActionPermissions({
            checkin:
              permissionEvents.length > 0 &&
              permissionEvents.some(
                (event) => event.allow_vendor_checkin ?? true,
              ),
            fipe:
              permissionEvents.length > 0 &&
              permissionEvents.some((event) => event.allow_vendor_fipe ?? true),
            fipeEventId:
              permissionEvents.find((event) => event.allow_vendor_fipe ?? true)
                ?.id ?? null,
          });
        })
        .catch(() => {
          // Mantém o comportamento anterior se a consulta de permissões falhar.
        });
    };

    const handlePermissionStorage = (event: StorageEvent) => {
      if (event.key === "painelgrid:event-permissions-updated") {
        loadPermissions();
      }
    };

    loadPermissions();
    window.addEventListener("storage", handlePermissionStorage);
    const refreshInterval = quickActionOpen
      ? window.setInterval(loadPermissions, 1500)
      : null;

    return () => {
      cancelled = true;
      window.removeEventListener("storage", handlePermissionStorage);
      if (refreshInterval) window.clearInterval(refreshInterval);
    };
  }, [user.role, quickActionOpen]);

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
      const data = await queryFipeData(
        cleanPlate,
        token,
        user.role === "vendedor"
          ? vendorQuickActionPermissions.fipeEventId
          : undefined,
      );
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
  const profileNavItems = getProfileNavItems(user);
  const settingsPath = `/${user.role}/configuracao`;
  /**
   * A barra inferior carrega só o essencial do dia a dia — no gestor eram os
   * 7 itens em duas fileiras, ocupando meia tela. O resto continua no menu
   * do topo, que lista a navegação inteira.
   */
  const pickByHref = (href: string) =>
    navItems.find((item) => item.href === href) ?? null;

  const mobileNavItems =
    user.role === "vendedor"
      ? [navItems[0], navItems[1], null, navItems[2], navItems[4]]
      : user.role === "recepcao"
        ? [
            navItems[0],
            navItems[1],
            null,
            null,
            {
              href: settingsPath,
              icon: <Settings size={18} />,
              label: "Ajustes",
            },
          ]
        : user.role === "gestor"
          ? [
              pickByHref("/gestor/crm"),
              pickByHref("/gestor/dashboard"),
              pickByHref("/gestor/chat"),
            ]
          : navItems;
  const handleLogout = () => {
    onLogout();
    navigate("/login");
  };

  const closeQuickAction = () => {
    setQuickActionOpen(false);
    setQuickAction(null);
    setCheckinResult(null);
    setScannerActive(false);
    setFipePlate("");
    setFipeResult(null);
    setFipeError(null);
  };

  const goToQuickActionFlow = () => {
    if (quickAction === "checkin") {
      closeQuickAction();
      navigate("/recepcao/checkin?cadastro=rapido");
      return;
    }
    const params = quickAction ? `?acao=${quickAction}` : "";
    closeQuickAction();
    navigate(`/vendedor/leads${params}`);
  };

  const runQuickAction = (action: MobileQuickAction) => {
    if (
      user.role === "vendedor" &&
      ((action === "checkin" && !vendorQuickActionPermissions.checkin) ||
        (action === "fipe" && !vendorQuickActionPermissions.fipe))
    ) {
      return;
    }
    if (action === "appointment") {
      closeQuickAction();
      navigate("/vendedor/leads?acao=appointment");
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
      <header className="fixed inset-x-0 top-0 z-40 flex h-[calc(4rem+env(safe-area-inset-top))] items-center justify-between border-b border-[#E51838]/10 bg-[#0b0b0b] px-3 pt-[env(safe-area-inset-top)] md:hidden">
        <button
          type="button"
          aria-label="Perfil"
          onClick={() => setProfileOpen(true)}
          className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#E51838] text-[11px] font-semibold text-white"
        >
          {initials}
          {user.role === "vendedor" && (
            <span
              className={clsx(
                "absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-[#0b0b0b]",
                vendorStatus === "online" && "bg-emerald-500",
                vendorStatus === "away" && "bg-amber-500",
              )}
            />
          )}
        </button>

        {user.role === "vendedor" ? (
          <div className="flex items-center gap-1 rounded-full border border-white/10 bg-zinc-900/90 p-1">
            <button
              type="button"
              onClick={() => handleUpdateVendorStatus("online")}
              className={clsx(
                "flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-extrabold transition-all",
                vendorStatus === "online"
                  ? "bg-emerald-500 text-white shadow-sm"
                  : "text-zinc-400 hover:text-zinc-200",
              )}
            >
              <span className="h-1.5 w-1.5 rounded-full bg-white animate-pulse" />
              <span>Online</span>
            </button>

            <button
              type="button"
              onClick={() => handleUpdateVendorStatus("away")}
              className={clsx(
                "flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-extrabold transition-all",
                vendorStatus === "away"
                  ? "bg-amber-500 text-black shadow-sm"
                  : "text-zinc-400 hover:text-zinc-200",
              )}
            >
              <span className="h-1.5 w-1.5 rounded-full bg-black/70" />
              <span>Ausente</span>
            </button>
          </div>
        ) : (
          <img
            src={sidebarLogo}
            alt="GP de Vendas"
            className="h-10 w-10 object-contain"
          />
        )}

        <button
          type="button"
          aria-label="Menu"
          onClick={() => setMenuOpen(true)}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/10 text-white"
        >
          <Menu size={18} />
        </button>
      </header>

      {/* Tela Inteira Escura de Atendimento Ativo com Cronômetro e Botões Gigantes */}
      {activeAttendance && (
        <div className="fixed inset-0 z-[9995] flex items-center justify-center p-4 bg-[#08090d]/95 backdrop-blur-2xl animate-fadeIn overflow-y-auto">
          <div className="w-full max-w-lg rounded-3xl border-2 border-emerald-500/40 bg-gradient-to-b from-zinc-900 via-[#0d0f17] to-black p-6 sm:p-8 text-white shadow-[0_0_90px_rgba(16,185,129,0.3)] space-y-6 text-center">
            {/* Badge Atendimento Em Andamento */}
            <div className="inline-flex items-center justify-center gap-2 rounded-full bg-emerald-500/10 px-4 py-1.5 text-xs font-black uppercase tracking-widest text-emerald-400 border border-emerald-500/30">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
              </span>
              <span>Atendimento em Andamento</span>
            </div>

            {/* Alerta de Atendimento Longo (+40 min) */}
            {elapsedSeconds >= 2400 && (
              <div className="rounded-2xl border border-amber-500/50 bg-amber-500/15 p-3 text-xs font-bold text-amber-300 shadow-md animate-pulse">
                ⚠️ ALERTA DE ATENDIMENTO LONGO (+40 MIN): Negociação em
                andamento estendida. Considere apoio do gestor na mesa!
              </div>
            )}

            {/* Nome do Cliente GIGANTE */}
            <div className="space-y-1">
              <p className="text-xs uppercase font-extrabold tracking-widest text-zinc-400">
                Você está em atendimento com:
              </p>
              <h1 className="text-3xl sm:text-5xl font-black tracking-tight text-white drop-shadow-md">
                {activeAttendance.lead_name}
              </h1>
            </div>

            {/* CRONÔMETRO GIGANTE NO MEIO DA TELA */}
            <div className="my-4 flex flex-col items-center justify-center gap-2 rounded-3xl bg-black/75 border-2 border-emerald-500/30 p-6 shadow-inner">
              <div className="flex items-center gap-2 text-emerald-400">
                <Clock size={28} className="animate-pulse" />
                <span className="text-xs uppercase font-extrabold tracking-widest text-emerald-400/90">
                  Tempo Decorrido
                </span>
              </div>
              <div className="font-mono text-5xl sm:text-7xl font-black tracking-widest text-emerald-300 drop-shadow-[0_0_25px_rgba(16,185,129,0.5)]">
                {formatCronometer(elapsedSeconds)}
              </div>
            </div>

            {/* Ação única: o resultado é perguntado somente ao finalizar. */}
            <div className="space-y-3 pt-2">
              <button
                type="button"
                onClick={() => setShowAttendanceOutcome(true)}
                className="w-full h-16 inline-flex items-center justify-center gap-3 rounded-2xl bg-emerald-600 px-6 text-lg font-black text-white shadow-[0_10px_30px_rgba(16,185,129,0.35)] hover:bg-emerald-500 active:scale-95 transition-all cursor-pointer"
              >
                <CheckSquare size={22} />
                <span>Finalizar Atendimento</span>
              </button>
            </div>

            {showAttendanceOutcome && (
              <div className="rounded-3xl border border-zinc-700 bg-black/80 p-5 space-y-4">
                <p className="text-lg font-black text-white">
                  Vendeu para este cliente?
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    disabled={finishingAttendance}
                    onClick={() => void handleFinishActiveAttendance(false)}
                    className="h-12 rounded-xl border border-zinc-600 bg-zinc-900 font-bold text-zinc-200 hover:bg-zinc-800 disabled:opacity-50"
                  >
                    Não
                  </button>
                  <button
                    type="button"
                    disabled={finishingAttendance}
                    onClick={() => void handleFinishActiveAttendance(true)}
                    className="h-12 rounded-xl bg-emerald-600 font-bold text-white hover:bg-emerald-500 disabled:opacity-50"
                  >
                    {finishingAttendance ? "Salvando..." : "Sim"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <div
        className={clsx(
          "h-screen md:pr-4 md:py-4 transition-all duration-300",
          isSidebarExpanded ? "md:pl-[280px]" : "md:pl-[112px]",
          isImmersiveChatRoute
            ? // A barra de abas e fixa e cobre ~4.75rem do rodape: sem esta
              // folga o campo de digitar do chat fica atras dela no celular.
              "overflow-hidden p-2 pb-[calc(4.75rem+env(safe-area-inset-bottom))] md:p-0"
            : // `overflow-x-hidden` e o que impede uma tabela ou um quadro
              // largo demais de arrastar a pagina inteira para o lado: sem
              // ele, o cabecalho e a busca saiam da tela junto com o conteudo.
              // Quem precisa rolar na horizontal ja tem o proprio scroller.
              "overflow-y-auto overflow-x-hidden pt-[calc(4rem+env(safe-area-inset-top))] pb-0 md:pt-0",
          // Board (kanban): no desktop a pagina controla o proprio scroll interno.
          isBoardRoute && "md:overflow-hidden",
        )}
      >
        <main
          className={clsx(
            "min-h-full min-w-0",
            // Altura definida (nao so min-height) para o `h-full` dos filhos
            // resolver e o conteudo encostar no rodape, igual ao sidebar.
            isImmersiveChatRoute ? "h-full p-0" : "p-4 md:p-6 xl:p-8",
            isBoardRoute && "md:h-full",
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

      {/* SIDEBAR DESKTOP EXPANDÍVEL (ABRIR E FECHAR) */}
      <aside
        className={clsx(
          "fixed bottom-4 left-4 top-4 z-50 hidden flex-col overflow-visible rounded-[28px] py-5 shadow-xl transition-all duration-300 border md:flex",
          isSidebarExpanded
            ? "w-64 px-4 items-start"
            : "w-20 px-0 items-center",
          dashboardDark
            ? "border-zinc-800/80 bg-[#0f1015] text-zinc-100"
            : "border-zinc-200/80 bg-white ring-1 ring-[#dfdfdf]/50 text-zinc-900",
        )}
      >
        {/* Cabeçalho do Sidebar com Logo + Botão de Abrir/Fechar */}
        <div
          className={clsx(
            "mb-6 flex shrink-0 w-full",
            // Recolhido a barra tem 80px: logo (44px) + botao (32px) lado a
            // lado nao cabem, entao o botao vai para baixo da logo.
            isSidebarExpanded
              ? "items-center justify-between px-1"
              : "flex-col items-center gap-2",
          )}
        >
          <div className="flex items-center gap-3">
            <div
              className={clsx(
                "flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl transition-colors",
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
            {isSidebarExpanded && (
              <span className="font-extrabold text-sm tracking-tight text-zinc-900 dark:text-white truncate">
                Painel GRID
              </span>
            )}
          </div>

          <button
            type="button"
            onClick={toggleSidebarExpanded}
            className={clsx(
              "flex h-8 w-8 items-center justify-center rounded-xl transition-all active:scale-95 cursor-pointer",
              dashboardDark
                ? "bg-zinc-800/80 text-zinc-300 hover:bg-zinc-700 hover:text-white"
                : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 hover:text-zinc-900",
            )}
            title={isSidebarExpanded ? "Recolher menu" : "Expandir menu"}
          >
            {isSidebarExpanded ? (
              <ChevronLeft size={18} />
            ) : (
              <ChevronRight size={18} />
            )}
          </button>
        </div>

        {/* Navegação Principal do Sidebar */}
        <nav className="flex min-h-0 w-full flex-1 flex-col gap-1.5 overflow-y-auto px-0.5">
          {navItems.map((item) => {
            return (
              <NavLink
                key={item.href}
                to={item.href}
                title={!isSidebarExpanded ? item.label : undefined}
                aria-label={item.label}
                className={({ isActive }) =>
                  clsx(
                    "relative flex items-center transition-all cursor-pointer",
                    isSidebarExpanded
                      ? "h-11 w-full gap-3 rounded-2xl px-3.5 text-xs font-bold"
                      : "h-11 w-11 justify-center rounded-full mx-auto",
                    isActive
                      ? dashboardDark
                        ? "bg-[#FF0636] text-white shadow-md font-bold"
                        : "bg-zinc-900 text-white font-bold"
                      : dashboardDark
                        ? "text-zinc-400 hover:bg-zinc-800/80 hover:text-zinc-200"
                        : "text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900",
                  )
                }
              >
                <span className="shrink-0">{item.icon}</span>
                {isSidebarExpanded && (
                  <span className="truncate text-xs font-semibold">
                    {item.label}
                  </span>
                )}
              </NavLink>
            );
          })}
        </nav>

        <div
          className={clsx(
            "mt-4 flex w-full shrink-0 flex-col border-t pt-4",
            // Aberto: linhas de menu com rotulo. Recolhido: pilha de icones.
            isSidebarExpanded ? "gap-1" : "items-center gap-1.5",
            dashboardDark ? "border-zinc-800" : "border-zinc-100",
          )}
        >
          {/* BOTÃO SINO DE NOTIFICAÇÕES (ACIMA DO BOTÃO DARKMODE) */}
          <div
            ref={notificationsRef}
            className={clsx(
              "relative flex items-center",
              isSidebarExpanded ? "w-full" : "justify-center",
            )}
          >
            <button
              type="button"
              onClick={() => setNotificationsOpen((prev) => !prev)}
              className={clsx(
                "relative flex items-center transition-colors cursor-pointer",
                isSidebarExpanded
                  ? "h-11 w-full gap-3 rounded-2xl px-3.5 text-xs font-bold"
                  : "h-11 w-11 justify-center rounded-full",
                dashboardDark
                  ? "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
                  : "text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900",
              )}
              title="Notificações do Sistema"
              aria-label="Notificações do Sistema"
            >
              <Bell size={18} className="shrink-0" />
              {isSidebarExpanded && (
                <>
                  <span className="truncate">Notificações</span>
                  {unreadCount > 0 && (
                    <span className="ml-auto inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-[#FF0636] px-1.5 text-[10px] font-black tabular-nums text-white">
                      {unreadCount > 99 ? "99+" : unreadCount}
                    </span>
                  )}
                </>
              )}
              {!isSidebarExpanded && unreadCount > 0 && (
                <span className="absolute top-2.5 right-2.5 flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#FF0636] opacity-75" />
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[#FF0636]" />
                </span>
              )}
            </button>

            {/* PAINEL POPOVER DE NOTIFICAÇÕES */}
            {notificationsOpen && (
              <div
                className={clsx(
                  "absolute bottom-0 left-[calc(100%+12px)] z-[200] w-80 rounded-2xl border shadow-2xl p-4 space-y-3 animate-fadeIn",
                  dashboardDark
                    ? "border-zinc-800 bg-[#15161b] text-zinc-100"
                    : "border-zinc-200 bg-white text-zinc-900",
                )}
              >
                <div className="flex items-center justify-between border-b pb-2.5 border-zinc-200 dark:border-zinc-800">
                  <div className="flex items-center gap-2">
                    <Bell size={16} className="text-[#FF0636]" />
                    <span className="font-bold text-xs uppercase tracking-wider">
                      Notificações
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setNotificationsOpen(false)}
                    className="text-zinc-400 hover:text-zinc-200 p-1 text-xs cursor-pointer"
                  >
                    <X size={14} />
                  </button>
                </div>

                {notifications.length === 0 ? (
                  <div className="flex flex-col items-center gap-1.5 py-8 text-center">
                    <Bell size={22} className="text-zinc-300" />
                    <p className="text-xs font-semibold text-zinc-500">
                      Nenhuma notificação por aqui
                    </p>
                    <p className="text-[11px] leading-relaxed text-zinc-400">
                      Check-ins, agendamentos, vendas e mensagens novas aparecem
                      aqui em tempo real.
                    </p>
                  </div>
                ) : (
                  <div className="max-h-72 overflow-y-auto text-xs divide-y divide-zinc-100 dark:divide-zinc-800/60">
                    {notifications.map((n) => (
                      <button
                        key={n.id}
                        type="button"
                        onClick={() => openNotification(n)}
                        className={clsx(
                          "w-full space-y-1 px-2 py-2.5 text-left transition-colors rounded-lg cursor-pointer",
                          dashboardDark
                            ? "hover:bg-zinc-800/70"
                            : "hover:bg-zinc-50",
                        )}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <span className="flex min-w-0 items-center gap-1.5">
                            {!n.read && (
                              <span className="mt-px h-1.5 w-1.5 shrink-0 rounded-full bg-[#FF0636]" />
                            )}
                            <span
                              className={clsx(
                                "truncate",
                                n.read
                                  ? "font-medium text-zinc-500 dark:text-zinc-400"
                                  : "font-bold text-zinc-900 dark:text-zinc-100",
                              )}
                            >
                              {n.title}
                            </span>
                          </span>
                          <span className="shrink-0 text-[10px] text-zinc-400 font-mono">
                            {formatRelativeTime(
                              n.created_at,
                              notificationsClock,
                            )}
                          </span>
                        </div>
                        <p className="text-zinc-500 dark:text-zinc-400 text-[11px] leading-relaxed">
                          {n.description}
                        </p>
                      </button>
                    ))}
                  </div>
                )}

                <div className="pt-2 border-t border-zinc-200 dark:border-zinc-800 flex justify-between items-center text-[11px]">
                  <button
                    type="button"
                    onClick={clearNotifications}
                    disabled={notifications.length === 0}
                    className="font-semibold text-zinc-400 hover:text-zinc-600 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                  >
                    Limpar tudo
                  </button>
                  <button
                    type="button"
                    onClick={markAllNotificationsRead}
                    disabled={unreadCount === 0}
                    className="text-[#FF0636] font-bold hover:underline disabled:opacity-40 disabled:cursor-not-allowed disabled:no-underline cursor-pointer"
                  >
                    Marcar como lidas
                  </button>
                </div>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() => {
              const next = !dashboardDark;
              applyDashboardDarkEnabled(user.id, next);
              setDashboardDark(next);
            }}
            className={clsx(
              "flex items-center transition-colors cursor-pointer",
              isSidebarExpanded
                ? "h-11 w-full gap-3 rounded-2xl px-3.5 text-xs font-bold"
                : "h-11 w-11 justify-center rounded-full",
              dashboardDark
                ? "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
                : "text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700",
            )}
            title="Alternar modo escuro"
            aria-label="Alternar modo escuro"
          >
            {dashboardDark ? (
              <Sun size={18} className="shrink-0" />
            ) : (
              <Moon size={18} className="shrink-0" />
            )}
            {isSidebarExpanded && (
              <span className="truncate">
                {dashboardDark ? "Modo claro" : "Modo escuro"}
              </span>
            )}
          </button>

          {/* Avatar + menu de hover */}
          <div
            className={clsx(
              "group relative flex items-center",
              isSidebarExpanded ? "mt-1 w-full" : "h-11 w-11 justify-center",
            )}
          >
            <button
              type="button"
              className={clsx(
                "flex select-none items-center transition-colors cursor-pointer",
                isSidebarExpanded
                  ? "w-full gap-3 rounded-2xl p-1.5 text-left"
                  : "h-11 w-11 justify-center rounded-full text-xs font-bold",
                dashboardDark
                  ? isSidebarExpanded
                    ? "hover:bg-zinc-800/70"
                    : "bg-zinc-800 text-zinc-200 hover:bg-zinc-700"
                  : isSidebarExpanded
                    ? "hover:bg-zinc-100"
                    : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200",
              )}
              aria-label="Abrir menu de perfil"
            >
              {isSidebarExpanded ? (
                <>
                  <span
                    className={clsx(
                      "flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold",
                      dashboardDark
                        ? "bg-zinc-800 text-zinc-200"
                        : "bg-zinc-100 text-zinc-700",
                    )}
                  >
                    {initials}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span
                      className={clsx(
                        "block truncate text-xs font-bold",
                        dashboardDark ? "text-zinc-100" : "text-zinc-900",
                      )}
                    >
                      {user.name}
                    </span>
                    <span className="block truncate text-[10px] font-medium text-zinc-400">
                      {roleLabels[user.role] ?? user.role}
                    </span>
                  </span>
                </>
              ) : (
                initials
              )}
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

                {user.role === "vendedor" && (
                  <div className="mt-2 pt-2 border-t border-zinc-700/50 space-y-1">
                    <span className="text-[10px] uppercase font-bold text-zinc-400 block mb-1">
                      Status de Atendimento:
                    </span>
                    <div className="flex flex-col gap-1">
                      <button
                        type="button"
                        onClick={() => handleUpdateVendorStatus("online")}
                        className={clsx(
                          "flex items-center gap-2 px-2 py-1 rounded-lg text-xs font-semibold w-full text-left transition-colors",
                          vendorStatus === "online"
                            ? "bg-emerald-500/20 text-emerald-300 font-bold"
                            : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200",
                        )}
                      >
                        <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                        <span>Online</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleUpdateVendorStatus("away")}
                        className={clsx(
                          "flex items-center gap-2 px-2 py-1 rounded-lg text-xs font-semibold w-full text-left transition-colors",
                          vendorStatus === "away"
                            ? "bg-amber-500/20 text-amber-300 font-bold"
                            : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200",
                        )}
                      >
                        <span className="h-2 w-2 rounded-full bg-amber-500" />
                        <span>Ausente</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
              {profileNavItems.length > 0 && (
                <div
                  className={clsx(
                    "border-b py-1",
                    dashboardDark ? "border-zinc-800" : "border-zinc-100",
                  )}
                >
                  {profileNavItems.map((item) => (
                    <NavLink
                      key={item.href}
                      to={item.href}
                      className={({ isActive }) =>
                        clsx(
                          "flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors",
                          isActive
                            ? dashboardDark
                              ? "text-white font-semibold"
                              : "text-zinc-900 font-semibold"
                            : dashboardDark
                              ? "text-zinc-300 hover:bg-zinc-800/80 hover:text-white"
                              : "text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900",
                        )
                      }
                    >
                      <span className="shrink-0">{item.icon}</span>
                      <span className="truncate">{item.label}</span>
                    </NavLink>
                  ))}
                </div>
              )}
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
              : user.role === "gestor"
                ? "grid-cols-3"
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

      {(user.role === "gestor" ||
        user.role === "cliente" ||
        (user.role === "recepcao" &&
          selectedReceptionEvent?.allow_reception_create_sale === true)) &&
        !isImmersiveChatRoute && (
          <button
            type="button"
            onClick={() => {
              setQuickSalePrefill(null);
              setQuickSaleOpen(true);
            }}
            className="fixed bottom-[calc(6.25rem+env(safe-area-inset-bottom))] right-5 z-40 flex h-14 items-center gap-2 rounded-full bg-[#E51838] px-5 font-bold text-white shadow-[0_16px_36px_rgba(229,24,56,0.35)] transition hover:-translate-y-0.5 hover:bg-[#c9122e] active:translate-y-0 md:bottom-8 md:right-8"
            aria-label="Registrar venda rápida"
          >
            <DollarSign size={22} strokeWidth={2.5} />
            <span>Venda rápida</span>
          </button>
        )}

      <QuickSaleModal
        open={quickSaleOpen}
        onClose={() => {
          setQuickSaleOpen(false);
          setQuickSalePrefill(null);
        }}
        user={user}
        prefill={quickSalePrefill}
      />

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

                {(user.role !== "vendedor" ||
                  vendorQuickActionPermissions.checkin) && (
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
                )}

                {(user.role !== "vendedor" ||
                  vendorQuickActionPermissions.fipe) && (
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
                )}
              </div>
            ) : (
              <div className="space-y-4">
                {quickAction === "checkin" ? (
                  <div className="space-y-4">
                    <div className="space-y-3">
                      <div className="flex items-center justify-center gap-2 rounded-2xl border border-[#E51838] bg-[#E51838]/5 py-3 text-sm font-bold text-[#E51838]">
                        <QrCode size={16} />
                        Escanear QR Code
                      </div>
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
                      <button
                        type="button"
                        onClick={goToQuickActionFlow}
                        className="flex w-full items-center justify-center gap-2 rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm font-bold text-zinc-800 transition-colors active:bg-zinc-100"
                      >
                        <Plus size={17} />
                        Sem QR Code · Cadastro rápido
                      </button>
                    </div>

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
              <div className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#E51838] text-sm font-bold text-white">
                {initials}
                {user.role === "vendedor" && (
                  <span
                    className={clsx(
                      "absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-[#121212]",
                      vendorStatus === "online" && "bg-emerald-500",
                      vendorStatus === "away" && "bg-amber-500",
                    )}
                  />
                )}
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-white">
                  {user.name}
                </p>
                <p className="truncate text-xs text-zinc-400">{user.email}</p>
              </div>
            </div>

            {user.role === "vendedor" && (
              <div className="mb-3 space-y-2 rounded-2xl border border-white/10 bg-white/5 p-3">
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-zinc-400 block">
                  Status de Atendimento
                </span>
                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    type="button"
                    onClick={() => handleUpdateVendorStatus("online")}
                    className={clsx(
                      "flex flex-col items-center justify-center gap-1 p-2 rounded-xl text-xs font-bold transition-all",
                      vendorStatus === "online"
                        ? "bg-emerald-500 text-white ring-2 ring-emerald-400"
                        : "bg-white/5 text-zinc-400 hover:bg-white/10",
                    )}
                  >
                    <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                    <span>Online</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleUpdateVendorStatus("away")}
                    className={clsx(
                      "flex flex-col items-center justify-center gap-1 p-2 rounded-xl text-xs font-bold transition-all",
                      vendorStatus === "away"
                        ? "bg-amber-500 text-black ring-2 ring-amber-400"
                        : "bg-white/5 text-zinc-400 hover:bg-white/10",
                    )}
                  >
                    <span className="h-2 w-2 rounded-full bg-amber-400" />
                    <span>Ausente</span>
                  </button>
                </div>
              </div>
            )}

            {user.role === "recepcao" && receptionEvents.length > 0 && (
              <div className="mb-3 rounded-2xl border border-white/10 bg-white/5 p-3">
                <label className="mb-2 block text-[10px] font-extrabold uppercase tracking-wider text-zinc-400">
                  Evento da recepção
                </label>
                <select
                  value={receptionEventId}
                  onChange={(event) => {
                    const nextId = event.target.value;
                    setReceptionEventId(nextId);
                    localStorage.setItem("reception:selected-event", nextId);
                    window.dispatchEvent(
                      new CustomEvent("reception-event-changed", {
                        detail: { eventId: nextId },
                      }),
                    );
                    setProfileOpen(false);
                  }}
                  className="w-full rounded-xl border border-white/10 bg-[#202020] px-3 py-3 text-sm font-semibold text-white outline-none"
                >
                  {receptionEvents.map((event) => (
                    <option key={event.id} value={event.id}>
                      {event.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

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

            {profileNavItems.length > 0 && (
              <div className="mb-3 space-y-2">
                {profileNavItems.map((item) => (
                  <NavLink
                    key={item.href}
                    to={item.href}
                    onClick={() => setProfileOpen(false)}
                    className={({ isActive }) =>
                      clsx(
                        "flex w-full items-center justify-center gap-2 rounded-2xl border py-3 text-sm font-semibold transition-colors",
                        isActive
                          ? "border-[#E51838]/40 bg-[#E51838]/15 text-white"
                          : "border-white/10 bg-white/5 text-zinc-200 hover:bg-white/10",
                      )
                    }
                  >
                    {item.icon}
                    {item.label}
                  </NavLink>
                ))}
              </div>
            )}

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

      {/* Modal Pop-up GIGANTE de Chamada da Recepção na Tela do Vendedor */}
      {vendorCallAlert && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn">
          <div className="w-full max-w-md rounded-3xl border-2 border-red-500/50 bg-gradient-to-b from-zinc-900 via-zinc-950 to-black p-6 text-white shadow-2xl space-y-5 text-center">
            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-red-600/20 text-red-500 animate-bounce ring-8 ring-red-500/10">
              <BellRing size={40} />
            </div>

            <div className="space-y-1">
              <span className="inline-block rounded-full bg-red-500/20 px-3.5 py-1 text-xs font-bold uppercase tracking-wider text-red-400">
                🚨 Cliente na Recepção
              </span>
              <h2 className="text-2xl font-black tracking-tight text-white">
                {vendorCallAlert.lead_name}
              </h2>
              <p className="text-xs sm:text-sm text-zinc-400">
                A recepção está chamando você para atender este cliente agora!
              </p>
              <p className="text-sm font-bold text-amber-300">
                {vendorCallSeconds}s para responder
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
              <button
                type="button"
                disabled={acceptingVendorCall}
                onClick={() => void handleAcceptAttendance(vendorCallAlert)}
                className="w-full h-14 inline-flex items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-5 text-sm font-bold text-white shadow-lg hover:bg-emerald-500 active:scale-95 transition-all"
              >
                <CheckCircle2 size={20} />
                <span>
                  {acceptingVendorCall ? "Aceitando..." : "Aceitar e Atender"}
                </span>
              </button>

              <button
                type="button"
                disabled={rejectingVendorCall}
                onClick={() => void handleRejectAttendance(vendorCallAlert)}
                className="w-full h-14 inline-flex items-center justify-center gap-2 rounded-2xl border border-zinc-700 bg-zinc-900 px-5 text-xs sm:text-sm font-semibold text-zinc-300 hover:bg-zinc-800 active:scale-95 transition-all"
              >
                <span>
                  {rejectingVendorCall ? "Encaminhando..." : "Recusar"}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Command Palette (Busca Global Cmd+K) */}
      <CommandPalette
        isOpen={commandPaletteOpen}
        onClose={() => setCommandPaletteOpen(false)}
        isDarkMode={dashboardDark}
        onToggleDarkMode={() => {
          const next = !dashboardDark;
          applyDashboardDarkEnabled(user.id, next);
          setDashboardDark(next);
        }}
      />
    </div>
  );
}
