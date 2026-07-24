import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import clsx from "clsx";
import {
  ArrowLeft,
  ArrowUpRight,
  Building2,
  CalendarDays,
  Clock3,
  Download,
  ImageIcon,
  Layers3,
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
  UserRound,
  Trash2,
  Users,
  TrendingUp,
  Tv,
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
import type { Client, Event, Lead } from "../../types";
import { readStoredSession } from "../../services/auth";
import {
  getClient,
  listClients,
  mapApiClientToClient,
} from "../../services/clients";
import { listLeadHistory, type ApiCrmHistoryItem } from "../../services/crm";
import {
  deleteEvent,
  getEvent,
  mapApiEventToEvent,
  updateEvent,
} from "../../services/events";
import {
  fetchAllLeads,
  mapApiLeadToLead,
  updateLead,
} from "../../services/leads";
import {
  addTeamMember,
  createSalesTeam,
  deleteSalesTeam,
  listSalesTeams,
  removeTeamMember,
  updateSalesTeam,
  type SalesTeam,
  type TeamMemberUser,
} from "../../services/salesTeams";
import { listUsers, type StaffUser } from "../../services/users";
import { dataUrlByteSize, resizeImageToDataUrl } from "../../utils/image";
import { saveOrShareBlob } from "../../utils/nativeDownload";
import {
  getVendorScoreRanking,
  type VendorScoreRankingItem,
} from "../../services/vendorScore";
import { EventReportTab } from "../../components/events/EventReportTab";
import {
  DASHBOARD_DARK_CHANGE_EVENT,
  readDashboardDarkEnabled,
} from "../../lib/dashboard-dark-mode";
import type { AppOutletContext } from "../../layouts/AppLayout";
import { useOutletContext } from "react-router-dom";
import type { ConfirmationStatus, LeadSource } from "../../types";

type EventDetailTab =
  "dashboard" | "dados" | "leads" | "time" | "relatorio" | "configuracoes";
type LeadDrawerTab = "historico" | "dados";

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
  { id: "dashboard", label: "Dashboard", icon: <Layers3 size={14} /> },
  { id: "dados", label: "Dados", icon: <CalendarDays size={14} /> },
  { id: "leads", label: "Leads", icon: <ArrowUpRight size={14} /> },
  { id: "time", label: "Time", icon: <Users size={14} /> },
  { id: "relatorio", label: "Relatório", icon: <TrendingUp size={14} /> },
  { id: "configuracoes", label: "Configurações", icon: <Settings size={14} /> },
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

function formatDateInput(value: string | null | undefined) {
  return value ? new Date(value).toISOString().slice(0, 10) : "";
}

function formatDateTimeInput(value: string | null | undefined) {
  return value ? new Date(value).toISOString().slice(0, 16) : "";
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
  const [event, setEvent] = useState<Event | null>(null);
  const [client, setClient] = useState<Client | null>(null);
  const [allClients, setAllClients] = useState<Client[]>([]);
  const [teams, setTeams] = useState<SalesTeam[]>([]);
  const [staff, setStaff] = useState<StaffUser[]>([]);
  const [eventLeads, setEventLeads] = useState<Lead[]>([]);
  const [leadsLoading, setLeadsLoading] = useState(false);
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
  const [leadDrawerOpen, setLeadDrawerOpen] = useState(false);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [leadDrawerTab, setLeadDrawerTab] =
    useState<LeadDrawerTab>("historico");
  const [leadDrawerStatus, setLeadDrawerStatus] =
    useState<ConfirmationStatus>("pending");
  const [leadDrawerVendorId, setLeadDrawerVendorId] = useState("");
  const [leadDrawerSaving, setLeadDrawerSaving] = useState(false);
  const [leadDrawerMessage, setLeadDrawerMessage] = useState("");
  const [leadHistory, setLeadHistory] = useState<ApiCrmHistoryItem[]>([]);
  const [leadHistoryLoading, setLeadHistoryLoading] = useState(false);
  const [leadRowSavingId, setLeadRowSavingId] = useState<string | null>(null);
  const [exportingLeads, setExportingLeads] = useState(false);
  const [activeTab, setActiveTab] = useState<EventDetailTab>("dashboard");
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
  const [newTeamName, setNewTeamName] = useState("");
  const [teamCreating, setTeamCreating] = useState(false);
  const [teamDeleting, setTeamDeleting] = useState<string | null>(null);
  const [addMemberTeamId, setAddMemberTeamId] = useState<string | null>(null);
  const [editingTeam, setEditingTeam] = useState<SalesTeam | null>(null);
  const [editTeamName, setEditTeamName] = useState("");
  const [editTeamLogo, setEditTeamLogo] = useState("");
  const [editTeamSaving, setEditTeamSaving] = useState(false);
  const [editTeamError, setEditTeamError] = useState("");
  const [addMemberSelectionId, setAddMemberSelectionId] = useState("");
  const [memberToggling, setMemberToggling] = useState<string | null>(null);
  const [formName, setFormName] = useState("");
  const [formEventType, setFormEventType] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formLaunchDate, setFormLaunchDate] = useState("");
  const [formEventDate, setFormEventDate] = useState("");
  const [formEventEndDate, setFormEventEndDate] = useState("");
  const [formLocation, setFormLocation] = useState("");
  const [formCapacity, setFormCapacity] = useState("");
  const [formSalesTarget, setFormSalesTarget] = useState("");
  const [formStatus, setFormStatus] = useState<Event["status"]>("draft");
  const [formRequireWristband, setFormRequireWristband] = useState(false);
  const [formCoverImageUrl, setFormCoverImageUrl] = useState("");
  const [formImageUrls, setFormImageUrls] = useState<string[]>([""]);
  const [formExtraClientIds, setFormExtraClientIds] = useState<string[]>([]);
  const [rankingData, setRankingData] = useState<VendorScoreRankingItem[]>([]);
  const [rankingLoading, setRankingLoading] = useState(false);
  const [rankingUpdatedAt, setRankingUpdatedAt] = useState<Date | null>(null);

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
    setFormStatus(nextEvent.status);
    setFormRequireWristband(nextEvent.require_wristband ?? false);
    setFormCoverImageUrl(nextEvent.cover_image_url ?? "");
    setFormImageUrls(nextEvent.image_urls.length ? nextEvent.image_urls : [""]);
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
    setRankingLoading(true);
    setError("");
    setSettingsError("");
    setSettingsSuccess("");

    try {
      const apiEvent = await getEvent(eventId, session.accessToken);
      const mappedEvent = mapApiEventToEvent(apiEvent);
      const participantClientIds = mappedEvent.participant_client_ids;

      const [
        apiClient,
        apiClients,
        apiTeams,
        apiStaff,
        rankingGroups,
        leadGroups,
      ] = await Promise.all([
        getClient(
          participantClientIds[0] ?? mappedEvent.client_id,
          session.accessToken,
        ).catch(() => null),
        listClients(session.accessToken).catch(() => []),
        listSalesTeams(session.accessToken, mappedEvent.id).catch(() => []),
        listUsers(session.accessToken).catch(() => []),
        participantClientIds.length > 0
          ? Promise.all(
              participantClientIds.map((cid) =>
                getVendorScoreRanking(session.accessToken, {
                  client_id: cid,
                  event_id: mappedEvent.id,
                  limit: 100,
                }).catch(() => [] as VendorScoreRankingItem[]),
              ),
            )
          : Promise.resolve([[] as VendorScoreRankingItem[]]),
        Promise.all(
          participantClientIds.map((clientId) =>
            fetchAllLeads({ client_id: clientId }, session.accessToken).catch(
              () => [],
            ),
          ),
        ),
      ]);

      // Merge rankings from all participant clients (each vendor belongs to one client so no duplicates)
      const apiRankingMerged: VendorScoreRankingItem[] = rankingGroups
        .flat()
        .sort(
          (a, b) =>
            b.total_points - a.total_points || b.sold.count - a.sold.count,
        );

      const apiLeads = leadGroups.flat();

      setEvent(mappedEvent);
      setClient(apiClient ? mapApiClientToClient(apiClient) : null);
      setAllClients(apiClients.map(mapApiClientToClient));
      setTeams(apiTeams);
      setStaff(
        apiStaff.filter(
          (member) =>
            member.role === "vendedor" &&
            member.is_active &&
            !!member.client_id &&
            participantClientIds.includes(member.client_id),
        ),
      );
      setEventLeads(
        apiLeads
          .map(mapApiLeadToLead)
          .filter((lead) => lead.event_id === mappedEvent.id),
      );
      setRankingData(apiRankingMerged);
      setRankingUpdatedAt(new Date());
      hydrateForm(mappedEvent);
      setAddMemberTeamId(null);
      setAddMemberSelectionId("");
    } catch (loadError) {
      setError(
        getErrorMessage(loadError, "Não foi possível carregar o evento."),
      );
    } finally {
      setLeadsLoading(false);
      setRankingLoading(false);
      if (showSpinner) {
        setLoading(false);
      }
    }
  }

  useEffect(() => {
    void loadPage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId]);

  // Auto-refresh ranking every 30s while on the relatório tab
  useEffect(() => {
    if (activeTab !== "relatorio") return;
    const session = readStoredSession();
    if (!session?.accessToken || !event) return;

    const tick = async () => {
      const participantClientIds = event.participant_client_ids;
      if (participantClientIds.length === 0) return;
      try {
        const groups = await Promise.all(
          participantClientIds.map((cid) =>
            getVendorScoreRanking(session.accessToken, {
              client_id: cid,
              event_id: event.id,
              limit: 100,
            }).catch(() => []),
          ),
        );
        const merged = groups
          .flat()
          .sort(
            (a, b) =>
              b.total_points - a.total_points || b.sold.count - a.sold.count,
          );
        setRankingData(merged);
        setRankingUpdatedAt(new Date());
      } catch {
        // silent — don't disrupt UX for a background refresh
      }
    };

    const interval = setInterval(() => {
      void tick();
    }, 30_000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, event?.id]);

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

  const eventOperationsClients = useMemo(() => {
    const items: Client[] = [];
    participantClients.forEach((clientItem) => {
      if (!items.some((existing) => existing.id === clientItem.id)) {
        items.push(clientItem);
      }
    });
    return items;
  }, [participantClients]);
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
    ? Math.round((event.confirmed_count / event.leads_count) * 100)
    : 0;
  const checkinRate = event?.leads_count
    ? Math.round((event.checkin_count / event.leads_count) * 100)
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
      setSettingsSuccess("Participantes do evento atualizados com sucesso.");
      await loadPage(false);
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

  function openLeadDrawer(lead: Lead) {
    setSelectedLead(lead);
    setLeadDrawerTab("historico");
    setLeadDrawerStatus(lead.confirmation_status);
    setLeadDrawerVendorId(lead.assigned_vendor_id ?? "");
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

    setLeadDrawerSaving(true);
    setLeadDrawerMessage("");
    try {
      const updated = await updateLead(
        selectedLead.id,
        {
          confirmation_status: leadDrawerStatus,
          assigned_vendor_id: leadDrawerVendorId || null,
        },
        session.accessToken,
      );

      const mapped = mapApiLeadToLead(updated);
      setEventLeads((current) =>
        current.map((lead) => (lead.id === mapped.id ? mapped : lead)),
      );
      setSelectedLead(mapped);
      setLeadDrawerStatus(mapped.confirmation_status);
      setLeadDrawerVendorId(mapped.assigned_vendor_id ?? "");
      setLeadDrawerMessage("Lead atualizado com sucesso.");
      setTimeout(() => setLeadDrawerMessage(""), 3000);
    } catch (quickLeadError) {
      setLeadDrawerMessage(
        getErrorMessage(quickLeadError, "Não foi possível atualizar o lead."),
      );
    } finally {
      setLeadDrawerSaving(false);
    }
  }

  async function handleQuickLeadStatusChange(lead: Lead) {
    const session = readStoredSession();
    if (!session?.accessToken) return;

    const nextStatus: ConfirmationStatus =
      lead.confirmation_status === "pending"
        ? "scheduled"
        : lead.confirmation_status === "scheduled"
          ? "confirmed"
          : lead.confirmation_status === "confirmed"
            ? "checked_in"
            : lead.confirmation_status === "checked_in"
              ? "pending"
              : "pending";

    setLeadRowSavingId(lead.id);
    try {
      const updated = await updateLead(
        lead.id,
        { confirmation_status: nextStatus },
        session.accessToken,
      );
      const mapped = mapApiLeadToLead(updated);
      setEventLeads((current) =>
        current.map((item) => (item.id === mapped.id ? mapped : item)),
      );
      if (selectedLead?.id === mapped.id) {
        setSelectedLead(mapped);
        setLeadDrawerStatus(mapped.confirmation_status);
        setLeadDrawerVendorId(mapped.assigned_vendor_id ?? "");
      }
    } catch (statusError) {
      setSettingsError(
        getErrorMessage(
          statusError,
          "Não foi possível atualizar o status do lead.",
        ),
      );
    } finally {
      setLeadRowSavingId(null);
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

  async function handleCreateTeam() {
    if (!event?.id || !newTeamName.trim()) return;
    const session = readStoredSession();
    if (!session?.accessToken) return;

    setTeamCreating(true);
    setSettingsError("");
    try {
      const created = await createSalesTeam(
        session.accessToken,
        event.id,
        newTeamName.trim(),
      );
      setTeams((current) => [...current, created]);
      setNewTeamName("");
    } catch (teamError) {
      setSettingsError(
        getErrorMessage(teamError, "Não foi possível criar o time."),
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

  async function handleAddMember(teamId: string, userId: string) {
    const session = readStoredSession();
    if (!session?.accessToken) return;

    setMemberToggling(userId);
    setSettingsError("");
    try {
      const updated = await addTeamMember(session.accessToken, teamId, userId);
      setTeams((current) =>
        current.map((team) => (team.id === teamId ? updated : team)),
      );
      setAddMemberTeamId(null);
      setAddMemberSelectionId("");
    } catch (teamError) {
      setSettingsError(
        getErrorMessage(teamError, "Não foi possível adicionar o vendedor."),
      );
    } finally {
      setMemberToggling(null);
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
          event_type: formEventType.trim() || undefined,
          description: formDescription.trim() || undefined,
          launch_date: formLaunchDate || undefined,
          event_date: new Date(formEventDate).toISOString(),
          event_end_date: formEventEndDate
            ? new Date(formEventEndDate).toISOString()
            : undefined,
          location: formLocation.trim() || undefined,
          capacity: hasCapacity ? capacityNumber : undefined,
          sales_target: hasSalesTarget ? salesTargetNumber : null,
          status: formStatus,
          require_wristband: formRequireWristband,
          cover_image_url: formCoverImageUrl.trim() || undefined,
          image_urls: formImageUrls.map((url) => url.trim()).filter(Boolean),
          participant_client_ids: [
            event?.participant_client_ids[0] ?? client?.id ?? "",
            ...formExtraClientIds,
          ].filter(Boolean),
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
              variant="secondary"
              icon={<Tv size={16} />}
              onClick={() =>
                window.open(`/eventos/${event.id}/tv`, "_blank", "noopener")
              }
            >
              Modo TV
            </Button>
            <Button
              variant="secondary"
              icon={<Tv size={16} />}
              onClick={() =>
                window.open(
                  `/eventos/${event.id}/tv-fila`,
                  "_blank",
                  "noopener",
                )
              }
            >
              Fila modo TV
            </Button>
            <Button
              variant="secondary"
              icon={<RefreshCcw size={16} />}
              loading={refreshing}
              onClick={() => void handleRefresh()}
            >
              Atualizar
            </Button>
            {!eventIsPublished ? (
              <Button
                icon={<ArrowUpRight size={16} />}
                loading={settingsSaving}
                onClick={() => void handleQuickStatusChange("active")}
              >
                Publicar evento
              </Button>
            ) : (
              <Button
                variant="secondary"
                icon={<Settings size={16} />}
                loading={settingsSaving}
                onClick={() => void handleQuickStatusChange("completed")}
              >
                Arquivar evento
              </Button>
            )}
            <Button
              variant="ghost"
              icon={<ArrowLeft size={16} />}
              onClick={() => navigate("/gestor/eventos")}
            >
              Voltar
            </Button>
          </>
        }
      />

      <div
        className={clsx(
          "relative overflow-hidden rounded-[32px] border shadow-[0_24px_60px_rgba(15,23,42,0.12)]",
          isDarkMode
            ? "border-zinc-800 bg-[#0f0f0f]"
            : "border-white/80 bg-white",
        )}
      >
        <div className="absolute inset-0 bg-gradient-to-br from-[#FF0636]/20 via-transparent to-[#3D56A2]/20" />
        <div className="relative grid gap-0 lg:grid-cols-[1.3fr_0.9fr]">
          <div className="p-6 lg:p-8">
            <div className="flex flex-wrap items-center gap-3">
              <EventStatusBadge status={event.status} />
              <Badge>
                {daysToEvent >= 0
                  ? `${daysToEvent} dias para o evento`
                  : "Evento passado"}
              </Badge>
            </div>
            <h2
              className={clsx(
                "mt-4 text-3xl font-black tracking-tight",
                isDarkMode ? "text-zinc-100" : "text-zinc-950",
              )}
            >
              {event.name}
            </h2>
            <div className="mt-2">
              <CopyableId value={event.id} label="event_id" dark={isDarkMode} />
            </div>
            <p
              className={clsx(
                "mt-3 max-w-2xl text-sm leading-6",
                isDarkMode ? "text-zinc-300" : "text-zinc-600",
              )}
            >
              {event.description ||
                "Sem descrição cadastrada. Use a aba Configurações para enriquecer o contexto do evento."}
            </p>

            <div className="mt-6 flex flex-wrap gap-3 text-sm">
              <div
                className={clsx(
                  "inline-flex items-center gap-2 rounded-full px-4 py-2",
                  isDarkMode
                    ? "bg-zinc-900 text-zinc-200"
                    : "bg-zinc-100 text-zinc-700",
                )}
              >
                <CalendarDays size={16} className="text-[#FF0636]" />
                {formatDateTime(event.event_date)}
              </div>
              <div
                className={clsx(
                  "inline-flex items-center gap-2 rounded-full px-4 py-2",
                  isDarkMode
                    ? "bg-zinc-900 text-zinc-200"
                    : "bg-zinc-100 text-zinc-700",
                )}
              >
                <MapPin size={16} className="text-[#3D56A2]" />
                {event.location || "Local não informado"}
              </div>
              <div
                className={clsx(
                  "inline-flex items-center gap-2 rounded-full px-4 py-2",
                  isDarkMode
                    ? "bg-zinc-900 text-zinc-200"
                    : "bg-zinc-100 text-zinc-700",
                )}
              >
                <Building2 size={16} className="text-[#FBBB49]" />
                {selectedClient?.company_name ?? "Cliente"}
              </div>
            </div>

            <div className="mt-7 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <MetricCard
                title="Leads"
                value={event.leads_count}
                helper="Leads vinculados ao evento"
                tone="rose"
                dark={isDarkMode}
              />
              <MetricCard
                title="Confirmados"
                value={event.confirmed_count}
                helper={`${leadConfirmationRate}% de confirmação`}
                tone="blue"
                dark={isDarkMode}
              />
              <MetricCard
                title="Check-ins"
                value={event.checkin_count}
                helper={`${checkinRate}% com presença`}
                tone="amber"
                dark={isDarkMode}
              />
              <MetricCard
                title="Time"
                value={totalMembers}
                helper={`${teams.length} time${teams.length !== 1 ? "s" : ""} criado${teams.length !== 1 ? "s" : ""}`}
                tone="emerald"
                dark={isDarkMode}
              />
            </div>
          </div>

          <div
            className={clsx(
              "border-t lg:border-t-0 lg:border-l",
              isDarkMode ? "border-zinc-800" : "border-zinc-100",
            )}
          >
            <div className="h-full p-4 lg:p-5">
              <div
                className={clsx(
                  "flex h-full min-h-[280px] flex-col justify-between rounded-[28px] p-5",
                  isDarkMode
                    ? "bg-[#101010]"
                    : "bg-gradient-to-br from-zinc-50 to-white",
                )}
              >
                <div className="space-y-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-zinc-400">
                        Resumo rápido
                      </p>
                      <p
                        className={clsx(
                          "mt-1 text-lg font-black tracking-tight",
                          isDarkMode ? "text-zinc-100" : "text-zinc-950",
                        )}
                      >
                        Painel de operação
                      </p>
                    </div>
                    <Settings size={20} className="text-zinc-400" />
                  </div>

                  <div className="space-y-3 text-sm">
                    <div className="flex items-center justify-between">
                      <span
                        className={
                          isDarkMode ? "text-zinc-400" : "text-zinc-500"
                        }
                      >
                        Capacidade
                      </span>
                      <span
                        className={
                          isDarkMode ? "text-zinc-100" : "text-zinc-900"
                        }
                      >
                        {event.capacity != null
                          ? `${event.capacity} lugares`
                          : "Não informada"}
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-zinc-200/70">
                      <div
                        className="h-full rounded-full bg-[#FF0636]"
                        style={{ width: `${capacityUsage}%` }}
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <span
                        className={
                          isDarkMode ? "text-zinc-400" : "text-zinc-500"
                        }
                      >
                        Taxa de confirmação
                      </span>
                      <span
                        className={
                          isDarkMode ? "text-zinc-100" : "text-zinc-900"
                        }
                      >
                        {leadConfirmationRate}%
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-zinc-200/70">
                      <div
                        className="h-full rounded-full bg-[#3D56A2]"
                        style={{ width: `${leadConfirmationRate}%` }}
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <span
                        className={
                          isDarkMode ? "text-zinc-400" : "text-zinc-500"
                        }
                      >
                        Taxa de check-in
                      </span>
                      <span
                        className={
                          isDarkMode ? "text-zinc-100" : "text-zinc-900"
                        }
                      >
                        {checkinRate}%
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-zinc-200/70">
                      <div
                        className="h-full rounded-full bg-[#FBBB49]"
                        style={{ width: `${checkinRate}%` }}
                      />
                    </div>
                  </div>
                </div>

                <div
                  className={clsx(
                    "mt-6 rounded-[22px] border p-4",
                    isDarkMode
                      ? "border-zinc-800 bg-[#0b0b0b]"
                      : "border-zinc-200 bg-white",
                  )}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-400">
                        Time do evento
                      </p>
                      <p
                        className={clsx(
                          "mt-1 text-sm font-semibold",
                          isDarkMode ? "text-zinc-100" : "text-zinc-900",
                        )}
                      >
                        {teams.length} time{teams.length !== 1 ? "s" : ""} ·{" "}
                        {totalMembers} membro
                        {totalMembers !== 1 ? "s" : ""}
                      </p>
                    </div>
                    <ArrowUpRight size={18} className="text-zinc-400" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <Tabs
        tabs={EVENT_TABS}
        active={activeTab}
        onChange={(tab) => setActiveTab(tab as EventDetailTab)}
      />

      {settingsError && <Notice tone="error">{settingsError}</Notice>}
      {settingsSuccess && <Notice tone="success">{settingsSuccess}</Notice>}

      {activeTab === "dashboard" && (
        <div className="grid gap-6 lg:grid-cols-[1.3fr_0.7fr]">
          <Card
            className={clsx(
              "rounded-[28px] border",
              isDarkMode ? "border-zinc-800 bg-[#111111]" : "border-zinc-100",
            )}
            padding="lg"
          >
            <h3
              className={clsx(
                "text-lg font-black tracking-tight",
                isDarkMode ? "text-zinc-100" : "text-zinc-950",
              )}
            >
              Visão geral do evento
            </h3>
            <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              <div
                className={clsx(
                  "rounded-[22px] p-4",
                  isDarkMode ? "bg-[#0b0b0b]" : "bg-zinc-50",
                )}
              >
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-400">
                  Cliente
                </p>
                <p
                  className={clsx(
                    "mt-2 text-sm font-semibold",
                    isDarkMode ? "text-zinc-100" : "text-zinc-900",
                  )}
                >
                  {selectedClient?.company_name ?? "Cliente não encontrado"}
                </p>
                <p
                  className={clsx(
                    "mt-1 text-xs",
                    isDarkMode ? "text-zinc-500" : "text-zinc-500",
                  )}
                >
                  {selectedClient?.plan ?? "Plano não identificado"}
                </p>
              </div>
              <div
                className={clsx(
                  "rounded-[22px] p-4",
                  isDarkMode ? "bg-[#0b0b0b]" : "bg-zinc-50",
                )}
              >
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-400">
                  Data de lançamento
                </p>
                <p
                  className={clsx(
                    "mt-2 text-sm font-semibold",
                    isDarkMode ? "text-zinc-100" : "text-zinc-900",
                  )}
                >
                  {formatDateTime(event.launch_date)}
                </p>
                <p
                  className={clsx(
                    "mt-1 text-xs",
                    isDarkMode ? "text-zinc-500" : "text-zinc-500",
                  )}
                >
                  Primeira comunicação do evento
                </p>
              </div>
              <div
                className={clsx(
                  "rounded-[22px] p-4",
                  isDarkMode ? "bg-[#0b0b0b]" : "bg-zinc-50",
                )}
              >
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-400">
                  Data final
                </p>
                <p
                  className={clsx(
                    "mt-2 text-sm font-semibold",
                    isDarkMode ? "text-zinc-100" : "text-zinc-900",
                  )}
                >
                  {formatDateTime(event.event_end_date)}
                </p>
                <p
                  className={clsx(
                    "mt-1 text-xs",
                    isDarkMode ? "text-zinc-500" : "text-zinc-500",
                  )}
                >
                  Encerramento ou término previsto
                </p>
              </div>
            </div>

            <div className="mt-6 grid gap-4 xl:grid-cols-[1.08fr_0.92fr]">
              <div className="space-y-4">
                <div
                  className={clsx(
                    "rounded-[22px] border p-4",
                    isDarkMode
                      ? "border-zinc-800 bg-[#0b0b0b]"
                      : "border-zinc-100 bg-white",
                  )}
                >
                  <p className="text-sm font-semibold text-zinc-400">
                    Leads e presença
                  </p>
                  <div className="mt-4 space-y-4">
                    <div>
                      <div className="mb-2 flex items-center justify-between text-xs text-zinc-500">
                        <span>Confirmação</span>
                        <span>{leadConfirmationRate}%</span>
                      </div>
                      <div className="h-2 rounded-full bg-zinc-200/70">
                        <div
                          className="h-full rounded-full bg-[#3D56A2]"
                          style={{ width: `${leadConfirmationRate}%` }}
                        />
                      </div>
                    </div>
                    <div>
                      <div className="mb-2 flex items-center justify-between text-xs text-zinc-500">
                        <span>Check-in</span>
                        <span>{checkinRate}%</span>
                      </div>
                      <div className="h-2 rounded-full bg-zinc-200/70">
                        <div
                          className="h-full rounded-full bg-[#FBBB49]"
                          style={{ width: `${checkinRate}%` }}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <div
                  className={clsx(
                    "rounded-[22px] border p-4",
                    isDarkMode
                      ? "border-zinc-800 bg-[#0b0b0b]"
                      : "border-zinc-100 bg-white",
                  )}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-zinc-400">
                        Operação por empresa
                      </p>
                      <p
                        className={clsx(
                          "mt-1 text-sm",
                          isDarkMode ? "text-zinc-300" : "text-zinc-600",
                        )}
                      >
                        Abra a visão operacional de cada empresa participante
                        para distribuir leads e acompanhar o placar no contexto
                        do evento.
                      </p>
                    </div>
                    <ArrowUpRight size={18} className="text-zinc-400" />
                  </div>

                  <div className="mt-4 grid gap-3 lg:grid-cols-2">
                    {eventOperationsClients.map((clientItem) => (
                      <div
                        key={clientItem.id}
                        className={clsx(
                          "rounded-[20px] border p-4",
                          isDarkMode
                            ? "border-zinc-800 bg-[#101010]"
                            : "border-zinc-50 bg-zinc-50",
                        )}
                      >
                        <div className="flex h-full flex-col justify-between gap-4">
                          <div>
                            <p
                              className={clsx(
                                "text-sm font-semibold",
                                isDarkMode ? "text-zinc-100" : "text-zinc-900",
                              )}
                            >
                              {clientItem.company_name}
                            </p>
                            <p className="mt-1 text-xs text-zinc-500">
                              Empresa participante do evento
                            </p>
                          </div>
                          <Button
                            size="sm"
                            variant="secondary"
                            icon={<ArrowUpRight size={14} />}
                            className="self-start"
                            onClick={() =>
                              navigate(
                                `/gestor/eventos/${event.id}/operacao/${clientItem.id}`,
                              )
                            }
                          >
                            Abrir operação
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div
                className={clsx(
                  "rounded-[22px] border p-4",
                  isDarkMode
                    ? "border-zinc-800 bg-[#0b0b0b]"
                    : "border-zinc-100 bg-white",
                )}
              >
                <p className="text-sm font-semibold text-zinc-400">
                  Time de vendas
                </p>
                <div className="mt-4 grid grid-cols-3 gap-3">
                  <div className="rounded-[18px] bg-zinc-50 p-3 text-center">
                    <p className="text-xl font-black text-[#FF0636]">
                      {teams.length}
                    </p>
                    <p className="mt-1 text-[11px] text-zinc-500">Times</p>
                  </div>
                  <div className="rounded-[18px] bg-zinc-50 p-3 text-center">
                    <p className="text-xl font-black text-[#3D56A2]">
                      {totalMembers}
                    </p>
                    <p className="mt-1 text-[11px] text-zinc-500">Membros</p>
                  </div>
                  <div className="rounded-[18px] bg-zinc-50 p-3 text-center">
                    <p className="text-xl font-black text-[#FBBB49]">
                      {availableVendors.length}
                    </p>
                    <p className="mt-1 text-[11px] text-zinc-500">
                      Disponíveis
                    </p>
                  </div>
                </div>

                <div className="mt-5 space-y-3">
                  <div
                    className={clsx(
                      "rounded-[18px] border p-4",
                      isDarkMode
                        ? "border-zinc-800 bg-[#101010]"
                        : "border-zinc-50 bg-zinc-50",
                    )}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p
                        className={clsx(
                          "text-sm font-semibold",
                          isDarkMode ? "text-zinc-100" : "text-zinc-900",
                        )}
                      >
                        Times ativos
                      </p>
                      <span className="text-xs text-zinc-500">
                        Resumo rápido
                      </span>
                    </div>
                    <div className="mt-3 space-y-2">
                      {teams.length === 0 ? (
                        <p className="text-sm text-zinc-500">
                          Nenhum time criado ainda.
                        </p>
                      ) : (
                        teams.slice(0, 4).map((team) => (
                          <div
                            key={team.id}
                            className="flex items-center justify-between rounded-2xl bg-white/70 px-3 py-2 text-sm"
                          >
                            <span
                              className={clsx(
                                "font-medium",
                                isDarkMode ? "text-zinc-200" : "text-zinc-700",
                              )}
                            >
                              {team.name}
                            </span>
                            <span className="text-xs text-zinc-500">
                              {team.members.length} membro
                              {team.members.length !== 1 ? "s" : ""}
                            </span>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  <div
                    className={clsx(
                      "rounded-[18px] border p-4",
                      isDarkMode
                        ? "border-zinc-800 bg-[#101010]"
                        : "border-zinc-50 bg-zinc-50",
                    )}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p
                        className={clsx(
                          "text-sm font-semibold",
                          isDarkMode ? "text-zinc-100" : "text-zinc-900",
                        )}
                      >
                        Vendedores disponíveis
                      </p>
                      <span className="text-xs text-zinc-500">
                        {availableVendors.length}
                      </span>
                    </div>
                    <p className="mt-2 text-sm text-zinc-500">
                      {availableVendors.length === 0
                        ? "Nenhum vendedor livre no momento."
                        : "Prontos para entrar em um time ou serem atribuídos à operação."}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </Card>

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
              Resumo operacional
            </h3>
            <div className="mt-5 space-y-4">
              <div
                className={clsx(
                  "rounded-[22px] border p-4",
                  isDarkMode
                    ? "border-zinc-800 bg-[#0b0b0b]"
                    : "border-zinc-100 bg-zinc-50",
                )}
              >
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-400">
                  Status
                </p>
                <div className="mt-2">
                  <EventStatusBadge status={event.status} />
                </div>
              </div>
              <div
                className={clsx(
                  "rounded-[22px] border p-4",
                  isDarkMode
                    ? "border-zinc-800 bg-[#0b0b0b]"
                    : "border-zinc-100 bg-zinc-50",
                )}
              >
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-400">
                  Capacidade
                </p>
                <p
                  className={clsx(
                    "mt-2 text-lg font-black",
                    isDarkMode ? "text-zinc-100" : "text-zinc-950",
                  )}
                >
                  {event.capacity != null
                    ? `${event.capacity} lugares`
                    : "Não configurada"}
                </p>
                <p className="mt-1 text-xs text-zinc-500">
                  {event.capacity != null
                    ? `${event.leads_count} leads ocupando ${capacityUsage}% da capacidade`
                    : "Defina a capacidade para acompanhar ocupação."}
                </p>
              </div>
              <div
                className={clsx(
                  "rounded-[22px] border p-4",
                  isDarkMode
                    ? "border-zinc-800 bg-[#0b0b0b]"
                    : "border-zinc-100 bg-zinc-50",
                )}
              >
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-400">
                  Base do evento
                </p>
                <p
                  className={clsx(
                    "mt-2 text-sm font-semibold",
                    isDarkMode ? "text-zinc-100" : "text-zinc-900",
                  )}
                >
                  {event.event_type || "Tipo não definido"}
                </p>
                <p className="mt-1 text-xs text-zinc-500">
                  {event.location || "Local ainda não informado"}
                </p>
              </div>
            </div>

            <div className="mt-6">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-400">
                    Linha do tempo
                  </p>
                  <h4
                    className={clsx(
                      "mt-1 text-base font-black tracking-tight",
                      isDarkMode ? "text-zinc-100" : "text-zinc-950",
                    )}
                  >
                    Ciclo do evento
                  </h4>
                </div>
                <Clock3 size={18} className="text-zinc-400" />
              </div>

              <div className="mt-4 space-y-3">
                {[
                  {
                    label: "Evento criado",
                    value: formatDateTime(event.created_at),
                    color: "rose",
                  },
                  {
                    label: "Lançamento",
                    value: formatDateTime(event.launch_date),
                    color: "blue",
                  },
                  {
                    label: "Data do evento",
                    value: formatDateTime(event.event_date),
                    color: "amber",
                  },
                  {
                    label: "Encerramento",
                    value: formatDateTime(event.event_end_date),
                    color: "emerald",
                  },
                  {
                    label: "Atualizado em",
                    value: formatDateTime(event.updated_at),
                    color: "blue",
                  },
                ].map((item) => (
                  <div
                    key={item.label}
                    className={clsx(
                      "flex items-start gap-3 rounded-[20px] border px-4 py-3",
                      isDarkMode
                        ? "border-zinc-800 bg-[#0b0b0b]"
                        : "border-zinc-100 bg-zinc-50",
                    )}
                  >
                    <span
                      className={clsx(
                        "mt-1 h-2.5 w-2.5 rounded-full",
                        item.color === "rose"
                          ? "bg-[#FF0636]"
                          : item.color === "blue"
                            ? "bg-[#3D56A2]"
                            : item.color === "amber"
                              ? "bg-[#FBBB49]"
                              : "bg-emerald-500",
                      )}
                    />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-zinc-900">
                        {item.label}
                      </p>
                      <p className="mt-0.5 text-xs text-zinc-500">
                        {item.value}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </Card>
        </div>
      )}

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
                  Início
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
              <div className="flex items-center justify-between">
                <h3
                  className={clsx(
                    "text-lg font-black tracking-tight",
                    isDarkMode ? "text-zinc-100" : "text-zinc-950",
                  )}
                >
                  Participação do evento
                </h3>
                <Building2 size={18} className="text-zinc-400" />
              </div>
              <p
                className={clsx(
                  "mt-4 text-sm",
                  isDarkMode ? "text-zinc-300" : "text-zinc-600",
                )}
              >
                O evento é independente e reúne várias empresas participantes. A
                empresa âncora técnica usada internamente hoje é{" "}
                {selectedClient?.company_name ?? "não identificada"}.
              </p>
              <div className="mt-4 grid gap-2 text-sm">
                <div
                  className={clsx(
                    "flex items-center justify-between rounded-2xl px-3 py-2",
                    isDarkMode
                      ? "bg-[#0b0b0b] text-zinc-300"
                      : "bg-zinc-50 text-zinc-600",
                  )}
                >
                  <span>Empresas participantes</span>
                  <span>{participantClients.length}</span>
                </div>
                <div
                  className={clsx(
                    "flex items-center justify-between rounded-2xl px-3 py-2",
                    isDarkMode
                      ? "bg-[#0b0b0b] text-zinc-300"
                      : "bg-zinc-50 text-zinc-600",
                  )}
                >
                  <span>Criado em</span>
                  <span>{formatDateTime(event.created_at)}</span>
                </div>
                <div
                  className={clsx(
                    "flex items-center justify-between rounded-2xl px-3 py-2",
                    isDarkMode
                      ? "bg-[#0b0b0b] text-zinc-300"
                      : "bg-zinc-50 text-zinc-600",
                  )}
                >
                  <span>Atualizado em</span>
                  <span>{formatDateTime(event.updated_at)}</span>
                </div>
              </div>
            </Card>

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
                  <p className="mt-1 text-sm text-zinc-500">
                    As empresas daqui liberam seus vendedores para criação e
                    manutenção dos times.
                  </p>
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
                Galeria
              </h3>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {event.image_urls.filter(Boolean).length === 0 ? (
                  <div
                    className={clsx(
                      "rounded-2xl border border-dashed px-4 py-10 text-center text-sm",
                      isDarkMode
                        ? "border-zinc-700 text-zinc-500"
                        : "border-zinc-200 text-zinc-500",
                    )}
                  >
                    Nenhuma imagem cadastrada.
                  </div>
                ) : (
                  event.image_urls
                    .filter(Boolean)
                    .slice(0, 4)
                    .map((url, index) => (
                      <div
                        key={`${url}-${index}`}
                        className="overflow-hidden rounded-2xl border border-zinc-100 bg-zinc-50"
                      >
                        <img
                          src={url}
                          alt={`Imagem do evento ${index + 1}`}
                          className="h-36 w-full object-cover"
                        />
                      </div>
                    ))
                )}
              </div>
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
                Mostrando {filteredEventLeads.length} de {eventLeads.length}{" "}
                leads
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
                      {filteredEventLeads.map((lead) => (
                        <tr
                          key={lead.id}
                          className={clsx(
                            "cursor-pointer",
                            isDarkMode
                              ? "hover:bg-[#0b0b0b]"
                              : "hover:bg-zinc-50",
                          )}
                          onClick={() => openLeadDrawer(lead)}
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
                                variant="secondary"
                                size="sm"
                                loading={leadRowSavingId === lead.id}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  void handleQuickLeadStatusChange(lead);
                                }}
                              >
                                {lead.confirmation_status === "pending"
                                  ? "Agendar"
                                  : lead.confirmation_status === "scheduled"
                                    ? "Confirmar"
                                    : lead.confirmation_status === "confirmed"
                                      ? "Check-in"
                                      : lead.confirmation_status ===
                                          "checked_in"
                                        ? "Reabrir"
                                        : "Ativar"}
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                icon={<MessageSquareMore size={14} />}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openLeadDrawer(lead);
                                }}
                              >
                                Abrir
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </Card>
      )}

      {activeTab === "time" && (
        <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
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
              Criar time
            </h3>
            <p
              className={clsx(
                "mt-2 text-sm",
                isDarkMode ? "text-zinc-400" : "text-zinc-500",
              )}
            >
              Estruture os vendedores do evento em grupos menores.
            </p>
            <div className="mt-5 flex gap-2">
              <input
                type="text"
                value={newTeamName}
                onChange={(e) => setNewTeamName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && void handleCreateTeam()}
                placeholder="Nome do time"
                className={clsx(
                  "flex-1 rounded-2xl border px-4 py-3 text-sm outline-none focus:border-[#FF0636]",
                  isDarkMode
                    ? "border-zinc-700 bg-[#0b0b0b] text-zinc-100 placeholder:text-zinc-500"
                    : "border-zinc-200 bg-white text-zinc-950 placeholder:text-zinc-400",
                )}
              />
              <Button
                loading={teamCreating}
                onClick={() => void handleCreateTeam()}
                icon={<Plus size={16} />}
              >
                Criar
              </Button>
            </div>
            <div className="mt-5 rounded-2xl border border-dashed border-zinc-200 px-4 py-4 text-sm text-zinc-500">
              {availableVendors.length} membro
              {availableVendors.length !== 1 ? "s" : ""} disponível
              {availableVendors.length !== 1 ? "eis" : ""}
              para alocação.
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
                    <div className="flex items-center justify-between gap-3 border-b border-zinc-100 px-5 py-4">
                      <div className="flex items-center gap-2">
                        {team.logo_url ? (
                          <img
                            src={team.logo_url}
                            alt={team.name}
                            className="h-7 w-7 rounded-full object-cover ring-1 ring-zinc-200"
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
                        <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-medium text-zinc-600">
                          {team.members.length} membro
                          {team.members.length !== 1 ? "s" : ""}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleEditTeam(team)}
                          className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
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
                              setAddMemberSelectionId(
                                nextOpen ? (available[0]?.id ?? "") : "",
                              );
                            }}
                            className="inline-flex items-center gap-1 rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-50"
                          >
                            <Plus size={12} />
                            Adicionar membro
                          </button>
                        ) : (
                          <span className="rounded-full bg-zinc-100 px-3 py-1.5 text-[11px] font-medium text-zinc-500">
                            Sem membros disponíveis
                          </span>
                        )}
                        <button
                          type="button"
                          disabled={teamDeleting === team.id}
                          onClick={() => void handleDeleteTeam(team)}
                          className="rounded-xl p-2 text-zinc-400 hover:bg-red-50 hover:text-red-500 disabled:opacity-40"
                          title="Excluir time"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>

                    {addMemberOpen && (
                      <div
                        className={clsx(
                          "border-b px-5 py-4",
                          isDarkMode
                            ? "border-zinc-800 bg-[#0b0b0b]"
                            : "border-zinc-100 bg-zinc-50/60",
                        )}
                      >
                        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
                          <Select
                            label="Membro disponível"
                            dark={isDarkMode}
                            value={addMemberSelectionId}
                            onChange={(e) =>
                              setAddMemberSelectionId(e.target.value)
                            }
                            placeholder="Selecione um membro"
                            options={available.map((vendor) => ({
                              value: vendor.id,
                              label: `${vendor.name} · ${vendor.email}`,
                            }))}
                          />
                          <div className="flex gap-2">
                            <Button
                              variant="secondary"
                              onClick={() => {
                                setAddMemberTeamId(null);
                                setAddMemberSelectionId("");
                              }}
                            >
                              Fechar
                            </Button>
                            <Button
                              loading={memberToggling === addMemberSelectionId}
                              isDisabled={!addMemberSelectionId}
                              onClick={() =>
                                void handleAddMember(
                                  team.id,
                                  addMemberSelectionId,
                                )
                              }
                            >
                              Adicionar
                            </Button>
                          </div>
                        </div>
                      </div>
                    )}

                    {team.members.length === 0 ? (
                      <p className="px-5 py-4 text-sm text-zinc-500">
                        Nenhum membro neste time ainda.
                      </p>
                    ) : (
                      <div className="divide-y divide-zinc-100">
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
                            <div className="space-y-2">
                              {members.map((member) => (
                                <div
                                  key={member.user_id}
                                  className="flex items-center justify-between rounded-2xl border border-zinc-100 px-4 py-3"
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
          className="grid gap-6 lg:grid-cols-[1fr_0.8fr]"
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
                <p
                  className={clsx(
                    "mt-1 text-sm",
                    isDarkMode ? "text-zinc-400" : "text-zinc-500",
                  )}
                >
                  Edite os dados principais, imagem e vínculos do evento.
                </p>
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
              <div>
                <Input
                  dark={isDarkMode}
                  label="Imagem de capa"
                  value={formCoverImageUrl}
                  onChange={(e) => setFormCoverImageUrl(e.target.value)}
                />
              </div>
            </div>

            <div className="mt-6">
              <div className="mb-3 flex items-center gap-2">
                <ImageIcon size={16} className="text-zinc-400" />
                <p className="text-sm font-semibold text-zinc-500">
                  Galeria de imagens
                </p>
              </div>
              <div className="space-y-3">
                {formImageUrls.map((url, index) => (
                  <div key={`image-${index}`} className="flex gap-2">
                    <Input
                      dark={isDarkMode}
                      value={url}
                      onChange={(e) =>
                        setFormImageUrls((current) =>
                          current.map((item, i) =>
                            i === index ? e.target.value : item,
                          ),
                        )
                      }
                      placeholder={`Imagem ${index + 1}`}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() =>
                        setFormImageUrls((current) =>
                          current.filter((_, i) => i !== index),
                        )
                      }
                    >
                      Remover
                    </Button>
                  </div>
                ))}
                <Button
                  type="button"
                  variant="secondary"
                  icon={<Plus size={16} />}
                  onClick={() =>
                    setFormImageUrls((current) => [...current, ""])
                  }
                >
                  Adicionar imagem
                </Button>
              </div>
            </div>

            <div className="mt-6">
              <div className="mb-3 flex items-center gap-2">
                <Users size={16} className="text-zinc-400" />
                <p className="text-sm font-semibold text-zinc-500">
                  Clientes participantes
                </p>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {allClients
                  .filter(
                    (item) =>
                      item.id !==
                      (event?.participant_client_ids[0] ?? client?.id),
                  )
                  .map((item) => {
                    const checked = formExtraClientIds.includes(item.id);
                    return (
                      <label
                        key={item.id}
                        className={clsx(
                          "flex cursor-pointer items-center gap-3 rounded-2xl border px-3 py-3 text-sm",
                          checked
                            ? "border-[#E51838] bg-[#E51838]/5 text-[#E51838]"
                            : isDarkMode
                              ? "border-zinc-800 bg-[#0b0b0b] text-zinc-300"
                              : "border-zinc-200 bg-zinc-50 text-zinc-700",
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() =>
                            setFormExtraClientIds((current) =>
                              checked
                                ? current.filter((id) => id !== item.id)
                                : [...current, item.id],
                            )
                          }
                          className="h-4 w-4 rounded border-zinc-300 text-[#E51838] focus:ring-[#E51838]"
                        />
                        <div>
                          <p className="font-medium">{item.company_name}</p>
                          <p className="text-[11px] opacity-70">{item.plan}</p>
                        </div>
                      </label>
                    );
                  })}
              </div>
            </div>
          </Card>

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
              Ações
            </h3>
            <p
              className={clsx(
                "mt-2 text-sm",
                isDarkMode ? "text-zinc-400" : "text-zinc-500",
              )}
            >
              Salve as alterações ou remova o evento definitivamente.
            </p>

            <div className="mt-5 space-y-3">
              <Button
                type="submit"
                loading={settingsSaving}
                icon={<Pencil size={16} />}
              >
                Salvar alterações
              </Button>
              {eventIsArchived && (
                <Button
                  type="button"
                  loading={settingsSaving}
                  onClick={() => void handleQuickStatusChange("active")}
                  icon={<ArrowUpRight size={16} />}
                >
                  Reativar evento
                </Button>
              )}
              <Button
                type="button"
                variant="destructive"
                loading={settingsDeleting}
                onClick={() => void handleDeleteEvent()}
                icon={<Trash2 size={16} />}
              >
                Excluir evento
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => navigate("/gestor/eventos")}
                icon={<ArrowLeft size={16} />}
              >
                Voltar à lista
              </Button>
            </div>
          </Card>
        </form>
      )}

      {activeTab === "relatorio" && event && (
        <EventReportTab
          event={event}
          leads={eventLeads}
          rankingData={rankingData}
          teams={teams}
          isDarkMode={isDarkMode}
          loading={rankingLoading}
          lastUpdatedAt={rankingUpdatedAt}
          onExportCsv={() => {
            const leadsByVendor: Record<string, number> = {};
            for (const lead of eventLeads) {
              const key = lead.registered_by_id ?? lead.assigned_vendor_id;
              if (key) leadsByVendor[key] = (leadsByVendor[key] ?? 0) + 1;
            }
            const rows: string[][] = [
              [
                "Vendedor",
                "Leads Cadastrados",
                "Agendamentos",
                "Check-ins",
                "Vendas",
                "Pontos",
              ],
              ...rankingData.map((v) => [
                v.vendor_name,
                String(leadsByVendor[v.vendor_id] ?? 0),
                String(v.scheduled.count),
                String(v.checked_in.count),
                String(v.sold.count),
                String(v.total_points),
              ]),
            ];
            downloadCsv(`relatorio-${event.name}.csv`, rows);
          }}
        />
      )}

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
                    onChange={(e) =>
                      setLeadDrawerStatus(e.target.value as ConfirmationStatus)
                    }
                    options={leadActionStatusOptions}
                  />
                  <Select
                    label="Vendedor"
                    dark={isDarkMode}
                    value={leadDrawerVendorId}
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
                    <div className="mt-3 space-y-2 text-sm">
                      <div className="flex items-center gap-2 text-zinc-500">
                        <Mail size={14} />
                        <span>{selectedLead.email || "Sem e-mail"}</span>
                      </div>
                      <div className="flex items-center gap-2 text-zinc-500">
                        <Phone size={14} />
                        <span>{selectedLead.phone || "Sem telefone"}</span>
                      </div>
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
                    <div className="mt-3 space-y-2 text-sm text-zinc-500">
                      <p>
                        {formatDateTime(
                          selectedLead.active_appointment.scheduled_at,
                        )}
                      </p>
                      <p>Status: {selectedLead.active_appointment.status}</p>
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                loading={leadDrawerSaving}
                onClick={() => void handleSaveLeadQuickActions()}
                icon={<Pencil size={16} />}
              >
                Salvar alterações
              </Button>
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
