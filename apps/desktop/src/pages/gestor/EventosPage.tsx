import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import clsx from "clsx";
import {
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  MapPin,
  PencilLine,
  Plus,
  Search,
  Settings,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { PageHeader } from "../../components/shared/PageHeader";
import { Card } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { EventStatusBadge } from "../../components/ui/Badge";
import { ConfirmationModal } from "../../components/ui/ConfirmationModal";
import { Select } from "../../components/ui/Select";
import { Drawer, Modal } from "../../components/ui/Modal";
import { Notice } from "../../components/ui/Notice";
import { Tabs } from "../../components/ui/Tabs";
import { readStoredSession } from "../../services/auth";
import { listClients, mapApiClientToClient } from "../../services/clients";
import { fetchAllLeads } from "../../services/leads";
import {
  createEvent,
  deleteEvent,
  listEvents,
  mapApiEventToEvent,
  updateEvent,
} from "../../services/events";
import {
  addTeamMember,
  createSalesTeam,
  deleteSalesTeam,
  listSalesTeams,
  removeTeamMember,
  type SalesTeam,
  type TeamMemberUser,
} from "../../services/salesTeams";
import { listUsers, type StaffUser } from "../../services/users";
import type { Client, Event } from "../../types";
import { useGestorClient } from "../../hooks/useGestorClient";
import {
  DASHBOARD_DARK_CHANGE_EVENT,
  readDashboardDarkEnabled,
} from "../../lib/dashboard-dark-mode";

function formatDate(date: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(date));
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function getStatusTone(status: Event["status"]) {
  switch (status) {
    case "active":
      return { strip: "bg-[#FF0636]", tint: "bg-[#FFE6EB]" };
    case "completed":
      return { strip: "bg-[#3D56A2]", tint: "bg-[#E9ECFB]" };
    case "draft":
      return { strip: "bg-[#FBBB49]", tint: "bg-[#FFF0D1]" };
    case "cancelled":
      return { strip: "bg-zinc-400", tint: "bg-[#F2F2F5]" };
    default:
      return { strip: "bg-zinc-300", tint: "bg-zinc-100" };
  }
}

type EventPageQuery = {
  clientId: string;
  eventId: string;
  campaignId: string;
};

type TeamAction =
  | {
      kind: "team";
      team: SalesTeam;
    }
  | {
      kind: "member";
      team: SalesTeam;
      member: TeamMemberUser;
    };

function resolveEventQuery(searchParams: URLSearchParams): EventPageQuery {
  return {
    clientId: searchParams.get("clientId") ?? "",
    eventId: searchParams.get("eventId") ?? "",
    campaignId: searchParams.get("campaignId") ?? "",
  };
}

export function EventosPage() {
  const navigate = useNavigate();
  const { user } = useGestorClient();
  const [searchParams] = useSearchParams();
  const query = resolveEventQuery(searchParams);
  const [isDarkMode, setIsDarkMode] = useState(() =>
    readDashboardDarkEnabled(user.id),
  );

  const [clients, setClients] = useState<Client[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [selectedEventId, setSelectedEventId] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | Event["status"]>(
    "all",
  );
  const [showModal, setShowModal] = useState(false);
  const [editingEvent, setEditingEvent] = useState<Event | null>(null);
  const [eventSaving, setEventSaving] = useState(false);
  const [eventDeleting, setEventDeleting] = useState(false);
  const [eventToDelete, setEventToDelete] = useState<Event | null>(null);
  const [eventError, setEventError] = useState("");
  const [eventPanelOpen, setEventPanelOpen] = useState(false);
  const [eventPanelTab, setEventPanelTab] = useState<
    "info" | "teams" | "rubinho"
  >("info");
  const [teams, setTeams] = useState<SalesTeam[]>([]);
  const [teamsLoading, setTeamsLoading] = useState(false);
  const [teamsError, setTeamsError] = useState("");
  const [newTeamName, setNewTeamName] = useState("");
  const [teamCreating, setTeamCreating] = useState(false);
  const [teamDeleting, setTeamDeleting] = useState<string | null>(null);
  const [teamAction, setTeamAction] = useState<TeamAction | null>(null);
  const [teamActionLoading, setTeamActionLoading] = useState(false);
  const [addMemberTeamId, setAddMemberTeamId] = useState<string | null>(null);
  const [addMemberSelectionId, setAddMemberSelectionId] = useState("");
  const [memberToggling, setMemberToggling] = useState<string | null>(null);
  const [availableVendors, setAvailableVendors] = useState<StaffUser[]>([]);
  const [selectedClientFilter, setSelectedClientFilter] = useState<
    "all" | string
  >("all");
  const [periodFilter, setPeriodFilter] = useState<"all" | "upcoming" | "past">(
    "all",
  );
  const [cancelledCountByEvent, setCancelledCountByEvent] = useState<
    Record<string, number>
  >({});

  // Estado da Paginação da Tabela de Eventos
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(10);

  // Reseta a paginação para 1 quando os filtros ou busca alterarem
  useEffect(() => {
    setCurrentPage(1);
  }, [search, selectedClientFilter, statusFilter, periodFilter]);

  // ── Form state (modal de criação/edição) ────────────────────────────────────
  const [formTab, setFormTab] = useState<
    "dados" | "datas" | "local" | "participantes"
  >("dados");
  const [formName, setFormName] = useState("");
  const [formEventType, setFormEventType] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formLaunchDate, setFormLaunchDate] = useState("");
  const [formStatus, setFormStatus] = useState<Event["status"]>("draft");
  const [formRequireWristband, setFormRequireWristband] = useState(false);
  const [formTotalInvestment, setFormTotalInvestment] = useState("");
  const [formPaidTraffic, setFormPaidTraffic] = useState("");
  const [formSalesTarget, setFormSalesTarget] = useState("");
  const [formDays, setFormDays] = useState<
    Array<{ start: string; end: string }>
  >([{ start: "", end: "" }]);
  const [formCep, setFormCep] = useState("");
  const [formLogradouro, setFormLogradouro] = useState("");
  const [formNumero, setFormNumero] = useState("");
  const [formComplemento, setFormComplemento] = useState("");
  const [formBairro, setFormBairro] = useState("");
  const [formCidade, setFormCidade] = useState("");
  const [formUf, setFormUf] = useState("");
  const [formCepLoading, setFormCepLoading] = useState(false);
  const [formExtraClientIds, setFormExtraClientIds] = useState<string[]>([]);

  useEffect(() => {
    setIsDarkMode(readDashboardDarkEnabled(user.id));
  }, [user.id]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const syncTheme = () => {
      setIsDarkMode(readDashboardDarkEnabled(user.id));
    };

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

  useEffect(() => {
    const t = readStoredSession()?.accessToken;
    if (!t) return;
    void listClients(t)
      .then((rows) => setClients(rows.map(mapApiClientToClient)))
      .catch(() => setClients([]));
  }, []);

  useEffect(() => {
    const t = readStoredSession()?.accessToken;
    if (!t) return;
    void listUsers(t)
      .then((rows) =>
        setAvailableVendors(
          rows.filter((user) => user.role !== "cliente" && user.is_active),
        ),
      )
      .catch(() => setAvailableVendors([]));
  }, []);

  useEffect(() => {
    const t = readStoredSession()?.accessToken;
    if (!t) {
      setEvents([]);
      return;
    }
    const params =
      selectedClientFilter === "all" ? {} : { client_id: selectedClientFilter };
    void listEvents(params, t)
      .then((rows) => setEvents(rows.map(mapApiEventToEvent)))
      .catch(() => setEvents([]));
  }, [selectedClientFilter]);

  useEffect(() => {
    const t = readStoredSession()?.accessToken;
    if (!t) return;
    void fetchAllLeads({ confirmation_status: "cancelled" }, t)
      .then((rows) => {
        const counts: Record<string, number> = {};
        rows.forEach((row) => {
          if (!row.event_id) return;
          counts[row.event_id] = (counts[row.event_id] ?? 0) + 1;
        });
        setCancelledCountByEvent(counts);
      })
      .catch(() => setCancelledCountByEvent({}));
  }, []);

  useEffect(() => {
    if (!clients.length) return;
    const targetEventId = query.eventId || query.campaignId;
    const matched = targetEventId
      ? events.find((e) => e.id === targetEventId)
      : undefined;
    const clientId = query.clientId || matched?.client_id || "";
    if (!clientId || selectedClientFilter !== "all") return;
    if (clients.some((c) => c.id === clientId)) {
      setSelectedClientFilter(clientId);
    }
  }, [
    clients,
    query.clientId,
    query.eventId,
    query.campaignId,
    events,
    selectedClientFilter,
  ]);

  useEffect(() => {
    if (!events.length) {
      setSelectedEventId("");
      return;
    }
    const targetEventId = query.eventId || query.campaignId;
    const pick =
      (targetEventId && events.find((e) => e.id === targetEventId)?.id) ||
      events.find((e) => e.status === "active")?.id ||
      events[0]?.id ||
      "";
    setSelectedEventId((prev) =>
      prev && events.some((e) => e.id === prev) ? prev : pick,
    );
  }, [events, query.eventId, query.campaignId]);

  const filteredEvents = useMemo(() => {
    const q = search.trim().toLowerCase();
    const nowMs = Date.now();

    return events
      .filter((event) => {
        const participantClients = clients.filter((item) =>
          event.participant_client_ids.includes(item.id),
        );
        const matchesClient =
          selectedClientFilter === "all" ||
          event.participant_client_ids.includes(selectedClientFilter);
        const matchesStatus =
          statusFilter === "all" || event.status === statusFilter;
        const matchesPeriod =
          periodFilter === "all" ||
          (periodFilter === "upcoming"
            ? new Date(event.event_date).getTime() >= nowMs
            : new Date(event.event_date).getTime() < nowMs);
        const matchesSearch =
          !q ||
          event.name.toLowerCase().includes(q) ||
          event.description.toLowerCase().includes(q) ||
          event.location.toLowerCase().includes(q) ||
          participantClients.some((client) =>
            client.company_name.toLowerCase().includes(q),
          );

        return matchesClient && matchesStatus && matchesPeriod && matchesSearch;
      })
      .sort(
        (a, b) =>
          new Date(a.event_date).getTime() - new Date(b.event_date).getTime(),
      );
  }, [
    search,
    selectedClientFilter,
    statusFilter,
    periodFilter,
    events,
    clients,
  ]);

  const totalPages = Math.max(1, Math.ceil(filteredEvents.length / pageSize));
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, filteredEvents.length);

  const paginatedEvents = useMemo(() => {
    return filteredEvents.slice(startIndex, startIndex + pageSize);
  }, [filteredEvents, startIndex, pageSize]);

  const selectedEvent =
    filteredEvents.find((event) => event.id === selectedEventId) ??
    filteredEvents[0] ??
    null;

  const assignedVendorIds = useMemo(
    () =>
      new Set(
        teams.flatMap((team) => team.members.map((member) => member.user_id)),
      ),
    [teams],
  );

  const availableEventVendors = useMemo(
    () =>
      availableVendors.filter(
        (vendor) =>
          !assignedVendorIds.has(vendor.id) &&
          !!vendor.client_id &&
          !!selectedEvent?.participant_client_ids.includes(vendor.client_id),
      ),
    [
      availableVendors,
      assignedVendorIds,
      selectedEvent?.participant_client_ids,
    ],
  );

  useEffect(() => {
    if (!selectedEvent?.id) {
      setTeams([]);
      setTeamsLoading(false);
      setTeamsError("");
      setAddMemberTeamId(null);
      setAddMemberSelectionId("");
      return;
    }

    const session = readStoredSession();
    if (!session?.accessToken) return;

    let active = true;
    setTeamsLoading(true);
    setTeamsError("");
    setAddMemberTeamId(null);
    setAddMemberSelectionId("");

    listSalesTeams(session.accessToken, selectedEvent.id)
      .then((rows) => {
        if (active) setTeams(rows);
      })
      .catch((err) => {
        if (active) {
          setTeams([]);
          setTeamsError(
            getErrorMessage(
              err,
              "Não foi possível carregar os times do evento.",
            ),
          );
        }
      })
      .finally(() => {
        if (active) setTeamsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [selectedEvent?.id]);

  function resetFormState(ev: Event | null) {
    setFormTab("dados");
    setFormName(ev?.name ?? "");
    setFormEventType(ev?.event_type ?? "");
    setFormDescription(ev?.description ?? "");
    setFormLaunchDate(ev?.launch_date ? ev.launch_date.slice(0, 10) : "");
    setFormStatus(ev?.status ?? "draft");
    setFormRequireWristband(ev?.require_wristband ?? false);
    setFormTotalInvestment(
      ev?.total_investment != null ? String(ev.total_investment) : "",
    );
    setFormPaidTraffic(
      ev?.paid_traffic_investment != null
        ? String(ev.paid_traffic_investment)
        : "",
    );
    setFormSalesTarget(ev?.sales_target != null ? String(ev.sales_target) : "");
    let daysToSet: Array<{ start: string; end: string }> = [
      { start: "", end: "" },
    ];
    if (ev) {
      if (Array.isArray(ev.event_days) && ev.event_days.length > 0) {
        daysToSet = ev.event_days.map((d) => ({
          start: typeof d.start === "string" ? d.start.slice(0, 16) : "",
          end: typeof d.end === "string" ? d.end.slice(0, 16) : "",
        }));
      } else {
        const s =
          typeof ev.event_date === "string" ? ev.event_date.slice(0, 16) : "";
        const e =
          typeof ev.event_end_date === "string"
            ? ev.event_end_date.slice(0, 16)
            : "";
        daysToSet = [{ start: s, end: e }];
      }
    }
    setFormDays(daysToSet);
    let logradouro = "";
    let numero = "";
    let complemento = "";
    let bairro = "";
    let cidade = "";
    let uf = "";

    if (ev?.location) {
      const parts = ev.location.split(",").map((p) => p.trim());
      const remainingParts = [...parts];

      const lastPart = remainingParts[remainingParts.length - 1];
      if (lastPart && lastPart.includes("/")) {
        const [c, u] = lastPart.split("/");
        cidade = c ? c.trim() : "";
        uf = u ? u.trim() : "";
        remainingParts.pop();
      }

      const numIdx = remainingParts.findIndex((p) =>
        p.toLowerCase().startsWith("nº "),
      );
      if (numIdx !== -1) {
        numero = remainingParts[numIdx].substring(2).trim();
        remainingParts.splice(numIdx, 1);
      }

      if (remainingParts.length > 0) {
        logradouro = remainingParts[0];
      }
      if (remainingParts.length === 2) {
        bairro = remainingParts[1];
      } else if (remainingParts.length >= 3) {
        complemento = remainingParts[1];
        bairro = remainingParts[2];
      }
    }

    setFormCep("");
    setFormLogradouro(ev ? logradouro || ev.location || "" : "");
    setFormNumero(numero);
    setFormComplemento(complemento);
    setFormBairro(bairro);
    setFormCidade(cidade);
    setFormUf(uf);
    setFormExtraClientIds(
      ev
        ? ev.participant_client_ids
        : selectedClientFilter === "all"
          ? []
          : [selectedClientFilter],
    );
  }

  async function handleCepLookup(cep: string) {
    const digits = cep.replace(/\D/g, "");
    if (digits.length !== 8) return;
    setFormCepLoading(true);
    try {
      const res = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
      const data = (await res.json()) as Record<string, string>;
      if (!data.erro) {
        setFormLogradouro(data.logradouro ?? "");
        setFormBairro(data.bairro ?? "");
        setFormCidade(data.localidade ?? "");
        setFormUf(data.uf ?? "");
      }
    } catch {
      // silent
    } finally {
      setFormCepLoading(false);
    }
  }

  const handleOpenCreate = () => {
    setEditingEvent(null);
    setEventError("");
    resetFormState(null);
    setShowModal(true);
  };

  const handleClientChange = (clientId: string) => {
    setSelectedClientFilter(clientId || "all");
    setSelectedEventId("");
  };

  const handleClose = () => {
    setShowModal(false);
    setEditingEvent(null);
    setEventError("");
  };

  const handleOpenEventPanel = (event: Event) => {
    navigate(`/gestor/eventos/${event.id}`);
  };

  const selectedEventClients = selectedEvent
    ? clients.filter((client) =>
        selectedEvent.participant_client_ids.includes(client.id),
      )
    : [];

  async function performDeleteEvent(eventToDelete: Event) {
    const session = readStoredSession();
    if (!session?.accessToken) return;

    setEventDeleting(true);
    setEventError("");
    try {
      await deleteEvent(eventToDelete.id, session.accessToken);
      setEvents((current) =>
        current.filter((item) => item.id !== eventToDelete.id),
      );
      if (selectedEventId === eventToDelete.id) {
        setSelectedEventId("");
        setEventPanelOpen(false);
        setEventPanelTab("info");
      }
      if (editingEvent?.id === eventToDelete.id) {
        handleClose();
      }
    } catch (err) {
      setEventError(
        err instanceof Error
          ? err.message
          : "Não foi possível excluir o evento.",
      );
    } finally {
      setEventDeleting(false);
    }
  }

  async function handleDeleteEvent() {
    if (!editingEvent) return;
    setEventToDelete(editingEvent);
  }

  async function handleSubmitEvent(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();

    const session = readStoredSession();
    if (!session?.accessToken) {
      setEventError("Faça login novamente para salvar evento.");
      return;
    }

    if (!formName.trim()) {
      setFormTab("dados");
      setEventError("Preencha o nome do evento.");
      return;
    }

    // Validar dias
    for (let i = 0; i < formDays.length; i++) {
      const day = formDays[i];
      if (!day.start) {
        setFormTab("datas");
        setEventError(`Preencha a data de início para o Dia ${i + 1}.`);
        return;
      }

      const startMs = new Date(day.start).getTime();

      if (day.end) {
        const endMs = new Date(day.end).getTime();
        if (endMs <= startMs) {
          setFormTab("datas");
          setEventError(
            `O término do Dia ${i + 1} deve ser posterior ao início do Dia ${i + 1}.`,
          );
          return;
        }
      }

      if (i > 0) {
        const prevDay = formDays[i - 1];
        const prevRefMs = prevDay.end
          ? new Date(prevDay.end).getTime()
          : new Date(prevDay.start).getTime();
        if (startMs < prevRefMs) {
          setFormTab("datas");
          setEventError(
            `O início do Dia ${i + 1} não pode ser anterior ao ${prevDay.end ? "término" : "início"} do Dia ${i}.`,
          );
          return;
        }
      }
    }

    const validParticipantIds = formExtraClientIds.filter((id) => id.trim());
    if (!validParticipantIds.length) {
      setFormTab("participantes");
      setEventError(
        "Adicione ao menos um cliente participante na aba Participantes.",
      );
      return;
    }

    const locationParts = [
      formLogradouro.trim(),
      formNumero.trim() ? `nº ${formNumero.trim()}` : "",
      formComplemento.trim(),
      formBairro.trim(),
      [formCidade.trim(), formUf.trim()].filter(Boolean).join("/"),
    ].filter(Boolean);

    const payload = {
      participant_client_ids: validParticipantIds,
      name: formName.trim(),
      event_type: formEventType || undefined,
      description: formDescription.trim() || undefined,
      launch_date: formLaunchDate || undefined,
      event_date: new Date(formDays[0].start).toISOString(),
      event_end_date: formDays[formDays.length - 1].end
        ? new Date(formDays[formDays.length - 1].end).toISOString()
        : formDays[formDays.length - 1].start
          ? new Date(formDays[formDays.length - 1].start).toISOString()
          : undefined,
      event_days: formDays.map((d) => ({
        start: new Date(d.start).toISOString(),
        end: d.end ? new Date(d.end).toISOString() : "",
      })),
      location: locationParts.join(", ") || undefined,
      status: formStatus,
      require_wristband: formRequireWristband,
      total_investment: formTotalInvestment.trim()
        ? Number(formTotalInvestment.replace(",", "."))
        : undefined,
      paid_traffic_investment: formPaidTraffic.trim()
        ? Number(formPaidTraffic.replace(",", "."))
        : undefined,
      sales_target: formSalesTarget.trim()
        ? Number(formSalesTarget.replace(",", "."))
        : undefined,
    };

    setEventSaving(true);
    setEventError("");
    try {
      const saved = editingEvent
        ? await updateEvent(editingEvent.id, payload, session.accessToken)
        : await createEvent(payload, session.accessToken);
      const mapped = mapApiEventToEvent(saved);

      setEvents((current) =>
        editingEvent
          ? current.map((item) => (item.id === editingEvent.id ? mapped : item))
          : [mapped, ...current],
      );
      setSelectedEventId(mapped.id);
      handleClose();
    } catch (saveError) {
      setEventError(
        saveError instanceof Error
          ? saveError.message
          : "Não foi possível salvar o evento.",
      );
    } finally {
      setEventSaving(false);
    }
  }

  async function handleCreateTeam() {
    if (!selectedEvent?.id || !newTeamName.trim()) return;

    const session = readStoredSession();
    if (!session?.accessToken) return;

    setTeamCreating(true);
    setTeamsError("");
    try {
      const created = await createSalesTeam(
        session.accessToken,
        selectedEvent.id,
        newTeamName.trim(),
      );
      setTeams((current) => [...current, created]);
      setNewTeamName("");
    } catch (err) {
      setTeamsError(getErrorMessage(err, "Não foi possível criar o time."));
    } finally {
      setTeamCreating(false);
    }
  }

  function handleDeleteTeam(team: SalesTeam) {
    setTeamAction({ kind: "team", team });
  }

  async function handleAddMember(teamId: string, userId: string) {
    const session = readStoredSession();
    if (!session?.accessToken) return;

    setMemberToggling(userId);
    setTeamsError("");
    try {
      const updated = await addTeamMember(session.accessToken, teamId, userId);
      if (updated) {
        setTeams((current) =>
          current.map((team) => (team.id === teamId ? updated : team)),
        );
      }
      setAddMemberTeamId(null);
      setAddMemberSelectionId("");
    } catch (err) {
      setTeamsError(
        getErrorMessage(err, "Não foi possível adicionar o vendedor ao time."),
      );
    } finally {
      setMemberToggling(null);
    }
  }

  function handleRemoveMember(team: SalesTeam, member: TeamMemberUser) {
    setTeamAction({ kind: "member", team, member });
  }

  async function performDeleteTeam(teamId: string) {
    const session = readStoredSession();
    if (!session?.accessToken) return;

    setTeamDeleting(teamId);
    setTeamsError("");
    try {
      await deleteSalesTeam(session.accessToken, teamId);
      setTeams((current) => current.filter((team) => team.id !== teamId));
    } catch (err) {
      setTeamsError(getErrorMessage(err, "Não foi possível excluir o time."));
    } finally {
      setTeamDeleting(null);
    }
  }

  async function performRemoveMember(teamId: string, userId: string) {
    const session = readStoredSession();
    if (!session?.accessToken) return;

    setMemberToggling(userId);
    setTeamsError("");
    try {
      const updated = await removeTeamMember(
        session.accessToken,
        teamId,
        userId,
      );
      if (updated) {
        setTeams((current) =>
          current.map((team) => (team.id === teamId ? updated : team)),
        );
      }
    } catch (err) {
      setTeamsError(
        getErrorMessage(err, "Não foi possível remover o vendedor do time."),
      );
    } finally {
      setMemberToggling(null);
    }
  }

  async function confirmTeamAction() {
    if (!teamAction) return;

    setTeamActionLoading(true);
    try {
      if (teamAction.kind === "team") {
        await performDeleteTeam(teamAction.team.id);
      } else {
        await performRemoveMember(teamAction.team.id, teamAction.member.id);
      }
    } finally {
      setTeamActionLoading(false);
      setTeamAction(null);
    }
  }

  const fieldClass = clsx(
    "w-full appearance-none rounded-2xl border px-4 py-3 pr-10 text-sm font-medium outline-none transition-colors focus:border-[#FF0636]",
    isDarkMode
      ? "border-zinc-700 bg-[#111111] text-zinc-100"
      : "border-zinc-200 bg-white text-zinc-950",
  );

  return (
    <div className={clsx("space-y-6", isDarkMode && "dashboard-dark bg-black")}>
      <PageHeader
        title="Eventos"
        breadcrumbs={[{ label: "Gestor" }, { label: "Eventos" }]}
        dark={isDarkMode}
      />

      <div className="space-y-6">
        <Card
          className={clsx(
            "rounded-[30px] border shadow-[0_18px_45px_rgba(15,23,42,0.07)]",
            isDarkMode ? "border-zinc-800 bg-[#0f0f0f]" : "border-white/80",
          )}
          padding="lg"
        >
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_240px_200px] lg:items-end">
            <div className="space-y-2">
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-400">
                Busca
              </p>
              <div className="relative">
                <Search
                  size={16}
                  className={clsx(
                    "pointer-events-none absolute left-4 top-1/2 -translate-y-1/2",
                    isDarkMode ? "text-zinc-500" : "text-zinc-400",
                  )}
                />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Buscar por evento, cliente ou local..."
                  className={clsx(
                    "w-full rounded-2xl border py-3 pl-11 pr-4 text-sm outline-none transition-colors focus:border-[#FF0636]",
                    isDarkMode
                      ? "border-zinc-700 bg-[#111111] text-zinc-100 placeholder:text-zinc-500"
                      : "border-zinc-200 bg-white text-zinc-950 placeholder:text-zinc-400",
                  )}
                />
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-400">
                Cliente
              </p>
              <div className="relative">
                <select
                  value={selectedClientFilter}
                  onChange={(event) => handleClientChange(event.target.value)}
                  className={fieldClass}
                >
                  <option value="all">Todos os eventos</option>
                  {clients.map((client) => (
                    <option key={client.id} value={client.id}>
                      {client.company_name}
                    </option>
                  ))}
                </select>
                <ChevronDown
                  size={16}
                  className={clsx(
                    "pointer-events-none absolute right-3 top-1/2 -translate-y-1/2",
                    isDarkMode ? "text-zinc-500" : "text-zinc-400",
                  )}
                />
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-400">
                Período
              </p>
              <div className="relative">
                <select
                  value={periodFilter}
                  onChange={(event) =>
                    setPeriodFilter(
                      event.target.value as "all" | "upcoming" | "past",
                    )
                  }
                  className={fieldClass}
                >
                  <option value="all">Todas as datas</option>
                  <option value="upcoming">Próximos</option>
                  <option value="past">Passados</option>
                </select>
                <ChevronDown
                  size={16}
                  className={clsx(
                    "pointer-events-none absolute right-3 top-1/2 -translate-y-1/2",
                    isDarkMode ? "text-zinc-500" : "text-zinc-400",
                  )}
                />
              </div>
            </div>
          </div>

          <div className="mt-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              {(
                [
                  ["all", "Todos"],
                  ["active", "Ativos"],
                  ["draft", "Rascunhos"],
                  ["completed", "Concluídos"],
                  ["cancelled", "Cancelados"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setStatusFilter(value)}
                  className={clsx(
                    "rounded-full px-3 py-1 text-xs font-semibold transition-colors",
                    statusFilter === value
                      ? "bg-[#FF0636] text-white"
                      : isDarkMode
                        ? "bg-[#1a1a1a] text-zinc-300 hover:bg-[#262626]"
                        : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={handleOpenCreate}
              className={clsx(
                "inline-flex items-center justify-center gap-2 rounded-full px-7 py-3 text-sm font-semibold text-white",
                isDarkMode
                  ? "bg-[#1f1f1f] hover:bg-[#2b2b2b]"
                  : "bg-[#0b0b0b] hover:bg-zinc-800",
              )}
            >
              Novo evento
              <Plus size={18} />
            </button>
          </div>
        </Card>

        <Card
          className={clsx(
            "overflow-hidden rounded-[24px] border p-0 shadow-[0_12px_30px_rgba(15,23,42,0.06)]",
            isDarkMode ? "border-zinc-800 bg-[#111111]" : "border-white/80",
          )}
          padding="none"
        >
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] border-collapse text-sm">
              <thead>
                <tr
                  className={clsx(
                    "border-b text-left text-[10px] font-semibold uppercase tracking-[0.14em]",
                    isDarkMode
                      ? "border-zinc-800 text-zinc-500"
                      : "border-zinc-100 text-zinc-400",
                  )}
                >
                  <th className="px-5 py-3 font-semibold">Nome</th>
                  <th className="px-3 py-3 text-right font-semibold">
                    Clientes
                  </th>
                  <th className="px-3 py-3 font-semibold">Status</th>
                  <th className="px-3 py-3 text-right font-semibold">Leads</th>
                  <th className="px-3 py-3 text-right font-semibold">
                    Confirmados
                  </th>
                  <th className="px-3 py-3 text-right font-semibold">
                    Check-in
                  </th>
                  <th className="px-3 py-3 text-right font-semibold">
                    Cancelaram
                  </th>
                  <th className="px-5 py-3 text-right font-semibold">Ações</th>
                </tr>
              </thead>
              <tbody>
                {paginatedEvents.map((event) => {
                  const tone = getStatusTone(event.status);
                  return (
                    <tr
                      key={event.id}
                      className={clsx(
                        "border-b last:border-b-0 transition-colors",
                        isDarkMode
                          ? "border-zinc-800 hover:bg-[#161616]"
                          : "border-zinc-100 hover:bg-zinc-50",
                      )}
                    >
                      <td className="px-5 py-3">
                        <button
                          type="button"
                          onClick={() => handleOpenEventPanel(event)}
                          className="flex min-w-0 items-center gap-3 text-left"
                        >
                          <span
                            className={clsx(
                              "h-2 w-2 shrink-0 rounded-full",
                              tone.strip,
                            )}
                          />
                          <span
                            className={clsx(
                              "truncate text-sm font-semibold hover:underline",
                              isDarkMode ? "text-zinc-100" : "text-zinc-950",
                            )}
                          >
                            {event.name}
                          </span>
                        </button>
                      </td>
                      <td
                        className={clsx(
                          "px-3 py-3 text-right font-semibold",
                          isDarkMode ? "text-zinc-100" : "text-zinc-950",
                        )}
                      >
                        {event.participant_client_ids.length}
                      </td>
                      <td className="px-3 py-3">
                        <EventStatusBadge status={event.status} />
                      </td>
                      <td
                        className={clsx(
                          "px-3 py-3 text-right font-semibold",
                          isDarkMode ? "text-zinc-100" : "text-zinc-950",
                        )}
                      >
                        {event.leads_count}
                      </td>
                      <td className="px-3 py-3 text-right font-semibold text-[#3D56A2]">
                        {event.confirmed_count}
                      </td>
                      <td className="px-3 py-3 text-right font-semibold text-[#8a5a00]">
                        {event.checkin_count}
                      </td>
                      <td className="px-3 py-3 text-right font-semibold text-zinc-500">
                        {cancelledCountByEvent[event.id] ?? 0}
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleOpenEventPanel(event)}
                            aria-label={`Editar ${event.name}`}
                            title="Editar"
                            className={clsx(
                              "inline-flex h-8 w-8 items-center justify-center rounded-full border transition-colors",
                              isDarkMode
                                ? "border-zinc-700 bg-[#171717] text-zinc-300 hover:bg-[#212121]"
                                : "border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50",
                            )}
                          >
                            <PencilLine size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={() => setEventToDelete(event)}
                            disabled={eventDeleting}
                            aria-label={`Excluir ${event.name}`}
                            title="Excluir"
                            className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-red-200 bg-red-50 text-red-600 transition-colors hover:bg-red-100 disabled:opacity-60"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Barra de Paginação da Tabela de Eventos */}
          {filteredEvents.length > 0 && (
            <div
              className={clsx(
                "flex flex-col sm:flex-row items-center justify-between gap-3 px-5 py-3 border-t text-xs",
                isDarkMode
                  ? "border-zinc-800 text-zinc-400 bg-[#0f0f0f]"
                  : "border-zinc-100 text-zinc-600 bg-zinc-50/50",
              )}
            >
              <div>
                <span>
                  Mostrando{" "}
                  <strong
                    className={isDarkMode ? "text-zinc-200" : "text-zinc-900"}
                  >
                    {startIndex + 1}
                  </strong>{" "}
                  a{" "}
                  <strong
                    className={isDarkMode ? "text-zinc-200" : "text-zinc-900"}
                  >
                    {endIndex}
                  </strong>{" "}
                  de{" "}
                  <strong
                    className={isDarkMode ? "text-zinc-200" : "text-zinc-900"}
                  >
                    {filteredEvents.length}
                  </strong>{" "}
                  eventos
                </span>
              </div>

              <div className="flex items-center gap-4">
                <div className="flex items-center gap-1.5">
                  <span>Itens por página:</span>
                  <select
                    value={pageSize}
                    onChange={(e) => {
                      setPageSize(Number(e.target.value));
                      setCurrentPage(1);
                    }}
                    className={clsx(
                      "px-2 py-1 rounded-lg text-xs font-semibold border outline-none cursor-pointer transition-colors",
                      isDarkMode
                        ? "bg-[#18181b] border-zinc-700 text-zinc-200"
                        : "bg-white border-zinc-200 text-zinc-800",
                    )}
                  >
                    <option value={10}>10</option>
                    <option value={25}>25</option>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                  </select>
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    disabled={currentPage === 1}
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    className={clsx(
                      "p-1.5 rounded-lg border text-xs font-semibold disabled:opacity-30 disabled:cursor-not-allowed transition-colors",
                      isDarkMode
                        ? "border-zinc-700 text-zinc-300 hover:bg-zinc-800"
                        : "border-zinc-200 text-zinc-700 hover:bg-zinc-100",
                    )}
                    title="Página Anterior"
                  >
                    <ChevronLeft size={15} />
                  </button>
                  <span
                    className={clsx(
                      "px-2 font-semibold",
                      isDarkMode ? "text-zinc-200" : "text-zinc-800",
                    )}
                  >
                    Página {currentPage} de {totalPages}
                  </span>
                  <button
                    type="button"
                    disabled={currentPage >= totalPages}
                    onClick={() =>
                      setCurrentPage((p) => Math.min(totalPages, p + 1))
                    }
                    className={clsx(
                      "p-1.5 rounded-lg border text-xs font-semibold disabled:opacity-30 disabled:cursor-not-allowed transition-colors",
                      isDarkMode
                        ? "border-zinc-700 text-zinc-300 hover:bg-zinc-800"
                        : "border-zinc-200 text-zinc-700 hover:bg-zinc-100",
                    )}
                    title="Próxima Página"
                  >
                    <ChevronRight size={15} />
                  </button>
                </div>
              </div>
            </div>
          )}
        </Card>

        <Drawer
          open={eventPanelOpen && !!selectedEvent}
          onClose={() => setEventPanelOpen(false)}
          title={selectedEvent?.name ?? "Evento"}
          width="w-[min(100vw, 980px)]"
          dark={isDarkMode}
        >
          {selectedEvent ? (
            <div className="space-y-5">
              <Tabs
                tabs={[
                  {
                    id: "info",
                    label: "Info do evento",
                    icon: <CalendarDays size={14} />,
                  },
                  {
                    id: "teams",
                    label: "Time de vendas",
                    icon: <Users size={14} />,
                  },
                  {
                    id: "rubinho",
                    label: "Rubinho",
                    icon: <Settings size={14} />,
                  },
                ]}
                active={eventPanelTab}
                onChange={(tab) =>
                  setEventPanelTab(tab as typeof eventPanelTab)
                }
              />

              {eventPanelTab === "info" && (
                <div className="space-y-5">
                  <div className="grid gap-3 sm:grid-cols-3">
                    {[
                      {
                        label: "Leads",
                        value: selectedEvent.leads_count,
                        color: "text-[#FF0636]",
                      },
                      {
                        label: "Confirmados",
                        value: selectedEvent.confirmed_count,
                        color: "text-[#3D56A2]",
                      },
                      {
                        label: "Check-ins",
                        value: selectedEvent.checkin_count,
                        color: "text-[#8a5a00]",
                      },
                    ].map((stat) => (
                      <div
                        key={stat.label}
                        className={clsx(
                          "rounded-[18px] p-4 text-center",
                          isDarkMode ? "bg-[#1a1a1a]" : "bg-zinc-50",
                        )}
                      >
                        <p className={`text-2xl font-black ${stat.color}`}>
                          {stat.value}
                        </p>
                        <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-400">
                          {stat.label}
                        </p>
                      </div>
                    ))}
                  </div>

                  <div
                    className={clsx(
                      "rounded-2xl border p-4",
                      isDarkMode
                        ? "border-zinc-800 bg-[#0f0f0f]"
                        : "border-zinc-100 bg-white",
                    )}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-400">
                          Participantes
                        </p>
                        <p
                          className={clsx(
                            "text-sm font-semibold",
                            isDarkMode ? "text-zinc-100" : "text-zinc-900",
                          )}
                        >
                          {selectedEventClients.length
                            ? selectedEventClients
                                .map((client) => client.company_name)
                                .join(" · ")
                            : "Nenhum participante carregado"}
                        </p>
                      </div>
                      <EventStatusBadge status={selectedEvent.status} />
                    </div>

                    <p
                      className={clsx(
                        "mt-4 text-sm leading-6",
                        isDarkMode ? "text-zinc-300" : "text-zinc-600",
                      )}
                    >
                      {selectedEvent.description || "Sem descrição cadastrada."}
                    </p>

                    <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                      <div className="flex items-center gap-2">
                        <CalendarDays size={14} className="text-[#FF0636]" />
                        <span>{formatDate(selectedEvent.event_date)}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <MapPin size={14} className="text-[#3D56A2]" />
                        <span className="truncate">
                          {selectedEvent.location || "Local não informado"}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 sm:col-span-2">
                        <Users size={14} className="text-[#FBBB49]" />
                        <span>
                          {selectedEvent.capacity != null
                            ? `${selectedEvent.capacity} lugares · `
                            : ""}
                          {selectedEvent.leads_count} leads
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {eventPanelTab === "teams" && (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3
                        className={clsx(
                          "text-lg font-black tracking-tight",
                          isDarkMode && "text-zinc-100",
                        )}
                      >
                        Time de vendas
                      </h3>
                      <p
                        className={clsx(
                          "mt-1 text-sm",
                          isDarkMode ? "text-zinc-400" : "text-zinc-500",
                        )}
                      >
                        Vincule membros de qualquer cliente ao mesmo evento.
                      </p>
                    </div>
                    <div
                      className={clsx(
                        "text-xs font-medium",
                        isDarkMode ? "text-zinc-400" : "text-zinc-500",
                      )}
                    >
                      {selectedEventClients.length} empresa
                      {selectedEventClients.length !== 1 ? "s" : ""}{" "}
                      participante
                      {selectedEventClients.length !== 1 ? "s" : ""}
                    </div>
                  </div>

                  {teamsError && (
                    <Notice tone="error" className="text-xs">
                      {teamsError}
                    </Notice>
                  )}

                  <div
                    className={clsx(
                      "rounded-2xl border p-3",
                      isDarkMode
                        ? "border-zinc-800 bg-[#0f0f0f]"
                        : "border-zinc-100 bg-zinc-50/80",
                    )}
                  >
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={newTeamName}
                        onChange={(event) => setNewTeamName(event.target.value)}
                        onKeyDown={(event) =>
                          event.key === "Enter" && void handleCreateTeam()
                        }
                        placeholder="Nome do novo time..."
                        className={clsx(
                          "flex-1 rounded-xl border px-4 py-3 text-sm outline-none transition-colors focus:border-[#FF0636]",
                          isDarkMode
                            ? "border-zinc-700 bg-[#111111] text-zinc-100 placeholder:text-zinc-500"
                            : "border-zinc-200 bg-white text-zinc-950 placeholder:text-zinc-400",
                        )}
                      />
                      <button
                        type="button"
                        disabled={teamCreating || !newTeamName.trim()}
                        onClick={() => void handleCreateTeam()}
                        className="inline-flex items-center gap-2 rounded-xl bg-[#FF0636] px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#d8002c] disabled:opacity-50"
                      >
                        {teamCreating ? "Criando..." : "Criar time"}
                        <Plus size={16} />
                      </button>
                    </div>
                  </div>

                  <div className="space-y-4">
                    {teamsLoading ? (
                      <p
                        className={clsx(
                          "py-6 text-center text-sm",
                          isDarkMode ? "text-zinc-500" : "text-zinc-400",
                        )}
                      >
                        Carregando times...
                      </p>
                    ) : teams.length === 0 ? (
                      <div
                        className={clsx(
                          "rounded-2xl border border-dashed py-10 text-center text-sm",
                          isDarkMode
                            ? "border-zinc-700 text-zinc-500"
                            : "border-zinc-200 text-zinc-500",
                        )}
                      >
                        Nenhum time criado neste evento ainda.
                      </div>
                    ) : (
                      teams.map((team) => {
                        const memberIds = new Set(
                          team.members.map((member) => member.user_id),
                        );
                        const available = availableEventVendors.filter(
                          (vendor) => !memberIds.has(vendor.id),
                        );
                        const addMemberOpen = addMemberTeamId === team.id;

                        return (
                          <div
                            key={team.id}
                            className={clsx(
                              "overflow-hidden rounded-2xl border",
                              isDarkMode
                                ? "border-zinc-800 bg-[#0f0f0f]"
                                : "border-zinc-100 bg-white",
                            )}
                          >
                            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-100 px-4 py-3">
                              <div className="flex items-center gap-2">
                                <Users size={15} className="text-[#FF0636]" />
                                <span
                                  className={clsx(
                                    "text-sm font-semibold",
                                    isDarkMode
                                      ? "text-zinc-100"
                                      : "text-zinc-900",
                                  )}
                                >
                                  {team.name}
                                </span>
                                <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-medium text-zinc-600">
                                  {team.members.length} membro
                                  {team.members.length !== 1 ? "s" : ""}
                                </span>
                              </div>
                              <div className="flex items-center gap-2">
                                {available.length > 0 ? (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const nextOpen =
                                        addMemberTeamId === team.id
                                          ? null
                                          : team.id;
                                      setAddMemberTeamId(nextOpen);
                                      setAddMemberSelectionId(
                                        nextOpen
                                          ? (available[0]?.id ?? "")
                                          : "",
                                      );
                                    }}
                                    className="inline-flex items-center gap-1 rounded-full border border-zinc-200 bg-white px-2.5 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-50"
                                  >
                                    <Plus size={12} /> Adicionar membro
                                  </button>
                                ) : (
                                  <span className="rounded-full bg-zinc-100 px-2.5 py-1.5 text-[11px] font-medium text-zinc-500">
                                    Sem membros disponíveis
                                  </span>
                                )}
                                <button
                                  type="button"
                                  disabled={teamDeleting === team.id}
                                  onClick={() => void handleDeleteTeam(team)}
                                  className="rounded-xl p-1.5 text-zinc-400 hover:bg-red-50 hover:text-red-500 disabled:opacity-40"
                                  title="Excluir time"
                                >
                                  <Trash2 size={14} />
                                </button>
                              </div>
                            </div>

                            {addMemberOpen && (
                              <div
                                className={clsx(
                                  "border-b px-4 py-4",
                                  isDarkMode
                                    ? "border-zinc-800 bg-[#0b0b0b]"
                                    : "border-zinc-100 bg-zinc-50/60",
                                )}
                              >
                                <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
                                  <div className="space-y-1.5">
                                    <Select
                                      label="Membro disponível"
                                      dark={isDarkMode}
                                      value={addMemberSelectionId}
                                      onChange={(event) =>
                                        setAddMemberSelectionId(
                                          event.target.value,
                                        )
                                      }
                                      placeholder="Selecione um membro"
                                      options={available.map((vendor) => ({
                                        value: vendor.id,
                                        label: `${vendor.name} · ${
                                          clients.find(
                                            (client) =>
                                              client.id === vendor.client_id,
                                          )?.company_name ?? "Sem empresa"
                                        }`,
                                      }))}
                                      className={clsx(
                                        "rounded-xl border px-4 py-3 pr-10 shadow-sm transition-shadow focus:shadow-[0_0_0_4px_rgba(255,6,54,0.12)] focus:border-[#FF0636]",
                                        isDarkMode
                                          ? "border-zinc-700 bg-[#111111] text-zinc-100"
                                          : "border-zinc-200 bg-white text-zinc-900",
                                      )}
                                    />
                                    <p
                                      className={clsx(
                                        "text-xs",
                                        isDarkMode
                                          ? "text-zinc-500"
                                          : "text-zinc-400",
                                      )}
                                    >
                                      Só aparecem membros que ainda não estão em
                                      outro time deste evento.
                                    </p>
                                  </div>
                                  <div className="flex gap-2">
                                    <Button
                                      variant="secondary"
                                      className="whitespace-nowrap"
                                      onClick={() => {
                                        setAddMemberTeamId(null);
                                        setAddMemberSelectionId("");
                                      }}
                                    >
                                      Fechar
                                    </Button>
                                    <Button
                                      className="whitespace-nowrap bg-[#0b0b0b] text-white hover:bg-zinc-800"
                                      isDisabled={
                                        !addMemberSelectionId ||
                                        memberToggling === addMemberSelectionId
                                      }
                                      loading={
                                        memberToggling === addMemberSelectionId
                                      }
                                      onClick={() =>
                                        void handleAddMember(
                                          team.id,
                                          addMemberSelectionId,
                                        )
                                      }
                                    >
                                      Adicionar ao time
                                    </Button>
                                  </div>
                                </div>
                              </div>
                            )}

                            {team.members.length === 0 ? (
                              <p className="px-4 py-3 text-xs text-zinc-400">
                                Nenhum membro neste time ainda.
                              </p>
                            ) : (
                              <div className="divide-y divide-zinc-100">
                                {team.members.map((member) => {
                                  const memberClientName =
                                    clients.find(
                                      (client) =>
                                        client.id === member.user.client_id,
                                    )?.company_name ?? "Sem empresa";

                                  return (
                                    <div
                                      key={member.user_id}
                                      className="flex items-center justify-between px-4 py-2.5"
                                    >
                                      <div className="flex items-center gap-2.5">
                                        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-100 text-[10px] font-bold text-blue-700">
                                          {member.user.name
                                            .split(" ")
                                            .slice(0, 2)
                                            .map((part) => part[0])
                                            .join("")}
                                        </div>
                                        <div>
                                          <p className="text-xs font-medium text-zinc-900">
                                            {member.user.name}
                                          </p>
                                          <p className="text-[10px] text-zinc-400">
                                            {member.user.email} ·{" "}
                                            {memberClientName}
                                          </p>
                                        </div>
                                      </div>
                                      <button
                                        type="button"
                                        disabled={
                                          memberToggling === member.user_id
                                        }
                                        onClick={() =>
                                          void handleRemoveMember(
                                            team,
                                            member.user,
                                          )
                                        }
                                        className="rounded-md p-1 text-zinc-300 hover:bg-red-50 hover:text-red-400 disabled:opacity-40"
                                        title="Remover do time"
                                      >
                                        <X size={14} />
                                      </button>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              )}

              {eventPanelTab === "rubinho" && (
                <div className="rounded-2xl border border-dashed border-zinc-200 bg-zinc-50 p-6 text-center">
                  <Settings size={32} className="mx-auto mb-2 text-zinc-300" />
                  <p className="text-sm font-medium text-zinc-700">
                    Módulo Rubinho
                  </p>
                  <p className="mt-1 text-xs text-zinc-400">
                    Em breve disponível neste evento.
                  </p>
                </div>
              )}
            </div>
          ) : null}
        </Drawer>

        {filteredEvents.length === 0 && (
          <Card
            className={clsx(
              "rounded-[28px] border border-dashed p-8 text-center text-sm",
              isDarkMode
                ? "border-zinc-700 bg-[#0f0f0f] text-zinc-400"
                : "border-zinc-200 bg-white text-zinc-500",
            )}
          >
            Nenhum evento encontrado com estes filtros.
          </Card>
        )}
      </div>

      <Modal
        open={showModal}
        onClose={handleClose}
        title={editingEvent ? "Editar evento" : "Novo evento"}
        size="xl"
        dark={isDarkMode}
        footer={
          <>
            {editingEvent ? (
              <Button
                variant="secondary"
                onClick={() => {
                  void handleDeleteEvent();
                }}
                isDisabled={eventSaving || eventDeleting}
                className="mr-auto text-red-500 hover:text-red-600"
              >
                {eventDeleting ? "Excluindo..." : "Excluir"}
              </Button>
            ) : null}
            <Button
              variant="secondary"
              onClick={handleClose}
              isDisabled={eventSaving || eventDeleting}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              form="event-form"
              loading={eventSaving}
              isDisabled={eventDeleting}
            >
              Salvar
            </Button>
          </>
        }
      >
        <form
          id="event-form"
          onSubmit={(e) => void handleSubmitEvent(e)}
          className="space-y-4"
        >
          {eventError ? (
            <Notice tone="error" className="text-xs">
              {eventError}
            </Notice>
          ) : null}

          {/* Tab navigation */}
          <div className="flex flex-wrap gap-1.5">
            {(["dados", "datas", "local", "participantes"] as const).map(
              (tab) => {
                const labels: Record<string, string> = {
                  dados: "Dados",
                  datas: "Datas e Horários",
                  local: "Localização",
                  participantes: "Participantes",
                };
                return (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setFormTab(tab)}
                    className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                      formTab === tab
                        ? "bg-[#3D56A2] text-white"
                        : "border border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50"
                    }`}
                  >
                    {labels[tab]}
                  </button>
                );
              },
            )}
          </div>

          {/* ── Aba Dados ── */}
          {formTab === "dados" && (
            <div className="space-y-3">
              <div>
                <label
                  className={clsx(
                    "mb-1 block text-sm font-medium",
                    isDarkMode ? "text-zinc-300" : "text-gray-700",
                  )}
                >
                  Nome do evento *
                </label>
                <input
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="Ex: Grand Prix de Vendas"
                  className={clsx(
                    "w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400",
                    isDarkMode
                      ? "border-zinc-700 bg-[#111111] text-zinc-100"
                      : "border-gray-300 bg-white",
                  )}
                />
              </div>
              <div>
                <label
                  className={clsx(
                    "mb-1 block text-sm font-medium",
                    isDarkMode ? "text-zinc-300" : "text-gray-700",
                  )}
                >
                  Tipo de evento
                </label>
                <select
                  value={formEventType}
                  onChange={(e) => setFormEventType(e.target.value)}
                  className={clsx(
                    "w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400",
                    isDarkMode
                      ? "border-zinc-700 bg-[#111111] text-zinc-100"
                      : "border-gray-300 bg-white",
                  )}
                >
                  <option value="">Selecione o tipo</option>
                  <option value="Grand Prix de Vendas">
                    Grand Prix de Vendas
                  </option>
                  <option value="Champions Festival">Champions Festival</option>
                  <option value="Projeto Conquista">Projeto Conquista</option>
                </select>
              </div>
              <div>
                <label
                  className={clsx(
                    "mb-1 block text-sm font-medium",
                    isDarkMode ? "text-zinc-300" : "text-gray-700",
                  )}
                >
                  Data de lançamento
                </label>
                <input
                  type="date"
                  value={formLaunchDate}
                  onChange={(e) => setFormLaunchDate(e.target.value)}
                  className={clsx(
                    "w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400",
                    isDarkMode
                      ? "border-zinc-700 bg-[#111111] text-zinc-100"
                      : "border-gray-300 bg-white",
                  )}
                />
              </div>
              <div>
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
                  rows={3}
                  placeholder="Descreva o evento..."
                  className={clsx(
                    "w-full resize-none rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400",
                    isDarkMode
                      ? "border-zinc-700 bg-[#111111] text-zinc-100"
                      : "border-gray-300 bg-white",
                  )}
                />
              </div>
              <div>
                <label
                  className={clsx(
                    "mb-1 block text-sm font-medium",
                    isDarkMode ? "text-zinc-300" : "text-gray-700",
                  )}
                >
                  Status
                </label>
                <select
                  value={formStatus}
                  onChange={(e) =>
                    setFormStatus(e.target.value as Event["status"])
                  }
                  className={clsx(
                    "w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400",
                    isDarkMode
                      ? "border-zinc-700 bg-[#111111] text-zinc-100"
                      : "border-gray-300 bg-white",
                  )}
                >
                  <option value="draft">Rascunho</option>
                  <option value="active">Ativo</option>
                  <option value="completed">Concluído</option>
                  <option value="cancelled">Cancelado</option>
                </select>
              </div>
              <div>
                <label
                  className={clsx(
                    "mb-1 block text-sm font-medium",
                    isDarkMode ? "text-zinc-300" : "text-gray-700",
                  )}
                >
                  Pulseira obrigatória
                </label>
                <select
                  value={formRequireWristband ? "true" : "false"}
                  onChange={(e) =>
                    setFormRequireWristband(e.target.value === "true")
                  }
                  className={clsx(
                    "w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400",
                    isDarkMode
                      ? "border-zinc-700 bg-[#111111] text-zinc-100"
                      : "border-gray-300 bg-white",
                  )}
                >
                  <option value="false">Não</option>
                  <option value="true">Sim</option>
                </select>
              </div>
              <div>
                <label
                  className={clsx(
                    "mb-1 block text-sm font-medium",
                    isDarkMode ? "text-zinc-300" : "text-gray-700",
                  )}
                >
                  Investimento total no evento (R$)
                </label>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={formTotalInvestment}
                  onChange={(e) => setFormTotalInvestment(e.target.value)}
                  placeholder="Ex: 82300"
                  className={clsx(
                    "w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400",
                    isDarkMode
                      ? "border-zinc-700 bg-[#111111] text-zinc-100"
                      : "border-gray-300 bg-white",
                  )}
                />
              </div>
              <div>
                <label
                  className={clsx(
                    "mb-1 block text-sm font-medium",
                    isDarkMode ? "text-zinc-300" : "text-gray-700",
                  )}
                >
                  Desse valor, quanto foi para tráfego pago (R$)
                </label>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={formPaidTraffic}
                  onChange={(e) => setFormPaidTraffic(e.target.value)}
                  placeholder="Ex: 17800"
                  className={clsx(
                    "w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400",
                    isDarkMode
                      ? "border-zinc-700 bg-[#111111] text-zinc-100"
                      : "border-gray-300 bg-white",
                  )}
                />
              </div>
              <div>
                <label
                  className={clsx(
                    "mb-1 block text-sm font-medium",
                    isDarkMode ? "text-zinc-300" : "text-gray-700",
                  )}
                >
                  Meta de vendas do evento (qtd.)
                </label>
                <input
                  type="number"
                  min={0}
                  step="1"
                  value={formSalesTarget}
                  onChange={(e) => setFormSalesTarget(e.target.value)}
                  placeholder="Ex: 15"
                  className={clsx(
                    "w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400",
                    isDarkMode
                      ? "border-zinc-700 bg-[#111111] text-zinc-100"
                      : "border-gray-300 bg-white",
                  )}
                />
              </div>
            </div>
          )}

          {/* ── Aba Datas e Horários ── */}
          {formTab === "datas" && (
            <div className="space-y-4">
              <div>
                <label
                  className={clsx(
                    "mb-1 block text-sm font-medium",
                    isDarkMode ? "text-zinc-300" : "text-gray-700",
                  )}
                >
                  Duração do evento (em dias)
                </label>
                <select
                  value={formDays.length}
                  onChange={(e) => {
                    const count = parseInt(e.target.value, 10);
                    setFormDays((prev) => {
                      if (prev.length === count) return prev;
                      if (prev.length < count) {
                        const added = Array.from(
                          { length: count - prev.length },
                          () => ({
                            start: "",
                            end: "",
                          }),
                        );
                        return [...prev, ...added];
                      }
                      return prev.slice(0, count);
                    });
                  }}
                  className={clsx(
                    "w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400",
                    isDarkMode
                      ? "border-zinc-700 bg-[#111111] text-zinc-100"
                      : "border-gray-300 bg-white",
                  )}
                >
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((num) => (
                    <option key={num} value={num}>
                      {num} {num === 1 ? "dia" : "dias"}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-3">
                {formDays.map((day, idx) => (
                  <div
                    key={idx}
                    className={clsx(
                      "rounded-lg border p-3",
                      isDarkMode
                        ? "border-zinc-800 bg-[#1a1a1a]/40"
                        : "border-gray-200 bg-gray-50/50",
                    )}
                  >
                    <div className="mb-2">
                      <span
                        className={clsx(
                          "text-xs font-semibold",
                          isDarkMode ? "text-zinc-300" : "text-gray-600",
                        )}
                      >
                        Dia {idx + 1}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label
                          className={clsx(
                            "mb-1 block text-xs font-medium",
                            isDarkMode ? "text-zinc-400" : "text-gray-500",
                          )}
                        >
                          Início {idx === 0 ? "*" : ""}
                        </label>
                        <input
                          type="datetime-local"
                          value={day.start}
                          onChange={(e) =>
                            setFormDays((prev) =>
                              prev.map((d, i) =>
                                i === idx ? { ...d, start: e.target.value } : d,
                              ),
                            )
                          }
                          className={clsx(
                            "w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400",
                            isDarkMode
                              ? "border-zinc-700 bg-[#111111] text-zinc-100"
                              : "border-gray-300 bg-white",
                          )}
                        />
                      </div>
                      <div>
                        <label
                          className={clsx(
                            "mb-1 block text-xs font-medium",
                            isDarkMode ? "text-zinc-400" : "text-gray-500",
                          )}
                        >
                          Término
                        </label>
                        <input
                          type="datetime-local"
                          value={day.end}
                          onChange={(e) =>
                            setFormDays((prev) =>
                              prev.map((d, i) =>
                                i === idx ? { ...d, end: e.target.value } : d,
                              ),
                            )
                          }
                          className={clsx(
                            "w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400",
                            isDarkMode
                              ? "border-zinc-700 bg-[#111111] text-zinc-100"
                              : "border-gray-300 bg-white",
                          )}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Aba Localização ── */}
          {formTab === "local" && (
            <div className="space-y-3">
              <div className="flex gap-2">
                <div className="flex-1">
                  <label
                    className={clsx(
                      "mb-1 block text-sm font-medium",
                      isDarkMode ? "text-zinc-300" : "text-gray-700",
                    )}
                  >
                    CEP
                  </label>
                  <input
                    value={formCep}
                    onChange={(e) => {
                      setFormCep(e.target.value);
                      if (e.target.value.replace(/\D/g, "").length === 8) {
                        void handleCepLookup(e.target.value);
                      }
                    }}
                    placeholder="00000-000"
                    maxLength={9}
                    className={clsx(
                      "w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400",
                      isDarkMode
                        ? "border-zinc-700 bg-[#111111] text-zinc-100"
                        : "border-gray-300 bg-white",
                    )}
                  />
                </div>
                {formCepLoading && (
                  <div className="flex items-end pb-2 text-xs text-gray-400">
                    Buscando...
                  </div>
                )}
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <label
                    className={clsx(
                      "mb-1 block text-sm font-medium",
                      isDarkMode ? "text-zinc-300" : "text-gray-700",
                    )}
                  >
                    Logradouro
                  </label>
                  <input
                    value={formLogradouro}
                    onChange={(e) => setFormLogradouro(e.target.value)}
                    placeholder="Rua, Avenida..."
                    className={clsx(
                      "w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400",
                      isDarkMode
                        ? "border-zinc-700 bg-[#111111] text-zinc-100"
                        : "border-gray-300 bg-white",
                    )}
                  />
                </div>
                <div>
                  <label
                    className={clsx(
                      "mb-1 block text-sm font-medium",
                      isDarkMode ? "text-zinc-300" : "text-gray-700",
                    )}
                  >
                    Número
                  </label>
                  <input
                    value={formNumero}
                    onChange={(e) => setFormNumero(e.target.value)}
                    placeholder="123"
                    className={clsx(
                      "w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400",
                      isDarkMode
                        ? "border-zinc-700 bg-[#111111] text-zinc-100"
                        : "border-gray-300 bg-white",
                    )}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label
                    className={clsx(
                      "mb-1 block text-sm font-medium",
                      isDarkMode ? "text-zinc-300" : "text-gray-700",
                    )}
                  >
                    Complemento
                  </label>
                  <input
                    value={formComplemento}
                    onChange={(e) => setFormComplemento(e.target.value)}
                    placeholder="Apto, Bloco..."
                    className={clsx(
                      "w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400",
                      isDarkMode
                        ? "border-zinc-700 bg-[#111111] text-zinc-100"
                        : "border-gray-300 bg-white",
                    )}
                  />
                </div>
                <div>
                  <label
                    className={clsx(
                      "mb-1 block text-sm font-medium",
                      isDarkMode ? "text-zinc-300" : "text-gray-700",
                    )}
                  >
                    Bairro
                  </label>
                  <input
                    value={formBairro}
                    onChange={(e) => setFormBairro(e.target.value)}
                    placeholder="Bairro"
                    className={clsx(
                      "w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400",
                      isDarkMode
                        ? "border-zinc-700 bg-[#111111] text-zinc-100"
                        : "border-gray-300 bg-white",
                    )}
                  />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <label
                    className={clsx(
                      "mb-1 block text-sm font-medium",
                      isDarkMode ? "text-zinc-300" : "text-gray-700",
                    )}
                  >
                    Cidade
                  </label>
                  <input
                    value={formCidade}
                    onChange={(e) => setFormCidade(e.target.value)}
                    placeholder="São Paulo"
                    className={clsx(
                      "w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400",
                      isDarkMode
                        ? "border-zinc-700 bg-[#111111] text-zinc-100"
                        : "border-gray-300 bg-white",
                    )}
                  />
                </div>
                <div>
                  <label
                    className={clsx(
                      "mb-1 block text-sm font-medium",
                      isDarkMode ? "text-zinc-300" : "text-gray-700",
                    )}
                  >
                    UF
                  </label>
                  <input
                    value={formUf}
                    onChange={(e) => setFormUf(e.target.value.toUpperCase())}
                    placeholder="SP"
                    maxLength={2}
                    className={clsx(
                      "w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400",
                      isDarkMode
                        ? "border-zinc-700 bg-[#111111] text-zinc-100"
                        : "border-gray-300 bg-white",
                    )}
                  />
                </div>
              </div>
            </div>
          )}

          {/* ── Aba Imagens ── */}
          {/* ── Aba Participantes ── */}
          {formTab === "participantes" && (
            <div className="space-y-3">
              <p
                className={clsx(
                  "text-xs",
                  isDarkMode ? "text-zinc-400" : "text-gray-500",
                )}
              >
                Defina os clientes participantes deste evento.
              </p>
              {clients.length === 0 && (
                <p
                  className={clsx(
                    "rounded-lg border border-dashed px-3 py-4 text-center text-xs",
                    isDarkMode
                      ? "border-zinc-700 text-zinc-500"
                      : "border-gray-200 text-gray-400",
                  )}
                >
                  Nenhum cliente cadastrado. Cadastre clientes para adicioná-los
                  como participantes.
                </p>
              )}
              {formExtraClientIds.map((clientId, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <select
                    value={clientId}
                    onChange={(e) =>
                      setFormExtraClientIds((prev) =>
                        prev.map((c, i) => (i === idx ? e.target.value : c)),
                      )
                    }
                    className={clsx(
                      "flex-1 rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400",
                      isDarkMode
                        ? "border-zinc-700 bg-[#111111] text-zinc-100"
                        : "border-gray-300 bg-white",
                    )}
                  >
                    <option value="">Selecione o cliente</option>
                    {clients.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.company_name}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() =>
                      setFormExtraClientIds((prev) =>
                        prev.filter((_, i) => i !== idx),
                      )
                    }
                    className="text-gray-400 hover:text-red-500"
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => setFormExtraClientIds((prev) => [...prev, ""])}
                className="flex items-center gap-1.5 rounded-lg border border-dashed border-gray-300 px-3 py-2 text-xs font-medium text-gray-500 hover:border-[#3D56A2] hover:text-[#3D56A2]"
              >
                <Plus size={12} /> Adicionar participante
              </button>
            </div>
          )}
        </form>
      </Modal>

      <ConfirmationModal
        open={Boolean(eventToDelete)}
        onClose={() => setEventToDelete(null)}
        onConfirm={() => {
          if (!eventToDelete) return;
          void performDeleteEvent(eventToDelete).finally(() =>
            setEventToDelete(null),
          );
        }}
        loading={eventDeleting}
        title="Excluir evento"
        description={
          <p className="text-sm text-zinc-600">
            Tem certeza que deseja excluir o evento{" "}
            <span className="font-semibold text-zinc-900">
              {eventToDelete?.name}
            </span>
            ? Esta ação não pode ser desfeita.
          </p>
        }
        confirmLabel="Excluir evento"
      />

      <ConfirmationModal
        open={Boolean(teamAction)}
        onClose={() => setTeamAction(null)}
        onConfirm={() => void confirmTeamAction()}
        loading={teamActionLoading}
        dark={isDarkMode}
        title={
          teamAction?.kind === "team"
            ? "Excluir time"
            : teamAction?.kind === "member"
              ? "Remover membro"
              : "Confirmar ação"
        }
        description={
          teamAction?.kind === "team" ? (
            <p
              className={clsx(
                "text-sm",
                isDarkMode ? "text-zinc-400" : "text-zinc-600",
              )}
            >
              Excluir o time{" "}
              <span className="font-semibold text-zinc-900">
                {teamAction.team.name}
              </span>
              ? Esta ação não pode ser desfeita.
            </p>
          ) : teamAction?.kind === "member" ? (
            <p
              className={clsx(
                "text-sm",
                isDarkMode ? "text-zinc-400" : "text-zinc-600",
              )}
            >
              Remover o vendedor{" "}
              <span className="font-semibold text-zinc-900">
                {teamAction.member.name}
              </span>{" "}
              do time{" "}
              <span className="font-semibold text-zinc-900">
                {teamAction.team.name}
              </span>
              ?
            </p>
          ) : null
        }
        confirmLabel={
          teamAction?.kind === "team"
            ? "Excluir time"
            : teamAction?.kind === "member"
              ? "Remover membro"
              : "Confirmar"
        }
      />
    </div>
  );
}
