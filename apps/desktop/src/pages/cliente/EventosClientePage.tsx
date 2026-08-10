import { useCallback, useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import { useNavigate, useOutletContext, useParams } from "react-router-dom";
import {
  ArrowLeft,
  ArrowUpRight,
  CalendarDays,
  ChevronRight,
  CircleUserRound,
  FileSearch,
  Mail,
  MessageCircle,
  Phone,
  Target,
  StickyNote,
  Trophy,
  Users,
  UserPlus2,
  CheckCircle2,
  ShoppingBag,
  DollarSign,
  BarChart3,
} from "lucide-react";
import { PageHeader } from "../../components/shared/PageHeader";
import {
  Badge,
  ConfirmationBadge,
  SourceBadge,
} from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Select } from "../../components/ui/Select";
import { Notice } from "../../components/ui/Notice";
import { MissingClientScope } from "../../components/shared/MissingClientScope";
import { readStoredSession } from "../../services/auth";
import { listLeadHistory, type ApiCrmHistoryItem } from "../../services/crm";
import {
  getEventDashboardTv,
  listEvents,
  mapApiEventToEvent,
  type EventDashboardTvResponse,
} from "../../services/events";
import { listLeads, mapApiLeadToLead, updateLead } from "../../services/leads";
import { listSalesTeams, type SalesTeam } from "../../services/salesTeams";
import { listClientStaff, mapStaffToUser } from "../../services/staff";
import type { Event, Lead, User } from "../../types";
import { resolveClientId } from "../../utils/userContext";
import {
  DASHBOARD_DARK_CHANGE_EVENT,
  readDashboardDarkEnabled,
} from "../../lib/dashboard-dark-mode";
import { useLeadRealtimeSync } from "../../hooks/useLeadRealtimeSync";

type OutletContext = {
  user: User;
};

type LeadVisibilityFilter = "all" | "pending" | "assigned" | "converted";
type EventDataScope = "client" | "event" | "compare";

const SOURCE_LABELS: Record<Lead["source"], string> = {
  facebook_ads: "Facebook Ads",
  whatsapp: "WhatsApp",
  manual: "Manual",
  form_page: "Formulário",
  import_excel: "Importação Excel",
};

const STAGE_LABELS: Record<Lead["crm_stage"], string> = {
  novo: "Novo",
  contactado: "Contactado",
  nao_responde: "Não responde",
  agendado: "Agendado",
  checkin: "Check-in",
  convertido: "Convertido",
  perdido: "Perdido",
};

const STATUS_LABELS: Record<Lead["confirmation_status"], string> = {
  pending: "Pendente",
  scheduled: "Agendado",
  confirmed: "Confirmado",
  cancelled: "Cancelado",
  checked_in: "Check-in",
  closed: "Encerrado",
};

function formatDateTime(value: string | null | undefined) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatCurrency(value: number | string | null | undefined) {
  const amount = Number(value ?? 0);
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  }).format(Number.isFinite(amount) ? amount : 0);
}

function EventLeadDetailDrawer({
  lead,
  vendorName,
  dark,
  canOpenCrm,
  canOpenChat,
  onClose,
  onOpenCrm,
  onOpenChat,
}: {
  lead: Lead;
  vendorName?: string;
  dark: boolean;
  canOpenCrm: boolean;
  canOpenChat: boolean;
  onClose: () => void;
  onOpenCrm: () => void;
  onOpenChat: () => void;
}) {
  const [history, setHistory] = useState<ApiCrmHistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  useEffect(() => {
    const token = readStoredSession()?.accessToken;
    if (!token) {
      setHistory([]);
      setHistoryLoading(false);
      return;
    }

    setHistoryLoading(true);
    listLeadHistory(lead.id, token)
      .then(setHistory)
      .catch(() => setHistory([]))
      .finally(() => setHistoryLoading(false));
  }, [lead.id]);

  const detailRows = [
    { label: "Telefone", value: lead.phone || "Sem telefone", icon: Phone },
    { label: "E-mail", value: lead.email || "Sem e-mail", icon: Mail },
    {
      label: "Evento",
      value: lead.event_interest || "Sem evento vinculado",
      icon: Target,
    },
    {
      label: "Agendamento",
      value: lead.store_visit_datetime
        ? formatDateTime(lead.store_visit_datetime)
        : "Sem agenda",
      icon: CalendarDays,
    },
    {
      label: "Vendedor",
      value: vendorName || "Ainda não distribuído",
      icon: CircleUserRound,
    },
  ];

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/45 backdrop-blur-[2px]">
      <button
        type="button"
        className="flex-1 cursor-default"
        aria-label="Fechar"
        onClick={onClose}
      />
      <aside
        className={clsx(
          "h-full w-full max-w-xl overflow-y-auto border-l px-5 py-6 shadow-[0_24px_80px_rgba(15,23,42,0.22)] sm:px-6",
          dark
            ? "border-zinc-800 bg-[#0b0b0b] text-zinc-100"
            : "border-zinc-200 bg-white text-zinc-950",
        )}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-zinc-400">
              Lead do evento
            </p>
            <h2 className="mt-2 text-2xl font-semibold">{lead.name}</h2>
            <p className="mt-2 text-sm text-zinc-500">
              Atualizado em {formatDateTime(lead.updated_at)}
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Fechar
          </Button>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          <SourceBadge source={lead.source} />
          <ConfirmationBadge status={lead.confirmation_status} />
          <Badge variant={lead.crm_stage === "convertido" ? "green" : "gray"}>
            {STAGE_LABELS[lead.crm_stage]}
          </Badge>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          {detailRows.map(({ label, value, icon: Icon }) => (
            <div
              key={label}
              className={clsx(
                "rounded-2xl border p-4",
                dark
                  ? "border-zinc-800 bg-[#111111]"
                  : "border-zinc-100 bg-zinc-50",
              )}
            >
              <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-zinc-400">
                <Icon size={14} />
                <span>{label}</span>
              </div>
              <p
                className={clsx(
                  "mt-2 text-sm font-medium",
                  dark ? "text-zinc-100" : "text-zinc-900",
                )}
              >
                {value}
              </p>
            </div>
          ))}
        </div>

        <div
          className={clsx(
            "mt-6 rounded-3xl border p-5",
            dark ? "border-zinc-800 bg-[#111111]" : "border-zinc-100 bg-white",
          )}
        >
          <div className="flex items-center gap-2 text-sm font-semibold">
            <FileSearch size={16} className="text-blue-500" />
            <span>Resumo operacional</span>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl bg-zinc-50 px-4 py-3">
              <p className="text-[11px] uppercase tracking-[0.18em] text-zinc-400">
                Fonte
              </p>
              <p className="mt-1 text-sm font-medium text-zinc-900">
                {SOURCE_LABELS[lead.source]}
              </p>
            </div>
            <div className="rounded-2xl bg-zinc-50 px-4 py-3">
              <p className="text-[11px] uppercase tracking-[0.18em] text-zinc-400">
                Confirmação
              </p>
              <p className="mt-1 text-sm font-medium text-zinc-900">
                {STATUS_LABELS[lead.confirmation_status]}
              </p>
            </div>
            <div className="rounded-2xl bg-zinc-50 px-4 py-3">
              <p className="text-[11px] uppercase tracking-[0.18em] text-zinc-400">
                Etapa CRM
              </p>
              <p className="mt-1 text-sm font-medium text-zinc-900">
                {STAGE_LABELS[lead.crm_stage]}
              </p>
            </div>
            <div className="rounded-2xl bg-zinc-50 px-4 py-3">
              <p className="text-[11px] uppercase tracking-[0.18em] text-zinc-400">
                Check-in/Venda
              </p>
              <p className="mt-1 text-sm font-medium text-zinc-900">
                {lead.confirmation_status === "checked_in"
                  ? "Com check-in"
                  : "Sem check-in"}
                {lead.sold_by_vendor_id ||
                lead.active_appointment?.sale_id ||
                lead.crm_stage === "convertido"
                  ? " · Com venda"
                  : " · Sem venda"}
              </p>
            </div>
          </div>

          <div
            className={clsx(
              "mt-4 rounded-2xl border px-4 py-4",
              dark
                ? "border-zinc-800 bg-[#0d0d0d]"
                : "border-zinc-100 bg-zinc-50",
            )}
          >
            <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-zinc-400">
              <StickyNote size={14} />
              <span>Observações</span>
            </div>
            <p
              className={clsx(
                "mt-2 text-sm leading-6",
                dark ? "text-zinc-300" : "text-zinc-700",
              )}
            >
              {lead.notes || "Nenhuma observação cadastrada para este lead."}
            </p>
          </div>
        </div>

        <div
          className={clsx(
            "mt-6 rounded-3xl border p-5",
            dark ? "border-zinc-800 bg-[#111111]" : "border-zinc-100 bg-white",
          )}
        >
          <div className="flex items-center gap-2 text-sm font-semibold">
            <CalendarDays size={16} className="text-amber-500" />
            <span>Histórico do lead</span>
          </div>

          <div className="mt-4 rounded-2xl border border-transparent">
            <div className="flex gap-3 py-1">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-100">
                <FileSearch size={14} className="text-blue-600" />
              </div>
              <div className="min-w-0 flex-1 pt-1">
                <p
                  className={clsx(
                    "text-[13px] font-semibold",
                    dark ? "text-zinc-100" : "text-zinc-900",
                  )}
                >
                  Lead criado
                </p>
                <p
                  className={clsx(
                    "text-[12px]",
                    dark ? "text-zinc-400" : "text-zinc-500",
                  )}
                >
                  Entrada via {SOURCE_LABELS[lead.source]}
                </p>
                <p
                  className={clsx(
                    "mt-0.5 text-[11px]",
                    dark ? "text-zinc-600" : "text-zinc-400",
                  )}
                >
                  {formatDateTime(lead.created_at)}
                </p>
              </div>
            </div>

            {historyLoading ? (
              <div
                className={clsx(
                  "flex items-center gap-2 py-4 text-[13px]",
                  dark ? "text-zinc-500" : "text-zinc-400",
                )}
              >
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                Carregando histórico…
              </div>
            ) : history.length === 0 ? (
              <p
                className={clsx(
                  "py-4 text-[13px]",
                  dark ? "text-zinc-500" : "text-zinc-400",
                )}
              >
                Nenhuma movimentação registrada.
              </p>
            ) : (
              history.map((item) => (
                <div
                  key={item.id}
                  className="flex gap-3 border-t py-3"
                  style={{ borderColor: dark ? "#1f1f1f" : "#f4f4f5" }}
                >
                  <div
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
                    style={{ backgroundColor: `${item.to_stage.color}22` }}
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
                        dark ? "text-zinc-100" : "text-zinc-900",
                      )}
                    >
                      {item.from_stage
                        ? `${item.from_stage.name} → ${item.to_stage.name}`
                        : `Entrou em ${item.to_stage.name}`}
                    </p>
                    <p
                      className={clsx(
                        "text-[12px]",
                        dark ? "text-zinc-400" : "text-zinc-500",
                      )}
                    >
                      por {item.changed_by.name}
                      {item.notes ? ` · ${item.notes}` : ""}
                    </p>
                    <p
                      className={clsx(
                        "mt-0.5 text-[11px]",
                        dark ? "text-zinc-600" : "text-zinc-400",
                      )}
                    >
                      {formatDateTime(item.created_at)}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          <Button variant="secondary" onClick={onClose}>
            Voltar
          </Button>
          {canOpenChat ? (
            <Button
              variant="secondary"
              icon={<MessageCircle size={16} />}
              onClick={onOpenChat}
            >
              Abrir no chat
            </Button>
          ) : null}
          {canOpenCrm ? (
            <Button icon={<ArrowUpRight size={16} />} onClick={onOpenCrm}>
              Abrir no CRM
            </Button>
          ) : null}
        </div>
      </aside>
    </div>
  );
}

export function EventosClientePage() {
  const { user } = useOutletContext<OutletContext>();
  const navigate = useNavigate();
  const { clientId: routeClientId, eventId: routeEventId } = useParams<{
    clientId?: string;
    eventId?: string;
  }>();
  const clientId =
    user.role === "gestor" ? (routeClientId ?? null) : resolveClientId(user);
  const [isDarkMode, setIsDarkMode] = useState(() =>
    readDashboardDarkEnabled(user.id),
  );
  const [events, setEvents] = useState<Event[]>([]);
  const [selectedEventId, setSelectedEventId] = useState("");
  const [teams, setTeams] = useState<SalesTeam[]>([]);
  const [eventLeads, setEventLeads] = useState<Lead[]>([]);
  const [vendors, setVendors] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [assigningLeadId, setAssigningLeadId] = useState<string | null>(null);
  const [vendorByLeadId, setVendorByLeadId] = useState<Record<string, string>>(
    {},
  );
  const [error, setError] = useState("");
  const [leadFilter, setLeadFilter] = useState<LeadVisibilityFilter>("all");
  const [assignedVendorFilter, setAssignedVendorFilter] = useState("all");
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [eventSnapshot, setEventSnapshot] =
    useState<EventDashboardTvResponse | null>(null);
  const [eventDataScope, setEventDataScope] =
    useState<EventDataScope>("client");

  const loadEventsData = useCallback(async () => {
    const token = readStoredSession()?.accessToken;
    if (!clientId || !token) return;

    const rows = await listEvents({ client_id: clientId }, token);
    const mapped = rows.map(mapApiEventToEvent);
    setEvents(mapped);
    setSelectedEventId((current) => {
      if (routeEventId && mapped.some((event) => event.id === routeEventId)) {
        return routeEventId;
      }
      if (current && mapped.some((event) => event.id === current)) {
        return current;
      }
      return mapped[0]?.id ?? "";
    });
  }, [clientId, routeEventId]);

  const loadEventContext = useCallback(async () => {
    const token = readStoredSession()?.accessToken;
    if (!clientId || !token || !selectedEventId) return;

    const [teamRows, leadRows, staffRows, snapshot] = await Promise.all([
      listSalesTeams(token, selectedEventId),
      listLeads({ client_id: clientId, event_id: selectedEventId }, token),
      listClientStaff(clientId, token),
      getEventDashboardTv(selectedEventId, token),
    ]);

    setTeams(teamRows);
    setEventLeads(leadRows.map(mapApiLeadToLead));
    setVendors(
      staffRows
        .map(mapStaffToUser)
        .filter(
          (staffUser) =>
            staffUser.role === "vendedor" && staffUser.client_id === clientId,
        ),
    );
    setEventSnapshot(snapshot);
  }, [clientId, selectedEventId]);

  const refreshPage = useCallback(async () => {
    if (!clientId) return;
    setLoading(true);
    setError("");
    try {
      await loadEventsData();
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Falha ao carregar eventos.",
      );
    } finally {
      setLoading(false);
    }
  }, [clientId, loadEventsData]);

  useEffect(() => {
    void refreshPage();
  }, [refreshPage]);

  useEffect(() => {
    if (!selectedEventId) {
      setTeams([]);
      setEventLeads([]);
      setEventSnapshot(null);
      return;
    }

    setLoading(true);
    setError("");
    void loadEventContext()
      .catch((loadError) => {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Falha ao carregar o evento.",
        );
      })
      .finally(() => {
        setLoading(false);
      });
  }, [loadEventContext, selectedEventId]);

  useLeadRealtimeSync(clientId, () => {
    void refreshPage();
    if (selectedEventId) {
      void loadEventContext();
    }
  });

  useEffect(() => {
    setIsDarkMode(readDashboardDarkEnabled(user.id));
  }, [user.id]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const sync = () => setIsDarkMode(readDashboardDarkEnabled(user.id));
    window.addEventListener("storage", sync);
    window.addEventListener("focus", sync);
    window.addEventListener(DASHBOARD_DARK_CHANGE_EVENT, sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener("focus", sync);
      window.removeEventListener(DASHBOARD_DARK_CHANGE_EVENT, sync);
    };
  }, [user.id]);

  const selectedEvent = useMemo(
    () => events.find((event) => event.id === selectedEventId) ?? null,
    [events, selectedEventId],
  );

  const pendingLeads = useMemo(
    () => eventLeads.filter((lead) => !lead.assigned_vendor_id),
    [eventLeads],
  );

  const assignedLeads = useMemo(
    () =>
      eventLeads
        .filter((lead) => !!lead.assigned_vendor_id)
        .sort(
          (a, b) =>
            new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
        ),
    [eventLeads],
  );

  const visibleLeads = useMemo(() => {
    const byAssignedVendor = (leads: Lead[]) =>
      assignedVendorFilter === "all"
        ? leads
        : leads.filter(
            (lead) => lead.assigned_vendor_id === assignedVendorFilter,
          );

    switch (leadFilter) {
      case "pending":
        return pendingLeads;
      case "assigned":
        return byAssignedVendor(
          assignedLeads.filter((lead) => lead.crm_stage !== "convertido"),
        );
      case "converted":
        return assignedLeads.filter((lead) => lead.crm_stage === "convertido");
      case "all":
      default:
        return [...pendingLeads, ...assignedLeads].sort(
          (a, b) =>
            new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
        );
    }
  }, [assignedLeads, assignedVendorFilter, leadFilter, pendingLeads]);

  const eligibleVendors = useMemo(() => {
    const eligibleIds = new Set(
      teams.flatMap((team) =>
        team.members
          .filter((member) => member.user.client_id === clientId)
          .map((member) => member.user_id),
      ),
    );
    return vendors.filter((vendor) => eligibleIds.has(vendor.id));
  }, [clientId, teams, vendors]);

  const totals = useMemo(() => {
    return teams.reduce(
      (acc, team) => {
        const metrics = team.metrics;
        if (!metrics) return acc;
        acc.assigned += metrics.assigned;
        acc.scheduled += metrics.scheduled.count;
        acc.checkedIn += metrics.checked_in.count;
        acc.sold += metrics.sold.count;
        return acc;
      },
      { assigned: 0, scheduled: 0, checkedIn: 0, sold: 0 },
    );
  }, [teams]);

  const scopedEventData = useMemo(() => {
    if (!eventSnapshot) return null;
    const ownParticipant = (eventSnapshot.event.participants ?? []).find(
      (participant) => participant.client_id === clientId,
    );
    const vendors =
      eventDataScope === "client"
        ? eventSnapshot.vendors.filter(
            (vendor) => vendor.client_id === clientId,
          )
        : eventSnapshot.vendors;

    if (eventDataScope !== "client") {
      return {
        funnel: eventSnapshot.funnel,
        revenue: Number(eventSnapshot.cars.total_value),
        vendors,
        teams: eventSnapshot.teams,
      };
    }

    const teamMap = new Map<
      string,
      EventDashboardTvResponse["teams"][number]
    >();
    vendors.forEach((vendor) => {
      if (!vendor.team_id || !vendor.team_name) return;
      const current = teamMap.get(vendor.team_id) ?? {
        team_id: vendor.team_id,
        team_name: vendor.team_name,
        logo_url: null,
        leads: 0,
        scheduled: 0,
        confirmed: 0,
        checked_in: 0,
        sold: 0,
        revenue: 0,
        points: 0,
      };
      current.leads += vendor.leads;
      current.scheduled += vendor.scheduled;
      current.confirmed += vendor.confirmed;
      current.checked_in += vendor.checked_in;
      current.sold += vendor.sold;
      current.revenue =
        Number(current.revenue ?? 0) + Number(vendor.revenue ?? 0);
      current.points += vendor.points;
      teamMap.set(vendor.team_id, current);
    });

    return {
      funnel: ownParticipant
        ? {
            leads: ownParticipant.leads,
            scheduled: ownParticipant.scheduled,
            confirmed: ownParticipant.confirmed,
            checked_in: ownParticipant.checked_in,
            sold: ownParticipant.sold,
          }
        : eventSnapshot.funnel,
      revenue: ownParticipant?.revenue ?? 0,
      vendors,
      teams: [...teamMap.values()],
    };
  }, [clientId, eventDataScope, eventSnapshot]);

  const vendorNameById = useMemo(
    () =>
      Object.fromEntries(
        vendors.map((vendor) => [vendor.id, vendor.name] as const),
      ),
    [vendors],
  );

  const openLeadInCrm = useCallback(
    (lead: Lead) => {
      const params = new URLSearchParams();
      params.set("client_id", lead.client_id);
      params.set("lead_id", lead.id);
      navigate(`/gestor/crm?${params.toString()}`);
    },
    [navigate],
  );

  const openLeadInChat = useCallback(
    (lead: Lead) => {
      const params = new URLSearchParams();
      params.set("client_id", lead.client_id);
      params.set("lead_id", lead.id);
      navigate(`/gestor/chat?${params.toString()}`);
    },
    [navigate],
  );

  const filterChips = useMemo(
    () => [
      { id: "all" as const, label: "Todos", count: eventLeads.length },
      {
        id: "pending" as const,
        label: "Pendentes",
        count: pendingLeads.length,
      },
      {
        id: "assigned" as const,
        label: "Distribuídos",
        count: assignedLeads.filter((lead) => lead.crm_stage !== "convertido")
          .length,
      },
      {
        id: "converted" as const,
        label: "Convertidos",
        count: assignedLeads.filter((lead) => lead.crm_stage === "convertido")
          .length,
      },
    ],
    [assignedLeads, eventLeads.length, pendingLeads.length],
  );

  const handleAssignLead = async (leadId: string) => {
    const token = readStoredSession()?.accessToken;
    const vendorId = vendorByLeadId[leadId];
    if (!token || !vendorId || !selectedEventId) return;

    setAssigningLeadId(leadId);
    setError("");
    try {
      await updateLead(
        leadId,
        {
          assigned_vendor_id: vendorId,
          event_interest_id: selectedEventId,
        },
        token,
      );
      setVendorByLeadId((current) => {
        const next = { ...current };
        delete next[leadId];
        return next;
      });
      await loadEventContext();
    } catch (assignError) {
      setError(
        assignError instanceof Error
          ? assignError.message
          : "Falha ao distribuir o lead.",
      );
    } finally {
      setAssigningLeadId(null);
    }
  };

  if (!clientId) return <MissingClientScope />;

  return (
    <div
      className={clsx(
        "space-y-6",
        isDarkMode &&
          "dashboard-dark cliente-detail-dark -mx-4 -mt-4 rounded-none px-4 pb-8 pt-4 md:-mx-6 md:-mt-6 md:px-6 xl:-mx-8 xl:-mt-8 xl:px-8 bg-black",
      )}
    >
      <PageHeader
        title="Evento 360"
        subtitle="Tudo sobre o evento, seus times, vendedores, leads, atendimento e resultados."
        breadcrumbs={[{ label: "Cliente" }, { label: "Evento 360" }]}
        dark={isDarkMode}
        actions={
          user.role === "gestor" ? (
            <Button
              variant="secondary"
              icon={<ArrowLeft size={14} />}
              onClick={() =>
                navigate(
                  routeEventId
                    ? `/gestor/eventos/${routeEventId}`
                    : "/gestor/eventos",
                )
              }
            >
              Voltar ao evento
            </Button>
          ) : undefined
        }
      />

      {error ? <Notice tone="error">{error}</Notice> : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card className="space-y-2 border border-zinc-100 p-5">
          <div className="flex items-center justify-between">
            <span className="text-sm text-zinc-500">Eventos disponíveis</span>
            <CalendarDays size={16} className="text-amber-500" />
          </div>
          <p className="text-3xl font-semibold text-zinc-950">
            {events.length}
          </p>
          <p className="text-xs text-zinc-500">
            Eventos próprios e compartilhados com sua empresa.
          </p>
        </Card>
        <Card className="space-y-2 border border-zinc-100 p-5">
          <div className="flex items-center justify-between">
            <span className="text-sm text-zinc-500">Leads atribuídos</span>
            <Users size={16} className="text-blue-500" />
          </div>
          <p className="text-3xl font-semibold text-zinc-950">
            {totals.assigned}
          </p>
          <p className="text-xs text-zinc-500">
            Distribuídos nos times do evento selecionado.
          </p>
        </Card>
        <Card className="space-y-2 border border-zinc-100 p-5">
          <div className="flex items-center justify-between">
            <span className="text-sm text-zinc-500">
              Agendamentos e check-ins
            </span>
            <CheckCircle2 size={16} className="text-emerald-500" />
          </div>
          <p className="text-3xl font-semibold text-zinc-950">
            {totals.scheduled} / {totals.checkedIn}
          </p>
          <p className="text-xs text-zinc-500">
            Agenda primeiro, compareceu depois.
          </p>
        </Card>
        <Card className="space-y-2 border border-zinc-100 p-5">
          <div className="flex items-center justify-between">
            <span className="text-sm text-zinc-500">Vendas do time</span>
            <ShoppingBag size={16} className="text-orange-500" />
          </div>
          <p className="text-3xl font-semibold text-zinc-950">{totals.sold}</p>
          <p className="text-xs text-zinc-500">
            Total agregado dos vendedores no evento.
          </p>
        </Card>
      </div>

      <Card className="space-y-4 border border-zinc-100 p-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-zinc-950">
              Contexto do evento
            </h2>
            <p className="text-sm text-zinc-500">
              Escolha o evento para distribuir os leads da sua empresa e
              acompanhar o placar do time.
            </p>
          </div>
          <div className="w-full md:w-80">
            <Select
              options={events.map((event) => ({
                value: event.id,
                label:
                  event.participant_client_ids.length > 1
                    ? `${event.name} · ${event.participant_client_ids.length} participantes`
                    : event.name,
              }))}
              placeholder="Selecione um evento"
              value={selectedEventId}
              onChange={(event) => setSelectedEventId(event.target.value)}
              dark={isDarkMode}
            />
          </div>
        </div>

        {selectedEvent ? (
          <div className="rounded-2xl border border-amber-100 bg-gradient-to-r from-amber-50 via-white to-orange-50 p-5">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-xl font-semibold text-zinc-950">
                    {selectedEvent.name}
                  </h3>
                  <span className="rounded-full bg-white px-3 py-1 text-xs font-medium text-zinc-500">
                    {selectedEvent.participant_client_ids.length > 1
                      ? `${selectedEvent.participant_client_ids.length} empresas participantes`
                      : "1 empresa participante"}
                  </span>
                </div>
                <p className="mt-2 text-sm text-zinc-600">
                  {new Date(selectedEvent.event_date).toLocaleString("pt-BR")} ·{" "}
                  {selectedEvent.location || "Local a definir"}
                </p>
              </div>
              <div className="rounded-2xl bg-white/80 px-4 py-3 text-right shadow-sm">
                <p className="text-xs uppercase tracking-[0.24em] text-zinc-400">
                  Fila pendente
                </p>
                <p className="text-2xl font-semibold text-zinc-950">
                  {pendingLeads.length}
                </p>
              </div>
            </div>
          </div>
        ) : null}
      </Card>

      {eventSnapshot && scopedEventData ? (
        <section className="space-y-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h2 className="text-xl font-semibold text-zinc-950">
                {eventDataScope === "client"
                  ? "Visão da minha empresa"
                  : eventDataScope === "compare"
                    ? "Comparativo das empresas"
                    : "Visão geral do evento"}
              </h2>
              <p className="text-sm text-zinc-500">
                {eventDataScope === "client"
                  ? "Somente os resultados, times e vendedores da sua empresa."
                  : "Números consolidados das empresas participantes do evento."}
              </p>
            </div>
            <div className="flex flex-col items-start gap-2 sm:items-end">
              <div className="inline-flex rounded-full bg-zinc-100 p-1">
                {[
                  ["client", "Minha empresa"],
                  ["event", "Evento inteiro"],
                  ["compare", "Comparar participantes"],
                ].map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setEventDataScope(value as EventDataScope)}
                    className={clsx(
                      "rounded-full px-3 py-2 text-xs font-semibold transition-colors",
                      eventDataScope === value
                        ? "bg-zinc-950 text-white shadow-sm"
                        : "text-zinc-500 hover:text-zinc-900",
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <p className="text-xs text-zinc-400">
                Atualizado em{" "}
                {new Date(eventSnapshot.generated_at).toLocaleString("pt-BR")}
              </p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            {[
              ["Leads", scopedEventData.funnel.leads, Users, "text-blue-500"],
              [
                "Agendados",
                scopedEventData.funnel.scheduled,
                CalendarDays,
                "text-indigo-500",
              ],
              [
                "Confirmados",
                scopedEventData.funnel.confirmed,
                CheckCircle2,
                "text-cyan-500",
              ],
              [
                "Check-ins",
                scopedEventData.funnel.checked_in,
                UserPlus2,
                "text-emerald-500",
              ],
              [
                "Vendas",
                scopedEventData.funnel.sold,
                ShoppingBag,
                "text-orange-500",
              ],
              [
                "Faturamento",
                formatCurrency(scopedEventData.revenue),
                DollarSign,
                "text-green-600",
              ],
            ].map(([label, value, Icon, color]) => {
              const MetricIcon = Icon as typeof Users;
              return (
                <Card
                  key={String(label)}
                  className="border border-zinc-100 p-4"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-zinc-500">
                      {String(label)}
                    </span>
                    <MetricIcon size={16} className={String(color)} />
                  </div>
                  <p className="mt-2 text-2xl font-semibold text-zinc-950">
                    {String(value)}
                  </p>
                </Card>
              );
            })}
          </div>

          {eventDataScope === "compare" ? (
            <Card className="overflow-x-auto border border-zinc-100 p-5">
              <div className="mb-4">
                <h3 className="font-semibold text-zinc-950">
                  Comparação por empresa participante
                </h3>
                <p className="text-xs text-zinc-500">
                  Funil, estrutura comercial e resultado de cada participante.
                </p>
              </div>
              <table className="w-full min-w-[900px] text-left text-sm">
                <thead className="border-b border-zinc-100 text-[11px] uppercase tracking-wider text-zinc-400">
                  <tr>
                    <th className="px-3 py-3">Empresa</th>
                    <th className="px-3 py-3">Times</th>
                    <th className="px-3 py-3">Vendedores</th>
                    <th className="px-3 py-3">Leads</th>
                    <th className="px-3 py-3">Agendados</th>
                    <th className="px-3 py-3">Check-ins</th>
                    <th className="px-3 py-3">Vendas</th>
                    <th className="px-3 py-3">Conversão</th>
                    <th className="px-3 py-3">Faturamento</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {[...(eventSnapshot.event.participants ?? [])]
                    .sort((a, b) => b.sold - a.sold || b.revenue - a.revenue)
                    .map((participant) => (
                      <tr key={participant.client_id}>
                        <td className="px-3 py-3 font-semibold text-zinc-900">
                          {participant.company_name}
                          {participant.client_id === clientId ? (
                            <span className="ml-2 rounded-full bg-blue-50 px-2 py-1 text-[10px] font-bold text-blue-600">
                              SUA EMPRESA
                            </span>
                          ) : null}
                        </td>
                        <td className="px-3 py-3">{participant.teams}</td>
                        <td className="px-3 py-3">{participant.vendors}</td>
                        <td className="px-3 py-3">{participant.leads}</td>
                        <td className="px-3 py-3">{participant.scheduled}</td>
                        <td className="px-3 py-3">{participant.checked_in}</td>
                        <td className="px-3 py-3 font-bold text-emerald-600">
                          {participant.sold}
                        </td>
                        <td className="px-3 py-3">
                          {participant.leads
                            ? Math.round(
                                (participant.sold / participant.leads) * 100,
                              )
                            : 0}
                          %
                        </td>
                        <td className="px-3 py-3 font-semibold">
                          {formatCurrency(participant.revenue)}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </Card>
          ) : null}

          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="border border-zinc-100 p-5">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-zinc-950">
                  Conversão do evento
                </h3>
                <Target size={17} className="text-orange-500" />
              </div>
              <p className="mt-4 text-4xl font-semibold text-zinc-950">
                {scopedEventData.funnel.leads
                  ? Math.round(
                      (scopedEventData.funnel.sold /
                        scopedEventData.funnel.leads) *
                        100,
                    )
                  : 0}
                %
              </p>
              <div className="mt-4 space-y-2 text-sm text-zinc-500">
                <p>
                  Comparecimento:{" "}
                  <strong className="text-zinc-900">
                    {scopedEventData.funnel.scheduled
                      ? Math.round(
                          (scopedEventData.funnel.checked_in /
                            scopedEventData.funnel.scheduled) *
                            100,
                        )
                      : 0}
                    %
                  </strong>
                </p>
                <p>
                  Conversão no salão:{" "}
                  <strong className="text-zinc-900">
                    {scopedEventData.funnel.checked_in
                      ? Math.round(
                          (scopedEventData.funnel.sold /
                            scopedEventData.funnel.checked_in) *
                            100,
                        )
                      : 0}
                    %
                  </strong>
                </p>
                <p>
                  Meta de vendas:{" "}
                  <strong className="text-zinc-900">
                    {eventSnapshot.event.sales_target ?? "Não definida"}
                  </strong>
                </p>
              </div>
            </Card>

            <Card className="border border-zinc-100 p-5 lg:col-span-2">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-zinc-950">
                    Ranking dos times
                  </h3>
                  <p className="text-xs text-zinc-500">
                    Desempenho completo dentro do evento.
                  </p>
                </div>
                <Trophy size={17} className="text-amber-500" />
              </div>
              <div className="space-y-2">
                {[...scopedEventData.teams]
                  .sort((a, b) => b.sold - a.sold || b.points - a.points)
                  .map((team, index) => (
                    <div
                      key={team.team_id}
                      className="grid grid-cols-[28px_minmax(0,1fr)_repeat(3,auto)] items-center gap-3 rounded-2xl bg-zinc-50 px-3 py-2.5 text-sm"
                    >
                      <span className="font-bold text-zinc-400">
                        {index + 1}º
                      </span>
                      <span className="truncate font-semibold text-zinc-900">
                        {team.team_name}
                      </span>
                      <span className="text-zinc-500">
                        {team.checked_in} check-ins
                      </span>
                      <span className="font-semibold text-emerald-600">
                        {team.sold} vendas
                      </span>
                      <span className="font-semibold text-amber-600">
                        {team.points} pts
                      </span>
                    </div>
                  ))}
                {!scopedEventData.teams.length ? (
                  <p className="text-sm text-zinc-500">
                    Nenhum time configurado.
                  </p>
                ) : null}
              </div>
            </Card>
          </div>

          <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
            <Card className="border border-zinc-100 p-5">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-zinc-950">
                    Desempenho dos vendedores
                  </h3>
                  <p className="text-xs text-zinc-500">
                    Todos os vendedores participantes, com time e empresa.
                  </p>
                </div>
                <Users size={17} className="text-blue-500" />
              </div>
              <div className="max-h-96 space-y-2 overflow-y-auto pr-1">
                {[...scopedEventData.vendors]
                  .sort((a, b) => b.sold - a.sold || b.points - a.points)
                  .map((vendor, index) => (
                    <div
                      key={vendor.vendor_id}
                      className="grid gap-2 rounded-2xl border border-zinc-100 px-4 py-3 sm:grid-cols-[32px_minmax(0,1fr)_repeat(4,auto)] sm:items-center"
                    >
                      <span className="font-bold text-zinc-400">
                        {index + 1}º
                      </span>
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-zinc-900">
                          {vendor.vendor_name}
                        </p>
                        <p className="truncate text-[11px] text-zinc-400">
                          {vendor.team_name || "Sem time"}
                          {vendor.client_id === clientId
                            ? " · Sua empresa"
                            : " · Empresa participante"}
                        </p>
                      </div>
                      <span className="text-xs text-zinc-500">
                        {vendor.leads} leads
                      </span>
                      <span className="text-xs text-zinc-500">
                        {vendor.scheduled} agendas
                      </span>
                      <span className="text-xs text-zinc-500">
                        {vendor.checked_in} check-ins
                      </span>
                      <span className="text-xs font-bold text-emerald-600">
                        {vendor.sold} vendas
                      </span>
                    </div>
                  ))}
              </div>
            </Card>

            <Card className="border border-zinc-100 p-5">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="font-semibold text-zinc-950">
                  {eventDataScope === "client"
                    ? "Estrutura da minha empresa"
                    : "Veículos vendidos no evento"}
                </h3>
                <BarChart3 size={17} className="text-violet-500" />
              </div>
              {eventDataScope === "client" ? (
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-2xl bg-zinc-50 p-4">
                    <p className="text-xs text-zinc-500">Vendedores</p>
                    <p className="mt-1 text-2xl font-semibold text-zinc-950">
                      {scopedEventData.vendors.length}
                    </p>
                  </div>
                  <div className="rounded-2xl bg-zinc-50 p-4">
                    <p className="text-xs text-zinc-500">Times</p>
                    <p className="mt-1 text-2xl font-semibold text-zinc-950">
                      {scopedEventData.teams.length}
                    </p>
                  </div>
                  <div className="col-span-2 rounded-2xl bg-emerald-50 p-4">
                    <p className="text-xs text-emerald-700">
                      Faturamento da empresa
                    </p>
                    <p className="mt-1 text-2xl font-semibold text-emerald-800">
                      {formatCurrency(scopedEventData.revenue)}
                    </p>
                  </div>
                </div>
              ) : (
                <>
                  <p className="text-3xl font-semibold text-zinc-950">
                    {formatCurrency(scopedEventData.revenue)}
                  </p>
                  <p className="mb-4 text-xs text-zinc-500">
                    Valor total registrado no evento
                  </p>
                  <div className="space-y-2">
                    {eventSnapshot.cars.top_models
                      .slice(0, 6)
                      .map((model, index) => (
                        <div
                          key={model.model}
                          className="flex items-center justify-between rounded-xl bg-zinc-50 px-3 py-2 text-sm"
                        >
                          <span className="truncate text-zinc-700">
                            {index + 1}. {model.model}
                          </span>
                          <strong className="text-zinc-950">
                            {model.count}
                          </strong>
                        </div>
                      ))}
                    {!eventSnapshot.cars.top_models.length ? (
                      <p className="text-sm text-zinc-500">
                        Nenhum modelo registrado.
                      </p>
                    ) : null}
                  </div>
                </>
              )}
            </Card>
          </div>
        </section>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[1.1fr_1.9fr]">
        <Card className="space-y-4 border border-zinc-100 p-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-zinc-950">
                Fila da sua empresa
              </h2>
              <p className="text-sm text-zinc-500">
                Leads automáticos do evento entram aqui até serem distribuídos
                no painel do cliente.
              </p>
            </div>
            <UserPlus2 size={18} className="text-blue-500" />
          </div>

          {loading ? (
            <p className="text-sm text-zinc-500">
              Carregando fila do evento...
            </p>
          ) : null}

          {!loading && pendingLeads.length === 0 ? (
            <Notice tone="info">
              Nenhum lead pendente de distribuição neste evento.
            </Notice>
          ) : null}

          {!loading &&
          pendingLeads.length > 0 &&
          eligibleVendors.length === 0 ? (
            <Notice tone="info">
              Não há vendedores da sua empresa vinculados a times deste evento.
              Adicione os membros no time antes de distribuir os leads.
            </Notice>
          ) : null}

          <div className="space-y-3">
            {pendingLeads.map((lead) => (
              <div
                key={lead.id}
                className="rounded-[22px] border border-zinc-100 bg-white p-3.5 shadow-sm sm:p-4"
              >
                <div className="flex flex-col gap-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="truncate text-sm font-semibold text-zinc-950 sm:text-base">
                        {lead.name}
                      </h3>
                      <p className="mt-1 text-[11px] text-zinc-500 sm:text-xs">
                        {lead.phone || "Sem telefone"} · {lead.source}
                      </p>
                    </div>
                    <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
                      sem dono
                    </span>
                  </div>

                  <div className="flex flex-wrap gap-1.5">
                    <SourceBadge source={lead.source} />
                    <ConfirmationBadge status={lead.confirmation_status} />
                    <Badge
                      variant={
                        lead.crm_stage === "convertido" ? "green" : "gray"
                      }
                    >
                      {lead.crm_stage}
                    </Badge>
                    {lead.confirmation_status === "checked_in" &&
                    (lead.sold_by_vendor_id ||
                      lead.active_appointment?.sale_id ||
                      lead.crm_stage === "convertido") ? (
                      <Badge variant="green">Check-in + venda</Badge>
                    ) : null}
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div className="rounded-xl bg-zinc-50 px-3 py-2">
                      <p className="text-[10px] uppercase tracking-[0.18em] text-zinc-400">
                        Status
                      </p>
                      <p className="mt-1 text-xs font-medium text-zinc-900">
                        {STATUS_LABELS[lead.confirmation_status]}
                      </p>
                    </div>
                    <div className="rounded-xl bg-zinc-50 px-3 py-2">
                      <p className="text-[10px] uppercase tracking-[0.18em] text-zinc-400">
                        Atualizado
                      </p>
                      <p className="mt-1 text-xs font-medium text-zinc-900">
                        {new Date(lead.updated_at).toLocaleString("pt-BR")}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-col gap-3 md:flex-row">
                    <div className="flex-1">
                      <Select
                        options={eligibleVendors.map((vendor) => ({
                          value: vendor.id,
                          label: vendor.name,
                        }))}
                        placeholder="Escolha o vendedor"
                        value={vendorByLeadId[lead.id] ?? ""}
                        onChange={(event) =>
                          setVendorByLeadId((current) => ({
                            ...current,
                            [lead.id]: event.target.value,
                          }))
                        }
                        dark={isDarkMode}
                      />
                    </div>
                    <Button
                      onClick={() => void handleAssignLead(lead.id)}
                      isDisabled={
                        !vendorByLeadId[lead.id] || eligibleVendors.length === 0
                      }
                      loading={assigningLeadId === lead.id}
                      icon={<UserPlus2 size={16} />}
                    >
                      Distribuir
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card className="space-y-4 border border-zinc-100 p-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-zinc-950">
                Placar do time
              </h2>
              <p className="text-sm text-zinc-500">
                Total por time e também o detalhe individual de cada vendedor no
                evento.
              </p>
            </div>
            <Trophy size={18} className="text-amber-500" />
          </div>

          {loading ? (
            <p className="text-sm text-zinc-500">
              Carregando métricas do time...
            </p>
          ) : null}

          {!loading && teams.length === 0 ? (
            <Notice tone="info">
              Nenhum time configurado para este evento.
            </Notice>
          ) : null}

          <div className="space-y-4">
            {teams.map((team) => (
              <div
                key={team.id}
                className="rounded-3xl border border-zinc-100 bg-gradient-to-br from-white via-zinc-50 to-amber-50 p-5 shadow-sm"
              >
                <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                  <div>
                    <h3 className="text-lg font-semibold text-zinc-950">
                      {team.name}
                    </h3>
                    <p className="text-sm text-zinc-500">
                      {team.members.length} membro(s) ·{" "}
                      {team.metrics?.total_points ?? 0} pontos
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-center sm:grid-cols-4">
                    <div className="rounded-2xl bg-white px-3 py-2">
                      <p className="text-[11px] uppercase tracking-[0.22em] text-zinc-400">
                        Leads
                      </p>
                      <p className="text-lg font-semibold text-zinc-950">
                        {team.metrics?.assigned ?? 0}
                      </p>
                    </div>
                    <div className="rounded-2xl bg-white px-3 py-2">
                      <p className="text-[11px] uppercase tracking-[0.22em] text-zinc-400">
                        Agenda
                      </p>
                      <p className="text-lg font-semibold text-zinc-950">
                        {team.metrics?.scheduled.count ?? 0}
                      </p>
                    </div>
                    <div className="rounded-2xl bg-white px-3 py-2">
                      <p className="text-[11px] uppercase tracking-[0.22em] text-zinc-400">
                        Check-in
                      </p>
                      <p className="text-lg font-semibold text-zinc-950">
                        {team.metrics?.checked_in.count ?? 0}
                      </p>
                    </div>
                    <div className="rounded-2xl bg-white px-3 py-2">
                      <p className="text-[11px] uppercase tracking-[0.22em] text-zinc-400">
                        Venda
                      </p>
                      <p className="text-lg font-semibold text-zinc-950">
                        {team.metrics?.sold.count ?? 0}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="mt-4 space-y-3">
                  {(team.vendors ?? []).map((vendor) => (
                    <div
                      key={vendor.vendor_id}
                      className="grid gap-3 rounded-2xl border border-white/80 bg-white/90 px-4 py-3 md:grid-cols-[minmax(0,1.5fr)_repeat(4,minmax(0,0.75fr))]"
                    >
                      <div>
                        <p className="font-medium text-zinc-950">
                          {vendor.vendor_name}
                        </p>
                        <p className="text-xs text-zinc-500">
                          {vendor.client_id === clientId
                            ? "Sua empresa"
                            : "Outra empresa do evento"}
                        </p>
                      </div>
                      <div>
                        <p className="text-[11px] uppercase tracking-[0.22em] text-zinc-400">
                          Leads
                        </p>
                        <p className="text-sm font-semibold text-zinc-950">
                          {vendor.assigned}
                        </p>
                      </div>
                      <div>
                        <p className="text-[11px] uppercase tracking-[0.22em] text-zinc-400">
                          Agenda
                        </p>
                        <p className="text-sm font-semibold text-zinc-950">
                          {vendor.scheduled.count}
                        </p>
                      </div>
                      <div>
                        <p className="text-[11px] uppercase tracking-[0.22em] text-zinc-400">
                          Check-in
                        </p>
                        <p className="text-sm font-semibold text-zinc-950">
                          {vendor.checked_in.count}
                        </p>
                      </div>
                      <div>
                        <p className="text-[11px] uppercase tracking-[0.22em] text-zinc-400">
                          Venda
                        </p>
                        <p className="text-sm font-semibold text-zinc-950">
                          {vendor.sold.count}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card className="space-y-4 border border-zinc-100 p-5">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-zinc-950">
              Leads do evento
            </h2>
            <p className="text-sm text-zinc-500">
              Acompanhe pendências, leads já distribuídos e convertidos da sua
              empresa neste evento.
            </p>
          </div>
          <Users size={18} className="text-zinc-500" />
        </div>

        <div className="flex flex-wrap gap-2">
          {filterChips.map((chip) => {
            const active = leadFilter === chip.id;
            return (
              <button
                key={chip.id}
                type="button"
                onClick={() => setLeadFilter(chip.id)}
                className={clsx(
                  "inline-flex items-center gap-2 rounded-full border px-3 py-2 text-sm transition-colors",
                  active
                    ? "border-zinc-900 bg-zinc-950 text-white"
                    : "border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300 hover:text-zinc-900",
                )}
              >
                <span>{chip.label}</span>
                <Badge
                  variant={active ? "gray" : "blue"}
                  className={active ? "!bg-white/15 !text-white" : ""}
                >
                  {chip.count}
                </Badge>
              </button>
            );
          })}
        </div>

        {leadFilter === "assigned" ? (
          <div className="max-w-xs">
            <Select
              options={[
                { value: "all", label: "Todos os vendedores" },
                ...eligibleVendors.map((vendor) => ({
                  value: vendor.id,
                  label: vendor.name,
                })),
              ]}
              placeholder="Filtrar por vendedor"
              value={assignedVendorFilter}
              onChange={(event) => setAssignedVendorFilter(event.target.value)}
              dark={isDarkMode}
            />
          </div>
        ) : null}

        {loading ? (
          <p className="text-sm text-zinc-500">Carregando leads do evento...</p>
        ) : null}

        {!loading && visibleLeads.length === 0 ? (
          <Notice tone="info">
            Nenhum lead encontrado para este filtro no evento.
          </Notice>
        ) : null}

        <div className="grid gap-3 lg:grid-cols-2">
          {visibleLeads.map((lead) => {
            const isPending = !lead.assigned_vendor_id;
            const hasCheckin = lead.confirmation_status === "checked_in";
            const hasSale =
              !!lead.sold_by_vendor_id ||
              !!lead.active_appointment?.sale_id ||
              lead.crm_stage === "convertido";
            const isWonJourney = hasCheckin && hasSale;
            return (
              <div
                key={lead.id}
                role="button"
                tabIndex={0}
                onClick={() => setSelectedLead(lead)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    setSelectedLead(lead);
                  }
                }}
                className={clsx(
                  "group flex h-full flex-col rounded-[22px] border bg-white p-3.5 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_24px_50px_rgba(15,23,42,0.10)] focus:outline-none focus:ring-2 focus:ring-zinc-300 sm:p-4",
                  isWonJourney
                    ? "border-emerald-300 bg-gradient-to-br from-emerald-50 via-white to-amber-50 shadow-[0_16px_40px_rgba(16,185,129,0.12)]"
                    : "border-zinc-100",
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="truncate text-sm font-semibold text-zinc-950 sm:text-base">
                      {lead.name}
                    </h3>
                    <p className="mt-1 text-[11px] text-zinc-500 sm:text-xs">
                      {lead.phone || "Sem telefone"} · {lead.source}
                    </p>
                  </div>
                  {isPending ? (
                    <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-700">
                      Pendente
                    </span>
                  ) : (
                    <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-emerald-700">
                      {vendorNameById[lead.assigned_vendor_id ?? ""] ??
                        "Distribuído"}
                    </span>
                  )}
                </div>

                <div className="mt-2 flex flex-wrap gap-1.5">
                  <SourceBadge source={lead.source} />
                  <ConfirmationBadge status={lead.confirmation_status} />
                  <Badge
                    variant={lead.crm_stage === "convertido" ? "green" : "gray"}
                  >
                    {lead.crm_stage}
                  </Badge>
                  {isWonJourney ? (
                    <Badge variant="green">Check-in + venda</Badge>
                  ) : null}
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                  <div className="rounded-xl bg-zinc-50 px-3 py-2">
                    <p className="text-[10px] uppercase tracking-[0.18em] text-zinc-400">
                      Status
                    </p>
                    <p className="mt-1 text-xs font-medium text-zinc-900">
                      {STATUS_LABELS[lead.confirmation_status]}
                    </p>
                  </div>
                  <div className="rounded-xl bg-zinc-50 px-3 py-2">
                    <p className="text-[10px] uppercase tracking-[0.18em] text-zinc-400">
                      Atualizado
                    </p>
                    <p className="mt-1 text-xs font-medium text-zinc-900">
                      {new Date(lead.updated_at).toLocaleString("pt-BR")}
                    </p>
                  </div>
                </div>

                {isPending ? (
                  <div
                    className="mt-3 flex flex-col gap-3 md:flex-row"
                    onClick={(event) => event.stopPropagation()}
                    onKeyDown={(event) => event.stopPropagation()}
                  >
                    <div className="flex-1">
                      <Select
                        options={eligibleVendors.map((vendor) => ({
                          value: vendor.id,
                          label: vendor.name,
                        }))}
                        placeholder="Escolha o vendedor"
                        value={vendorByLeadId[lead.id] ?? ""}
                        onChange={(event) =>
                          setVendorByLeadId((current) => ({
                            ...current,
                            [lead.id]: event.target.value,
                          }))
                        }
                        dark={isDarkMode}
                      />
                    </div>
                    <Button
                      onClick={() => void handleAssignLead(lead.id)}
                      isDisabled={
                        !vendorByLeadId[lead.id] || eligibleVendors.length === 0
                      }
                      loading={assigningLeadId === lead.id}
                      icon={<UserPlus2 size={16} />}
                    >
                      Distribuir
                    </Button>
                  </div>
                ) : null}

                <div
                  className="mt-auto grid gap-1.5 sm:grid-cols-3"
                  onClick={(event) => event.stopPropagation()}
                  onKeyDown={(event) => event.stopPropagation()}
                >
                  <Button
                    variant="secondary"
                    size="sm"
                    icon={<FileSearch size={15} />}
                    className="h-10 w-full min-w-0 justify-center gap-1.5 rounded-2xl px-3 text-xs font-semibold"
                    onClick={() => setSelectedLead(lead)}
                  >
                    Detalhes
                  </Button>
                  {user.role === "gestor" ? (
                    <Button
                      variant="secondary"
                      size="sm"
                      icon={<MessageCircle size={15} />}
                      className="h-10 w-full min-w-0 justify-center gap-1.5 rounded-2xl px-3 text-xs font-semibold"
                      onClick={() => openLeadInChat(lead)}
                    >
                      Chat
                    </Button>
                  ) : null}
                  {user.role === "gestor" ? (
                    <Button
                      size="sm"
                      icon={<ArrowUpRight size={15} />}
                      className="h-10 w-full min-w-0 justify-center gap-1.5 rounded-2xl px-3 text-xs font-semibold"
                      onClick={() => openLeadInCrm(lead)}
                    >
                      CRM
                    </Button>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      {selectedLead ? (
        <EventLeadDetailDrawer
          lead={selectedLead}
          vendorName={
            selectedLead.assigned_vendor_id
              ? (vendorNameById[selectedLead.assigned_vendor_id] ?? undefined)
              : undefined
          }
          dark={isDarkMode}
          canOpenCrm={user.role === "gestor"}
          canOpenChat={user.role === "gestor"}
          onClose={() => setSelectedLead(null)}
          onOpenChat={() => openLeadInChat(selectedLead)}
          onOpenCrm={() => openLeadInCrm(selectedLead)}
        />
      ) : null}
    </div>
  );
}
