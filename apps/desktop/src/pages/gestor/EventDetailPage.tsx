import {
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";
import { useNavigate, useParams } from "react-router-dom";
import clsx from "clsx";
import {
  ArrowLeft,
  ArrowUpRight,
  Building2,
  CalendarDays,
  Clock3,
  Download,
  Eye,
  ImageIcon,
  MapPin,
  Mail,
  MessageSquareMore,
  Pencil,
  Plus,
  Search,
  RefreshCcw,
  Settings,
  Filter,
  Phone,
  ChevronRight,
  ChevronLeft,
  ChevronUp,
  ChevronDown,
  UserRound,
  Trash2,
  Users,
  TrendingUp,
  Tv,
  ShoppingCart,
} from "lucide-react";
import { PageHeader } from "../../components/shared/PageHeader";
import {
  Badge,
  ConfirmationBadge,
  EventStatusBadge,
  SourceBadge,
  StageBadge,
} from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { CopyableId } from "../../components/ui/CopyableId";
import { Card } from "../../components/ui/Card";
import { ConfirmationModal } from "../../components/ui/ConfirmationModal";
import { Input } from "../../components/ui/Input";
import { Notice } from "../../components/ui/Notice";
import { Select } from "../../components/ui/Select";
import { Tabs } from "../../components/ui/Tabs";
import { Drawer, Modal } from "../../components/ui/Modal";
import type { Client, Event, Lead, VendorCategory } from "../../types";
import { readStoredSession } from "../../services/auth";
import { listClients, mapApiClientToClient } from "../../services/clients";
import { listLeadHistory, type ApiCrmHistoryItem } from "../../services/crm";
import {
  deleteEvent,
  getEvent,
  mapApiEventToEvent,
  updateEvent,
} from "../../services/events";
import {
  fetchLeadsPage,
  getLead,
  mapApiLeadToLead,
  updateLead,
} from "../../services/leads";
import { rescheduleAppointment } from "../../services/appointments";
import {
  addTeamMember,
  createSalesTeam,
  deleteSalesTeam,
  listSalesTeams,
  removeTeamMember,
  reorderTeamMembers,
  updateSalesTeam,
  type SalesTeam,
  type TeamMemberUser,
} from "../../services/salesTeams";
import { listUsers, type StaffUser } from "../../services/users";
import {
  deleteSale,
  listEventSales,
  listPendingEventSales,
  updateSale,
  type EventSaleListItem,
  type PendingEventSale,
} from "../../services/sales";
import { dataUrlByteSize, resizeImageToDataUrl } from "../../utils/image";
import { saveOrShareBlob } from "../../utils/nativeDownload";
import {
  DASHBOARD_DARK_CHANGE_EVENT,
  readDashboardDarkEnabled,
} from "../../lib/dashboard-dark-mode";
import type { AppOutletContext } from "../../layouts/AppLayout";
import { useOutletContext } from "react-router-dom";
import type { ConfirmationStatus, LeadSource } from "../../types";
import { maskCurrencyInput } from "../../utils/currency";

type EventDetailTab =
  "dados" | "leads" | "vendas" | "time" | "fila" | "configuracoes";
type LeadDrawerTab = "historico" | "dados";
type LeadDrawerMode = "view" | "edit";

type EventDeleteAction =
  | {
      kind: "participant";
      client: Client;
    }
  | {
      kind: "team";
      team: SalesTeam;
    }
  | {
      kind: "member";
      team: SalesTeam;
      member: TeamMemberUser;
    };

const EVENT_TABS: Array<{
  id: EventDetailTab;
  label: string;
  icon: JSX.Element;
}> = [
  { id: "dados", label: "Dados", icon: <CalendarDays size={14} /> },
  { id: "leads", label: "Leads", icon: <ArrowUpRight size={14} /> },
  { id: "vendas", label: "Vendas", icon: <ShoppingCart size={14} /> },
  { id: "time", label: "Time", icon: <Users size={14} /> },
  { id: "fila", label: "Fila", icon: <ChevronRight size={14} /> },
  { id: "configuracoes", label: "Configurações", icon: <Settings size={14} /> },
];

const FIXED_TEAMS: Array<{ name: string; logoUrl: string }> = [
  { name: "Blue Line Racing", logoUrl: "/team-logos/blue-line-racing.png" },
  { name: "Blue Thunder", logoUrl: "/team-logos/blue-thunder.png" },
  { name: "Carbon Fire", logoUrl: "/team-logos/carbon-fire.png" },
  { name: "Gold Rush", logoUrl: "/team-logos/gold-rush.png" },
  { name: "Laranja Apex", logoUrl: "/team-logos/laranja-apex.png" },
  { name: "Neon Track", logoUrl: "/team-logos/neon-track.png" },
  {
    name: "Scuderia Rosso Sprint",
    logoUrl: "/team-logos/scuderia-rosso-sprint.png",
  },
  { name: "Silver Ring", logoUrl: "/team-logos/silver-ring.png" },
  { name: "Silver Volt", logoUrl: "/team-logos/silver-volt.png" },
  { name: "Veloce Union", logoUrl: "/team-logos/veloce-union.png" },
];

const EVENT_QUEUE_CATEGORIES: Array<{ value: VendorCategory; label: string }> =
  [
    { value: "novo", label: "Novo" },
    { value: "semininovo", label: "Seminovo" },
    { value: "pdc", label: "PCD" },
    { value: "consorcio", label: "Venda direta" },
    { value: "assinatura", label: "Assinatura" },
  ];

const LEAD_SOURCE_LABELS: Record<LeadSource, string> = {
  facebook_ads: "Facebook Ads",
  manual: "Manual",
  whatsapp: "WhatsApp",
  form_page: "Formulário",
  import_excel: "Importação",
};

const LEAD_STATUS_LABELS: Record<ConfirmationStatus, string> = {
  pending: "Pendente",
  scheduled: "Agendado",
  confirmed: "Confirmado",
  cancelled: "Cancelado",
  checked_in: "Check-in",
  closed: "Encerrado",
};

function csvEscape(value: string) {
  return `"${value.replace(/"/g, '""')}"`;
}

function downloadCsv(filename: string, rows: string[][]) {
  const csv = rows.map((row) => row.map(csvEscape).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  void saveOrShareBlob(blob, filename).catch((err) => {
    console.error("Falha ao exportar CSV", err);
  });
}

function formatDateFull(value: string | null | undefined) {
  if (!value) return "Não informado";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "Não informado";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatCurrency(value: string | number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(Number(value) || 0);
}

function formatDateInput(value: string | null | undefined) {
  return value ? new Date(value).toISOString().slice(0, 10) : "";
}

function formatDateTimeInput(value: string | null | undefined) {
  return value ? new Date(value).toISOString().slice(0, 16) : "";
}

function formatEventDayOption(day: { start: string; end: string }) {
  const start = new Date(day.start);
  const end = new Date(day.end);
  if (Number.isNaN(start.getTime())) return day.start;

  const date = new Intl.DateTimeFormat("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "America/Sao_Paulo",
  }).format(start);
  const time = new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  });

  return `${date}, das ${time.format(start)}${
    !Number.isNaN(end.getTime()) ? ` às ${time.format(end)}` : ""
  }`;
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function MetricCard({
  title,
  value,
  helper,
  tone = "rose",
  dark,
}: {
  title: string;
  value: string | number;
  helper?: string;
  tone?: "rose" | "blue" | "amber" | "emerald";
  dark: boolean;
}) {
  const toneClasses: Record<typeof tone, string> = {
    rose: "text-[#FF0636]",
    blue: "text-[#3D56A2]",
    amber: "text-[#FBBB49]",
    emerald: "text-emerald-600",
  };

  return (
    <div
      className={clsx(
        "rounded-[22px] border p-4 shadow-[0_12px_30px_rgba(15,23,42,0.04)]",
        dark ? "border-zinc-800 bg-[#111111]" : "border-zinc-100 bg-white",
      )}
    >
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-400">
        {title}
      </p>
      <p
        className={clsx(
          "mt-2 text-3xl font-black tracking-tight",
          toneClasses[tone],
        )}
      >
        {value}
      </p>
      {helper && (
        <p
          className={clsx(
            "mt-2 text-xs",
            dark ? "text-zinc-500" : "text-zinc-500",
          )}
        >
          {helper}
        </p>
      )}
    </div>
  );
}

export function EventDetailPage() {
  const { id: eventId = "" } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useOutletContext<AppOutletContext>();

  const [isDarkMode, setIsDarkMode] = useState(() =>
    readDashboardDarkEnabled(user.id),
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [loadWarning, setLoadWarning] = useState("");
  const [event, setEvent] = useState<Event | null>(null);
  const [client, setClient] = useState<Client | null>(null);
  const [allClients, setAllClients] = useState<Client[]>([]);
  const [teams, setTeams] = useState<SalesTeam[]>([]);
  const [allStaffRaw, setAllStaffRaw] = useState<StaffUser[]>([]);
  const [eventLeads, setEventLeads] = useState<Lead[]>([]);
  const [leadsLoading, setLeadsLoading] = useState(false);
  const [eventLeadsNextCursor, setEventLeadsNextCursor] = useState<
    string | null
  >(null);
  const [eventLeadsHasNextPage, setEventLeadsHasNextPage] = useState(false);
  const [eventLeadsLoadingMore, setEventLeadsLoadingMore] = useState(false);
  const [eventSales, setEventSales] = useState<EventSaleListItem[]>([]);
  const [pendingEventSales, setPendingEventSales] = useState<
    PendingEventSale[]
  >([]);
  const [salesView, setSalesView] = useState<"completed" | "pending">(
    "completed",
  );
  const [salesLoading, setSalesLoading] = useState(false);
  const [editingSale, setEditingSale] = useState<EventSaleListItem | null>(
    null,
  );
  const [saleDeleteTarget, setSaleDeleteTarget] =
    useState<EventSaleListItem | null>(null);
  const [saleActionLoading, setSaleActionLoading] = useState(false);
  const [saleActionError, setSaleActionError] = useState("");
  const [saleEditLeadId, setSaleEditLeadId] = useState("");
  const [saleEditVendorId, setSaleEditVendorId] = useState("");
  const [saleEditProduct, setSaleEditProduct] = useState("");
  const [saleEditType, setSaleEditType] =
    useState<EventSaleListItem["type"]>("NOVO");
  const [saleEditValue, setSaleEditValue] = useState("");
  const [saleEditSoldAt, setSaleEditSoldAt] = useState("");
  const [saleEditOrderNumber, setSaleEditOrderNumber] = useState("");
  const [saleEditNotes, setSaleEditNotes] = useState("");
  const [leadSearch, setLeadSearch] = useState("");
  const [leadStatusFilter, setLeadStatusFilter] = useState<
    "all" | ConfirmationStatus
  >("all");
  const [leadSourceFilter, setLeadSourceFilter] = useState<"all" | LeadSource>(
    "all",
  );
  const [leadVendorFilter, setLeadVendorFilter] = useState<"all" | string>(
    "all",
  );
  const [eventLeadsPage, setEventLeadsPage] = useState(1);
  const eventLeadsPageSize = 20;
  const [leadDrawerOpen, setLeadDrawerOpen] = useState(false);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [leadDrawerTab, setLeadDrawerTab] =
    useState<LeadDrawerTab>("historico");
  const [leadDrawerMode, setLeadDrawerMode] = useState<LeadDrawerMode>("view");
  const [leadDrawerStatus, setLeadDrawerStatus] =
    useState<ConfirmationStatus>("pending");
  const [leadDrawerVendorId, setLeadDrawerVendorId] = useState("");
  const [leadDrawerName, setLeadDrawerName] = useState("");
  const [leadDrawerEmail, setLeadDrawerEmail] = useState("");
  const [leadDrawerPhone, setLeadDrawerPhone] = useState("");
  const [leadDrawerScheduledAt, setLeadDrawerScheduledAt] = useState("");
  const [leadDrawerSaving, setLeadDrawerSaving] = useState(false);
  const [leadDrawerMessage, setLeadDrawerMessage] = useState("");
  const [leadHistory, setLeadHistory] = useState<ApiCrmHistoryItem[]>([]);
  const [leadHistoryLoading, setLeadHistoryLoading] = useState(false);
  const [exportingLeads, setExportingLeads] = useState(false);
  const [activeTab, setActiveTab] = useState<EventDetailTab>("dados");
  const [queueCategory, setQueueCategory] = useState<VendorCategory>("novo");
  const [refreshing, setRefreshing] = useState(false);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsDeleting, setSettingsDeleting] = useState(false);
  const [settingsError, setSettingsError] = useState("");
  const [settingsSuccess, setSettingsSuccess] = useState("");
  const [eventDeleteOpen, setEventDeleteOpen] = useState(false);
  const [eventDeleteAction, setEventDeleteAction] =
    useState<EventDeleteAction | null>(null);
  const [eventDeleteActionLoading, setEventDeleteActionLoading] =
    useState(false);
  const [participantDraftId, setParticipantDraftId] = useState("");
  const [participantSaving, setParticipantSaving] = useState(false);
  const [teamCreating, setTeamCreating] = useState(false);
  const [teamDeleting, setTeamDeleting] = useState<string | null>(null);
  const [addMemberTeamId, setAddMemberTeamId] = useState<string | null>(null);
  const [editingTeam, setEditingTeam] = useState<SalesTeam | null>(null);
  const [editTeamName, setEditTeamName] = useState("");
  const [editTeamLogo, setEditTeamLogo] = useState("");
  const [editTeamSaving, setEditTeamSaving] = useState(false);
  const [editTeamError, setEditTeamError] = useState("");
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);
  const [memberToggling, setMemberToggling] = useState<string | null>(null);
  const [queueSaving, setQueueSaving] = useState<string | null>(null);
  const [formName, setFormName] = useState("");
  const [formEventType, setFormEventType] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formLaunchDate, setFormLaunchDate] = useState("");
  const [formEventDate, setFormEventDate] = useState("");
  const [formEventEndDate, setFormEventEndDate] = useState("");
  const [formLocation, setFormLocation] = useState("");
  const [formCapacity, setFormCapacity] = useState("");
  const [formSalesTarget, setFormSalesTarget] = useState("");
  const [formScheduledTarget, setFormScheduledTarget] = useState("");
  const [formTotalInvestment, setFormTotalInvestment] = useState("");
  const [formPaidTraffic, setFormPaidTraffic] = useState("");
  const [formStatus, setFormStatus] = useState<Event["status"]>("draft");
  const [formRequireWristband, setFormRequireWristband] = useState(false);
  const [, setFormExtraClientIds] = useState<string[]>([]);
  useEffect(() => {
    setIsDarkMode(readDashboardDarkEnabled(user.id));
  }, [user.id]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const syncTheme = () => setIsDarkMode(readDashboardDarkEnabled(user.id));
    syncTheme();
    window.addEventListener("storage", syncTheme);
    window.addEventListener("focus", syncTheme);
    window.addEventListener(DASHBOARD_DARK_CHANGE_EVENT, syncTheme);

    return () => {
      window.removeEventListener("storage", syncTheme);
      window.removeEventListener("focus", syncTheme);
      window.removeEventListener(DASHBOARD_DARK_CHANGE_EVENT, syncTheme);
    };
  }, [user.id]);

  function hydrateForm(nextEvent: Event) {
    setFormName(nextEvent.name);
    setFormEventType(nextEvent.event_type ?? "");
    setFormDescription(nextEvent.description ?? "");
    setFormLaunchDate(formatDateInput(nextEvent.launch_date));
    setFormEventDate(formatDateTimeInput(nextEvent.event_date));
    setFormEventEndDate(formatDateTimeInput(nextEvent.event_end_date));
    setFormLocation(nextEvent.location ?? "");
    setFormCapacity(
      nextEvent.capacity != null ? String(nextEvent.capacity) : "",
    );
    setFormSalesTarget(
      nextEvent.sales_target != null ? String(nextEvent.sales_target) : "",
    );
    setFormScheduledTarget(
      nextEvent.scheduled_target != null
        ? String(nextEvent.scheduled_target)
        : "",
    );
    setFormTotalInvestment(
      nextEvent.total_investment != null
        ? String(nextEvent.total_investment)
        : "",
    );
    setFormPaidTraffic(
      nextEvent.paid_traffic_investment != null
        ? String(nextEvent.paid_traffic_investment)
        : "",
    );
    setFormStatus(nextEvent.status);
    setFormRequireWristband(nextEvent.require_wristband ?? false);
    setFormExtraClientIds(
      nextEvent.participant_client_ids.filter(
        (clientId) => clientId !== nextEvent.participant_client_ids[0],
      ),
    );
  }

  async function loadPage(showSpinner = true) {
    if (!isUuid(eventId)) {
      setError("Evento inválido.");
      setLoading(false);
      return;
    }

    const session = readStoredSession();
    if (!session?.accessToken) {
      setError("Faça login novamente para ver este evento.");
      setLoading(false);
      return;
    }

    if (showSpinner) {
      setLoading(true);
    }
    setLeadsLoading(true);
    setSalesLoading(true);
    setError("");
    setLoadWarning("");
    setSettingsError("");
    setSettingsSuccess("");

    try {
      const failedParts: string[] = [];
      const [
        apiEvent,
        apiClients,
        apiTeams,
        apiStaff,
        apiLeads,
        apiSales,
        apiPendingSales,
      ] = await Promise.all([
        getEvent(eventId, session.accessToken),
        listClients(session.accessToken).catch(() => {
          failedParts.push("lista de clientes");
          return [];
        }),
        listSalesTeams(session.accessToken, eventId).catch(() => {
          failedParts.push("times");
          return [];
        }),
        listUsers(session.accessToken).catch(() => {
          failedParts.push("vendedores");
          return [];
        }),
        fetchLeadsPage(
          { event_id: eventId, take: 100 },
          session.accessToken,
        ).catch(() => {
          failedParts.push("leads");
          return {
            items: [],
            page_info: {
              take: 100,
              next_cursor: null,
              has_next_page: false,
            },
          };
        }),
        listEventSales(session.accessToken, eventId).catch(() => {
          failedParts.push("vendas");
          return [];
        }),
        listPendingEventSales(session.accessToken, eventId).catch(() => {
          failedParts.push("vendas sem baixa");
          return [];
        }),
      ]);
      const mappedEvent = mapApiEventToEvent(apiEvent);
      const participantClientIds = mappedEvent.participant_client_ids;

      // Exibe os dados principais assim que o evento chega. As listas
      // auxiliares continuam carregando sem manter a página inteira bloqueada.
      setEvent(mappedEvent);
      hydrateForm(mappedEvent);
      if (showSpinner) setLoading(false);

      if (failedParts.length > 0) {
        const uniqueParts = Array.from(new Set(failedParts));
        setLoadWarning(
          `Não foi possível carregar: ${uniqueParts.join(", ")}. Tente atualizar a página.`,
        );
      }

      const mappedClients = apiClients.map(mapApiClientToClient);
      const primaryClientId = participantClientIds[0] ?? mappedEvent.client_id;
      setClient(
        mappedClients.find((client) => client.id === primaryClientId) ?? null,
      );
      setAllClients(mappedClients);
      setTeams(apiTeams);
      setAllStaffRaw(apiStaff);
      setEventLeads(
        apiLeads.items
          .map(mapApiLeadToLead)
          .filter((lead) => lead.event_id === mappedEvent.id),
      );
      setEventLeadsNextCursor(apiLeads.page_info.next_cursor);
      setEventLeadsHasNextPage(apiLeads.page_info.has_next_page);
      setEventSales(apiSales);
      setPendingEventSales(apiPendingSales);
      setAddMemberTeamId(null);
      setSelectedMemberIds([]);
    } catch (loadError) {
      setError(
        getErrorMessage(loadError, "Não foi possível carregar o evento."),
      );
    } finally {
      setLeadsLoading(false);
      setSalesLoading(false);
      if (showSpinner) {
        setLoading(false);
      }
    }
  }

  useEffect(() => {
    void loadPage();
    // Deps propositalmente reduzidas para o efeito nao reexecutar a cada
    // render das dependencias derivadas.
  }, [eventId]);

  const deferredLeadSearch = useDeferredValue(leadSearch);

  useEffect(() => {
    if (activeTab !== "leads" || !isUuid(eventId)) return;
    const token = readStoredSession()?.accessToken;
    if (!token) return;

    const controller = new AbortController();
    setLeadsLoading(true);
    void fetchLeadsPage(
      {
        event_id: eventId,
        search: deferredLeadSearch.trim() || undefined,
        source: leadSourceFilter === "all" ? undefined : leadSourceFilter,
        confirmation_status:
          leadStatusFilter === "all" ? undefined : leadStatusFilter,
        take: 100,
      },
      token,
      controller.signal,
    )
      .then((page) => {
        setEventLeads(page.items.map(mapApiLeadToLead));
        setEventLeadsNextCursor(page.page_info.next_cursor);
        setEventLeadsHasNextPage(page.page_info.has_next_page);
        setEventLeadsPage(1);
      })
      .catch((loadError) => {
        if (loadError instanceof Error && loadError.name === "AbortError") {
          return;
        }
        setLoadWarning(
          getErrorMessage(loadError, "Não foi possível filtrar os leads."),
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLeadsLoading(false);
      });

    return () => controller.abort();
  }, [
    activeTab,
    deferredLeadSearch,
    eventId,
    leadSourceFilter,
    leadStatusFilter,
  ]);

  async function loadMoreEventLeads() {
    if (!eventLeadsNextCursor || eventLeadsLoadingMore) return;
    const token = readStoredSession()?.accessToken;
    if (!token) return;

    setEventLeadsLoadingMore(true);
    try {
      const page = await fetchLeadsPage(
        {
          event_id: eventId,
          search: deferredLeadSearch.trim() || undefined,
          source: leadSourceFilter === "all" ? undefined : leadSourceFilter,
          confirmation_status:
            leadStatusFilter === "all" ? undefined : leadStatusFilter,
          take: 100,
          cursor: eventLeadsNextCursor,
        },
        token,
      );
      const incoming = page.items.map(mapApiLeadToLead);
      setEventLeads((current) => {
        const knownIds = new Set(current.map((lead) => lead.id));
        return [
          ...current,
          ...incoming.filter((lead) => !knownIds.has(lead.id)),
        ];
      });
      setEventLeadsNextCursor(page.page_info.next_cursor);
      setEventLeadsHasNextPage(page.page_info.has_next_page);
    } catch (loadError) {
      setLoadWarning(
        getErrorMessage(loadError, "Não foi possível carregar mais leads."),
      );
    } finally {
      setEventLeadsLoadingMore(false);
    }
  }

  function openSaleEditor(sale: EventSaleListItem) {
    setEditingSale(sale);
    setSaleEditLeadId(sale.lead_id);
    setSaleEditVendorId(sale.vendor_id);
    setSaleEditProduct(sale.product);
    setSaleEditType(sale.type);
    setSaleEditValue(maskCurrencyInput(sale.value));
    setSaleEditSoldAt(formatDateTimeInput(sale.sold_at));
    setSaleEditOrderNumber(sale.order_number ?? "");
    setSaleEditNotes(sale.notes ?? "");
    setSaleActionError("");
  }

  async function handleUpdateSale() {
    if (!editingSale) return;
    const token = readStoredSession()?.accessToken;
    if (!token) {
      setSaleActionError("Faça login novamente para editar a venda.");
      return;
    }
    if (!saleEditLeadId || !saleEditVendorId || !saleEditProduct.trim()) {
      setSaleActionError("Preencha comprador, vendedor e veículo.");
      return;
    }
    setSaleActionLoading(true);
    setSaleActionError("");
    try {
      await updateSale(token, editingSale.id, {
        lead_id: saleEditLeadId,
        vendor_id: saleEditVendorId,
        type: saleEditType,
        product: saleEditProduct.trim(),
        value: saleEditValue,
        sold_at: new Date(saleEditSoldAt).toISOString(),
        order_number: saleEditOrderNumber.trim() || undefined,
        notes: saleEditNotes.trim() || undefined,
      });
      setEditingSale(null);
      await loadPage(false);
    } catch (actionError) {
      setSaleActionError(
        getErrorMessage(actionError, "Não foi possível atualizar a venda."),
      );
    } finally {
      setSaleActionLoading(false);
    }
  }

  async function handleDeleteSale() {
    if (!saleDeleteTarget) return;
    const token = readStoredSession()?.accessToken;
    if (!token) return;
    setSaleActionLoading(true);
    setSaleActionError("");
    try {
      await deleteSale(token, saleDeleteTarget.id);
      setSaleDeleteTarget(null);
      await loadPage(false);
    } catch (actionError) {
      setSaleActionError(
        getErrorMessage(actionError, "Não foi possível excluir a venda."),
      );
    } finally {
      setSaleActionLoading(false);
    }
  }

  const staff = useMemo(
    () =>
      allStaffRaw.filter(
        (member) =>
          member.role === "vendedor" &&
          member.is_active &&
          !!member.client_id &&
          (event?.participant_client_ids.includes(member.client_id) ?? false),
      ),
    [allStaffRaw, event?.participant_client_ids],
  );

  const assignedVendorIds = useMemo(
    () =>
      new Set(
        teams.flatMap((team) => team.members.map((member) => member.user_id)),
      ),
    [teams],
  );

  const availableVendors = useMemo(
    () => staff.filter((member) => !assignedVendorIds.has(member.id)),
    [assignedVendorIds, staff],
  );
  const categoryQueueMembers = useMemo(
    () =>
      teams
        .flatMap((team) =>
          team.members.map((member) => ({ ...member, teamId: team.id })),
        )
        .filter((member) => {
          const categories = member.user.vendor_categories?.length
            ? member.user.vendor_categories
            : member.user.vendor_category
              ? [member.user.vendor_category]
              : [];
          return categories.includes(queueCategory);
        })
        .sort(
          (a, b) =>
            (a.queue_positions?.[queueCategory] ??
              a.queue_position ??
              Number.MAX_SAFE_INTEGER) -
              (b.queue_positions?.[queueCategory] ??
                b.queue_position ??
                Number.MAX_SAFE_INTEGER) ||
            a.user.name.localeCompare(b.user.name, "pt-BR"),
        ),
    [queueCategory, teams],
  );
  const participantClients = useMemo(
    () =>
      allClients.filter((item) =>
        event?.participant_client_ids.includes(item.id),
      ),
    [allClients, event?.participant_client_ids],
  );

  const selectedClient = useMemo(
    () => client ?? participantClients[0] ?? null,
    [client, participantClients],
  );

  const staffById = useMemo(
    () => new Map(staff.map((member) => [member.id, member.name] as const)),
    [staff],
  );

  const vendorFilterOptions = useMemo(
    () => [
      { value: "all", label: "Todos os vendedores" },
      { value: "none", label: "Sem vendedor" },
      ...staff.map((member) => ({ value: member.id, label: member.name })),
    ],
    [staff],
  );

  const leadSourceOptions = useMemo(
    () => [
      { value: "all", label: "Todas as origens" },
      ...Object.entries(LEAD_SOURCE_LABELS).map(([value, label]) => ({
        value,
        label,
      })),
    ],
    [],
  );

  const leadStatusOptions = useMemo(
    () => [
      { value: "all", label: "Todos os status" },
      ...Object.entries(LEAD_STATUS_LABELS).map(([value, label]) => ({
        value,
        label,
      })),
    ],
    [],
  );

  const leadActionStatusOptions = useMemo(
    () =>
      Object.entries(LEAD_STATUS_LABELS).map(([value, label]) => ({
        value,
        label,
      })),
    [],
  );

  const filteredEventLeads = useMemo(() => {
    const q = leadSearch.trim().toLowerCase();
    return eventLeads
      .filter((lead) => {
        const matchesSearch =
          !q ||
          lead.name.toLowerCase().includes(q) ||
          lead.email.toLowerCase().includes(q) ||
          lead.phone.toLowerCase().includes(q) ||
          (lead.event_interest?.toLowerCase().includes(q) ?? false);
        const matchesStatus =
          leadStatusFilter === "all" ||
          lead.confirmation_status === leadStatusFilter;
        const matchesSource =
          leadSourceFilter === "all" || lead.source === leadSourceFilter;
        const matchesVendor =
          leadVendorFilter === "all"
            ? true
            : leadVendorFilter === "none"
              ? !lead.assigned_vendor_id
              : lead.assigned_vendor_id === leadVendorFilter;
        return matchesSearch && matchesStatus && matchesSource && matchesVendor;
      })
      .sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      );
  }, [
    eventLeads,
    leadSearch,
    leadSourceFilter,
    leadStatusFilter,
    leadVendorFilter,
  ]);

  const eventLeadsPageCount = Math.max(
    1,
    Math.ceil(filteredEventLeads.length / eventLeadsPageSize),
  );
  const pagedEventLeads = useMemo(() => {
    const start = (eventLeadsPage - 1) * eventLeadsPageSize;
    return filteredEventLeads.slice(start, start + eventLeadsPageSize);
  }, [eventLeadsPage, filteredEventLeads]);

  useEffect(() => {
    setEventLeadsPage(1);
  }, [leadSearch, leadStatusFilter, leadSourceFilter, leadVendorFilter]);

  useEffect(() => {
    if (eventLeadsPage > eventLeadsPageCount) {
      setEventLeadsPage(eventLeadsPageCount);
    }
  }, [eventLeadsPage, eventLeadsPageCount]);

  const eventSalesRevenue = useMemo(
    () => eventSales.reduce((total, sale) => total + Number(sale.value), 0),
    [eventSales],
  );

  const availableParticipantOptions = useMemo(
    () =>
      allClients.filter(
        (clientItem) => !event?.participant_client_ids.includes(clientItem.id),
      ),
    [allClients, event?.participant_client_ids],
  );
  const participantClientNameById = useMemo(
    () =>
      Object.fromEntries(
        participantClients.map(
          (clientItem) => [clientItem.id, clientItem.company_name] as const,
        ),
      ),
    [participantClients],
  );
  const availableVendorsByParticipant = useMemo(() => {
    const groups = new Map<string, StaffUser[]>();
    availableVendors.forEach((vendor) => {
      const key = vendor.client_id ?? "sem-cliente";
      const bucket = groups.get(key) ?? [];
      bucket.push(vendor);
      groups.set(key, bucket);
    });
    return Array.from(groups.entries()).map(([clientId, vendors]) => ({
      clientId,
      clientName:
        participantClientNameById[clientId] ?? "Empresa não identificada",
      vendors,
    }));
  }, [availableVendors, participantClientNameById]);

  const totalMembers = teams.reduce(
    (sum, team) => sum + team.members.length,
    0,
  );
  const leadConfirmationRate = event?.leads_count
    ? Math.min(
        100,
        Math.round((event.confirmed_count / event.leads_count) * 100),
      )
    : 0;
  const checkinRate = event?.leads_count
    ? Math.min(100, Math.round((event.checkin_count / event.leads_count) * 100))
    : 0;
  const capacityUsage = event?.capacity
    ? Math.min(100, Math.round((event.leads_count / event.capacity) * 100))
    : 0;
  const daysToEvent = event
    ? Math.ceil(
        (new Date(event.event_date).getTime() - Date.now()) /
          (1000 * 60 * 60 * 24),
      )
    : 0;
  const eventIsPublished = event?.status === "active";
  const eventIsArchived = event?.status === "completed";

  async function handleRefresh() {
    setRefreshing(true);
    try {
      await loadPage(false);
    } finally {
      setRefreshing(false);
    }
  }

  async function handleQuickStatusChange(nextStatus: Event["status"]) {
    if (!event) return;
    const session = readStoredSession();
    if (!session?.accessToken) return;

    setSettingsSaving(true);
    setSettingsError("");
    try {
      const saved = await updateEvent(
        event.id,
        { status: nextStatus },
        session.accessToken,
      );
      const mapped = mapApiEventToEvent(saved);
      setEvent(mapped);
      hydrateForm(mapped);
      setSettingsSuccess(
        nextStatus === "active"
          ? "Evento publicado com sucesso."
          : "Evento arquivado com sucesso.",
      );
      setTimeout(() => setSettingsSuccess(""), 3000);
    } catch (quickError) {
      setSettingsError(
        getErrorMessage(
          quickError,
          "Não foi possível alterar o status do evento.",
        ),
      );
    } finally {
      setSettingsSaving(false);
    }
  }

  async function handleSaveParticipants(nextParticipantIds: string[]) {
    if (!event) return;
    const session = readStoredSession();
    if (!session?.accessToken) return;
    if (nextParticipantIds.length === 0) {
      setSettingsError(
        "O evento precisa ter pelo menos um cliente participante.",
      );
      return;
    }

    setParticipantSaving(true);
    setSettingsError("");
    try {
      const saved = await updateEvent(
        event.id,
        {
          participant_client_ids: nextParticipantIds,
        },
        session.accessToken,
      );
      const mapped = mapApiEventToEvent(saved);
      setEvent(mapped);
      hydrateForm(mapped);
      setParticipantDraftId("");
      setClient(
        allClients.find(
          (item) => item.id === (nextParticipantIds[0] ?? mapped.client_id),
        ) ?? null,
      );
      setSettingsSuccess("Participantes do evento atualizados com sucesso.");

      setLeadsLoading(true);
      try {
        const page = await fetchLeadsPage(
          { event_id: mapped.id, take: 100 },
          session.accessToken,
        );
        setEventLeads(
          page.items
            .map(mapApiLeadToLead)
            .filter((lead) => lead.event_id === mapped.id),
        );
        setEventLeadsNextCursor(page.page_info.next_cursor);
        setEventLeadsHasNextPage(page.page_info.has_next_page);
      } finally {
        setLeadsLoading(false);
      }

      setTimeout(() => setSettingsSuccess(""), 3000);
    } catch (participantError) {
      setSettingsError(
        getErrorMessage(
          participantError,
          "Não foi possível atualizar os participantes do evento.",
        ),
      );
    } finally {
      setParticipantSaving(false);
    }
  }

  async function handleAddParticipant() {
    if (!event || !participantDraftId) return;
    await handleSaveParticipants(
      Array.from(
        new Set([...event.participant_client_ids, participantDraftId]),
      ),
    );
  }

  function handleRemoveParticipant(clientId: string) {
    const participant =
      allClients.find((item) => item.id === clientId) ??
      (client?.id === clientId ? client : null);
    if (!participant) return;

    setEventDeleteAction({ kind: "participant", client: participant });
  }

  function openLeadDrawer(
    lead: Lead,
    options: { tab?: LeadDrawerTab; mode?: LeadDrawerMode } = {},
  ) {
    setSelectedLead(lead);
    setLeadDrawerTab(options.tab ?? "dados");
    setLeadDrawerMode(options.mode ?? "view");
    setLeadDrawerStatus(lead.confirmation_status);
    setLeadDrawerVendorId(lead.assigned_vendor_id ?? "");
    setLeadDrawerName(lead.name ?? "");
    setLeadDrawerEmail(lead.email ?? "");
    setLeadDrawerPhone(lead.phone ?? "");
    const scheduledAt =
      lead.active_appointment?.scheduled_at ?? lead.store_visit_datetime ?? "";
    const matchingDay = (event?.event_days ?? []).find(
      (day) => Date.parse(day.start) === Date.parse(scheduledAt),
    );
    setLeadDrawerScheduledAt(matchingDay?.start ?? scheduledAt);
    setLeadDrawerMessage("");
    setLeadDrawerOpen(true);
  }

  function closeLeadDrawer() {
    setLeadDrawerOpen(false);
    setSelectedLead(null);
    setLeadDrawerMessage("");
  }

  useEffect(() => {
    if (!leadDrawerOpen || !selectedLead) return;

    const token = readStoredSession()?.accessToken;
    if (!token) {
      setLeadHistory([]);
      setLeadHistoryLoading(false);
      return;
    }

    let active = true;
    setLeadHistoryLoading(true);
    listLeadHistory(selectedLead.id, token)
      .then((items) => {
        if (!active) return;
        setLeadHistory(items);
      })
      .catch(() => {
        if (!active) return;
        setLeadHistory([]);
      })
      .finally(() => {
        if (!active) return;
        setLeadHistoryLoading(false);
      });

    return () => {
      active = false;
    };
  }, [leadDrawerOpen, selectedLead?.id]);

  async function handleSaveLeadQuickActions() {
    if (!selectedLead) return;
    const session = readStoredSession();
    if (!session?.accessToken) return;

    const normalizedName = leadDrawerName.trim();
    if (!normalizedName) {
      setLeadDrawerMessage("Informe o nome do lead.");
      return;
    }

    const configuredDays = event?.event_days ?? [];
    const selectedEventDay = configuredDays.find(
      (day) =>
        day.start === leadDrawerScheduledAt ||
        Date.parse(day.start) === Date.parse(leadDrawerScheduledAt),
    );
    const activeAppointment = selectedLead.active_appointment;
    const activeAt = activeAppointment
      ? Date.parse(activeAppointment.scheduled_at)
      : Number.NaN;
    const selectedAt = selectedEventDay
      ? Date.parse(selectedEventDay.start)
      : Number.NaN;
    const dateChanged = Boolean(
      activeAppointment && selectedEventDay && activeAt !== selectedAt,
    );

    if (activeAppointment && configuredDays.length > 0 && !selectedEventDay) {
      setLeadDrawerMessage("Selecione uma data válida cadastrada no evento.");
      return;
    }

    setLeadDrawerSaving(true);
    setLeadDrawerMessage("");
    try {
      await updateLead(
        selectedLead.id,
        {
          name: normalizedName,
          email: leadDrawerEmail.trim() || null,
          phone: leadDrawerPhone.trim() || null,
          confirmation_status: leadDrawerStatus,
          assigned_vendor_id:
            leadDrawerVendorId && leadDrawerVendorId !== "none"
              ? leadDrawerVendorId
              : null,
        },
        session.accessToken,
      );

      if (dateChanged && activeAppointment && selectedEventDay) {
        await rescheduleAppointment(session.accessToken, activeAppointment.id, {
          scheduled_at: selectedEventDay.start,
          timezone: "America/Sao_Paulo",
          notes: "Data alterada pelo gestor na ficha do lead.",
        });
      }

      const [freshLead, history] = await Promise.all([
        getLead(selectedLead.id, session.accessToken),
        listLeadHistory(selectedLead.id, session.accessToken),
      ]);
      const mapped = mapApiLeadToLead(freshLead);
      setEventLeads((current) =>
        current.map((lead) => (lead.id === mapped.id ? mapped : lead)),
      );
      setSelectedLead(mapped);
      setLeadDrawerStatus(mapped.confirmation_status);
      setLeadDrawerVendorId(mapped.assigned_vendor_id ?? "");
      setLeadDrawerName(mapped.name ?? "");
      setLeadDrawerEmail(mapped.email ?? "");
      setLeadDrawerPhone(mapped.phone ?? "");
      setLeadHistory(history);
      const refreshedScheduledAt =
        mapped.active_appointment?.scheduled_at ??
        mapped.store_visit_datetime ??
        "";
      const refreshedDay = (event?.event_days ?? []).find(
        (day) => Date.parse(day.start) === Date.parse(refreshedScheduledAt),
      );
      setLeadDrawerScheduledAt(refreshedDay?.start ?? refreshedScheduledAt);
      setLeadDrawerMode("view");
      setLeadDrawerMessage(
        dateChanged
          ? "Lead e data do evento atualizados com sucesso."
          : "Lead atualizado com sucesso.",
      );
      setTimeout(() => setLeadDrawerMessage(""), 3000);
    } catch (quickLeadError) {
      setLeadDrawerMessage(
        getErrorMessage(quickLeadError, "Não foi possível atualizar o lead."),
      );
    } finally {
      setLeadDrawerSaving(false);
    }
  }

  async function handleExportLeads() {
    if (!filteredEventLeads.length || !event) return;
    setExportingLeads(true);
    try {
      downloadCsv(
        `leads-evento-${event.name.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "evento"}.csv`,
        [
          [
            "Nome",
            "E-mail",
            "Telefone",
            "Fonte",
            "Status",
            "Vendedor",
            "Evento",
            "Criado em",
          ],
          ...filteredEventLeads.map((lead) => [
            lead.name,
            lead.email,
            lead.phone,
            LEAD_SOURCE_LABELS[lead.source] ?? lead.source,
            LEAD_STATUS_LABELS[lead.confirmation_status] ??
              lead.confirmation_status,
            lead.assigned_vendor_id
              ? (staffById.get(lead.assigned_vendor_id) ??
                lead.assigned_vendor_id)
              : "Sem vendedor",
            lead.event_interest || "",
            formatDateTime(lead.created_at),
          ]),
        ],
      );
    } finally {
      setExportingLeads(false);
    }
  }

  async function handleSelectFixedTeam(fixedTeam: {
    name: string;
    logoUrl: string;
  }) {
    if (!event?.id) return;
    const session = readStoredSession();
    if (!session?.accessToken) return;

    setTeamCreating(true);
    setSettingsError("");
    try {
      const created = await createSalesTeam(
        session.accessToken,
        event.id,
        fixedTeam.name,
      );
      const absoluteLogoUrl = new URL(
        fixedTeam.logoUrl,
        window.location.origin,
      ).toString();
      const withLogo = await updateSalesTeam(session.accessToken, created.id, {
        logo_url: absoluteLogoUrl,
      });
      setTeams((current) => [...current, { ...created, ...withLogo }]);
    } catch (teamError) {
      setSettingsError(
        getErrorMessage(teamError, "Não foi possível adicionar o time."),
      );
    } finally {
      setTeamCreating(false);
    }
  }

  function handleDeleteTeam(team: SalesTeam) {
    setEventDeleteAction({ kind: "team", team });
  }

  function handleEditTeam(team: SalesTeam) {
    setEditingTeam(team);
    setEditTeamName(team.name);
    setEditTeamLogo(team.logo_url ?? "");
    setEditTeamError("");
  }

  async function handleEditTeamFile(file: File | null) {
    if (!file) {
      setEditTeamLogo("");
      return;
    }
    if (!/^image\/(png|jpe?g|webp|gif|svg\+xml)$/i.test(file.type)) {
      setEditTeamError("Use uma imagem (PNG, JPG, WEBP, GIF ou SVG).");
      return;
    }
    // Limite alto no arquivo original: redimensionamos antes de enviar
    const MAX_INPUT_BYTES = 10_000_000;
    if (file.size > MAX_INPUT_BYTES) {
      setEditTeamError(
        `Imagem grande demais (${Math.round(file.size / 1024)}KB). Máximo 10MB.`,
      );
      return;
    }
    setEditTeamError("");
    try {
      const dataUrl = await resizeImageToDataUrl(file, {
        maxDimension: 512,
        quality: 0.85,
      });
      setEditTeamLogo(dataUrl);
    } catch (resizeError) {
      setEditTeamError(
        resizeError instanceof Error
          ? resizeError.message
          : "Não foi possível processar a imagem.",
      );
    }
  }

  async function handleSaveTeamEdit() {
    if (!editingTeam) return;
    const session = readStoredSession();
    if (!session?.accessToken) return;

    const trimmedName = editTeamName.trim();
    if (trimmedName.length < 2) {
      setEditTeamError("O nome precisa ter pelo menos 2 caracteres.");
      return;
    }

    setEditTeamSaving(true);
    setEditTeamError("");
    try {
      const updated = await updateSalesTeam(
        session.accessToken,
        editingTeam.id,
        {
          name: trimmedName,
          logo_url: editTeamLogo || null,
        },
      );
      setTeams((current) =>
        current.map((team) =>
          team.id === editingTeam.id ? { ...team, ...updated } : team,
        ),
      );
      setEditingTeam(null);
    } catch (saveErr) {
      setEditTeamError(
        getErrorMessage(saveErr, "Não foi possível salvar as alterações."),
      );
    } finally {
      setEditTeamSaving(false);
    }
  }

  async function handleAddMembers(teamId: string, userIds: string[]) {
    const session = readStoredSession();
    if (!session?.accessToken || userIds.length === 0) return;

    setMemberToggling(teamId);
    setSettingsError("");
    try {
      let updatedTeam: SalesTeam | null = null;
      for (const userId of userIds) {
        updatedTeam = await addTeamMember(session.accessToken, teamId, userId);
      }
      if (updatedTeam) {
        const finalTeam = updatedTeam;
        setTeams((current) =>
          current.map((team) => (team.id === teamId ? finalTeam : team)),
        );
      }
      setAddMemberTeamId(null);
      setSelectedMemberIds([]);
    } catch (teamError) {
      setSettingsError(
        getErrorMessage(teamError, "Não foi possível adicionar os vendedores."),
      );
    } finally {
      setMemberToggling(null);
    }
  }

  async function handleReorderCategoryMember(
    memberId: string,
    direction: -1 | 1,
  ) {
    const currentCategoryIndex = categoryQueueMembers.findIndex(
      (member) => member.user_id === memberId,
    );
    const nextCategoryIndex = currentCategoryIndex + direction;
    if (
      currentCategoryIndex < 0 ||
      nextCategoryIndex < 0 ||
      nextCategoryIndex >= categoryQueueMembers.length
    )
      return;
    const orderedCategoryMembers = [...categoryQueueMembers];
    [
      orderedCategoryMembers[currentCategoryIndex],
      orderedCategoryMembers[nextCategoryIndex],
    ] = [
      orderedCategoryMembers[nextCategoryIndex],
      orderedCategoryMembers[currentCategoryIndex],
    ];
    const categoryOrder = new Map(
      orderedCategoryMembers.map((member, position) => [
        member.user_id,
        position,
      ]),
    );
    const session = readStoredSession();
    if (!session?.accessToken) return;
    const previousTeams = teams;
    setSettingsError("");
    setSettingsSuccess("");
    setQueueSaving(memberId);
    setTeams((current) =>
      current.map((team) => ({
        ...team,
        members: team.members.map((member) =>
          categoryOrder.has(member.user_id)
            ? {
                ...member,
                queue_positions: {
                  ...(member.queue_positions ?? {}),
                  [queueCategory]: categoryOrder.get(member.user_id)!,
                },
              }
            : member,
        ),
      })),
    );
    try {
      await reorderTeamMembers(
        session.accessToken,
        orderedCategoryMembers[0].teamId,
        orderedCategoryMembers.map((member) => member.user_id),
        queueCategory,
      );
      const confirmedTeams = await listSalesTeams(session.accessToken, eventId);
      setTeams(confirmedTeams);
      setSettingsSuccess("Ordem da fila salva com sucesso.");
      window.setTimeout(() => setSettingsSuccess(""), 3500);
    } catch (queueError) {
      setTeams(previousTeams);
      setSettingsError(
        getErrorMessage(queueError, "Não foi possível salvar a ordem da fila."),
      );
    } finally {
      setQueueSaving(null);
    }
  }

  function handleRemoveMember(team: SalesTeam, member: TeamMemberUser) {
    setEventDeleteAction({ kind: "member", team, member });
  }

  async function performRemoveParticipant(clientId: string) {
    if (!event) return;
    await handleSaveParticipants(
      event.participant_client_ids.filter(
        (participantId) => participantId !== clientId,
      ),
    );
  }

  async function performDeleteTeam(teamId: string) {
    const session = readStoredSession();
    if (!session?.accessToken) return;

    setTeamDeleting(teamId);
    setSettingsError("");
    try {
      await deleteSalesTeam(session.accessToken, teamId);
      setTeams((current) => current.filter((team) => team.id !== teamId));
    } catch (teamError) {
      setSettingsError(
        getErrorMessage(teamError, "Não foi possível excluir o time."),
      );
    } finally {
      setTeamDeleting(null);
    }
  }

  async function performRemoveMember(teamId: string, userId: string) {
    const session = readStoredSession();
    if (!session?.accessToken) return;

    setMemberToggling(userId);
    setSettingsError("");
    try {
      const updated = await removeTeamMember(
        session.accessToken,
        teamId,
        userId,
      );
      setTeams((current) =>
        current.map((team) => (team.id === teamId ? updated : team)),
      );
    } catch (teamError) {
      setSettingsError(
        getErrorMessage(teamError, "Não foi possível remover o vendedor."),
      );
    } finally {
      setMemberToggling(null);
    }
  }

  async function confirmEventDeleteAction() {
    if (!eventDeleteAction) return;

    setEventDeleteActionLoading(true);
    try {
      if (eventDeleteAction.kind === "participant") {
        await performRemoveParticipant(eventDeleteAction.client.id);
      } else if (eventDeleteAction.kind === "team") {
        await performDeleteTeam(eventDeleteAction.team.id);
      } else {
        await performRemoveMember(
          eventDeleteAction.team.id,
          eventDeleteAction.member.id,
        );
      }
    } finally {
      setEventDeleteActionLoading(false);
      setEventDeleteAction(null);
    }
  }

  async function handleSaveSettings(eventForm: FormEvent<HTMLFormElement>) {
    eventForm.preventDefault();

    if (!event) return;
    const session = readStoredSession();
    if (!session?.accessToken) {
      setSettingsError("Faça login novamente para salvar.");
      return;
    }

    if (!formName.trim()) {
      setSettingsError("Informe o nome do evento.");
      return;
    }
    if (!formEventDate) {
      setSettingsError("Informe a data do evento.");
      return;
    }

    const hasCapacity = formCapacity.trim().length > 0;
    const capacityNumber = Number(formCapacity);
    if (
      hasCapacity &&
      (!Number.isFinite(capacityNumber) || capacityNumber < 0)
    ) {
      setSettingsError("A capacidade precisa ser um número válido.");
      return;
    }

    const trimmedSalesTarget = formSalesTarget.trim();
    const hasSalesTarget = trimmedSalesTarget.length > 0;
    const salesTargetNumber = Number(trimmedSalesTarget);
    if (
      hasSalesTarget &&
      (!Number.isFinite(salesTargetNumber) || salesTargetNumber < 1)
    ) {
      setSettingsError(
        "A meta de vendas precisa ser um número inteiro positivo.",
      );
      return;
    }

    setSettingsSaving(true);
    setSettingsError("");
    setSettingsSuccess("");

    try {
      const saved = await updateEvent(
        event.id,
        {
          name: formName.trim(),
          event_type: formEventType.trim() || null,
          description: formDescription.trim() || null,
          launch_date: formLaunchDate || null,
          event_date: new Date(formEventDate).toISOString(),
          event_end_date: formEventEndDate
            ? new Date(formEventEndDate).toISOString()
            : null,
          location: formLocation.trim() || null,
          capacity: hasCapacity ? capacityNumber : null,
          sales_target: hasSalesTarget ? salesTargetNumber : null,
          scheduled_target: formScheduledTarget.trim()
            ? Number(formScheduledTarget.replace(",", "."))
            : null,
          total_investment: formTotalInvestment.trim()
            ? Number(formTotalInvestment.replace(",", "."))
            : null,
          paid_traffic_investment: formPaidTraffic.trim()
            ? Number(formPaidTraffic.replace(",", "."))
            : null,
          status: formStatus,
          require_wristband: formRequireWristband,
        },
        session.accessToken,
      );

      const mapped = mapApiEventToEvent(saved);
      setEvent(mapped);
      hydrateForm(mapped);
      setSettingsSuccess("Configurações salvas com sucesso.");
      setTimeout(() => setSettingsSuccess(""), 3000);
    } catch (saveError) {
      setSettingsError(
        getErrorMessage(saveError, "Não foi possível salvar o evento."),
      );
    } finally {
      setSettingsSaving(false);
    }
  }

  async function handleDeleteEvent() {
    setEventDeleteOpen(true);
  }

  async function performDeleteEvent() {
    if (!event) return;
    const session = readStoredSession();
    if (!session?.accessToken) return;

    setSettingsDeleting(true);
    setSettingsError("");
    try {
      await deleteEvent(event.id, session.accessToken);
      navigate("/gestor/eventos");
    } catch (deleteError) {
      setSettingsError(
        getErrorMessage(deleteError, "Não foi possível excluir o evento."),
      );
    } finally {
      setSettingsDeleting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center text-sm text-zinc-500">
        Carregando evento...
      </div>
    );
  }

  if (error || !event) {
    return (
      <div className="space-y-4">
        <PageHeader
          title="Evento"
          subtitle="Detalhes do evento"
          breadcrumbs={[{ label: "Gestor" }, { label: "Eventos" }]}
          dark={isDarkMode}
        />
        <Notice tone="error">{error || "Evento não encontrado."}</Notice>
        <Button
          variant="secondary"
          onClick={() => navigate("/gestor/eventos")}
          icon={<ArrowLeft size={16} />}
        >
          Voltar para eventos
        </Button>
      </div>
    );
  }

  return (
    <div className={clsx("space-y-6", isDarkMode && "dashboard-dark bg-black")}>
      <PageHeader
        breadcrumbs={[
          { label: "Gestor", href: "/gestor/dashboard" },
          { label: "Eventos", href: "/gestor/eventos" },
          { label: event.name },
        ]}
        dark={isDarkMode}
        actions={
          <>
            <Button
              variant="ghost"
              size="icon"
              title="Modo TV"
              aria-label="Modo TV"
              onClick={() =>
                window.open(`/eventos/${event.id}/tv`, "_blank", "noopener")
              }
            >
              <Tv size={16} />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              title="Fila modo TV"
              aria-label="Fila modo TV"
              onClick={() =>
                window.open(
                  `/eventos/${event.id}/tv-fila`,
                  "_blank",
                  "noopener",
                )
              }
            >
              <Tv size={16} />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              title="Atualizar"
              aria-label="Atualizar"
              loading={refreshing}
              onClick={() => void handleRefresh()}
            >
              <RefreshCcw size={16} />
            </Button>
            {!eventIsPublished ? (
              <Button
                icon={<ArrowUpRight size={16} />}
                loading={settingsSaving}
                onClick={() => void handleQuickStatusChange("active")}
              >
                Publicar
              </Button>
            ) : (
              <Button
                variant="secondary"
                icon={<Settings size={16} />}
                loading={settingsSaving}
                onClick={() => void handleQuickStatusChange("completed")}
              >
                Arquivar
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              title="Voltar"
              aria-label="Voltar"
              onClick={() => navigate("/gestor/eventos")}
            >
              <ArrowLeft size={16} />
            </Button>
          </>
        }
      />

      <Card
        className={clsx(
          "rounded-[28px] border",
          isDarkMode ? "border-zinc-800 bg-[#0f0f0f]" : "border-white/80",
        )}
        padding="lg"
      >
        <div className="flex flex-wrap items-center gap-2">
          <EventStatusBadge status={event.status} />
          <Badge>
            {daysToEvent >= 0
              ? `${daysToEvent} dias para o evento`
              : "Evento passado"}
          </Badge>
        </div>

        <h2
          className={clsx(
            "mt-3 text-2xl font-black tracking-tight",
            isDarkMode ? "text-zinc-100" : "text-zinc-950",
          )}
        >
          {event.name}
        </h2>

        <div className="mt-2 flex flex-wrap items-center gap-2">
          <CopyableId value={event.id} label="event_id" dark={isDarkMode} />
        </div>

        <div className="mt-5 flex flex-wrap gap-2 text-sm">
          <div
            className={clsx(
              "inline-flex items-center gap-2 rounded-full px-3.5 py-1.5",
              isDarkMode
                ? "bg-[#171717] text-zinc-300"
                : "bg-zinc-100 text-zinc-700",
            )}
          >
            <CalendarDays size={14} className="text-[#FF0636]" />
            {formatDateTime(event.event_date)}
          </div>
          <div
            className={clsx(
              "inline-flex items-center gap-2 rounded-full px-3.5 py-1.5",
              isDarkMode
                ? "bg-[#171717] text-zinc-300"
                : "bg-zinc-100 text-zinc-700",
            )}
          >
            <MapPin size={14} className="text-[#3D56A2]" />
            {event.location || "Local não informado"}
          </div>
          <div
            className={clsx(
              "inline-flex items-center gap-2 rounded-full px-3.5 py-1.5",
              isDarkMode
                ? "bg-[#171717] text-zinc-300"
                : "bg-zinc-100 text-zinc-700",
            )}
          >
            <Building2 size={14} className="text-[#FBBB49]" />
            {selectedClient?.company_name ?? "Cliente"}
          </div>
          {event.capacity != null && (
            <div
              className={clsx(
                "inline-flex items-center gap-2 rounded-full px-3.5 py-1.5",
                isDarkMode
                  ? "bg-[#171717] text-zinc-300"
                  : "bg-zinc-100 text-zinc-700",
              )}
            >
              <Users size={14} className="text-emerald-500" />
              {event.leads_count}/{event.capacity} lugares ({capacityUsage}%)
            </div>
          )}
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            title="Leads"
            value={event.leads_count}
            tone="rose"
            dark={isDarkMode}
          />
          <MetricCard
            title="Confirmados"
            value={event.confirmed_count}
            helper={`${leadConfirmationRate}%`}
            tone="blue"
            dark={isDarkMode}
          />
          <MetricCard
            title="Check-ins"
            value={event.checkin_count}
            helper={`${checkinRate}%`}
            tone="amber"
            dark={isDarkMode}
          />
          <MetricCard
            title="Time"
            value={totalMembers}
            helper={`${teams.length} time${teams.length !== 1 ? "s" : ""}`}
            tone="emerald"
            dark={isDarkMode}
          />
        </div>
      </Card>

      <Tabs
        tabs={
          user.role === "gestor"
            ? EVENT_TABS
            : EVENT_TABS.filter((tab) => tab.id !== "fila")
        }
        active={activeTab}
        onChange={(tab) => setActiveTab(tab as EventDetailTab)}
      />

      {loadWarning && <Notice tone="error">{loadWarning}</Notice>}
      {settingsError && <Notice tone="error">{settingsError}</Notice>}
      {settingsSuccess && <Notice tone="success">{settingsSuccess}</Notice>}

      {activeTab === "dados" && (
        <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <Card
            className={clsx(
              "rounded-[28px] border",
              isDarkMode
                ? "border-zinc-800 bg-[#111111]"
                : "border-zinc-100 bg-white",
            )}
            padding="lg"
          >
            <h3
              className={clsx(
                "text-lg font-black tracking-tight",
                isDarkMode ? "text-zinc-100" : "text-zinc-950",
              )}
            >
              Dados do evento
            </h3>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <div className="space-y-1">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-400">
                  Nome
                </p>
                <p
                  className={clsx(
                    "text-sm font-semibold",
                    isDarkMode ? "text-zinc-100" : "text-zinc-900",
                  )}
                >
                  {event.name}
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-400">
                  Status
                </p>
                <EventStatusBadge status={event.status} />
              </div>
              <div className="space-y-1">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-400">
                  Tipo
                </p>
                <p
                  className={clsx(
                    "text-sm font-semibold",
                    isDarkMode ? "text-zinc-100" : "text-zinc-900",
                  )}
                >
                  {event.event_type || "Não informado"}
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-400">
                  Local
                </p>
                <p
                  className={clsx(
                    "text-sm font-semibold",
                    isDarkMode ? "text-zinc-100" : "text-zinc-900",
                  )}
                >
                  {event.location || "Não informado"}
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-400">
                  Capacidade
                </p>
                <p
                  className={clsx(
                    "text-sm font-semibold",
                    isDarkMode ? "text-zinc-100" : "text-zinc-900",
                  )}
                >
                  {event.capacity != null
                    ? `${event.capacity} lugares`
                    : "Não informada"}
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-400">
                  Meta de vendas
                </p>
                <p
                  className={clsx(
                    "text-sm font-semibold",
                    isDarkMode ? "text-zinc-100" : "text-zinc-900",
                  )}
                >
                  {event.sales_target != null
                    ? event.sales_target
                    : "Não informada"}
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-400">
                  Pulseira obrigatória
                </p>
                <p
                  className={clsx(
                    "text-sm font-semibold",
                    isDarkMode ? "text-zinc-100" : "text-zinc-900",
                  )}
                >
                  {event.require_wristband ? "Sim" : "Não"}
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-400">
                  Data do evento
                </p>
                <p
                  className={clsx(
                    "text-sm font-semibold",
                    isDarkMode ? "text-zinc-100" : "text-zinc-900",
                  )}
                >
                  {formatDateTime(event.event_date)}
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-400">
                  Lançamento
                </p>
                <p
                  className={clsx(
                    "text-sm font-semibold",
                    isDarkMode ? "text-zinc-100" : "text-zinc-900",
                  )}
                >
                  {formatDateTime(event.launch_date)}
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-400">
                  Término
                </p>
                <p
                  className={clsx(
                    "text-sm font-semibold",
                    isDarkMode ? "text-zinc-100" : "text-zinc-900",
                  )}
                >
                  {formatDateTime(event.event_end_date)}
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-400">
                  Criado em
                </p>
                <p
                  className={clsx(
                    "text-sm font-semibold",
                    isDarkMode ? "text-zinc-100" : "text-zinc-900",
                  )}
                >
                  {formatDateTime(event.created_at)}
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-400">
                  Atualizado em
                </p>
                <p
                  className={clsx(
                    "text-sm font-semibold",
                    isDarkMode ? "text-zinc-100" : "text-zinc-900",
                  )}
                >
                  {formatDateTime(event.updated_at)}
                </p>
              </div>
              <div className="sm:col-span-2 space-y-1">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-400">
                  Descrição
                </p>
                <p
                  className={clsx(
                    "text-sm leading-6",
                    isDarkMode ? "text-zinc-300" : "text-zinc-600",
                  )}
                >
                  {event.description || "Sem descrição cadastrada."}
                </p>
              </div>
            </div>
          </Card>

          <div className="space-y-6">
            <Card
              className={clsx(
                "rounded-[28px] border",
                isDarkMode
                  ? "border-zinc-800 bg-[#111111]"
                  : "border-zinc-100 bg-white",
              )}
              padding="lg"
            >
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <h3
                    className={clsx(
                      "text-lg font-black tracking-tight",
                      isDarkMode ? "text-zinc-100" : "text-zinc-950",
                    )}
                  >
                    Clientes participantes
                  </h3>
                </div>
                <div className="w-full max-w-sm">
                  <div className="flex gap-2">
                    <Select
                      options={availableParticipantOptions.map((item) => ({
                        value: item.id,
                        label: item.company_name,
                      }))}
                      placeholder="Adicionar participante"
                      value={participantDraftId}
                      onChange={(changeEvent) =>
                        setParticipantDraftId(changeEvent.target.value)
                      }
                      dark={isDarkMode}
                    />
                    <Button
                      icon={<Plus size={16} />}
                      loading={participantSaving}
                      isDisabled={!participantDraftId}
                      onClick={() => void handleAddParticipant()}
                    >
                      Adicionar
                    </Button>
                  </div>
                </div>
              </div>
              {participantClients.length === 0 ? (
                <p className="mt-4 text-sm text-zinc-500">
                  Nenhum cliente participante vinculado.
                </p>
              ) : (
                <div className="mt-4 space-y-2">
                  {participantClients.map((item) => (
                    <div
                      key={item.id}
                      className={clsx(
                        "flex items-center justify-between rounded-2xl border px-3 py-2",
                        isDarkMode
                          ? "border-zinc-800 bg-[#0b0b0b]"
                          : "border-zinc-100 bg-zinc-50",
                      )}
                    >
                      <div>
                        <span
                          className={clsx(
                            "text-sm font-medium",
                            isDarkMode ? "text-zinc-200" : "text-zinc-700",
                          )}
                        >
                          {item.company_name}
                        </span>
                        <p className="text-xs text-zinc-500">
                          {item.id === event.participant_client_ids[0]
                            ? "Âncora técnica"
                            : "Participante"}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge>{item.plan}</Badge>
                        <Button
                          variant="ghost"
                          size="sm"
                          loading={participantSaving}
                          isDisabled={participantClients.length === 1}
                          icon={<Trash2 size={14} />}
                          onClick={() => void handleRemoveParticipant(item.id)}
                        >
                          Remover
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>
        </div>
      )}

      {activeTab === "leads" && (
        <Card
          className={clsx(
            "rounded-[28px] border",
            isDarkMode
              ? "border-zinc-800 bg-[#111111]"
              : "border-zinc-100 bg-white",
          )}
          padding="lg"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3
                className={clsx(
                  "text-lg font-black tracking-tight",
                  isDarkMode ? "text-zinc-100" : "text-zinc-950",
                )}
              >
                Leads vinculados ao evento
              </h3>
              <p
                className={clsx(
                  "mt-1 text-sm",
                  isDarkMode ? "text-zinc-400" : "text-zinc-500",
                )}
              >
                {filteredEventLeads.length === 0
                  ? "Nenhum lead encontrado"
                  : `Mostrando ${(eventLeadsPage - 1) * eventLeadsPageSize + 1}–${Math.min(eventLeadsPage * eventLeadsPageSize, filteredEventLeads.length)} de ${filteredEventLeads.length} leads carregados`}
              </p>
            </div>
            <Button
              type="button"
              variant="secondary"
              loading={exportingLeads}
              isDisabled={!filteredEventLeads.length}
              icon={<Download size={16} />}
              onClick={() => void handleExportLeads()}
            >
              Exportar CSV
            </Button>
          </div>

          {leadsLoading ? (
            <p className="py-8 text-center text-sm text-zinc-400">
              Carregando leads...
            </p>
          ) : (
            <>
              <div
                className={clsx(
                  "mt-5 grid gap-3 rounded-[24px] border p-4 lg:grid-cols-[1.4fr_0.8fr_0.8fr_0.8fr]",
                  isDarkMode
                    ? "border-zinc-800 bg-[#0b0b0b]"
                    : "border-zinc-100 bg-zinc-50",
                )}
              >
                <div className="space-y-1.5">
                  <label
                    className={clsx(
                      "text-xs font-semibold uppercase tracking-[0.16em]",
                      isDarkMode ? "text-zinc-500" : "text-zinc-500",
                    )}
                  >
                    Buscar
                  </label>
                  <div
                    className={clsx(
                      "flex items-center gap-2 rounded-2xl border px-3 py-2.5",
                      isDarkMode
                        ? "border-zinc-700 bg-[#111111]"
                        : "border-zinc-200 bg-white",
                    )}
                  >
                    <Search size={16} className="text-zinc-400" />
                    <input
                      type="text"
                      value={leadSearch}
                      onChange={(e) => setLeadSearch(e.target.value)}
                      placeholder="Nome, e-mail, telefone ou interesse"
                      className={clsx(
                        "w-full bg-transparent text-sm outline-none",
                        isDarkMode
                          ? "text-zinc-100 placeholder:text-zinc-500"
                          : "text-zinc-900 placeholder:text-zinc-400",
                      )}
                    />
                  </div>
                </div>
                <Select
                  label="Status"
                  dark={isDarkMode}
                  value={leadStatusFilter}
                  onChange={(e) =>
                    setLeadStatusFilter(
                      e.target.value as "all" | ConfirmationStatus,
                    )
                  }
                  options={leadStatusOptions}
                />
                <Select
                  label="Origem"
                  dark={isDarkMode}
                  value={leadSourceFilter}
                  onChange={(e) =>
                    setLeadSourceFilter(e.target.value as "all" | LeadSource)
                  }
                  options={leadSourceOptions}
                />
                <Select
                  label="Vendedor"
                  dark={isDarkMode}
                  value={leadVendorFilter}
                  onChange={(e) => setLeadVendorFilter(e.target.value)}
                  options={vendorFilterOptions}
                />
              </div>

              {filteredEventLeads.length === 0 ? (
                <div
                  className={clsx(
                    "mt-5 rounded-[22px] border border-dashed p-8 text-center text-sm",
                    isDarkMode
                      ? "border-zinc-700 text-zinc-500"
                      : "border-zinc-200 text-zinc-500",
                  )}
                >
                  Nenhum lead encontrado com os filtros atuais.
                </div>
              ) : (
                <div className="mt-5 overflow-hidden rounded-[24px] border border-zinc-100">
                  <table className="w-full text-left text-sm">
                    <thead
                      className={clsx(
                        isDarkMode
                          ? "bg-[#0b0b0b] text-zinc-400"
                          : "bg-zinc-50 text-zinc-500",
                      )}
                    >
                      <tr>
                        <th className="px-4 py-3">Lead</th>
                        <th className="px-4 py-3">Fonte</th>
                        <th className="px-4 py-3">Status</th>
                        <th className="px-4 py-3">Vendedor</th>
                        <th className="px-4 py-3">Criado em</th>
                        <th className="px-4 py-3 text-right">Ações</th>
                      </tr>
                    </thead>
                    <tbody
                      className={clsx(
                        "divide-y",
                        isDarkMode ? "divide-zinc-800" : "divide-zinc-100",
                      )}
                    >
                      {pagedEventLeads.map((lead) => (
                        <tr
                          key={lead.id}
                          className={clsx(
                            "cursor-pointer",
                            isDarkMode
                              ? "hover:bg-[#0b0b0b]"
                              : "hover:bg-zinc-50",
                          )}
                          onClick={() =>
                            openLeadDrawer(lead, { tab: "dados", mode: "view" })
                          }
                        >
                          <td className="px-4 py-3">
                            <div className="space-y-1">
                              <p
                                className={clsx(
                                  "font-semibold",
                                  isDarkMode
                                    ? "text-zinc-100"
                                    : "text-zinc-900",
                                )}
                              >
                                {lead.name}
                              </p>
                              <div className="flex flex-wrap items-center gap-3 text-xs text-zinc-400">
                                <span>{lead.email || "Sem e-mail"}</span>
                                {lead.phone && <span>{lead.phone}</span>}
                                {lead.event_interest && (
                                  <span>{lead.event_interest}</span>
                                )}
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <SourceBadge source={lead.source} />
                          </td>
                          <td className="px-4 py-3">
                            <ConfirmationBadge
                              status={lead.confirmation_status}
                            />
                          </td>
                          <td className="px-4 py-3 text-zinc-500">
                            {lead.assigned_vendor_id
                              ? (staffById.get(lead.assigned_vendor_id) ??
                                lead.assigned_vendor_id)
                              : "Sem vendedor"}
                          </td>
                          <td className="px-4 py-3 text-zinc-500">
                            {formatDateTime(lead.created_at)}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex justify-end gap-2">
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                icon={<Eye size={14} />}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openLeadDrawer(lead, {
                                    tab: "dados",
                                    mode: "view",
                                  });
                                }}
                              >
                                Visualizar
                              </Button>
                              <button
                                type="button"
                                aria-label={`Editar ${lead.name}`}
                                title="Editar lead"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openLeadDrawer(lead, {
                                    tab: "dados",
                                    mode: "edit",
                                  });
                                }}
                                className={clsx(
                                  "inline-flex h-9 w-9 items-center justify-center rounded-xl border transition-colors",
                                  isDarkMode
                                    ? "border-zinc-700 text-zinc-300 hover:border-[#FF0636] hover:bg-[#FF0636]/10 hover:text-[#FF0636]"
                                    : "border-zinc-200 text-zinc-600 hover:border-[#FF0636] hover:bg-red-50 hover:text-[#FF0636]",
                                )}
                              >
                                <Pencil size={15} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {filteredEventLeads.length > 0 && (
                <div
                  className={clsx(
                    "mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border px-3 py-2",
                    isDarkMode
                      ? "border-zinc-800 bg-[#0b0b0b]"
                      : "border-zinc-100 bg-zinc-50",
                  )}
                >
                  <p className="text-xs text-zinc-500">
                    Página {eventLeadsPage} de {eventLeadsPageCount}
                  </p>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      icon={<ChevronLeft size={15} />}
                      isDisabled={eventLeadsPage <= 1}
                      onClick={() =>
                        setEventLeadsPage((page) => Math.max(1, page - 1))
                      }
                    >
                      Anterior
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      icon={<ChevronRight size={15} />}
                      isDisabled={eventLeadsPage >= eventLeadsPageCount}
                      onClick={() =>
                        setEventLeadsPage((page) =>
                          Math.min(eventLeadsPageCount, page + 1),
                        )
                      }
                    >
                      Próxima
                    </Button>
                  </div>
                </div>
              )}
              {eventLeadsHasNextPage && (
                <div className="mt-3 flex justify-center">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    loading={eventLeadsLoadingMore}
                    onClick={() => void loadMoreEventLeads()}
                  >
                    Carregar mais 100 leads
                  </Button>
                </div>
              )}
            </>
          )}
        </Card>
      )}

      {activeTab === "vendas" && (
        <div className="space-y-5">
          <div
            className={clsx(
              "inline-flex rounded-2xl border p-1",
              isDarkMode
                ? "border-zinc-800 bg-[#111111]"
                : "border-zinc-200 bg-zinc-50",
            )}
          >
            <button
              type="button"
              onClick={() => setSalesView("completed")}
              className={clsx(
                "rounded-xl px-5 py-2.5 text-sm font-bold transition",
                salesView === "completed"
                  ? "bg-red-500 text-white shadow-sm"
                  : "text-zinc-500 hover:text-zinc-900",
              )}
            >
              Vendas ({eventSales.length})
            </button>
            <button
              type="button"
              onClick={() => setSalesView("pending")}
              className={clsx(
                "rounded-xl px-5 py-2.5 text-sm font-bold transition",
                salesView === "pending"
                  ? "bg-amber-500 text-zinc-950 shadow-sm"
                  : "text-zinc-500 hover:text-zinc-900",
              )}
            >
              Vendas sem dar baixa ({pendingEventSales.length})
            </button>
          </div>

          {salesView === "completed" ? (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <MetricCard
                  title="Vendas realizadas"
                  value={eventSales.length}
                  helper="Registros deste evento"
                  tone="rose"
                  dark={isDarkMode}
                />
                <MetricCard
                  title="Valor vendido"
                  value={formatCurrency(eventSalesRevenue)}
                  helper="Faturamento registrado"
                  tone="emerald"
                  dark={isDarkMode}
                />
              </div>

              <Card
                className={clsx(
                  "rounded-[28px] border",
                  isDarkMode
                    ? "border-zinc-800 bg-[#111111]"
                    : "border-zinc-100 bg-white",
                )}
                padding="lg"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3
                      className={clsx(
                        "text-lg font-black tracking-tight",
                        isDarkMode ? "text-zinc-100" : "text-zinc-950",
                      )}
                    >
                      Vendas do evento
                    </h3>
                    <p className="mt-1 text-sm text-zinc-500">
                      Cliente, vendedor, veículo, pedido e valor de cada venda.
                    </p>
                  </div>
                  <Badge>{eventSales.length} vendas</Badge>
                </div>

                {salesLoading ? (
                  <p className="py-10 text-center text-sm text-zinc-400">
                    Carregando vendas...
                  </p>
                ) : eventSales.length === 0 ? (
                  <div
                    className={clsx(
                      "mt-5 rounded-[22px] border border-dashed p-10 text-center",
                      isDarkMode
                        ? "border-zinc-700 text-zinc-500"
                        : "border-zinc-200 text-zinc-500",
                    )}
                  >
                    <ShoppingCart className="mx-auto mb-3" size={30} />
                    <p className="font-semibold">Nenhuma venda registrada</p>
                    <p className="mt-1 text-sm">
                      As vendas rápidas e as vendas dos vendedores aparecerão
                      aqui.
                    </p>
                  </div>
                ) : (
                  <div
                    className={clsx(
                      "mt-5 overflow-x-auto rounded-[24px] border",
                      isDarkMode ? "border-zinc-800" : "border-zinc-100",
                    )}
                  >
                    <table className="min-w-[960px] w-full text-left text-sm">
                      <thead
                        className={clsx(
                          "text-xs uppercase tracking-[0.14em]",
                          isDarkMode
                            ? "bg-[#0b0b0b] text-zinc-500"
                            : "bg-zinc-50 text-zinc-500",
                        )}
                      >
                        <tr>
                          <th className="px-5 py-4">Comprador</th>
                          <th className="px-5 py-4">Vendedor</th>
                          <th className="px-5 py-4">Time</th>
                          <th className="px-5 py-4">Carro</th>
                          <th className="px-5 py-4">Pedido</th>
                          <th className="px-5 py-4">Data</th>
                          <th className="px-5 py-4 text-right">Valor</th>
                          <th className="px-5 py-4 text-right">Ações</th>
                        </tr>
                      </thead>
                      <tbody
                        className={
                          isDarkMode
                            ? "divide-y divide-zinc-800"
                            : "divide-y divide-zinc-100"
                        }
                      >
                        {eventSales.map((sale) => (
                          <tr
                            key={sale.id}
                            className={clsx(
                              "transition-colors",
                              isDarkMode
                                ? "hover:bg-white/[0.03]"
                                : "hover:bg-zinc-50",
                            )}
                          >
                            <td className="px-5 py-4">
                              <p
                                className={clsx(
                                  "font-bold",
                                  isDarkMode
                                    ? "text-zinc-100"
                                    : "text-zinc-900",
                                )}
                              >
                                {sale.lead?.name ?? "Cliente não informado"}
                              </p>
                              <p className="mt-0.5 text-xs text-zinc-500">
                                {sale.lead?.phone ?? "Sem telefone"}
                              </p>
                            </td>
                            <td className="px-5 py-4 font-medium">
                              {sale.vendor.name}
                            </td>
                            <td className="px-5 py-4 text-zinc-500">
                              {sale.team?.name ?? "Sem time"}
                            </td>
                            <td className="px-5 py-4">
                              <p className="font-medium">{sale.product}</p>
                              <p className="mt-0.5 text-xs text-zinc-500">
                                {sale.type.replace(/_/g, " ")}
                              </p>
                            </td>
                            <td className="px-5 py-4 font-mono text-xs">
                              {sale.order_number || "—"}
                            </td>
                            <td className="px-5 py-4 text-zinc-500">
                              {formatDateTime(sale.sold_at)}
                            </td>
                            <td className="px-5 py-4 text-right font-black text-emerald-500">
                              {formatCurrency(sale.value)}
                            </td>
                            <td className="px-5 py-4">
                              <div className="flex justify-end gap-2">
                                <button
                                  type="button"
                                  onClick={() => openSaleEditor(sale)}
                                  className="rounded-lg border border-zinc-200 p-2 text-zinc-500 transition hover:border-zinc-400 hover:text-zinc-900 dark:border-zinc-700 dark:hover:text-white"
                                  title="Editar venda"
                                  aria-label={`Editar venda de ${sale.lead?.name ?? "cliente"}`}
                                >
                                  <Pencil size={16} />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSaleActionError("");
                                    setSaleDeleteTarget(sale);
                                  }}
                                  className="rounded-lg border border-rose-200 p-2 text-rose-500 transition hover:bg-rose-50 dark:border-rose-900/60 dark:hover:bg-rose-950/30"
                                  title="Excluir venda"
                                  aria-label={`Excluir venda de ${sale.lead?.name ?? "cliente"}`}
                                >
                                  <Trash2 size={16} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>
            </>
          ) : (
            <Card
              className={clsx(
                "rounded-[28px] border",
                isDarkMode
                  ? "border-zinc-800 bg-[#111111]"
                  : "border-zinc-100 bg-white",
              )}
              padding="lg"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-lg font-black tracking-tight">
                    Clientes que informaram compra
                  </h3>
                  <p className="mt-1 text-sm text-zinc-500">
                    Atendimentos finalizados com “Comprou: sim” que ainda não
                    possuem o registro completo da venda.
                  </p>
                </div>
                <Badge>{pendingEventSales.length} pendentes</Badge>
              </div>

              {pendingEventSales.length === 0 ? (
                <div className="mt-5 rounded-[22px] border border-dashed border-zinc-200 p-10 text-center text-zinc-500">
                  <ShoppingCart className="mx-auto mb-3" size={30} />
                  <p className="font-semibold">
                    Nenhuma venda aguardando baixa
                  </p>
                </div>
              ) : (
                <div className="mt-5 overflow-x-auto rounded-[24px] border border-zinc-100">
                  <table className="min-w-[760px] w-full text-left text-sm">
                    <thead className="bg-zinc-50 text-xs uppercase tracking-[0.14em] text-zinc-500">
                      <tr>
                        <th className="px-5 py-4">Comprador</th>
                        <th className="px-5 py-4">Vendedor</th>
                        <th className="px-5 py-4">Pulseira</th>
                        <th className="px-5 py-4">Atendimento finalizado</th>
                        <th className="px-5 py-4">Situação</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100">
                      {pendingEventSales.map((pending) => (
                        <tr key={pending.id}>
                          <td className="px-5 py-4">
                            <p className="font-bold">{pending.lead_name}</p>
                            <p className="text-xs text-zinc-500">
                              {pending.lead_phone ?? "Sem telefone"}
                            </p>
                          </td>
                          <td className="px-5 py-4 font-medium">
                            {pending.vendor_name}
                          </td>
                          <td className="px-5 py-4">
                            {pending.wristband_number ?? "—"}
                          </td>
                          <td className="px-5 py-4 text-zinc-500">
                            {pending.finished_at
                              ? formatDateTime(pending.finished_at)
                              : "—"}
                          </td>
                          <td className="px-5 py-4">
                            <Button
                              type="button"
                              size="sm"
                              onClick={() =>
                                window.dispatchEvent(
                                  new CustomEvent("open-quick-sale", {
                                    detail: {
                                      clientId: event?.client_id ?? "",
                                      eventId: eventId ?? "",
                                      vendorId: pending.vendor_id,
                                      leadId: pending.lead_id,
                                      leadName: pending.lead_name,
                                      leadPhone: pending.lead_phone,
                                      wristband: pending.wristband_number,
                                    },
                                  }),
                                )
                              }
                            >
                              Dar baixa na venda
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          )}
        </div>
      )}

      {activeTab === "fila" && user.role === "gestor" && (
        <Card
          className={clsx(
            "rounded-[28px] border",
            isDarkMode
              ? "border-zinc-800 bg-[#111111]"
              : "border-zinc-100 bg-white",
          )}
          padding="lg"
        >
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
            <div>
              <h3
                className={clsx(
                  "text-lg font-black tracking-tight",
                  isDarkMode ? "text-zinc-100" : "text-zinc-950",
                )}
              >
                Fila por categoria
              </h3>
              <p className="mt-1 text-sm text-zinc-500">
                Reorganize a prioridade dos vendedores de cada categoria deste
                evento.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {EVENT_QUEUE_CATEGORIES.map((category) => (
                <button
                  key={category.value}
                  type="button"
                  onClick={() => setQueueCategory(category.value)}
                  className={clsx(
                    "rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors",
                    queueCategory === category.value
                      ? "border-[#E51838] bg-[#E51838] text-white"
                      : isDarkMode
                        ? "border-zinc-700 text-zinc-300 hover:bg-zinc-800"
                        : "border-zinc-200 text-zinc-600 hover:bg-zinc-50",
                  )}
                >
                  {category.label}
                </button>
              ))}
            </div>
          </div>
          {categoryQueueMembers.length === 0 ? (
            <div className="mt-8 rounded-2xl border border-dashed border-zinc-200 p-8 text-center text-sm text-zinc-500 dark:border-zinc-700">
              Nenhum vendedor vinculado a esta categoria neste evento.
            </div>
          ) : (
            <div
              className={clsx(
                "mt-6 rounded-2xl border p-4",
                isDarkMode
                  ? "border-zinc-800 bg-[#0b0b0b]"
                  : "border-zinc-100 bg-zinc-50/50",
              )}
            >
              <div className="mb-3 flex items-center justify-between">
                <p
                  className={clsx(
                    "text-sm font-bold",
                    isDarkMode ? "text-zinc-100" : "text-zinc-900",
                  )}
                >
                  Ordem geral da categoria
                </p>
                <Badge variant="gray">
                  {categoryQueueMembers.length} vendedores
                </Badge>
              </div>
              <div className="space-y-2">
                {categoryQueueMembers.map((member, index) => (
                  <div
                    key={member.user_id}
                    className={clsx(
                      "flex items-center gap-3 rounded-xl border px-3 py-2.5",
                      isDarkMode
                        ? "border-zinc-800 bg-[#111111]"
                        : "border-zinc-200 bg-white",
                    )}
                  >
                    <span className="w-5 text-center text-xs font-bold text-zinc-400">
                      {index + 1}
                    </span>
                    <span
                      className={clsx(
                        "min-w-0 flex-1 truncate text-sm font-semibold",
                        isDarkMode ? "text-zinc-100" : "text-zinc-900",
                      )}
                    >
                      {member.user.name}
                    </span>
                    <div className="flex gap-1">
                      <button
                        type="button"
                        aria-label="Mover para cima"
                        disabled={index === 0 || queueSaving !== null}
                        onClick={() =>
                          void handleReorderCategoryMember(member.user_id, -1)
                        }
                        title="Mover uma posição para cima"
                        className="rounded-lg border border-transparent p-2 text-zinc-500 transition-colors hover:border-zinc-200 hover:bg-zinc-100 hover:text-[#E51838] disabled:opacity-30 dark:hover:border-zinc-700 dark:hover:bg-zinc-800"
                      >
                        <ChevronUp size={16} />
                      </button>
                      <button
                        type="button"
                        aria-label="Mover para baixo"
                        disabled={
                          index === categoryQueueMembers.length - 1 ||
                          queueSaving !== null
                        }
                        onClick={() =>
                          void handleReorderCategoryMember(member.user_id, 1)
                        }
                        title="Mover uma posição para baixo"
                        className="rounded-lg border border-transparent p-2 text-zinc-500 transition-colors hover:border-zinc-200 hover:bg-zinc-100 hover:text-[#E51838] disabled:opacity-30 dark:hover:border-zinc-700 dark:hover:bg-zinc-800"
                      >
                        <ChevronDown size={16} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>
      )}

      {activeTab === "time" && (
        <div className="grid items-start gap-6 lg:grid-cols-[360px_minmax(0,1fr)]">
          <Card
            className={clsx(
              "rounded-[28px] border",
              isDarkMode
                ? "border-zinc-800 bg-[#111111]"
                : "border-zinc-100 bg-white",
            )}
            padding="lg"
          >
            <h3
              className={clsx(
                "text-lg font-black tracking-tight",
                isDarkMode ? "text-zinc-100" : "text-zinc-950",
              )}
            >
              Adicionar time
            </h3>
            {(() => {
              const usedNames = new Set(teams.map((team) => team.name));
              const remainingTeams = FIXED_TEAMS.filter(
                (fixedTeam) => !usedNames.has(fixedTeam.name),
              );
              return remainingTeams.length === 0 ? (
                <p
                  className={clsx(
                    "mt-4 text-sm",
                    isDarkMode ? "text-zinc-400" : "text-zinc-500",
                  )}
                >
                  Todos os times já foram adicionados a este evento.
                </p>
              ) : (
                <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {remainingTeams.map((fixedTeam) => (
                    <button
                      key={fixedTeam.name}
                      type="button"
                      disabled={teamCreating}
                      onClick={() => void handleSelectFixedTeam(fixedTeam)}
                      className={clsx(
                        "flex flex-col items-center gap-2 rounded-2xl border p-3 text-center transition-colors disabled:opacity-50",
                        isDarkMode
                          ? "border-zinc-800 bg-[#0b0b0b] hover:border-zinc-700 hover:bg-[#141414]"
                          : "border-zinc-200 bg-zinc-50 hover:border-zinc-300 hover:bg-white",
                      )}
                    >
                      <img
                        src={fixedTeam.logoUrl}
                        alt={fixedTeam.name}
                        className="h-10 w-10 rounded-full object-cover"
                      />
                      <span
                        className={clsx(
                          "text-xs font-medium leading-tight",
                          isDarkMode ? "text-zinc-200" : "text-zinc-700",
                        )}
                      >
                        {fixedTeam.name}
                      </span>
                    </button>
                  ))}
                </div>
              );
            })()}
            <div
              className={clsx(
                "mt-4 flex items-center justify-between rounded-2xl px-4 py-2.5 text-sm",
                isDarkMode
                  ? "bg-[#0b0b0b] text-zinc-300"
                  : "bg-zinc-50 text-zinc-600",
              )}
            >
              <span>Disponíveis</span>
              <span className="font-semibold">{availableVendors.length}</span>
            </div>
            {availableVendorsByParticipant.length > 0 ? (
              <div className="mt-4 space-y-2">
                {availableVendorsByParticipant.map((group) => (
                  <div
                    key={group.clientId}
                    className={clsx(
                      "flex items-center justify-between rounded-2xl border px-4 py-3 text-sm",
                      isDarkMode
                        ? "border-zinc-800 bg-[#0b0b0b]"
                        : "border-zinc-100 bg-zinc-50",
                    )}
                  >
                    <span
                      className={clsx(
                        isDarkMode ? "text-zinc-200" : "text-zinc-700",
                      )}
                    >
                      {group.clientName}
                    </span>
                    <Badge variant="gray">
                      {group.vendors.length} disponível
                      {group.vendors.length !== 1 ? "eis" : ""}
                    </Badge>
                  </div>
                ))}
              </div>
            ) : null}
          </Card>

          <div className="space-y-4">
            {teams.length === 0 ? (
              <Card
                className={clsx(
                  "rounded-[28px] border border-dashed p-10 text-center",
                  isDarkMode
                    ? "border-zinc-700 bg-[#111111] text-zinc-400"
                    : "border-zinc-200 bg-white text-zinc-500",
                )}
              >
                <Users size={32} className="mx-auto mb-3 text-zinc-300" />
                Nenhum time criado neste evento ainda.
              </Card>
            ) : (
              teams.map((team) => {
                const memberIds = new Set(
                  team.members.map((member) => member.user_id),
                );
                const available = availableVendors.filter(
                  (vendor) => !memberIds.has(vendor.id),
                );
                const addMemberOpen = addMemberTeamId === team.id;
                const membersByParticipant = Array.from(
                  team.members.reduce((groups, member) => {
                    const key = member.user.client_id ?? "sem-cliente";
                    const bucket = groups.get(key) ?? [];
                    bucket.push(member);
                    groups.set(key, bucket);
                    return groups;
                  }, new Map<string, typeof team.members>()),
                );

                return (
                  <Card
                    key={team.id}
                    className={clsx(
                      "overflow-hidden rounded-[28px] border",
                      isDarkMode
                        ? "border-zinc-800 bg-[#111111]"
                        : "border-zinc-100 bg-white",
                    )}
                    padding="none"
                  >
                    <div
                      className={clsx(
                        "flex items-center justify-between gap-3 border-b px-5 py-4",
                        isDarkMode ? "border-zinc-800" : "border-zinc-100",
                      )}
                    >
                      <div className="flex items-center gap-2">
                        {team.logo_url ? (
                          <img
                            src={team.logo_url}
                            alt={team.name}
                            className={clsx(
                              "h-7 w-7 rounded-full object-cover ring-1",
                              isDarkMode ? "ring-zinc-700" : "ring-zinc-200",
                            )}
                          />
                        ) : (
                          <Users size={16} className="text-[#FF0636]" />
                        )}
                        <p
                          className={clsx(
                            "text-sm font-semibold",
                            isDarkMode ? "text-zinc-100" : "text-zinc-900",
                          )}
                        >
                          {team.name}
                        </p>
                        <span
                          className={clsx(
                            "rounded-full px-2 py-0.5 text-[10px] font-medium",
                            isDarkMode
                              ? "bg-[#1a1a1a] text-zinc-300"
                              : "bg-zinc-100 text-zinc-600",
                          )}
                        >
                          {team.members.length} membro
                          {team.members.length !== 1 ? "s" : ""}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleEditTeam(team)}
                          className={clsx(
                            "rounded-lg p-1.5 text-zinc-400 transition-colors",
                            isDarkMode
                              ? "hover:bg-[#1a1a1a] hover:text-zinc-200"
                              : "hover:bg-zinc-100 hover:text-zinc-700",
                          )}
                          title="Editar nome e logo do time"
                        >
                          <Pencil size={13} />
                        </button>
                      </div>
                      <div className="flex items-center gap-2">
                        {available.length > 0 ? (
                          <button
                            type="button"
                            onClick={() => {
                              const nextOpen =
                                addMemberTeamId === team.id ? null : team.id;
                              setAddMemberTeamId(nextOpen);
                              setSelectedMemberIds(
                                nextOpen ? available.map((v) => v.id) : [],
                              );
                            }}
                            className={clsx(
                              "inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                              isDarkMode
                                ? "border-zinc-700 bg-[#111111] text-zinc-300 hover:bg-[#1a1a1a]"
                                : "border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50",
                            )}
                          >
                            <Plus size={12} />
                            Adicionar membros
                          </button>
                        ) : (
                          <span
                            className={clsx(
                              "rounded-full px-3 py-1.5 text-[11px] font-medium",
                              isDarkMode
                                ? "bg-[#1a1a1a] text-zinc-400"
                                : "bg-zinc-100 text-zinc-500",
                            )}
                          >
                            Sem membros disponíveis
                          </span>
                        )}
                        <button
                          type="button"
                          disabled={teamDeleting === team.id}
                          onClick={() => void handleDeleteTeam(team)}
                          className={clsx(
                            "rounded-xl p-2 text-zinc-400 transition-colors disabled:opacity-40",
                            isDarkMode
                              ? "hover:bg-red-500/10 hover:text-red-400"
                              : "hover:bg-red-50 hover:text-red-500",
                          )}
                          title="Excluir time"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>

                    {addMemberOpen && (
                      <div
                        className={clsx(
                          "border-b px-5 py-4 space-y-3",
                          isDarkMode
                            ? "border-zinc-800 bg-[#0b0b0b]"
                            : "border-zinc-100 bg-zinc-50/60",
                        )}
                      >
                        <div className="flex items-center justify-between">
                          <span
                            className={clsx(
                              "text-xs font-semibold uppercase tracking-wider",
                              isDarkMode ? "text-zinc-400" : "text-zinc-500",
                            )}
                          >
                            Selecione os vendedores para o time:
                          </span>
                          {available.length > 1 && (
                            <button
                              type="button"
                              onClick={() => {
                                if (
                                  selectedMemberIds.length === available.length
                                ) {
                                  setSelectedMemberIds([]);
                                } else {
                                  setSelectedMemberIds(
                                    available.map((v) => v.id),
                                  );
                                }
                              }}
                              className="text-xs font-medium text-[#E51838] hover:underline"
                            >
                              {selectedMemberIds.length === available.length
                                ? "Desmarcar todos"
                                : "Selecionar todos"}
                            </button>
                          )}
                        </div>

                        <div
                          className={clsx(
                            "max-h-48 overflow-y-auto rounded-xl border p-2 space-y-1.5",
                            isDarkMode
                              ? "border-zinc-800 bg-[#121318]"
                              : "border-zinc-200 bg-white",
                          )}
                        >
                          {available.map((vendor) => {
                            const isChecked = selectedMemberIds.includes(
                              vendor.id,
                            );
                            return (
                              <label
                                key={vendor.id}
                                className={clsx(
                                  "flex items-center gap-3 rounded-lg p-2 transition-colors cursor-pointer text-xs font-medium",
                                  isChecked
                                    ? isDarkMode
                                      ? "bg-[#E51838]/10 text-white"
                                      : "bg-red-50 text-zinc-900"
                                    : isDarkMode
                                      ? "text-zinc-300 hover:bg-zinc-800/60"
                                      : "text-zinc-700 hover:bg-zinc-100",
                                )}
                              >
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={(e) => {
                                    if (e.target.checked) {
                                      setSelectedMemberIds((prev) => [
                                        ...prev,
                                        vendor.id,
                                      ]);
                                    } else {
                                      setSelectedMemberIds((prev) =>
                                        prev.filter((id) => id !== vendor.id),
                                      );
                                    }
                                  }}
                                  className="h-4 w-4 rounded border-zinc-700 text-[#E51838] focus:ring-[#E51838]"
                                />
                                <div className="flex flex-col">
                                  <span className="font-semibold">
                                    {vendor.name}
                                  </span>
                                  <span className="text-[11px] text-zinc-400">
                                    {vendor.email}
                                  </span>
                                </div>
                              </label>
                            );
                          })}
                        </div>

                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="secondary"
                            onClick={() => {
                              setAddMemberTeamId(null);
                              setSelectedMemberIds([]);
                            }}
                          >
                            Fechar
                          </Button>
                          <Button
                            loading={memberToggling === team.id}
                            isDisabled={selectedMemberIds.length === 0}
                            onClick={() =>
                              void handleAddMembers(team.id, selectedMemberIds)
                            }
                          >
                            {selectedMemberIds.length > 1
                              ? `Adicionar (${selectedMemberIds.length}) vendedores`
                              : "Adicionar vendedor"}
                          </Button>
                        </div>
                      </div>
                    )}

                    {team.members.length === 0 ? (
                      <p className="px-5 py-4 text-sm text-zinc-500">
                        Nenhum membro neste time ainda.
                      </p>
                    ) : (
                      <div
                        className={clsx(
                          "divide-y",
                          isDarkMode ? "divide-zinc-800" : "divide-zinc-100",
                        )}
                      >
                        {membersByParticipant.map(([clientId, members]) => (
                          <div
                            key={`${team.id}-${clientId}`}
                            className="px-5 py-3"
                          >
                            <div className="mb-3 flex items-center justify-between">
                              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-400">
                                {participantClientNameById[clientId] ??
                                  "Empresa não identificada"}
                              </p>
                              <Badge variant="gray">
                                {members.length} membro
                                {members.length !== 1 ? "s" : ""}
                              </Badge>
                            </div>
                            <div className="grid gap-2 xl:grid-cols-2">
                              {members.map((member) => (
                                <div
                                  key={member.user_id}
                                  className={clsx(
                                    "flex items-center justify-between rounded-2xl border px-4 py-3",
                                    isDarkMode
                                      ? "border-zinc-800"
                                      : "border-zinc-100",
                                  )}
                                >
                                  <div className="flex items-center gap-3">
                                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-100 text-[10px] font-bold text-blue-700">
                                      {member.user.name
                                        .split(" ")
                                        .slice(0, 2)
                                        .map((part) => part[0])
                                        .join("")}
                                    </div>
                                    <div>
                                      <p
                                        className={clsx(
                                          "text-sm font-medium",
                                          isDarkMode
                                            ? "text-zinc-100"
                                            : "text-zinc-900",
                                        )}
                                      >
                                        {member.user.name}
                                      </p>
                                      <p className="text-[11px] text-zinc-400">
                                        {member.user.email}
                                      </p>
                                    </div>
                                  </div>
                                  <button
                                    type="button"
                                    disabled={memberToggling === member.user_id}
                                    onClick={() =>
                                      void handleRemoveMember(team, member.user)
                                    }
                                    className="rounded-md p-1.5 text-zinc-300 hover:bg-red-50 hover:text-red-400 disabled:opacity-40"
                                    title="Remover do time"
                                  >
                                    <Trash2 size={14} />
                                  </button>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </Card>
                );
              })
            )}
          </div>
        </div>
      )}

      {activeTab === "configuracoes" && (
        <form
          onSubmit={(e) => void handleSaveSettings(e)}
          className="grid gap-6"
        >
          <Card
            className={clsx(
              "rounded-[28px] border",
              isDarkMode
                ? "border-zinc-800 bg-[#111111]"
                : "border-zinc-100 bg-white",
            )}
            padding="lg"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3
                  className={clsx(
                    "text-lg font-black tracking-tight",
                    isDarkMode ? "text-zinc-100" : "text-zinc-950",
                  )}
                >
                  Configurações do evento
                </h3>
              </div>
              <Pencil size={18} className="text-zinc-400" />
            </div>

            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <Input
                dark={isDarkMode}
                label="Nome do evento"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
              />
              <Input
                dark={isDarkMode}
                label="Tipo de evento"
                value={formEventType}
                onChange={(e) => setFormEventType(e.target.value)}
              />
              <Input
                dark={isDarkMode}
                label="Lançamento"
                type="date"
                value={formLaunchDate}
                onChange={(e) => setFormLaunchDate(e.target.value)}
              />
              <Input
                dark={isDarkMode}
                label="Capacidade"
                type="number"
                min="0"
                value={formCapacity}
                onChange={(e) => setFormCapacity(e.target.value)}
              />
              <Input
                dark={isDarkMode}
                label="Meta de vendas"
                type="number"
                min="1"
                placeholder="ex: 200"
                value={formSalesTarget}
                onChange={(e) => setFormSalesTarget(e.target.value)}
              />
              <Input
                dark={isDarkMode}
                label="Meta de agendamentos por vendedor"
                type="number"
                min="1"
                placeholder="ex: 50"
                value={formScheduledTarget}
                onChange={(e) => setFormScheduledTarget(e.target.value)}
              />
              <Input
                dark={isDarkMode}
                label="Valor investido total (R$)"
                type="number"
                min="0"
                step="0.01"
                placeholder="ex: 82300"
                value={formTotalInvestment}
                onChange={(e) => setFormTotalInvestment(e.target.value)}
              />
              <Input
                dark={isDarkMode}
                label="Valor tráfego pago (R$)"
                type="number"
                min="0"
                step="0.01"
                placeholder="ex: 17800"
                value={formPaidTraffic}
                onChange={(e) => setFormPaidTraffic(e.target.value)}
              />
              <Input
                dark={isDarkMode}
                label="Data do evento"
                type="datetime-local"
                value={formEventDate}
                onChange={(e) => setFormEventDate(e.target.value)}
              />
              <Input
                dark={isDarkMode}
                label="Término do evento"
                type="datetime-local"
                value={formEventEndDate}
                onChange={(e) => setFormEventEndDate(e.target.value)}
              />
              <div className="sm:col-span-2">
                <Input
                  dark={isDarkMode}
                  label="Local"
                  value={formLocation}
                  onChange={(e) => setFormLocation(e.target.value)}
                />
              </div>
              <div className="sm:col-span-2">
                <label
                  className={clsx(
                    "mb-1 block text-sm font-medium",
                    isDarkMode ? "text-zinc-300" : "text-gray-700",
                  )}
                >
                  Descrição
                </label>
                <textarea
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  rows={4}
                  className={clsx(
                    "w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-400",
                    isDarkMode
                      ? "border-zinc-700 bg-[#111111] text-zinc-100 placeholder:text-zinc-500"
                      : "border-gray-300 bg-white text-gray-900 placeholder:text-gray-400",
                  )}
                />
              </div>
              <div>
                <Select
                  dark={isDarkMode}
                  label="Status"
                  value={formStatus}
                  onChange={(e) =>
                    setFormStatus(e.target.value as Event["status"])
                  }
                  options={[
                    { value: "draft", label: "Rascunho" },
                    { value: "active", label: "Ativo" },
                    { value: "completed", label: "Concluído" },
                    { value: "cancelled", label: "Cancelado" },
                  ]}
                />
              </div>
              <div>
                <Select
                  dark={isDarkMode}
                  label="Pulseira obrigatória"
                  value={formRequireWristband ? "true" : "false"}
                  onChange={(e) =>
                    setFormRequireWristband(e.target.value === "true")
                  }
                  options={[
                    { value: "false", label: "Não" },
                    { value: "true", label: "Sim" },
                  ]}
                />
              </div>
            </div>

            <div
              className={clsx(
                "mt-6 flex flex-col gap-3 border-t pt-5 sm:flex-row sm:items-center sm:justify-between",
                isDarkMode ? "border-zinc-800" : "border-zinc-100",
              )}
            >
              <div className="min-h-5 text-sm">
                {settingsError && (
                  <span className="font-medium text-red-600">
                    {settingsError}
                  </span>
                )}
                {!settingsError && settingsSuccess && (
                  <span className="font-medium text-emerald-600">
                    {settingsSuccess}
                  </span>
                )}
              </div>
              <Button
                type="submit"
                loading={settingsSaving}
                icon={<Pencil size={16} />}
                className="w-full sm:w-auto"
              >
                Salvar configurações
              </Button>
            </div>
          </Card>

          <div className="fixed right-6 top-1/2 z-40 flex -translate-y-1/2 flex-col gap-2">
            {eventIsArchived && (
              <Button
                type="button"
                variant="secondary"
                size="icon"
                title="Reativar evento"
                aria-label="Reativar evento"
                loading={settingsSaving}
                onClick={() => void handleQuickStatusChange("active")}
                className="rounded-full shadow-lg"
              >
                <ArrowUpRight size={16} />
              </Button>
            )}
            <Button
              type="button"
              variant="destructive"
              size="icon"
              title="Excluir evento"
              aria-label="Excluir evento"
              loading={settingsDeleting}
              onClick={() => void handleDeleteEvent()}
              className="rounded-full shadow-lg"
            >
              <Trash2 size={16} />
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="icon"
              title="Voltar à lista"
              aria-label="Voltar à lista"
              onClick={() => navigate("/gestor/eventos")}
              className="rounded-full shadow-lg"
            >
              <ArrowLeft size={16} />
            </Button>
          </div>
        </form>
      )}

      <Modal
        open={Boolean(editingSale)}
        onClose={() => !saleActionLoading && setEditingSale(null)}
        title="Editar venda"
        dark={isDarkMode}
        size="xl"
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => setEditingSale(null)}
              isDisabled={saleActionLoading}
            >
              Cancelar
            </Button>
            <Button
              onClick={() => void handleUpdateSale()}
              loading={saleActionLoading}
            >
              Salvar alterações
            </Button>
          </>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Select
            label="Comprador"
            value={saleEditLeadId}
            onValueChange={setSaleEditLeadId}
            options={Array.from(
              new Map(
                [
                  ...(editingSale?.lead
                    ? [
                        {
                          id: editingSale.lead.id,
                          name: editingSale.lead.name,
                          phone: editingSale.lead.phone,
                        },
                      ]
                    : []),
                  ...eventLeads,
                ].map((lead) => [lead.id, lead]),
              ).values(),
            )
              .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"))
              .map((lead) => ({
                value: lead.id,
                label: `${lead.name}${lead.phone ? ` · ${lead.phone}` : ""}`,
              }))}
          />
          <Select
            label="Vendedor"
            value={saleEditVendorId}
            onValueChange={setSaleEditVendorId}
            options={staff
              .slice()
              .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"))
              .map((vendor) => ({ value: vendor.id, label: vendor.name }))}
          />
          <Input
            label="Veículo"
            value={saleEditProduct}
            onChange={(event) => setSaleEditProduct(event.target.value)}
            placeholder="Marca e modelo"
          />
          <Select
            label="Tipo da venda"
            value={saleEditType}
            onValueChange={(value) =>
              setSaleEditType(value as EventSaleListItem["type"])
            }
            options={[
              { value: "NOVO", label: "Novo" },
              { value: "SEMINOVO", label: "Seminovo" },
              { value: "VENDA_DIRETA", label: "Venda direta" },
              { value: "PCD", label: "PCD" },
            ]}
          />
          <Input
            label="Valor do carro"
            value={saleEditValue}
            onChange={(event) =>
              setSaleEditValue(maskCurrencyInput(event.target.value))
            }
            placeholder="R$ 0,00"
            inputMode="numeric"
            autoComplete="off"
          />
          <Input
            label="Data da venda"
            type="datetime-local"
            value={saleEditSoldAt}
            onChange={(event) => setSaleEditSoldAt(event.target.value)}
          />
          <Input
            label="Número do pedido"
            value={saleEditOrderNumber}
            onChange={(event) => setSaleEditOrderNumber(event.target.value)}
          />
          <div className="flex flex-col gap-1 sm:col-span-2">
            <label
              className="text-sm font-medium text-foreground"
              htmlFor="sale-edit-notes"
            >
              Observações
            </label>
            <textarea
              id="sale-edit-notes"
              value={saleEditNotes}
              onChange={(event) => setSaleEditNotes(event.target.value)}
              rows={3}
              maxLength={2000}
              className="w-full rounded-2xl border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30"
            />
          </div>
          {saleActionError && (
            <div className="sm:col-span-2">
              <Notice tone="error">{saleActionError}</Notice>
            </div>
          )}
        </div>
      </Modal>

      <ConfirmationModal
        open={Boolean(saleDeleteTarget)}
        onClose={() => !saleActionLoading && setSaleDeleteTarget(null)}
        onConfirm={() => void handleDeleteSale()}
        loading={saleActionLoading}
        dark={isDarkMode}
        title="Excluir venda"
        description={
          <p className="text-sm text-zinc-600 dark:text-zinc-300">
            Excluir a venda de{" "}
            <span className="font-semibold">
              {saleDeleteTarget?.lead?.name ?? "cliente não informado"}
            </span>
            ? Ela será removida do faturamento, ranking e pontuação. Esta ação
            não pode ser desfeita.
          </p>
        }
        confirmLabel="Excluir venda"
      />

      <Modal
        open={Boolean(editingTeam)}
        onClose={() => setEditingTeam(null)}
        title="Editar time"
        dark={isDarkMode}
        size="md"
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => setEditingTeam(null)}
              isDisabled={editTeamSaving}
            >
              Cancelar
            </Button>
            <Button
              onClick={() => void handleSaveTeamEdit()}
              loading={editTeamSaving}
            >
              Salvar
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <Input
            dark={isDarkMode}
            label="Nome do time"
            value={editTeamName}
            onChange={(e) => setEditTeamName(e.target.value)}
            placeholder="ex: Ferrari"
            maxLength={255}
          />
          <div>
            <label
              className={clsx(
                "mb-1 block text-sm font-medium",
                isDarkMode ? "text-zinc-300" : "text-gray-700",
              )}
            >
              Logo do time
            </label>
            <div className="flex items-center gap-4">
              {editTeamLogo ? (
                <img
                  src={editTeamLogo}
                  alt="Pré-visualização"
                  className="h-20 w-20 rounded-full object-cover ring-1 ring-zinc-300"
                />
              ) : (
                <div className="flex h-20 w-20 items-center justify-center rounded-full border-2 border-dashed border-zinc-300 text-zinc-400 dark:border-zinc-700">
                  <ImageIcon size={22} />
                </div>
              )}
              <div className="flex flex-col gap-2">
                <label className="inline-flex cursor-pointer items-center gap-2 self-start rounded-xl border border-zinc-200 bg-white px-4 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800">
                  <Plus size={14} />
                  {editTeamLogo ? "Trocar imagem" : "Selecionar imagem"}
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
                    className="hidden"
                    onChange={(e) => {
                      void handleEditTeamFile(e.target.files?.[0] ?? null);
                      e.target.value = "";
                    }}
                  />
                </label>
                {editTeamLogo && (
                  <button
                    type="button"
                    onClick={() => setEditTeamLogo("")}
                    className="self-start text-xs text-zinc-500 hover:text-rose-500"
                  >
                    Remover
                  </button>
                )}
                <p className="text-[11px] text-zinc-500">
                  PNG, JPG, WEBP, GIF ou SVG (até 10MB). Redimensiona
                  automaticamente para 512px.
                  {editTeamLogo && (
                    <span className="ml-1 font-semibold text-emerald-600">
                      · {Math.round(dataUrlByteSize(editTeamLogo) / 1024)} KB
                    </span>
                  )}
                </p>
              </div>
            </div>
          </div>
          {editTeamError && <Notice tone="error">{editTeamError}</Notice>}
        </div>
      </Modal>

      <ConfirmationModal
        open={eventDeleteOpen}
        onClose={() => setEventDeleteOpen(false)}
        onConfirm={() =>
          void performDeleteEvent().finally(() => setEventDeleteOpen(false))
        }
        loading={settingsDeleting}
        title="Excluir evento"
        description={
          <p className="text-sm text-zinc-600">
            Tem certeza que deseja excluir o evento{" "}
            <span className="font-semibold text-zinc-900">{event.name}</span>?
            Esta ação não pode ser desfeita.
          </p>
        }
        confirmLabel="Excluir evento"
      />

      <ConfirmationModal
        open={Boolean(eventDeleteAction)}
        onClose={() => setEventDeleteAction(null)}
        onConfirm={() => void confirmEventDeleteAction()}
        loading={eventDeleteActionLoading}
        dark={isDarkMode}
        title={
          eventDeleteAction?.kind === "participant"
            ? "Remover participante"
            : eventDeleteAction?.kind === "team"
              ? "Excluir time"
              : eventDeleteAction?.kind === "member"
                ? "Remover membro"
                : "Confirmar ação"
        }
        description={
          eventDeleteAction?.kind === "participant" ? (
            <p className="text-sm text-zinc-600">
              Remover o cliente{" "}
              <span className="font-semibold text-zinc-900">
                {eventDeleteAction.client.company_name}
              </span>{" "}
              deste evento?
            </p>
          ) : eventDeleteAction?.kind === "team" ? (
            <p className="text-sm text-zinc-600">
              Excluir o time{" "}
              <span className="font-semibold text-zinc-900">
                {eventDeleteAction.team.name}
              </span>
              ? Esta ação não pode ser desfeita.
            </p>
          ) : eventDeleteAction?.kind === "member" ? (
            <p className="text-sm text-zinc-600">
              Remover o vendedor{" "}
              <span className="font-semibold text-zinc-900">
                {eventDeleteAction.member.name}
              </span>{" "}
              do time{" "}
              <span className="font-semibold text-zinc-900">
                {eventDeleteAction.team.name}
              </span>
              ?
            </p>
          ) : null
        }
        confirmLabel={
          eventDeleteAction?.kind === "participant"
            ? "Remover participante"
            : eventDeleteAction?.kind === "team"
              ? "Excluir time"
              : eventDeleteAction?.kind === "member"
                ? "Remover membro"
                : "Confirmar"
        }
      />

      <Drawer
        open={leadDrawerOpen && Boolean(selectedLead)}
        onClose={closeLeadDrawer}
        title={selectedLead?.name ?? "Lead"}
        width="w-full max-w-[520px]"
        dark={isDarkMode}
      >
        {selectedLead && (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-2">
              <ConfirmationBadge status={selectedLead.confirmation_status} />
              <SourceBadge source={selectedLead.source} />
              <StageBadge stage={selectedLead.crm_stage} />
            </div>

            <div
              className={clsx(
                "flex gap-1 rounded-2xl border p-1",
                isDarkMode
                  ? "border-zinc-800 bg-[#0b0b0b]"
                  : "border-zinc-100 bg-zinc-50",
              )}
            >
              {(
                [
                  { id: "historico", label: "Histórico" },
                  { id: "dados", label: "Dados" },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setLeadDrawerTab(tab.id)}
                  className={clsx(
                    "flex-1 rounded-xl px-3 py-2 text-sm font-medium transition-colors",
                    leadDrawerTab === tab.id
                      ? "bg-[#FF0636] text-white"
                      : isDarkMode
                        ? "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
                        : "text-zinc-500 hover:bg-white hover:text-zinc-900",
                  )}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {leadDrawerTab === "historico" ? (
              <div
                className={clsx(
                  "rounded-2xl border p-4",
                  isDarkMode
                    ? "border-zinc-800 bg-[#0b0b0b]"
                    : "border-zinc-100 bg-zinc-50",
                )}
              >
                <div className="flex items-center gap-2">
                  <TrendingUp size={14} className="text-zinc-400" />
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-400">
                    Linha do tempo
                  </p>
                </div>

                <div className="mt-4 space-y-4">
                  <div className="flex gap-3">
                    <div
                      className={clsx(
                        "flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
                        isDarkMode ? "bg-emerald-500/10" : "bg-emerald-50",
                      )}
                    >
                      <TrendingUp size={14} className="text-emerald-500" />
                    </div>
                    <div className="min-w-0 flex-1 pt-1">
                      <p
                        className={clsx(
                          "text-[13px] font-semibold",
                          isDarkMode ? "text-zinc-100" : "text-zinc-900",
                        )}
                      >
                        Lead criado
                      </p>
                      <p
                        className={clsx(
                          "text-[12px]",
                          isDarkMode ? "text-zinc-400" : "text-zinc-500",
                        )}
                      >
                        Entrada via{" "}
                        {LEAD_SOURCE_LABELS[selectedLead.source] ??
                          selectedLead.source}
                      </p>
                      <p
                        className={clsx(
                          "mt-0.5 text-[11px]",
                          isDarkMode ? "text-zinc-600" : "text-zinc-400",
                        )}
                      >
                        {formatDateFull(selectedLead.created_at)}
                      </p>
                    </div>
                  </div>

                  {leadHistoryLoading ? (
                    <div
                      className={clsx(
                        "flex items-center gap-2 py-4 text-[13px]",
                        isDarkMode ? "text-zinc-500" : "text-zinc-400",
                      )}
                    >
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                      Carregando histórico...
                    </div>
                  ) : leadHistory.length === 0 ? (
                    <p
                      className={clsx(
                        "py-4 text-[13px]",
                        isDarkMode ? "text-zinc-500" : "text-zinc-400",
                      )}
                    >
                      Nenhuma movimentação registrada.
                    </p>
                  ) : (
                    leadHistory.map((item) => (
                      <div
                        key={item.id}
                        className="flex gap-3 border-t py-3"
                        style={{
                          borderColor: isDarkMode ? "#1f1f1f" : "#f4f4f5",
                        }}
                      >
                        <div
                          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
                          style={{
                            backgroundColor: `${item.to_stage.color}22`,
                          }}
                        >
                          <ChevronRight
                            size={14}
                            style={{ color: item.to_stage.color }}
                          />
                        </div>
                        <div className="min-w-0 flex-1 pt-1">
                          <p
                            className={clsx(
                              "text-[13px] font-semibold",
                              isDarkMode ? "text-zinc-100" : "text-zinc-900",
                            )}
                          >
                            {item.from_stage
                              ? `${item.from_stage.name} → ${item.to_stage.name}`
                              : `Entrou em ${item.to_stage.name}`}
                          </p>
                          <p
                            className={clsx(
                              "text-[12px]",
                              isDarkMode ? "text-zinc-400" : "text-zinc-500",
                            )}
                          >
                            por {item.changed_by.name}
                          </p>
                          {item.notes && (
                            <p
                              className={clsx(
                                "mt-1 text-[12px]",
                                isDarkMode ? "text-zinc-500" : "text-zinc-400",
                              )}
                            >
                              {item.notes}
                            </p>
                          )}
                          <p
                            className={clsx(
                              "mt-0.5 text-[11px]",
                              isDarkMode ? "text-zinc-600" : "text-zinc-400",
                            )}
                          >
                            {formatDateFull(item.created_at)}
                          </p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div
                  className={clsx(
                    "grid gap-3 rounded-2xl border p-4 sm:grid-cols-2",
                    isDarkMode
                      ? "border-zinc-800 bg-[#0b0b0b]"
                      : "border-zinc-100 bg-zinc-50",
                  )}
                >
                  <Select
                    label="Status do lead"
                    dark={isDarkMode}
                    value={leadDrawerStatus}
                    disabled={leadDrawerMode !== "edit"}
                    onChange={(e) =>
                      setLeadDrawerStatus(e.target.value as ConfirmationStatus)
                    }
                    options={leadActionStatusOptions}
                  />
                  <Select
                    label="Vendedor"
                    dark={isDarkMode}
                    value={leadDrawerVendorId}
                    disabled={leadDrawerMode !== "edit"}
                    onChange={(e) => setLeadDrawerVendorId(e.target.value)}
                    options={vendorFilterOptions}
                  />
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div
                    className={clsx(
                      "rounded-2xl border p-4",
                      isDarkMode
                        ? "border-zinc-800 bg-[#0b0b0b]"
                        : "border-zinc-100 bg-zinc-50",
                    )}
                  >
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-400">
                      Contato
                    </p>
                    {leadDrawerMode === "edit" ? (
                      <div className="mt-3 space-y-3">
                        <Input
                          label="Nome"
                          value={leadDrawerName}
                          onChange={(event) =>
                            setLeadDrawerName(event.target.value)
                          }
                        />
                        <Input
                          label="E-mail"
                          type="email"
                          value={leadDrawerEmail}
                          onChange={(event) =>
                            setLeadDrawerEmail(event.target.value)
                          }
                        />
                        <Input
                          label="Telefone"
                          value={leadDrawerPhone}
                          onChange={(event) =>
                            setLeadDrawerPhone(event.target.value)
                          }
                        />
                      </div>
                    ) : (
                      <div className="mt-3 space-y-2 text-sm">
                        <div className="flex items-center gap-2 text-zinc-500">
                          <UserRound size={14} />
                          <span>{selectedLead.name || "Sem nome"}</span>
                        </div>
                        <div className="flex items-center gap-2 text-zinc-500">
                          <Mail size={14} />
                          <span>{selectedLead.email || "Sem e-mail"}</span>
                        </div>
                        <div className="flex items-center gap-2 text-zinc-500">
                          <Phone size={14} />
                          <span>{selectedLead.phone || "Sem telefone"}</span>
                        </div>
                      </div>
                    )}
                  </div>
                  <div
                    className={clsx(
                      "rounded-2xl border p-4",
                      isDarkMode
                        ? "border-zinc-800 bg-[#0b0b0b]"
                        : "border-zinc-100 bg-zinc-50",
                    )}
                  >
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-400">
                      Responsável
                    </p>
                    <div className="mt-3 space-y-2 text-sm">
                      <div className="flex items-center gap-2 text-zinc-500">
                        <UserRound size={14} />
                        <span>
                          {selectedLead.assigned_vendor_id
                            ? (staffById.get(selectedLead.assigned_vendor_id) ??
                              selectedLead.assigned_vendor_id)
                            : "Sem vendedor"}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-zinc-500">
                        <Clock3 size={14} />
                        <span>{formatDateTime(selectedLead.created_at)}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {leadDrawerMessage && (
                  <Notice
                    tone={
                      leadDrawerMessage.includes("sucesso")
                        ? "success"
                        : "error"
                    }
                  >
                    {leadDrawerMessage}
                  </Notice>
                )}

                <div
                  className={clsx(
                    "rounded-2xl border p-4",
                    isDarkMode
                      ? "border-zinc-800 bg-[#0b0b0b]"
                      : "border-zinc-100 bg-zinc-50",
                  )}
                >
                  <div className="flex items-center gap-2">
                    <Filter size={14} className="text-zinc-400" />
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-400">
                      Resumo
                    </p>
                  </div>
                  <div className="mt-3 space-y-3 text-sm text-zinc-500">
                    <p>
                      <strong
                        className={
                          isDarkMode ? "text-zinc-200" : "text-zinc-900"
                        }
                      >
                        Interesse:
                      </strong>{" "}
                      {selectedLead.event_interest || "Não informado"}
                    </p>
                    <p>
                      <strong
                        className={
                          isDarkMode ? "text-zinc-200" : "text-zinc-900"
                        }
                      >
                        Pipeline:
                      </strong>{" "}
                      {selectedLead.crm_pipeline_id || "Não informado"}
                    </p>
                    <p>
                      <strong
                        className={
                          isDarkMode ? "text-zinc-200" : "text-zinc-900"
                        }
                      >
                        Última atualização:
                      </strong>{" "}
                      {formatDateTime(selectedLead.updated_at)}
                    </p>
                  </div>
                </div>

                <div
                  className={clsx(
                    "rounded-2xl border p-4",
                    isDarkMode
                      ? "border-zinc-800 bg-[#0b0b0b]"
                      : "border-zinc-100 bg-zinc-50",
                  )}
                >
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-400">
                    Observações
                  </p>
                  <p
                    className={clsx(
                      "mt-3 whitespace-pre-line text-sm",
                      isDarkMode ? "text-zinc-300" : "text-zinc-700",
                    )}
                  >
                    {selectedLead.notes || "Sem observações registradas."}
                  </p>
                </div>

                {selectedLead.active_appointment && (
                  <div
                    className={clsx(
                      "rounded-2xl border p-4",
                      isDarkMode
                        ? "border-zinc-800 bg-[#0b0b0b]"
                        : "border-zinc-100 bg-zinc-50",
                    )}
                  >
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-400">
                      Agendamento ativo
                    </p>
                    {leadDrawerMode === "edit" &&
                    (event?.event_days?.length ?? 0) > 0 ? (
                      <div className="mt-3 space-y-2">
                        <Select
                          id="lead-event-date"
                          label="Data do evento"
                          value={leadDrawerScheduledAt}
                          disabled={leadDrawerSaving}
                          onValueChange={setLeadDrawerScheduledAt}
                          options={(event?.event_days ?? []).map((day) => ({
                            value: day.start,
                            label: formatEventDayOption(day),
                          }))}
                        />
                        <p className="text-xs text-zinc-500">
                          A alteração será registrada como reagendamento e
                          manterá o histórico do lead.
                        </p>
                        <p className="text-sm text-zinc-500">
                          Status atual: {selectedLead.active_appointment.status}
                        </p>
                      </div>
                    ) : (
                      <div className="mt-3 space-y-2 text-sm text-zinc-500">
                        <p>
                          {formatDateTime(
                            selectedLead.active_appointment.scheduled_at,
                          )}
                        </p>
                        <p>Status: {selectedLead.active_appointment.status}</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              {leadDrawerMode === "edit" ? (
                <Button
                  type="button"
                  loading={leadDrawerSaving}
                  onClick={() => void handleSaveLeadQuickActions()}
                  icon={<Pencil size={16} />}
                >
                  Salvar alterações
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    setLeadDrawerMode("edit");
                    setLeadDrawerTab("dados");
                  }}
                  icon={<Pencil size={16} />}
                >
                  Editar lead
                </Button>
              )}
              <Button
                type="button"
                variant="secondary"
                icon={<MessageSquareMore size={16} />}
                onClick={() =>
                  navigate(
                    `/gestor/chat?client_id=${selectedLead.client_id}&lead_id=${selectedLead.id}`,
                  )
                }
              >
                Abrir chat
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={closeLeadDrawer}
              >
                Fechar
              </Button>
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
}
