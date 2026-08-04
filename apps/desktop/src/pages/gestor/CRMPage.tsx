import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent,
  type WheelEvent as ReactWheelEvent,
} from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import clsx from "clsx";
import {
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  ArrowDownWideNarrow,
  CalendarDays,
  Check,
  CheckSquare,
  ChevronDown,
  ChevronRight,
  Clock,
  Filter,
  Layers,
  Mail,
  MessageCircle,
  Phone,
  Search,
  Square,
  Tag,
  Target,
  TrendingDown,
  TrendingUp,
  User as UserIcon,
  UserCheck,
  X,
  GripVertical,
  KanbanSquare,
  LayoutGrid,
  List,
  EyeOff,
  Car,
  Users,
  FileText,
} from "lucide-react";
import { Card } from "../../components/ui/Card";
import { CopyableId } from "../../components/ui/CopyableId";
import {
  ConfirmationBadge,
  SourceBadge,
  StageBadge,
} from "../../components/ui/Badge";
import type { Client, Lead, User } from "../../types";
import { readStoredSession } from "../../services/auth";
import { listClients, mapApiClientToClient } from "../../services/clients";
import {
  bulkMoveCrmLeads,
  createCrmPipeline,
  getCrmStageCounts,
  listCrmPipelines,
  listLeadTimeline,
  listPipelineStages,
  moveCrmLead,
  type ApiCrmStage,
  type ApiLeadTimelineItem,
  type ApiLeadTimelineOrigin,
} from "../../services/crm";
import {
  fetchAllLeads,
  getLead,
  mapApiLeadToLead,
  updateLead,
} from "../../services/leads";
import { HttpError } from "../../services/http";
import {
  apiStagesToColumns,
  clientIdToPipelineCode,
  defaultKanbanStages,
  distributeLeadsByStageCode,
  distributeLeadsByStageId,
  emptyBoardForStages,
  pickDefaultPipeline,
  stageCodeById,
  type KanbanColumn,
} from "../../lib/crm-kanban";
import { listClientStaff, mapStaffToUser } from "../../services/staff";
import { useGestorClient } from "../../hooks/useGestorClient";
import {
  useLeadRealtimeSync,
  type RealtimeStatus,
} from "../../hooks/useLeadRealtimeSync";
import {
  DASHBOARD_DARK_CHANGE_EVENT,
  readDashboardDarkEnabled,
} from "../../lib/dashboard-dark-mode";
import {
  CRM_SOURCE_LABELS as SOURCE_LABELS,
  CRM_SOURCE_OPTIONS as SOURCE_OPTIONS,
  LEGACY_STAGES as STAGES,
  formatCrmDate as formatDate,
  formatStageLeadCount,
  isUuid,
  removeLeadFromBoard,
  upsertLeadInBoard,
} from "./crm-page.model";

type ViewMode = "kanban" | "compact" | "list";
type CardSort = "recent" | "oldest" | "visit" | "updated" | "name";
type StageFilter = "all" | string;
type ConfirmationFilter = "all" | Lead["confirmation_status"];
type LeadMotionKind = "new" | "stage-change" | "update";
type StageMotionKind = LeadMotionKind;

type Toast = {
  id: number;
  message: string;
  type: "success" | "error" | "info";
  /** Acao opcional no proprio toast (ex.: desfazer uma movimentacao). */
  action?: { label: string; onAction: () => void };
};

const CARD_SORT_OPTIONS = [
  ["recent", "Mais recentes"],
  ["oldest", "Mais antigos"],
  ["visit", "Visita mais proxima"],
  ["updated", "Atualizados por ultimo"],
  ["name", "Nome (A-Z)"],
] as const satisfies ReadonlyArray<readonly [CardSort, string]>;

const CARD_SORT_STORAGE_KEY = "crm_card_sort";

/** true abaixo do breakpoint `md` do Tailwind (768px). No celular o Kanban
 *  mostra uma etapa por vez em vez do quadro rolando na horizontal. */
function useIsMobileViewport() {
  const query = "(max-width: 767px)";
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== "undefined" && window.matchMedia(query).matches,
  );

  useEffect(() => {
    const media = window.matchMedia(query);
    const handleChange = (event: MediaQueryListEvent) =>
      setIsMobile(event.matches);
    setIsMobile(media.matches);
    media.addEventListener("change", handleChange);
    return () => media.removeEventListener("change", handleChange);
  }, []);

  return isMobile;
}

/** Compara duas datas ISO. Lead sem data (ou com data invalida) sempre vai
 *  para o fim da coluna, nas duas direcoes. */
function compareByDate(
  a: string | null | undefined,
  b: string | null | undefined,
  direction: "asc" | "desc",
) {
  const aTime = a ? Date.parse(a) : Number.NaN;
  const bTime = b ? Date.parse(b) : Number.NaN;
  const aMissing = Number.isNaN(aTime);
  const bMissing = Number.isNaN(bTime);
  if (aMissing && bMissing) return 0;
  if (aMissing) return 1;
  if (bMissing) return -1;
  return direction === "asc" ? aTime - bTime : bTime - aTime;
}

/** Ordenacao dos cards dentro da etapa. O desempate por nome mantem a ordem
 *  estavel quando dois leads tem a mesma data. */
function compareLeads(sort: CardSort) {
  return (a: Lead, b: Lead) => {
    const byName = a.name.localeCompare(b.name);
    switch (sort) {
      case "recent":
        return compareByDate(a.created_at, b.created_at, "desc") || byName;
      case "oldest":
        return compareByDate(a.created_at, b.created_at, "asc") || byName;
      case "visit":
        return (
          compareByDate(
            a.store_visit_datetime,
            b.store_visit_datetime,
            "asc",
          ) || byName
        );
      case "updated":
        return compareByDate(a.updated_at, b.updated_at, "desc") || byName;
      case "name":
      default:
        return byName;
    }
  };
}

function ToastStack({
  toasts,
  onDismiss,
}: {
  toasts: Toast[];
  onDismiss: (id: number) => void;
}) {
  if (!toasts.length) return null;
  return (
    <div className="pointer-events-none fixed bottom-6 left-1/2 z-[100] flex -translate-x-1/2 flex-col items-center gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={clsx(
            "pointer-events-auto flex items-center gap-3 rounded-2xl px-5 py-3 text-sm font-medium shadow-[0_8px_32px_rgba(0,0,0,0.22)]",
            t.type === "error" && "bg-[#FF0636] text-white",
            t.type === "success" && "bg-emerald-500 text-white",
            t.type === "info" && "bg-zinc-900 text-white",
          )}
        >
          <span>{t.message}</span>
          {t.action && (
            <button
              type="button"
              onClick={() => {
                t.action?.onAction();
                onDismiss(t.id);
              }}
              className="shrink-0 rounded-full bg-white/20 px-3 py-1 text-xs font-bold uppercase tracking-wide transition-colors hover:bg-white/30"
            >
              {t.action.label}
            </button>
          )}
          <button
            type="button"
            onClick={() => onDismiss(t.id)}
            className="opacity-70 hover:opacity-100"
            aria-label="Fechar"
          >
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}

const CONFIRMATION_LABELS: Record<string, string> = {
  pending: "Pendente",
  confirmed: "Confirmado",
  checked_in: "Check-in realizado",
  cancelled: "Cancelado",
};

function formatDateFull(date: string | null | undefined) {
  if (!date) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(date));
}

function formatDateShort(date: string | null | undefined) {
  if (!date) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(date));
}

function formatDateOnly(date: string | null | undefined) {
  if (!date) return "—";
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(date);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : formatDateShort(date);
}

const TIMELINE_ORIGIN_LABEL: Record<ApiLeadTimelineOrigin, string> = {
  crm: "CRM",
  whatsapp: "WhatsApp",
  vendor: "Vendedor",
  gestor: "Gestor",
  automation: "Automação",
  integration: "Integração",
  n8n: "n8n",
  system: "Sistema",
};

const TIMELINE_ORIGIN_COLOR: Record<ApiLeadTimelineOrigin, string> = {
  crm: "#3D56A2",
  whatsapp: "#22C55E",
  vendor: "#A855F7",
  gestor: "#0EA5E9",
  automation: "#F59E0B",
  integration: "#6366F1",
  n8n: "#EC4899",
  system: "#71717A",
};

const CONFIRMATION_STATUS_LABEL: Record<string, string> = {
  pending: "Pendente",
  scheduled: "Agendado",
  confirmed: "Confirmado",
  cancelled: "Cancelado",
  checked_in: "Check-in",
};

function statusLabelPt(value: string | null) {
  if (!value) return "—";
  return CONFIRMATION_STATUS_LABEL[value] ?? value;
}

function timelineTitle(item: ApiLeadTimelineItem) {
  switch (item.event_type) {
    case "created":
      return "Lead criado";
    case "stage_moved":
      return item.from_stage
        ? `${item.from_stage.name} → ${item.to_stage?.name ?? item.to_value ?? "—"}`
        : `Entrou em ${item.to_stage?.name ?? item.to_value ?? "—"}`;
    case "status_changed":
      return `Status: ${statusLabelPt(item.from_value)} → ${statusLabelPt(item.to_value)}`;
    case "assigned":
      return "Vendedor atribuído";
    case "unassigned":
      return "Vendedor removido";
    case "tag_added":
      return `Tag adicionada${item.to_value ? `: ${item.to_value}` : ""}`;
    case "tag_removed":
      return `Tag removida${item.from_value ? `: ${item.from_value}` : ""}`;
    case "note":
      return "Anotação";
    case "message":
      return "Mensagem";
    default:
      return item.event_type;
  }
}

function timelineDotColor(item: ApiLeadTimelineItem) {
  if (item.event_type === "stage_moved" && item.to_stage)
    return item.to_stage.color;
  return TIMELINE_ORIGIN_COLOR[item.origin] ?? "#71717A";
}

function LeadDetailModal({
  lead: initialLead,
  vendorsById,
  pipelineStages,
  dark,
  historyVersion,
  onClose,
  onOpenChat,
  onLeadUpdated,
  onMoveStage,
}: {
  lead: Lead;
  vendorsById: Record<string, string>;
  pipelineStages: KanbanColumn[];
  dark: boolean;
  historyVersion: number;
  onClose: () => void;
  onOpenChat: (lead: Lead) => void;
  onLeadUpdated: (lead: Lead) => void;
  /** Move o lead pela trilha de etapas do topo (mesma rota da API do drag). */
  onMoveStage: (lead: Lead, stageId: string) => Promise<Lead | null>;
}) {
  const [activeTab, setActiveTab] = useState<"historico" | "dados">(
    "historico",
  );
  const [lead, setLead] = useState(initialLead);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editPhone, setEditPhone] = useState(lead.phone);
  const [editEmail, setEditEmail] = useState(lead.email);
  const [editNotes, setEditNotes] = useState(lead.notes);
  const [editVendorId, setEditVendorId] = useState(
    lead.assigned_vendor_id ?? "",
  );
  const [editVisitDate, setEditVisitDate] = useState(
    lead.store_visit_datetime ? lead.store_visit_datetime.slice(0, 16) : "",
  );
  const [editVehiclePlate, setEditVehiclePlate] = useState(
    lead.vehicle_plate ?? "",
  );
  const [editCompanions, setEditCompanions] = useState(lead.companions ?? "");
  const [editDescription, setEditDescription] = useState(
    lead.description ?? "",
  );
  const [editFirstName, setEditFirstName] = useState(lead.first_name ?? "");
  const [editLastName, setEditLastName] = useState(lead.last_name ?? "");
  const [editBirthDate, setEditBirthDate] = useState(
    lead.birth_date?.slice(0, 10) ?? "",
  );
  const [history, setHistory] = useState<ApiLeadTimelineItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [movingStageId, setMovingStageId] = useState<string | null>(null);

  const vendorName = lead.assigned_vendor_id
    ? vendorsById[lead.assigned_vendor_id]
    : null;
  const progressStages =
    pipelineStages.length > 0
      ? pipelineStages
      : STAGES.map((stage) => ({
          id: stage.id,
          code: stage.id,
          label: stage.label,
          color: stage.color,
          emptyIcon: stage.emptyIcon,
        }));
  const currentStageIndex = progressStages.findIndex(
    (stage) => stage.id === lead.crm_stage_id || stage.id === lead.crm_stage,
  );

  const handleStageClick = async (stageId: string) => {
    if (movingStageId) return;
    if (stageId === lead.crm_stage_id || stageId === lead.crm_stage) return;
    setMovingStageId(stageId);
    try {
      const moved = await onMoveStage(lead, stageId);
      if (moved) setLead(moved);
    } finally {
      setMovingStageId(null);
    }
  };

  useEffect(() => {
    setLead(initialLead);
    setEditPhone(initialLead.phone);
    setEditEmail(initialLead.email);
    setEditNotes(initialLead.notes);
    setEditVendorId(initialLead.assigned_vendor_id ?? "");
    setEditVisitDate(
      initialLead.store_visit_datetime
        ? initialLead.store_visit_datetime.slice(0, 16)
        : "",
    );
    setEditVehiclePlate(initialLead.vehicle_plate ?? "");
    setEditCompanions(initialLead.companions ?? "");
    setEditDescription(initialLead.description ?? "");
    setEditFirstName(initialLead.first_name ?? "");
    setEditLastName(initialLead.last_name ?? "");
    setEditBirthDate(initialLead.birth_date?.slice(0, 10) ?? "");
  }, [initialLead]);

  // Fecha ao pressionar Esc
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Carrega histórico real da API
  useEffect(() => {
    const token = readStoredSession()?.accessToken;
    if (!token) {
      setHistoryLoading(false);
      return;
    }
    setHistoryLoading(true);
    listLeadTimeline(lead.id, token)
      .then(setHistory)
      .catch(() => setHistory([]))
      .finally(() => setHistoryLoading(false));
  }, [historyVersion, lead.id]);

  const handleSave = async () => {
    const token = readStoredSession()?.accessToken;
    if (!token) return;
    setSaving(true);
    try {
      const updated = await updateLead(
        lead.id,
        {
          phone: editPhone || null,
          email: editEmail || null,
          notes: editNotes || null,
          store_visit_datetime: editVisitDate
            ? new Date(editVisitDate).toISOString()
            : null,
          assigned_vendor_id: editVendorId || null,
          vehicle_plate: editVehiclePlate || null,
          companions: editCompanions || null,
          description: editDescription || null,
          first_name: editFirstName || null,
          last_name: editLastName || null,
          birth_date: editBirthDate || null,
        },
        token,
      );
      const mapped = {
        ...lead,
        phone: updated.phone ?? "",
        email: updated.email ?? "",
        notes: updated.notes ?? "",
        assigned_vendor_id: updated.assigned_vendor_id,
        store_visit_datetime: updated.store_visit_datetime,
        vehicle_plate: updated.vehicle_plate ?? "",
        companions: updated.companions ?? "",
        description: updated.description ?? "",
        first_name: updated.first_name ?? "",
        last_name: updated.last_name ?? "",
        birth_date: updated.birth_date ?? null,
      };
      setLead(mapped);
      onLeadUpdated(mapped);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  const vendors = Object.entries(vendorsById);

  const infoRows: Array<{
    label: string;
    value: string | null;
    icon: typeof Phone;
  }> = [
    { label: "Telefone", value: lead.phone || null, icon: Phone },
    { label: "E-mail", value: lead.email || null, icon: Mail },
    {
      label: "Data de nascimento",
      value: formatDateOnly(lead.birth_date),
      icon: CalendarDays,
    },
    {
      label: "Evento de interesse",
      value: lead.event_interest || null,
      icon: Target,
    },
    {
      label: "Agendamento",
      value: lead.store_visit_datetime
        ? formatDateFull(lead.store_visit_datetime)
        : null,
      icon: CalendarDays,
    },
    {
      label: "Consulta ativa",
      value: lead.active_appointment
        ? `${formatDateShort(lead.active_appointment.scheduled_at)} · ${lead.active_appointment.status}`
        : null,
      icon: UserCheck,
    },
    {
      label: "Fonte",
      value: lead.source ? (SOURCE_LABELS[lead.source] ?? lead.source) : null,
      icon: ChevronRight,
    },
    {
      label: "Confirmação",
      value:
        CONFIRMATION_LABELS[lead.confirmation_status] ??
        lead.confirmation_status,
      icon: Check,
    },
    { label: "Vendedor", value: vendorName || null, icon: UserIcon },
    { label: "Entrada", value: formatDateShort(lead.created_at), icon: Clock },
    { label: "Nome", value: lead.first_name || null, icon: UserIcon },
    { label: "Sobrenome", value: lead.last_name || null, icon: UserIcon },
    { label: "Placa do veículo", value: lead.vehicle_plate || null, icon: Car },
    { label: "Acompanhantes", value: lead.companions || null, icon: Users },
    { label: "Descrição", value: lead.description || null, icon: FileText },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-[3px]"
      style={{ backgroundColor: "rgba(0,0,0,0.45)" }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={clsx(
          "flex h-[88vh] w-full max-w-6xl flex-col overflow-hidden rounded-[28px] shadow-[0_32px_80px_rgba(0,0,0,0.28)]",
          dark ? "bg-[#0f0f0f]" : "bg-white",
        )}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* ── Header ── */}
        <div
          className={clsx(
            "flex shrink-0 items-start justify-between gap-4 px-6 py-5",
            dark ? "border-b border-[#1f1f1f]" : "border-b border-zinc-100",
          )}
        >
          <div className="min-w-0 flex-1">
            <p
              className={clsx(
                "text-[11px] font-semibold uppercase tracking-[0.18em]",
                dark ? "text-zinc-500" : "text-zinc-400",
              )}
            >
              Lead
            </p>
            <h2
              className={clsx(
                "mt-1 truncate text-2xl font-black tracking-tight",
                dark ? "text-zinc-50" : "text-zinc-950",
              )}
            >
              {lead.name}
            </h2>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <SourceBadge source={lead.source} />
              <StageBadge stage={lead.crm_stage} />
              {lead.tags.slice(0, 3).map((tag) => (
                <span
                  key={tag}
                  className={clsx(
                    "flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold",
                    dark
                      ? "bg-[#1c1c1c] text-zinc-300"
                      : "bg-zinc-100 text-zinc-600",
                  )}
                >
                  <Tag size={9} />
                  {tag}
                </span>
              ))}
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {editing ? (
              <>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void handleSave()}
                  className="inline-flex items-center gap-1.5 rounded-full bg-[#FF0636] px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#d90530] disabled:opacity-60"
                >
                  <Check size={13} />
                  {saving ? "Salvando…" : "Salvar"}
                </button>
                <button
                  type="button"
                  onClick={() => setEditing(false)}
                  className={clsx(
                    "rounded-full px-4 py-2 text-xs font-semibold transition-colors",
                    dark
                      ? "bg-[#1a1a1a] text-zinc-300 hover:bg-[#252525]"
                      : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200",
                  )}
                >
                  Cancelar
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setEditing(true)}
                className={clsx(
                  "inline-flex items-center gap-1.5 rounded-full border px-4 py-2 text-xs font-semibold transition-colors",
                  dark
                    ? "border-zinc-700 bg-[#111] text-zinc-200 hover:bg-[#1a1a1a]"
                    : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50",
                )}
              >
                Editar
              </button>
            )}
            <button
              type="button"
              onClick={() => onOpenChat(lead)}
              className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-emerald-600"
            >
              <MessageCircle size={14} />
              Chat
            </button>
            <button
              type="button"
              onClick={onClose}
              className={clsx(
                "inline-flex h-9 w-9 items-center justify-center rounded-full transition-colors",
                dark
                  ? "text-zinc-400 hover:bg-white/10"
                  : "text-zinc-500 hover:bg-zinc-100",
              )}
              aria-label="Fechar"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* ── Pipeline progress bar ── */}
        <div
          className={clsx(
            "shrink-0 px-6 py-4",
            dark
              ? "border-b border-[#1f1f1f] bg-[#080808]"
              : "border-b border-zinc-100 bg-zinc-50/60",
          )}
        >
          <div className="flex items-center overflow-x-auto pb-1">
            {progressStages.map((stage, idx) => {
              const isPast = idx < currentStageIndex;
              const isCurrent = idx === currentStageIndex;
              const isFirst = idx === 0;
              return (
                <div key={stage.id} className="flex shrink-0 items-center">
                  {!isFirst && (
                    <div
                      className={clsx(
                        "h-[2px] w-6 shrink-0 rounded-full transition-colors",
                        isPast || isCurrent
                          ? "bg-emerald-500"
                          : dark
                            ? "bg-[#232323]"
                            : "bg-zinc-200",
                      )}
                    />
                  )}
                  <button
                    type="button"
                    onClick={() => void handleStageClick(stage.id)}
                    disabled={isCurrent || movingStageId !== null}
                    title={
                      isCurrent
                        ? `Etapa atual: ${stage.label}`
                        : `Mover para ${stage.label}`
                    }
                    aria-label={
                      isCurrent
                        ? `Etapa atual: ${stage.label}`
                        : `Mover lead para ${stage.label}`
                    }
                    className={clsx(
                      "flex shrink-0 flex-col items-center gap-1.5 rounded-xl px-1.5 py-1 transition-colors",
                      isCurrent
                        ? "cursor-default"
                        : movingStageId
                          ? "cursor-wait opacity-60"
                          : clsx(
                              "cursor-pointer",
                              dark ? "hover:bg-white/5" : "hover:bg-zinc-100",
                            ),
                    )}
                  >
                    <div
                      className={clsx(
                        "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 transition-all",
                        isCurrent
                          ? "border-[#FF0636] bg-[#FF0636] text-white ring-4 ring-[#FF0636]/15"
                          : isPast
                            ? "border-emerald-500 bg-emerald-500 text-white"
                            : dark
                              ? "border-[#2a2a2a] bg-transparent"
                              : "border-zinc-300 bg-white",
                        movingStageId === stage.id &&
                          "animate-pulse border-[#FF0636]",
                      )}
                    >
                      {isPast && <Check size={12} strokeWidth={3} />}
                      {isCurrent && (
                        <span className="h-1.5 w-1.5 rounded-full bg-white" />
                      )}
                    </div>
                    <span
                      className={clsx(
                        "max-w-[88px] text-center text-[10px] font-semibold leading-tight tracking-wide",
                        isCurrent
                          ? "text-[#FF0636]"
                          : isPast
                            ? dark
                              ? "text-zinc-300"
                              : "text-zinc-600"
                            : dark
                              ? "text-zinc-600"
                              : "text-zinc-400",
                      )}
                    >
                      {stage.label}
                    </span>
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Body (left + right) ── */}
        <div className="flex min-h-0 flex-1 overflow-hidden">
          {/* Left panel — dados do lead */}
          <aside
            className={clsx(
              "flex w-[340px] shrink-0 flex-col overflow-y-auto",
              dark
                ? "border-r border-[#1f1f1f] bg-[#080808]"
                : "border-r border-zinc-100 bg-zinc-50/40",
            )}
          >
            <div className="px-6 py-5">
              <p
                className={clsx(
                  "mb-4 text-[10px] font-semibold uppercase tracking-[0.18em]",
                  dark ? "text-zinc-500" : "text-zinc-400",
                )}
              >
                Informações
              </p>

              {editing ? (
                <div className="space-y-3">
                  {[
                    {
                      label: "Telefone",
                      value: editPhone,
                      onChange: setEditPhone,
                      type: "tel",
                    },
                    {
                      label: "E-mail",
                      value: editEmail,
                      onChange: setEditEmail,
                      type: "email",
                    },
                    {
                      label: "Data de nascimento",
                      value: editBirthDate,
                      onChange: setEditBirthDate,
                      type: "date",
                    },
                  ].map(({ label, value, onChange, type }) => (
                    <div key={label}>
                      <p
                        className={clsx(
                          "mb-1 text-[10px] font-medium",
                          dark ? "text-zinc-500" : "text-zinc-400",
                        )}
                      >
                        {label}
                      </p>
                      <input
                        type={type}
                        value={value}
                        onChange={(e) => onChange(e.target.value)}
                        className={clsx(
                          "w-full rounded-xl border px-3 py-2 text-[13px] outline-none transition-colors focus:border-[#FF0636]",
                          dark
                            ? "border-zinc-700 bg-[#111] text-zinc-100"
                            : "border-zinc-200 bg-white text-zinc-900",
                        )}
                      />
                    </div>
                  ))}
                  <div>
                    <p
                      className={clsx(
                        "mb-1 text-[10px] font-medium",
                        dark ? "text-zinc-500" : "text-zinc-400",
                      )}
                    >
                      Agendamento
                    </p>
                    <input
                      type="datetime-local"
                      value={editVisitDate}
                      onChange={(e) => setEditVisitDate(e.target.value)}
                      className={clsx(
                        "w-full rounded-xl border px-3 py-2 text-[13px] outline-none transition-colors focus:border-[#FF0636]",
                        dark
                          ? "border-zinc-700 bg-[#111] text-zinc-100"
                          : "border-zinc-200 bg-white text-zinc-900",
                      )}
                    />
                  </div>
                  <div>
                    <p
                      className={clsx(
                        "mb-1 text-[10px] font-medium",
                        dark ? "text-zinc-500" : "text-zinc-400",
                      )}
                    >
                      Vendedor
                    </p>
                    <select
                      value={editVendorId}
                      onChange={(e) => setEditVendorId(e.target.value)}
                      className={clsx(
                        "w-full rounded-xl border px-3 py-2 text-[13px] outline-none transition-colors focus:border-[#FF0636]",
                        dark
                          ? "border-zinc-700 bg-[#111] text-zinc-100"
                          : "border-zinc-200 bg-white text-zinc-900",
                      )}
                    >
                      <option value="">Sem vendedor</option>
                      {vendors.map(([id, name]) => (
                        <option key={id} value={id}>
                          {name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <p
                      className={clsx(
                        "mb-1 text-[10px] font-medium",
                        dark ? "text-zinc-500" : "text-zinc-400",
                      )}
                    >
                      Observações
                    </p>
                    <textarea
                      value={editNotes}
                      onChange={(e) => setEditNotes(e.target.value)}
                      rows={2}
                      className={clsx(
                        "w-full resize-none rounded-xl border px-3 py-2 text-[13px] outline-none transition-colors focus:border-[#FF0636]",
                        dark
                          ? "border-zinc-700 bg-[#111] text-zinc-100"
                          : "border-zinc-200 bg-white text-zinc-900",
                      )}
                    />
                  </div>
                  <div>
                    <p
                      className={clsx(
                        "mb-1 text-[10px] font-medium",
                        dark ? "text-zinc-500" : "text-zinc-400",
                      )}
                    >
                      Nome
                    </p>
                    <input
                      type="text"
                      value={editFirstName}
                      onChange={(e) => setEditFirstName(e.target.value)}
                      className={clsx(
                        "w-full rounded-xl border px-3 py-2 text-[13px] outline-none transition-colors focus:border-[#FF0636]",
                        dark
                          ? "border-zinc-700 bg-[#111] text-zinc-100"
                          : "border-zinc-200 bg-white text-zinc-900",
                      )}
                    />
                  </div>
                  <div>
                    <p
                      className={clsx(
                        "mb-1 text-[10px] font-medium",
                        dark ? "text-zinc-500" : "text-zinc-400",
                      )}
                    >
                      Sobrenome
                    </p>
                    <input
                      type="text"
                      value={editLastName}
                      onChange={(e) => setEditLastName(e.target.value)}
                      className={clsx(
                        "w-full rounded-xl border px-3 py-2 text-[13px] outline-none transition-colors focus:border-[#FF0636]",
                        dark
                          ? "border-zinc-700 bg-[#111] text-zinc-100"
                          : "border-zinc-200 bg-white text-zinc-900",
                      )}
                    />
                  </div>
                  <div>
                    <p
                      className={clsx(
                        "mb-1 text-[10px] font-medium",
                        dark ? "text-zinc-500" : "text-zinc-400",
                      )}
                    >
                      Placa do veículo
                    </p>
                    <input
                      type="text"
                      value={editVehiclePlate}
                      onChange={(e) => setEditVehiclePlate(e.target.value)}
                      className={clsx(
                        "w-full rounded-xl border px-3 py-2 text-[13px] outline-none transition-colors focus:border-[#FF0636]",
                        dark
                          ? "border-zinc-700 bg-[#111] text-zinc-100"
                          : "border-zinc-200 bg-white text-zinc-900",
                      )}
                    />
                  </div>
                  <div>
                    <p
                      className={clsx(
                        "mb-1 text-[10px] font-medium",
                        dark ? "text-zinc-500" : "text-zinc-400",
                      )}
                    >
                      Acompanhantes
                    </p>
                    <input
                      type="text"
                      value={editCompanions}
                      onChange={(e) => setEditCompanions(e.target.value)}
                      className={clsx(
                        "w-full rounded-xl border px-3 py-2 text-[13px] outline-none transition-colors focus:border-[#FF0636]",
                        dark
                          ? "border-zinc-700 bg-[#111] text-zinc-100"
                          : "border-zinc-200 bg-white text-zinc-900",
                      )}
                    />
                  </div>
                  <div>
                    <p
                      className={clsx(
                        "mb-1 text-[10px] font-medium",
                        dark ? "text-zinc-500" : "text-zinc-400",
                      )}
                    >
                      Descrição
                    </p>
                    <textarea
                      value={editDescription}
                      onChange={(e) => setEditDescription(e.target.value)}
                      rows={2}
                      className={clsx(
                        "w-full resize-none rounded-xl border px-3 py-2 text-[13px] outline-none transition-colors focus:border-[#FF0636]",
                        dark
                          ? "border-zinc-700 bg-[#111] text-zinc-100"
                          : "border-zinc-200 bg-white text-zinc-900",
                      )}
                    />
                  </div>
                </div>
              ) : (
                <>
                  <div className="space-y-4">
                    {infoRows.map(({ label, value, icon: Icon }) => (
                      <div key={label} className="flex items-start gap-3">
                        <Icon
                          size={14}
                          className={clsx(
                            "mt-0.5 shrink-0",
                            dark ? "text-zinc-500" : "text-zinc-400",
                          )}
                        />
                        <div className="min-w-0">
                          <p
                            className={clsx(
                              "text-[10px] font-medium",
                              dark ? "text-zinc-600" : "text-zinc-400",
                            )}
                          >
                            {label}
                          </p>
                          <p
                            className={clsx(
                              "mt-1 break-words text-[13px] font-medium",
                              value
                                ? dark
                                  ? "text-zinc-200"
                                  : "text-zinc-800"
                                : dark
                                  ? "text-zinc-600"
                                  : "text-zinc-400",
                            )}
                          >
                            {value ?? "—"}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                  {lead.notes && (
                    <div className="mt-5">
                      <p
                        className={clsx(
                          "mb-2 text-[10px] font-semibold uppercase tracking-[0.18em]",
                          dark ? "text-zinc-500" : "text-zinc-400",
                        )}
                      >
                        Observações
                      </p>
                      <p
                        className={clsx(
                          "text-[13px] leading-relaxed",
                          dark ? "text-zinc-300" : "text-zinc-700",
                        )}
                      >
                        {lead.notes}
                      </p>
                    </div>
                  )}
                </>
              )}
            </div>
          </aside>

          {/* Right panel — histórico / abas */}
          <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
            {/* Tabs */}
            <div
              className={clsx(
                "flex shrink-0 gap-1 border-b px-5 pt-3",
                dark ? "border-[#1f1f1f]" : "border-zinc-100",
              )}
            >
              {(
                [
                  { id: "historico", label: "Histórico" },
                  { id: "dados", label: "Consulta" },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={clsx(
                    "rounded-t-lg px-4 py-2.5 text-xs font-semibold transition-colors",
                    activeTab === tab.id
                      ? "border-b-2 border-[#FF0636] text-[#FF0636]"
                      : dark
                        ? "text-zinc-400 hover:text-zinc-200"
                        : "text-zinc-500 hover:text-zinc-900",
                  )}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
              {activeTab === "historico" && (
                <div className="space-y-1">
                  {/* Criação do lead */}
                  <div className="flex gap-3 pb-3">
                    <div
                      className={clsx(
                        "flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
                        dark ? "bg-emerald-500/10" : "bg-emerald-50",
                      )}
                    >
                      <TrendingUp size={14} className="text-emerald-500" />
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
                        Entrada via {SOURCE_LABELS[lead.source] ?? lead.source}
                      </p>
                      <p
                        className={clsx(
                          "mt-0.5 text-[11px]",
                          dark ? "text-zinc-600" : "text-zinc-400",
                        )}
                      >
                        {formatDateFull(lead.created_at)}
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
                    history.map((item) => {
                      const dotColor = timelineDotColor(item);
                      return (
                        <div
                          key={item.id}
                          className="flex gap-3 border-t py-3"
                          style={{ borderColor: dark ? "#1f1f1f" : "#f4f4f5" }}
                        >
                          <div
                            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
                            style={{ backgroundColor: `${dotColor}22` }}
                          >
                            <ChevronRight
                              size={14}
                              style={{ color: dotColor }}
                            />
                          </div>
                          <div className="min-w-0 flex-1 pt-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <p
                                className={clsx(
                                  "text-[13px] font-semibold",
                                  dark ? "text-zinc-100" : "text-zinc-900",
                                )}
                              >
                                {timelineTitle(item)}
                              </p>
                              <span
                                className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide"
                                style={{
                                  backgroundColor: `${TIMELINE_ORIGIN_COLOR[item.origin]}1f`,
                                  color: TIMELINE_ORIGIN_COLOR[item.origin],
                                }}
                              >
                                {TIMELINE_ORIGIN_LABEL[item.origin]}
                              </span>
                            </div>
                            <p
                              className={clsx(
                                "text-[12px]",
                                dark ? "text-zinc-400" : "text-zinc-500",
                              )}
                            >
                              {item.actor.name
                                ? `por ${item.actor.name}`
                                : "automático"}
                              {item.notes ? ` · ${item.notes}` : ""}
                            </p>
                            <p
                              className={clsx(
                                "mt-0.5 text-[11px]",
                                dark ? "text-zinc-600" : "text-zinc-400",
                              )}
                            >
                              {formatDateFull(item.occurred_at)}
                            </p>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              )}

              {activeTab === "dados" && (
                <div className="space-y-3">
                  {lead.active_appointment ? (
                    <div
                      className={clsx(
                        "rounded-2xl border p-4",
                        dark
                          ? "border-[#1f1f1f] bg-[#111]"
                          : "border-zinc-100 bg-zinc-50",
                      )}
                    >
                      <p
                        className={clsx(
                          "mb-3 text-[10px] font-semibold uppercase tracking-[0.18em]",
                          dark ? "text-zinc-500" : "text-zinc-400",
                        )}
                      >
                        Consulta ativa
                      </p>
                      <div className="space-y-2">
                        {[
                          {
                            label: "Data",
                            value: formatDateFull(
                              lead.active_appointment.scheduled_at,
                            ),
                          },
                          {
                            label: "Status",
                            value: lead.active_appointment.status,
                          },
                          {
                            label: "ID",
                            value: lead.active_appointment.id.slice(0, 8) + "…",
                          },
                        ].map(({ label, value }) => (
                          <div
                            key={label}
                            className="flex items-center justify-between gap-4"
                          >
                            <span
                              className={clsx(
                                "text-[12px]",
                                dark ? "text-zinc-500" : "text-zinc-500",
                              )}
                            >
                              {label}
                            </span>
                            <span
                              className={clsx(
                                "text-[13px] font-medium",
                                dark ? "text-zinc-200" : "text-zinc-800",
                              )}
                            >
                              {value}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div
                      className={clsx(
                        "flex flex-col items-center justify-center gap-2 rounded-2xl border py-10 text-center",
                        dark
                          ? "border-[#1f1f1f] bg-[#111]"
                          : "border-zinc-100 bg-zinc-50",
                      )}
                    >
                      <CalendarDays
                        size={28}
                        className={dark ? "text-zinc-600" : "text-zinc-300"}
                      />
                      <p
                        className={clsx(
                          "text-[13px]",
                          dark ? "text-zinc-500" : "text-zinc-400",
                        )}
                      >
                        Nenhuma consulta agendada
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}

const LeadCard = memo(function LeadCard({
  lead,
  dense,
  vendorsById,
  dark,
  liveKind,
  selectionMode,
  selected,
  onToggleSelect,
  onOpen,
  onKeyboardMove,
  enterIndex,
}: {
  lead: Lead;
  dense?: boolean;
  vendorsById: Record<string, string>;
  dark?: boolean;
  liveKind?: LeadMotionKind;
  selectionMode?: boolean;
  selected?: boolean;
  onToggleSelect?: (id: string) => void;
  onOpen: (lead: Lead) => void;
  /** Alt + seta move o card para a etapa vizinha (alternativa ao arraste). */
  onKeyboardMove?: (lead: Lead, direction: -1 | 1) => void;
  enterIndex?: number;
}) {
  const vendorName = lead.assigned_vendor_id
    ? vendorsById[lead.assigned_vendor_id]
    : undefined;
  const navigate = useNavigate();
  const wasDraggingRef = useRef(false);
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({
      id: lead.id,
      // Em modo selecao, so cards selecionados arrastam (movem a selecao inteira).
      // Os nao-selecionados continuam apenas clicaveis para entrar na selecao.
      disabled: selectionMode && !selected,
    });

  const openChat = (event: MouseEvent) => {
    event.stopPropagation();
    event.preventDefault();
    const params = new URLSearchParams();
    if (lead.client_id) params.set("client_id", lead.client_id);
    params.set("lead_id", lead.id);
    navigate(`/gestor/chat?${params.toString()}`);
  };

  // Entrada escalonada (sensação de cards sendo "colocados" no board). Usa a
  // propriedade CSS `translate`, independente do `transform` usado pelo dnd-kit.
  const enterDelayMs = Math.min(enterIndex ?? 0, 10) * 35;
  const style = {
    ...(transform
      ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
      : {}),
    animationDelay: `${enterDelayMs}ms`,
  };

  // Track if the pointer actually moved (drag) so onClick doesn't open modal after drag
  const handlePointerDown = () => {
    wasDraggingRef.current = false;
  };
  const handlePointerMove = () => {
    if (isDragging) wasDraggingRef.current = true;
  };
  const handleClick = () => {
    // Ignora o clique disparado ao final de um arraste (vale tambem em modo selecao).
    if (wasDraggingRef.current) return;
    if (selectionMode) {
      onToggleSelect?.(lead.id);
      return;
    }
    onOpen(lead);
  };

  // Teclado: Enter/Espaco abre o lead e Alt + seta troca de etapa. E a unica
  // via de movimentacao para quem nao usa mouse — o dnd-kit so tem sensores de
  // mouse e toque (o KeyboardSensor moveria o card de 25px por tecla, inutil
  // para alcancar a coluna vizinha).
  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    // So responde com o foco no proprio card: senao o Enter no botao interno
    // de abrir o chat tambem abriria o modal do lead.
    if (event.target !== event.currentTarget) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      handleClick();
      return;
    }
    if (!onKeyboardMove) return;
    if (!event.altKey && !event.metaKey && !event.ctrlKey) return;
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      onKeyboardMove(lead, -1);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      onKeyboardMove(lead, 1);
    }
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      role="group"
      tabIndex={0}
      aria-roledescription="Lead arrastável"
      aria-label={clsx(
        `Lead ${lead.name}, etapa ${lead.crm_stage}, fonte ${lead.source}`,
        onKeyboardMove && "— Alt e seta esquerda ou direita move de etapa",
      )}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      className={clsx(
        // `shrink-0`: a lista de cards e flex-col; sem isso os cards
        // comprimiriam quando a coluna nao coubesse na altura.
        "group shrink-0 cursor-pointer rounded-[18px] border p-3.5 transition-all duration-150",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF0636]/70",
        dark
          ? "border-[#222] bg-[#111] hover:border-[#333] hover:shadow-[0_4px_16px_rgba(0,0,0,0.3)]"
          : "border-zinc-100/80 bg-white hover:border-zinc-200 hover:shadow-[0_4px_16px_rgba(15,23,42,0.08)]",
        dense ? "space-y-2" : "space-y-2.5",
        !isDragging && !liveKind && "crm-card-enter",
        // Virtualizacao leve: cards fora da viewport pulam layout/paint mas seguem
        // no DOM (o @dnd-kit consegue medir). Desligado durante o drag por seguranca.
        !isDragging &&
          (dense
            ? "[content-visibility:auto] [contain-intrinsic-size:auto_92px]"
            : "[content-visibility:auto] [contain-intrinsic-size:auto_120px]"),
        liveKind === "new" && "lead-row-live-new",
        liveKind === "stage-change" && "lead-row-live-stage",
        liveKind === "update" && "lead-row-live-update",
        isDragging &&
          "cursor-grabbing scale-[0.98] opacity-60 shadow-[0_20px_48px_rgba(0,0,0,0.2)]",
        selected &&
          (dark
            ? "border-[#FF0636]/50 ring-1 ring-[#FF0636]/30"
            : "border-[#FF0636]/40 ring-1 ring-[#FF0636]/20"),
      )}
    >
      {/* Name row */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            {selectionMode && (
              <span className="shrink-0 text-[#FF0636]">
                {selected ? (
                  <CheckSquare size={15} />
                ) : (
                  <Square
                    size={15}
                    className={dark ? "text-zinc-600" : "text-zinc-300"}
                  />
                )}
              </span>
            )}
            <p
              className={clsx(
                "truncate text-[13px] font-bold leading-snug",
                dark ? "text-zinc-100" : "text-zinc-900",
              )}
            >
              {lead.name}
            </p>
          </div>
          {lead.phone && (
            <div
              className={clsx(
                "mt-1 flex items-center gap-1.5 text-[11px]",
                dark ? "text-zinc-500" : "text-zinc-400",
              )}
            >
              <Phone size={10} />
              <span>{lead.phone}</span>
            </div>
          )}
        </div>
        {!selectionMode && (
          <GripVertical
            size={13}
            className={clsx(
              "mt-0.5 shrink-0 transition-opacity",
              dark
                ? "text-zinc-700 opacity-0 group-hover:opacity-100"
                : "text-zinc-300 opacity-0 group-hover:opacity-100",
            )}
          />
        )}
      </div>

      {/* Badges */}
      <div className="flex flex-wrap gap-1.5">
        <SourceBadge source={lead.source} />
        <ConfirmationBadge status={lead.confirmation_status} />
      </div>

      {/* Visit date + event */}
      <div
        className={clsx(
          "flex flex-col gap-1 text-[11px]",
          dark ? "text-zinc-500" : "text-zinc-400",
        )}
      >
        {lead.store_visit_datetime && (
          <div className="flex items-center gap-1.5">
            <CalendarDays
              size={10}
              className={dark ? "text-zinc-600" : "text-zinc-300"}
            />
            <span>{formatDate(lead.store_visit_datetime)}</span>
          </div>
        )}
        {lead.event_interest && (
          <div className="flex items-center gap-1.5">
            <Target
              size={10}
              className={dark ? "text-zinc-600" : "text-zinc-300"}
            />
            <span className="truncate">{lead.event_interest}</span>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between gap-2 pt-0.5">
        <div className="flex min-w-0 flex-wrap gap-1">
          {lead.tags.slice(0, 2).map((tag) => (
            <span
              key={tag}
              className={clsx(
                "rounded-full px-2 py-0.5 text-[10px] font-semibold",
                dark
                  ? "bg-[#1c1c1c] text-zinc-400"
                  : "bg-zinc-100 text-zinc-500",
              )}
            >
              {tag}
            </span>
          ))}
          {vendorName && (
            <span className="rounded-full bg-[#FF0636]/8 px-2 py-0.5 text-[10px] font-semibold text-[#FF0636]">
              {vendorName.split(" ")[0]}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={openChat}
          onPointerDown={(event) => event.stopPropagation()}
          onMouseDown={(event) => event.stopPropagation()}
          aria-label={`Abrir chat com ${lead.name}`}
          title="Abrir chat"
          className={clsx(
            "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition-colors",
            dark
              ? "bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20"
              : "bg-emerald-50 text-emerald-600 hover:bg-emerald-100",
          )}
        >
          <MessageCircle size={13} />
        </button>
      </div>

      {!dense && lead.notes && (
        <p
          className={clsx(
            "line-clamp-2 border-t pt-2 text-[11px] leading-relaxed",
            dark
              ? "border-[#1a1a1a] text-zinc-500"
              : "border-zinc-50 text-zinc-400",
          )}
        >
          {lead.notes}
        </p>
      )}
    </div>
  );
});

function StageColumn({
  stage,
  leads,
  dense,
  vendorsById,
  dark,
  liveKind,
  liveLeadKinds,
  selectionMode,
  selectedLeadIds,
  onToggleSelect,
  onLeadOpen,
  onLeadKeyboardMove,
  totalCount,
  fillHeight,
}: {
  stage: KanbanColumn;
  leads: Lead[];
  dense?: boolean;
  vendorsById: Record<string, string>;
  dark?: boolean;
  liveKind?: StageMotionKind;
  liveLeadKinds?: Record<string, LeadMotionKind>;
  selectionMode?: boolean;
  selectedLeadIds?: Set<string>;
  onToggleSelect?: (id: string) => void;
  onLeadOpen: (lead: Lead) => void;
  onLeadKeyboardMove?: (lead: Lead, direction: -1 | 1) => void;
  totalCount?: number;
  /** Kanban: preenche a altura do board (o pai controla). Compact: altura fixa. */
  fillHeight?: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id });
  const cardListRef = useRef<HTMLDivElement>(null);

  const handleColumnWheel = (event: ReactWheelEvent<HTMLDivElement>) => {
    const cardList = cardListRef.current;
    if (!cardList || event.deltaY === 0) return;
    if (event.target instanceof Node && cardList.contains(event.target)) {
      return;
    }

    const maxScrollTop = cardList.scrollHeight - cardList.clientHeight;
    if (maxScrollTop <= 0) return;

    const deltaY =
      event.deltaMode === 1
        ? event.deltaY * 16
        : event.deltaMode === 2
          ? event.deltaY * cardList.clientHeight
          : event.deltaY;
    const nextScrollTop = Math.min(
      maxScrollTop,
      Math.max(0, cardList.scrollTop + deltaY),
    );

    if (nextScrollTop === cardList.scrollTop) return;

    cardList.scrollTop = nextScrollTop;
  };

  return (
    <div
      onWheel={handleColumnWheel}
      className={clsx(
        "flex flex-col gap-2",
        // No modo compacto a coluna conserva a altura propria. No Kanban, ela
        // ocupa exatamente a altura do quadro para que apenas os cards rolem.
        "h-[calc(100vh-11.5rem)] min-h-[36rem]",
        fillHeight
          ? "w-[272px] shrink-0 md:h-full md:max-h-full md:min-h-0"
          : "w-full",
      )}
    >
      {/* ── Column header ── */}
      <div
        className={clsx(
          "overflow-hidden rounded-[20px]",
          dark ? "bg-[#0f0f0f]" : "bg-white",
          "shadow-[0_4px_16px_rgba(15,23,42,0.06)]",
          liveKind === "new" && "lead-row-live-new",
          liveKind === "stage-change" && "lead-row-live-stage",
          liveKind === "update" && "lead-row-live-update",
        )}
      >
        {/* Colored top strip */}
        <div className="h-1 w-full" style={{ backgroundColor: stage.color }} />
        <div className="flex items-center gap-3 px-4 py-3">
          <div className="flex-1 min-w-0">
            <p
              className={clsx(
                "text-[13px] font-black tracking-tight",
                dark ? "text-zinc-100" : "text-zinc-900",
              )}
            >
              {stage.label}
            </p>
          </div>
          <span
            className="inline-flex h-6 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full px-2 text-[11px] font-black tabular-nums"
            style={{ backgroundColor: `${stage.color}18`, color: stage.color }}
            title={`${totalCount ?? leads.length} leads`}
          >
            {formatStageLeadCount(totalCount ?? leads.length)}
          </span>
        </div>
      </div>

      {/* ── Drop zone ── */}
      <div
        ref={setNodeRef}
        className={clsx(
          "flex min-h-0 flex-1 flex-col overflow-hidden rounded-[20px] p-2.5 transition-all duration-150",
          isOver
            ? dark
              ? "bg-[#FF0636]/8 ring-2 ring-[#FF0636]/30"
              : "bg-[#FF0636]/4 ring-2 ring-[#FF0636]/25"
            : dark
              ? "bg-[#080808]"
              : "bg-zinc-50/70",
        )}
      >
        <div
          ref={cardListRef}
          className="flex min-h-0 flex-1 touch-pan-y flex-col gap-2.5 overflow-y-auto overscroll-contain pr-1 [scrollbar-gutter:stable] [-ms-overflow-style:none] [scrollbar-width:thin]"
        >
          {leads.map((lead, index) => (
            <LeadCard
              key={lead.id}
              lead={lead}
              dense={dense}
              vendorsById={vendorsById}
              dark={dark}
              liveKind={liveLeadKinds?.[lead.id]}
              selectionMode={selectionMode}
              selected={selectedLeadIds?.has(lead.id)}
              onToggleSelect={onToggleSelect}
              onOpen={onLeadOpen}
              onKeyboardMove={onLeadKeyboardMove}
              enterIndex={index}
            />
          ))}
          {leads.length === 0 && (
            <div
              className={clsx(
                "flex min-h-[200px] flex-1 flex-col items-center justify-center gap-2 rounded-[16px] border border-dashed",
                dark
                  ? "border-[#2a2a2a] text-zinc-700"
                  : "border-zinc-200 text-zinc-300",
              )}
            >
              <span
                className="text-2xl leading-none"
                style={{ color: `${stage.color}40` }}
              >
                {stage.emptyIcon}
              </span>
              <p
                className={clsx(
                  "text-[11px] font-medium",
                  dark ? "text-zinc-600" : "text-zinc-400",
                )}
              >
                Nenhum lead
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
export function CRMPage() {
  const { user, setGestorClientId } = useGestorClient();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [isDarkMode, setIsDarkMode] = useState(() =>
    readDashboardDarkEnabled(user.id),
  );
  const [crmClients, setCrmClients] = useState<Client[]>([]);
  const [selectedClient, setSelectedClient] = useState(() => {
    if (typeof window === "undefined") return "";
    return window.localStorage.getItem("crm:selected-client-id") || "";
  });
  const requestedClientId = searchParams.get("client_id") ?? "";
  const requestedLeadId = searchParams.get("lead_id") ?? "";
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    const stored = localStorage.getItem("crm_view_mode");
    return (stored as ViewMode) || "kanban";
  });
  const isMobileViewport = useIsMobileViewport();
  const [mobileStageId, setMobileStageId] = useState<string | null>(null);
  const [cardSort, setCardSort] = useState<CardSort>(() => {
    const stored = localStorage.getItem(CARD_SORT_STORAGE_KEY);
    return CARD_SORT_OPTIONS.some(([value]) => value === stored)
      ? (stored as CardSort)
      : "recent";
  });
  const [search, setSearch] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [hideMenuOpen, setHideMenuOpen] = useState(false);
  const [hiddenStageIds, setHiddenStageIds] = useState<Set<string>>(() => {
    try {
      const stored = localStorage.getItem("crm_hidden_stages");
      const parsed = stored ? (JSON.parse(stored) as unknown) : [];
      return new Set(Array.isArray(parsed) ? parsed.map(String) : []);
    } catch {
      return new Set();
    }
  });
  const toggleHiddenStage = useCallback((stageId: string) => {
    setHiddenStageIds((current) => {
      const next = new Set(current);
      if (next.has(stageId)) next.delete(stageId);
      else next.add(stageId);
      localStorage.setItem(
        "crm_hidden_stages",
        JSON.stringify(Array.from(next)),
      );
      return next;
    });
  }, []);
  const [sourceFilter, setSourceFilter] = useState("all");
  const [vendorFilter, setVendorFilter] = useState("all");
  const [tagFilter, setTagFilter] = useState("all");
  const [stageFilter, setStageFilter] = useState<StageFilter>("all");
  const [confirmationFilter, setConfirmationFilter] =
    useState<ConfirmationFilter>("all");
  const [boardState, setBoardState] = useState<Record<string, Lead[]>>({});
  const [stageCounts, setStageCounts] = useState<Record<string, number>>({});
  // Filtros que reduzem cards DENTRO da coluna (stageFilter só oculta colunas).
  // Quando ativos, o badge usa a contagem visível; senão, a contagem real do servidor.
  const cardFiltersActive =
    search.trim() !== "" ||
    sourceFilter !== "all" ||
    vendorFilter !== "all" ||
    tagFilter !== "all" ||
    confirmationFilter !== "all";
  const [activeId, setActiveId] = useState<string | null>(null);
  const [openLead, setOpenLead] = useState<Lead | null>(null);
  const [openLeadHistoryVersion, setOpenLeadHistoryVersion] = useState(0);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastCounterRef = useRef(0);
  const requestedLeadHandledRef = useRef("");
  const [apiPipelineCode, setApiPipelineCode] = useState<string | null>(null);
  const [apiStages, setApiStages] = useState<ApiCrmStage[]>([]);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedLeadIds, setSelectedLeadIds] = useState<Set<string>>(
    new Set(),
  );
  const [bulkTargetStageId, setBulkTargetStageId] = useState("");
  const [bulkMoving, setBulkMoving] = useState(false);
  const [boardLoading, setBoardLoading] = useState(false);
  const [realtimeStatus, setRealtimeStatus] =
    useState<RealtimeStatus>("reconnecting");
  const [liveLeadKinds, setLiveLeadKinds] = useState<
    Record<string, LeadMotionKind>
  >({});
  const [liveStageKinds, setLiveStageKinds] = useState<
    Record<string, StageMotionKind>
  >({});
  const leadsAbortRef = useRef<AbortController | null>(null);
  const realtimeReconcileTimerRef = useRef<number | null>(null);
  // Busca aplicada no servidor (ref para nao recriar refreshBoard a cada tecla).
  const searchTermRef = useRef("");
  const searchDebounceMountRef = useRef(false);
  const previousBoardSnapshotRef = useRef<
    Map<string, { lead: Lead; stageId: string | null }>
  >(new Map());
  const liveBoardTimeoutRef = useRef<number | null>(null);
  const kanbanColumns = useMemo(
    () => apiStagesToColumns(apiStages),
    [apiStages],
  );

  const showToast = (
    message: string,
    type: Toast["type"] = "info",
    action?: Toast["action"],
  ) => {
    const id = ++toastCounterRef.current;
    setToasts((prev) => [...prev, { id, message, type, action }]);
    // Toast com acao fica mais tempo: e a janela para desfazer.
    setTimeout(
      () => setToasts((prev) => prev.filter((t) => t.id !== id)),
      action ? 8000 : 5000,
    );
  };

  const scheduleLiveBoardFxCleanup = useCallback(() => {
    if (liveBoardTimeoutRef.current != null) {
      window.clearTimeout(liveBoardTimeoutRef.current);
    }
    liveBoardTimeoutRef.current = window.setTimeout(() => {
      setLiveLeadKinds({});
      setLiveStageKinds({});
      liveBoardTimeoutRef.current = null;
    }, 2200);
  }, []);

  const triggerLiveBoardFx = useCallback(
    (
      leadId: string,
      kind: LeadMotionKind,
      stageIds: Array<string | null | undefined>,
    ) => {
      setLiveLeadKinds((current) => ({
        ...current,
        [leadId]: kind,
      }));
      setLiveStageKinds((current) => ({
        ...current,
        ...Object.fromEntries(
          stageIds
            .filter((stageId): stageId is string => Boolean(stageId))
            .map((stageId) => [stageId, kind]),
        ),
      }));
      scheduleLiveBoardFxCleanup();
    },
    [scheduleLiveBoardFxCleanup],
  );

  const dismissToast = (id: number) =>
    setToasts((prev) => prev.filter((t) => t.id !== id));
  const [staffUsers, setStaffUsers] = useState<User[]>([]);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    // Um gesto curto deve rolar a etapa. No toque, o drag so comeca apos
    // pressionar por alguns instantes sem ultrapassar a tolerancia de movimento.
    useSensor(TouchSensor, {
      activationConstraint: { delay: 250, tolerance: 8 },
    }),
  );

  const vendors = useMemo(
    () => staffUsers.filter((user) => user.role === "vendedor"),
    [staffUsers],
  );
  const vendorsById = useMemo(
    () => Object.fromEntries(staffUsers.map((u) => [u.id, u.name])),
    [staffUsers],
  );
  const clientLeads = useMemo(
    () => Object.values(boardState).flat(),
    [boardState],
  );
  const allTags = useMemo(
    () =>
      Array.from(new Set(clientLeads.flatMap((lead) => lead.tags))).filter(
        Boolean,
      ),
    [clientLeads],
  );
  const boardLeadCount = clientLeads.length;
  const confirmedCount = clientLeads.filter(
    (lead) =>
      lead.confirmation_status === "confirmed" ||
      lead.confirmation_status === "checked_in",
  ).length;
  const responseRate =
    boardLeadCount > 0
      ? Math.round((confirmedCount / boardLeadCount) * 100)
      : 0;

  const topTags = Object.entries(
    clientLeads.reduce<Record<string, number>>((acc, lead) => {
      lead.tags.forEach((tag) => {
        acc[tag] = (acc[tag] || 0) + 1;
      });
      return acc;
    }, {}),
  )
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  const visibleBoard = useMemo(() => {
    const columns = kanbanColumns.length > 0 ? kanbanColumns : [];
    return Object.fromEntries(
      columns.map((stage) => [
        stage.id,
        (boardState[stage.id] ?? [])
          .filter((lead) => {
            const query = search.trim().toLowerCase();
            if (query) {
              const haystack = [
                lead.name,
                lead.email,
                lead.phone,
                lead.event_interest || "",
                lead.notes || "",
                lead.tags.join(" "),
              ]
                .join(" ")
                .toLowerCase();
              if (!haystack.includes(query)) return false;
            }
            if (sourceFilter !== "all" && lead.source !== sourceFilter)
              return false;
            if (
              vendorFilter !== "all" &&
              lead.assigned_vendor_id !== vendorFilter
            )
              return false;
            if (tagFilter !== "all" && !lead.tags.includes(tagFilter))
              return false;
            if (stageFilter !== "all" && lead.crm_stage_id !== stageFilter)
              return false;
            if (
              confirmationFilter !== "all" &&
              lead.confirmation_status !== confirmationFilter
            )
              return false;
            return true;
          })
          .sort(compareLeads(cardSort)),
      ]),
    ) as Record<string, Lead[]>;
  }, [
    boardState,
    cardSort,
    kanbanColumns,
    search,
    sourceFilter,
    vendorFilter,
    tagFilter,
    stageFilter,
    confirmationFilter,
  ]);

  /** Etapas realmente renderizadas, na ordem do funil. Serve tanto para o
   *  render das colunas quanto para achar a etapa vizinha no atalho de teclado. */
  const visibleStages = useMemo(
    () =>
      kanbanColumns.filter(
        (stage) =>
          (stageFilter === "all" || stage.id === stageFilter) &&
          !hiddenStageIds.has(stage.id),
      ),
    [kanbanColumns, stageFilter, hiddenStageIds],
  );

  /** Etapa aberta no celular. Cai na primeira visivel quando a escolhida some
   *  (filtro de etapa, etapa ocultada, troca de cliente). */
  const activeMobileStage =
    visibleStages.find((stage) => stage.id === mobileStageId) ??
    visibleStages[0] ??
    null;

  const visibleLeads = Object.values(visibleBoard).flat();
  const activeLead = activeId
    ? (clientLeads.find((lead) => lead.id === activeId) ?? null)
    : null;

  const resetFilters = () => {
    setSearch("");
    setSourceFilter("all");
    setVendorFilter("all");
    setTagFilter("all");
    setStageFilter("all");
    setConfirmationFilter("all");
  };

  const toggleSelection = (leadId: string) => {
    setSelectedLeadIds((prev) => {
      const next = new Set(prev);
      if (next.has(leadId)) next.delete(leadId);
      else next.add(leadId);
      return next;
    });
  };

  const exitSelectionMode = () => {
    setSelectionMode(false);
    setSelectedLeadIds(new Set());
  };

  const handleBulkMove = async () => {
    if (selectedLeadIds.size === 0 || !apiPipelineCode) return;
    const session = readStoredSession();
    const accessToken = session?.accessToken;
    if (!accessToken) return;

    const stageCode = stageCodeById(apiStages, bulkTargetStageId);
    if (!stageCode) {
      showToast("Etapa de destino nao encontrada no pipeline.", "error");
      return;
    }

    setBulkMoving(true);
    try {
      const result = await bulkMoveCrmLeads(
        {
          lead_ids: Array.from(selectedLeadIds),
          pipeline_code: apiPipelineCode,
          stage_code: stageCode,
          source: "desktop_bulk",
        },
        accessToken,
      );
      showToast(
        `${result.moved} de ${result.total} leads movidos para ${kanbanColumns.find((stage) => stage.id === bulkTargetStageId)?.label ?? "etapa selecionada"}.`,
        result.moved > 0 ? "success" : "info",
      );
      exitSelectionMode();
      refreshBoard();
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : "Falha no bulk move.",
        "error",
      );
    } finally {
      setBulkMoving(false);
    }
  };

  const handleClientChange = (clientId: string) => {
    setSelectedClient(clientId);
    setGestorClientId(clientId);
  };

  useEffect(() => {
    if (user.role !== "gestor") return;
    if (requestedClientId && requestedClientId !== selectedClient) {
      setSelectedClient(requestedClientId);
      setGestorClientId(requestedClientId);
    }
  }, [requestedClientId, selectedClient, setGestorClientId, user.role]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("crm:selected-client-id", selectedClient);
  }, [selectedClient]);

  useEffect(() => {
    previousBoardSnapshotRef.current = new Map();
    setLiveLeadKinds({});
    setLiveStageKinds({});
    if (liveBoardTimeoutRef.current != null) {
      window.clearTimeout(liveBoardTimeoutRef.current);
      liveBoardTimeoutRef.current = null;
    }
  }, [selectedClient]);

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
    const session = readStoredSession();
    if (!session?.accessToken) return;

    listClients(session.accessToken)
      .then((rows) => {
        const mapped = rows.map(mapApiClientToClient);
        setCrmClients(mapped);
        setSelectedClient((current) => {
          if (current && mapped.some((client) => client.id === current)) {
            return current;
          }
          const nextClientId = mapped[0]?.id ?? "";
          if (nextClientId) {
            setGestorClientId(nextClientId);
          }
          return nextClientId;
        });
      })
      .catch(() => setCrmClients([]));
  }, [setGestorClientId]);

  useEffect(() => {
    if (crmClients.length === 0) return;
    if (crmClients.some((c) => c.id === selectedClient)) return;
    const nextClientId = crmClients[0]?.id ?? "";
    setSelectedClient(nextClientId);
    if (nextClientId) {
      setGestorClientId(nextClientId);
    }
  }, [crmClients, selectedClient, setGestorClientId]);

  useEffect(() => {
    const session = readStoredSession();
    const accessToken = session?.accessToken ?? "";
    if (!accessToken || !selectedClient || !isUuid(selectedClient)) {
      setStaffUsers([]);
      return;
    }
    void listClientStaff(selectedClient, accessToken)
      .then((rows) => setStaffUsers(rows.map(mapStaffToUser)))
      .catch(() => setStaffUsers([]));
  }, [selectedClient]);

  const refreshBoard = useCallback(() => {
    const session = readStoredSession();
    const accessToken = session?.accessToken ?? "";
    if (!accessToken || !selectedClient || !isUuid(selectedClient)) {
      setBoardState({});
      setBoardLoading(false);
      return;
    }

    if (apiStages.length === 0) {
      return;
    }

    leadsAbortRef.current?.abort();
    const abort = new AbortController();
    leadsAbortRef.current = abort;

    let active = true;
    setBoardLoading(true);

    // Contagem real por etapa (independente do carregamento progressivo dos cards).
    void getCrmStageCounts(selectedClient, accessToken)
      .then((result) => {
        if (active && !abort.signal.aborted)
          setStageCounts(result.counts ?? {});
      })
      .catch(() => {
        /* badge cai para a contagem local */
      });

    const applyLeads = (rows: ReturnType<typeof mapApiLeadToLead>[]) => {
      setBoardState(distributeLeadsByStageId(rows, apiStages));
    };

    void fetchAllLeads(
      { client_id: selectedClient, search: searchTermRef.current || undefined },
      accessToken,
      {
        signal: abort.signal,
        onPage: (_page, accumulated) => {
          if (!active || abort.signal.aborted) return;
          applyLeads(accumulated.map(mapApiLeadToLead));
        },
      },
    )
      .then((rows) => {
        if (!active || abort.signal.aborted) return;
        applyLeads(rows.map(mapApiLeadToLead));
      })
      .catch((error) => {
        if (!active || abort.signal.aborted) return;
        if (error instanceof DOMException && error.name === "AbortError")
          return;
        setBoardState(emptyBoardForStages(apiStages));
        showToast("Falha ao carregar leads.", "error");
      })
      .finally(() => {
        if (active && !abort.signal.aborted) {
          setBoardLoading(false);
        }
      });

    return () => {
      active = false;
      abort.abort();
    };
  }, [apiStages, selectedClient]);

  const refreshBoardRef = useRef(refreshBoard);
  useEffect(() => {
    refreshBoardRef.current = refreshBoard;
  }, [refreshBoard]);

  /** Ajusta os contadores por etapa junto com a movimentacao otimista, para o
   *  badge nao ficar velho sem precisar refazer o board inteiro. */
  const adjustStageCounts = useCallback(
    (moves: Array<{ from?: string | null; to: string }>) => {
      if (moves.length === 0) return;
      setStageCounts((prev) => {
        // Sem contagem do servidor ainda: o badge cai para o total local.
        if (Object.keys(prev).length === 0) return prev;
        const next = { ...prev };
        for (const move of moves) {
          if (move.from && next[move.from] != null) {
            next[move.from] = Math.max(0, next[move.from] - 1);
          }
          next[move.to] = (next[move.to] ?? 0) + 1;
        }
        return next;
      });
    },
    [],
  );

  /** Leads movidos por esta aba nos ultimos segundos. O evento de realtime
   *  volta para quem originou a mudanca; sem isso, cada arraste dispararia um
   *  refreshBoard completo (ate 10 requisicoes) logo apos o move. */
  const selfMovedLeadsRef = useRef<Map<string, number>>(new Map());
  const SELF_MOVE_ECHO_MS = 8_000;

  const markSelfMoved = useCallback((leadIds: string[]) => {
    const now = Date.now();
    for (const [leadId, at] of selfMovedLeadsRef.current) {
      if (now - at > SELF_MOVE_ECHO_MS)
        selfMovedLeadsRef.current.delete(leadId);
    }
    for (const leadId of leadIds) selfMovedLeadsRef.current.set(leadId, now);
  }, []);

  const consumeSelfMovedEcho = useCallback((leadId: string) => {
    const at = selfMovedLeadsRef.current.get(leadId);
    if (at == null) return false;
    selfMovedLeadsRef.current.delete(leadId);
    return Date.now() - at <= SELF_MOVE_ECHO_MS;
  }, []);

  // Busca server-side com debounce: encontra leads alem do teto carregado no board,
  // sem refazer o refreshBoard a cada tecla. O primeiro render é ignorado (o efeito
  // de montagem ja carrega o board).
  useEffect(() => {
    if (!searchDebounceMountRef.current) {
      searchDebounceMountRef.current = true;
      return;
    }
    const handle = window.setTimeout(() => {
      searchTermRef.current = search.trim();
      refreshBoardRef.current();
    }, 350);
    return () => window.clearTimeout(handle);
  }, [search]);

  const handleRealtimeLeadEvent = useCallback(
    async (
      eventName: "lead_updated" | "lead_checkin" | "stage_changed",
      payload: { lead_id?: string; action?: string },
    ) => {
      const leadId = payload.lead_id;
      const token = readStoredSession()?.accessToken;

      if (!leadId || !token || !selectedClient || apiStages.length === 0) {
        return;
      }

      // Exclusao: remove direto, sem gastar um getLead que retornaria 404.
      if (payload.action === "deleted") {
        setBoardState((prev) => removeLeadFromBoard(prev, leadId));
        setOpenLead((current) => (current?.id === leadId ? null : current));
        return;
      }

      try {
        leadsAbortRef.current?.abort();
        setBoardLoading(false);
        const previousLead =
          clientLeads.find((lead) => lead.id === leadId) ?? null;
        const freshLead = mapApiLeadToLead(await getLead(leadId, token));
        if (freshLead.client_id !== selectedClient) return;

        setBoardState((prev) => upsertLeadInBoard(prev, freshLead, apiStages));
        setOpenLead((current) =>
          current?.id === freshLead.id ? freshLead : current,
        );

        if (payload.action === "created") {
          triggerLiveBoardFx(freshLead.id, "new", [
            freshLead.crm_stage_id ?? apiStages[0]?.id,
          ]);
        } else if (
          eventName === "stage_changed" ||
          payload.action === "stage_changed"
        ) {
          triggerLiveBoardFx(freshLead.id, "stage-change", [
            previousLead?.crm_stage_id ?? apiStages[0]?.id,
            freshLead.crm_stage_id ?? apiStages[0]?.id,
          ]);
        } else {
          triggerLiveBoardFx(freshLead.id, "update", [
            freshLead.crm_stage_id ?? apiStages[0]?.id,
          ]);
        }

        if (
          openLead?.id === freshLead.id &&
          (eventName === "stage_changed" || payload.action === "stage_changed")
        ) {
          setOpenLeadHistoryVersion((current) => current + 1);
        }

        // Eco do proprio move: o `getLead` acima ja trouxe a verdade do
        // servidor para esse lead, entao o resync completo seria redundante.
        if (!consumeSelfMovedEcho(freshLead.id)) {
          if (realtimeReconcileTimerRef.current != null) {
            window.clearTimeout(realtimeReconcileTimerRef.current);
          }
          realtimeReconcileTimerRef.current = window.setTimeout(() => {
            realtimeReconcileTimerRef.current = null;
            refreshBoard();
          }, 350);
        }
      } catch (error) {
        if (error instanceof HttpError && error.status === 404) {
          setBoardState((prev) => removeLeadFromBoard(prev, leadId));
          setOpenLead((current) => (current?.id === leadId ? null : current));
          return;
        }
      }
    },
    [
      apiStages,
      clientLeads,
      consumeSelfMovedEcho,
      openLead?.id,
      refreshBoard,
      selectedClient,
      triggerLiveBoardFx,
    ],
  );

  useEffect(() => {
    const cleanup = refreshBoard();
    return cleanup;
  }, [refreshBoard]);

  useLeadRealtimeSync(selectedClient || null, refreshBoard, {
    enabled: apiStages.length > 0,
    refreshOnEvent: false,
    onEvent: handleRealtimeLeadEvent,
    onStatus: setRealtimeStatus,
    // Rede de seguranca lenta: eventos + resync no reconnect (T1) sao o caminho
    // primario; o poll so cobre evento perdido com socket vivo.
    pollMs: 30_000,
  });

  useEffect(() => {
    return () => {
      if (realtimeReconcileTimerRef.current != null) {
        window.clearTimeout(realtimeReconcileTimerRef.current);
      }
      if (liveBoardTimeoutRef.current != null) {
        window.clearTimeout(liveBoardTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const currentSnapshot = new Map<
      string,
      { lead: Lead; stageId: string | null }
    >();
    for (const [stageId, leads] of Object.entries(boardState)) {
      for (const lead of leads) {
        currentSnapshot.set(lead.id, { lead, stageId });
      }
    }

    const previousSnapshot = previousBoardSnapshotRef.current;
    if (previousSnapshot.size === 0) {
      previousBoardSnapshotRef.current = currentSnapshot;
      return;
    }

    const changedLeadEntries: Array<readonly [string, LeadMotionKind]> = [];
    const changedStageEntries = new Map<string, StageMotionKind>();

    for (const [leadId, { lead, stageId }] of currentSnapshot.entries()) {
      const previousEntry = previousSnapshot.get(leadId);
      if (!previousEntry) {
        changedLeadEntries.push([leadId, "new"]);
        if (stageId) changedStageEntries.set(stageId, "new");
        continue;
      }

      if (previousEntry.stageId !== stageId) {
        changedLeadEntries.push([leadId, "stage-change"]);
        if (previousEntry.stageId)
          changedStageEntries.set(previousEntry.stageId, "stage-change");
        if (stageId) changedStageEntries.set(stageId, "stage-change");
        continue;
      }

      if (
        previousEntry.lead.updated_at !== lead.updated_at ||
        previousEntry.lead.confirmation_status !== lead.confirmation_status
      ) {
        changedLeadEntries.push([leadId, "update"]);
        if (stageId) changedStageEntries.set(stageId, "update");
      }
    }

    previousBoardSnapshotRef.current = currentSnapshot;

    if (changedLeadEntries.length === 0 && changedStageEntries.size === 0) {
      return;
    }

    setLiveLeadKinds((current) => ({
      ...current,
      ...Object.fromEntries(changedLeadEntries),
    }));
    setLiveStageKinds((current) => ({
      ...current,
      ...Object.fromEntries(changedStageEntries),
    }));

    scheduleLiveBoardFxCleanup();
  }, [boardState, scheduleLiveBoardFxCleanup]);

  useEffect(() => {
    if (
      !requestedLeadId ||
      !selectedClient ||
      requestedLeadHandledRef.current === requestedLeadId
    ) {
      return;
    }

    const requestedLead = clientLeads.find(
      (lead) => lead.id === requestedLeadId,
    );
    if (!requestedLead) return;

    setOpenLead(requestedLead);
    requestedLeadHandledRef.current = requestedLeadId;
  }, [clientLeads, requestedLeadId, selectedClient]);

  useEffect(() => {
    const session = readStoredSession();
    const accessToken = session?.accessToken ?? "";
    if (!accessToken) {
      setApiPipelineCode(null);
      setApiStages(defaultKanbanStages());
      return;
    }

    if (!isUuid(selectedClient)) {
      setApiPipelineCode(null);
      setApiStages(defaultKanbanStages());
      return;
    }

    let active = true;

    async function loadPipelines() {
      try {
        let pipelines = await listCrmPipelines(selectedClient, accessToken);

        // Auto-cria pipeline padrão de 18 etapas (espelho do funil de eventos) se não existir.
        // Os códigos são determinísticos (derivados do client_id), permitindo que integrações
        // externas (ex.: n8n/Bitrix) calculem pipeline_code e stage_code sem consultar a API.
        const defaultPipeline = pickDefaultPipeline(pipelines, selectedClient);
        if (!defaultPipeline) {
          const idBase = selectedClient
            .replace(/-/g, "")
            .toUpperCase()
            .slice(0, 16);
          const created = await createCrmPipeline(
            {
              client_id: selectedClient,
              name: "Funil de Vendas",
              code: clientIdToPipelineCode(selectedClient),
              stages: [
                {
                  name: "Novo Lead",
                  code: `${idBase}_NOVO_LEAD`,
                  display_order: 1,
                  color: "#3B82F6",
                },
                {
                  name: "Landing Page - Leads",
                  code: `${idBase}_LANDING_PAGE`,
                  display_order: 2,
                  color: "#6366F1",
                },
                {
                  name: "Avaliar",
                  code: `${idBase}_AVALIAR`,
                  display_order: 3,
                  color: "#1F2937",
                },
                {
                  name: "Tentativa de contato",
                  code: `${idBase}_TENTATIVA_CONTATO`,
                  display_order: 4,
                  color: "#8B5CF6",
                },
                {
                  name: "Em contato",
                  code: `${idBase}_EM_CONTATO`,
                  display_order: 5,
                  color: "#7C3AED",
                },
                {
                  name: "Pré-agendamento",
                  code: `${idBase}_PRE_AGENDAMENTO`,
                  display_order: 6,
                  color: "#6366F1",
                },
                {
                  name: "Presença agendada",
                  code: `${idBase}_PRESENCA_AGENDADA`,
                  display_order: 7,
                  color: "#10B981",
                },
                {
                  name: "TEMP",
                  code: `${idBase}_TEMP`,
                  display_order: 8,
                  color: "#06B6D4",
                },
                {
                  name: "Enviar confirmação",
                  code: `${idBase}_ENVIAR_CONFIRMACAO`,
                  display_order: 9,
                  color: "#3D56A2",
                },
                {
                  name: "Leads Agendados - Confirmados",
                  code: `${idBase}_AGENDADOS_CONFIRMADOS`,
                  display_order: 10,
                  color: "#2563EB",
                },
                {
                  name: "Presença reagendada",
                  code: `${idBase}_PRESENCA_REAGENDADA`,
                  display_order: 11,
                  color: "#F59E0B",
                },
                {
                  name: "Presença cancelada",
                  code: `${idBase}_PRESENCA_CANCELADA`,
                  display_order: 12,
                  color: "#EF4444",
                },
                {
                  name: "Lembrete - Ainda dá tempo!",
                  code: `${idBase}_LEMBRETE`,
                  display_order: 13,
                  color: "#22D3EE",
                },
                {
                  name: "Perdido na Cadência",
                  code: `${idBase}_PERDIDO_CADENCIA`,
                  display_order: 14,
                  color: "#6B7280",
                  is_final_stage: true,
                },
                {
                  name: "Desinteresse",
                  code: `${idBase}_DESINTERESSE`,
                  display_order: 15,
                  color: "#F97316",
                  is_final_stage: true,
                },
                {
                  name: "Aguardando",
                  code: `${idBase}_AGUARDANDO`,
                  display_order: 16,
                  color: "#9CA3AF",
                },
                {
                  name: "Presença confirmada",
                  code: `${idBase}_PRESENCA_CONFIRMADA`,
                  display_order: 17,
                  color: "#059669",
                  is_final_stage: true,
                },
                {
                  name: "Lead perdido",
                  code: `${idBase}_LEAD_PERDIDO`,
                  display_order: 18,
                  color: "#4B5563",
                  is_final_stage: true,
                },
                {
                  name: "Lead ausente",
                  code: `${idBase}_LEAD_AUSENTE`,
                  display_order: 19,
                  color: "#374151",
                  is_final_stage: true,
                },
              ],
            },
            accessToken,
          );
          if (!active) return;
          showToast("Pipeline padrão criado automaticamente.", "info");
          pipelines = [created];
        }

        if (!active) return;
        const pipeline = pickDefaultPipeline(pipelines, selectedClient);
        if (pipeline?.code) {
          setApiPipelineCode(pipeline.code);
          try {
            const embeddedStages = pipeline.stages?.length
              ? pipeline.stages
              : null;
            const stages =
              embeddedStages ??
              (await listPipelineStages(pipeline.id, accessToken));
            if (!active) return;
            setApiStages(stages);
            setBulkTargetStageId((current) => current || stages[0]?.id || "");
          } catch {
            if (!active) return;
            setApiStages([]);
          }
        }
      } catch {
        if (!active) return;
        setApiPipelineCode(null);
        setApiStages([]);
        showToast(
          "Falha ao carregar pipeline. Movimentações não serão salvas.",
          "error",
        );
      }
    }

    void loadPipelines();

    return () => {
      active = false;
    };
  }, [selectedClient]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(String(event.active.id));
  };

  const handleMultiDragMove = (ids: string[], targetStageId: string) => {
    const idSet = new Set(ids);
    const targetColumn = kanbanColumns.find(
      (stage) => stage.id === targetStageId,
    );

    // Posicao original (para revert) e leads que de fato mudam de etapa.
    const originalStageById: Record<string, string> = {};
    const movedLeads: Lead[] = [];
    for (const stage of kanbanColumns) {
      for (const lead of boardState[stage.id] ?? []) {
        if (!idSet.has(lead.id)) continue;
        originalStageById[lead.id] = stage.id;
        if (stage.id !== targetStageId) {
          movedLeads.push({
            ...lead,
            crm_stage_id: targetStageId,
            crm_stage_name: targetColumn?.label ?? lead.crm_stage_name,
          });
        }
      }
    }

    if (movedLeads.length === 0) return; // toda a selecao ja estava no destino

    // Atualizacao otimista.
    setBoardState((prev) => {
      const next = { ...prev };
      for (const stage of kanbanColumns) {
        if (stage.id === targetStageId) continue;
        next[stage.id] = (next[stage.id] ?? []).filter(
          (lead) => !idSet.has(lead.id),
        );
      }
      next[targetStageId] = [...(next[targetStageId] ?? []), ...movedLeads];
      return next;
    });
    adjustStageCounts(
      movedLeads.map((moved) => ({
        from: originalStageById[moved.id],
        to: targetStageId,
      })),
    );

    const movedIds = movedLeads.map((lead) => lead.id);
    const revert = (message: string) => {
      showToast(message, "error");
      adjustStageCounts(
        movedLeads.map((moved) => ({
          from: targetStageId,
          to: originalStageById[moved.id],
        })),
      );
      setBoardState((prev) => {
        const next = { ...prev };
        next[targetStageId] = (next[targetStageId] ?? []).filter(
          (lead) => !movedIds.includes(lead.id),
        );
        for (const moved of movedLeads) {
          const originalStageId = originalStageById[moved.id];
          if (!originalStageId) continue;
          const restored: Lead = {
            ...moved,
            crm_stage_id: originalStageId,
            crm_stage_name:
              kanbanColumns.find((stage) => stage.id === originalStageId)
                ?.label ?? moved.crm_stage_name,
          };
          next[originalStageId] = [...(next[originalStageId] ?? []), restored];
        }
        return next;
      });
    };

    const session = readStoredSession();
    const accessToken = session?.accessToken;
    const stageCode = stageCodeById(apiStages, targetStageId);

    if (
      !accessToken ||
      !isUuid(selectedClient) ||
      !apiPipelineCode ||
      !stageCode
    ) {
      revert(
        "Pipeline/etapa nao configurada ou sessao invalida — movimentacao nao foi salva.",
      );
      return;
    }

    // Antes da chamada: o evento de realtime pode chegar antes da resposta.
    markSelfMoved(movedIds);
    void bulkMoveCrmLeads(
      {
        lead_ids: movedIds,
        pipeline_code: apiPipelineCode,
        stage_code: stageCode,
        source: "desktop_drag",
      },
      accessToken,
    )
      .then((result) => {
        showToast(
          `${result.moved} de ${result.total} leads movidos para ${targetColumn?.label ?? "nova etapa"}.`,
          result.moved > 0 ? "success" : "info",
        );
        exitSelectionMode();
        // O board otimista ja reflete o sucesso total; so vale refazer tudo
        // quando a API pulou algum lead e o estado local ficou por corrigir.
        if (result.moved !== movedIds.length) refreshBoard();
      })
      .catch((error) => {
        const detail = error instanceof Error ? error.message : "";
        revert(
          detail
            ? `Falha ao salvar movimentacao: ${detail}`
            : "Falha ao salvar movimentacao na API.",
        );
      });
  };

  /** Botao "Desfazer" do toast: devolve o lead para a etapa de origem. O
   *  desfazer nao oferece outro desfazer, para nao virar ping-pong de toasts. */
  const buildUndoAction = (
    lead: Lead,
    previousStageId: string | null | undefined,
    undoable?: boolean,
  ): Toast["action"] => {
    if (undoable === false || !previousStageId) return undefined;
    if (!kanbanColumns.some((stage) => stage.id === previousStageId)) {
      return undefined;
    }
    return {
      label: "Desfazer",
      onAction: () => {
        void moveLeadToStage(lead, previousStageId, {
          source: "desktop_undo",
          undoable: false,
        });
      },
    };
  };

  /** Move um lead para outra etapa sem drag (trilha de etapas do modal e o
   *  desfazer do toast). Usa a mesma rota da API do arraste, entao o historico
   *  e registrado igual. */
  const moveLeadToStage = async (
    lead: Lead,
    targetStageId: string,
    options?: { source?: string; undoable?: boolean },
  ): Promise<Lead | null> => {
    const targetColumn = kanbanColumns.find(
      (stage) => stage.id === targetStageId,
    );
    if (!targetColumn) return null;

    const session = readStoredSession();
    const accessToken = session?.accessToken;
    const stageCode = stageCodeById(apiStages, targetStageId);

    if (!accessToken || !isUuid(lead.id) || !isUuid(selectedClient)) {
      showToast(
        "Sem sessao ou cliente invalido — etapa nao foi alterada.",
        "error",
      );
      return null;
    }
    if (!apiPipelineCode || !stageCode) {
      showToast(
        "Pipeline ou etapa nao configurada para este cliente — etapa nao foi alterada.",
        "error",
      );
      return null;
    }

    // Antes da chamada: o evento de realtime pode chegar antes da resposta.
    markSelfMoved([lead.id]);

    try {
      const result = await moveCrmLead(
        lead.id,
        {
          pipeline_code: apiPipelineCode,
          stage_code: stageCode,
          source: options?.source ?? "desktop_modal",
        },
        accessToken,
      );

      const updated: Lead = {
        ...lead,
        crm_stage_id: targetStageId,
        crm_stage_name: targetColumn.label,
        confirmation_status:
          result.confirmation_status &&
          [
            "pending",
            "scheduled",
            "confirmed",
            "cancelled",
            "checked_in",
          ].includes(result.confirmation_status)
            ? (result.confirmation_status as Lead["confirmation_status"])
            : lead.confirmation_status,
      };

      setBoardState((prev) => {
        const next = { ...prev };
        for (const stage of kanbanColumns) {
          next[stage.id] = (next[stage.id] ?? []).filter(
            (item) => item.id !== lead.id,
          );
        }
        next[targetStageId] = [...(next[targetStageId] ?? []), updated];
        return next;
      });
      const previousStageId = result.from_stage_id ?? lead.crm_stage_id;
      adjustStageCounts([{ from: previousStageId, to: targetStageId }]);
      setOpenLead((current) => (current?.id === lead.id ? updated : current));
      // Recarrega a timeline do modal para mostrar a movimentacao recem-criada.
      setOpenLeadHistoryVersion((version) => version + 1);
      showToast(
        `${lead.name} movido para ${targetColumn.label}.`,
        "success",
        buildUndoAction(updated, previousStageId, options?.undoable),
      );
      return updated;
    } catch (error) {
      const detail = error instanceof Error ? error.message : "";
      showToast(
        detail
          ? `Falha ao mover etapa: ${detail}`
          : "Falha ao mover etapa na API.",
        "error",
      );
      return null;
    }
  };

  /** Atalho de teclado do card: manda o lead para a etapa vizinha visivel. */
  const moveLeadToNeighborStage = (lead: Lead, direction: -1 | 1) => {
    const currentIndex = visibleStages.findIndex(
      (stage) => stage.id === lead.crm_stage_id,
    );
    if (currentIndex === -1) return;
    const target = visibleStages[currentIndex + direction];
    if (!target) {
      showToast(
        direction === 1
          ? "Este lead ja esta na ultima etapa visivel."
          : "Este lead ja esta na primeira etapa visivel.",
        "info",
      );
      return;
    }
    void moveLeadToStage(lead, target.id, { source: "desktop_keyboard" });
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);
    if (!over) return;

    const draggedId = String(active.id);
    const targetStageId = String(over.id);
    if (!kanbanColumns.some((stage) => stage.id === targetStageId)) return;

    // Multi-drag: arrastar um card selecionado move a selecao inteira.
    if (
      selectionMode &&
      selectedLeadIds.has(draggedId) &&
      selectedLeadIds.size > 1
    ) {
      handleMultiDragMove(Array.from(selectedLeadIds), targetStageId);
      return;
    }

    let movedLead: Lead | undefined;
    let originalStageId: string | undefined;
    const targetColumn = kanbanColumns.find(
      (stage) => stage.id === targetStageId,
    );

    setBoardState((prev) => {
      const next = { ...prev };

      for (const stage of kanbanColumns) {
        const index = (next[stage.id] ?? []).findIndex(
          (lead) => lead.id === draggedId,
        );
        if (index !== -1) {
          originalStageId = stage.id;
          movedLead = {
            ...next[stage.id][index],
            crm_stage_id: targetStageId,
            crm_stage_name:
              targetColumn?.label ?? next[stage.id][index].crm_stage_name,
          };
          next[stage.id] = next[stage.id].filter(
            (lead) => lead.id !== draggedId,
          );
          break;
        }
      }

      if (movedLead) {
        next[targetStageId] = [...(next[targetStageId] ?? []), movedLead];
      }
      return next;
    });

    if (!movedLead || !originalStageId || originalStageId === targetStageId)
      return;

    adjustStageCounts([{ from: originalStageId, to: targetStageId }]);

    const session = readStoredSession();
    const accessToken = session?.accessToken;
    const stageCode = stageCodeById(apiStages, targetStageId);

    const revert = (message: string) => {
      showToast(message, "error");
      if (originalStageId) {
        adjustStageCounts([{ from: targetStageId, to: originalStageId }]);
      }
      setBoardState((prev) => {
        const next = { ...prev };
        next[targetStageId] = (next[targetStageId] ?? []).filter(
          (lead) => lead.id !== draggedId,
        );
        if (movedLead && originalStageId) {
          next[originalStageId] = [...(next[originalStageId] ?? []), movedLead];
        }
        return next;
      });
    };

    if (!accessToken || !isUuid(movedLead.id) || !isUuid(selectedClient)) {
      revert("Sem sessao ou cliente invalido — movimentacao nao foi salva.");
      return;
    }

    if (!apiPipelineCode || !stageCode) {
      revert(
        "Pipeline ou etapa nao configurada para este cliente — movimentacao nao foi salva.",
      );
      return;
    }

    // Antes da chamada: o evento de realtime pode chegar antes da resposta.
    markSelfMoved([movedLead.id]);
    void moveCrmLead(
      movedLead.id,
      {
        pipeline_code: apiPipelineCode,
        stage_code: stageCode,
        source: "desktop_drag",
      },
      accessToken,
    )
      .then((result) => {
        if (
          result.confirmation_status &&
          [
            "pending",
            "scheduled",
            "confirmed",
            "cancelled",
            "checked_in",
          ].includes(result.confirmation_status)
        ) {
          setBoardState((prev) => {
            const next = { ...prev };
            next[targetStageId] = (next[targetStageId] ?? []).map((lead) =>
              lead.id === movedLead?.id
                ? {
                    ...lead,
                    confirmation_status:
                      result.confirmation_status as Lead["confirmation_status"],
                  }
                : lead,
            );
            return next;
          });
        }

        showToast(
          `${movedLead?.name} movido para ${targetColumn?.label ?? "nova etapa"}.`,
          "success",
          movedLead ? buildUndoAction(movedLead, originalStageId) : undefined,
        );
      })
      .catch((error) => {
        const detail = error instanceof Error ? error.message : "";
        revert(
          detail
            ? `Falha ao salvar movimentacao: ${detail}`
            : "Falha ao salvar movimentacao na API.",
        );
      });
  };

  const fieldClass = clsx(
    "w-full appearance-none rounded-2xl border px-4 py-3 pr-10 text-sm font-medium outline-none transition-colors focus:border-[#FF0636]",
    isDarkMode
      ? "border-zinc-700 bg-[#111111] text-zinc-100"
      : "border-zinc-200 bg-white text-zinc-950",
  );

  return (
    <div
      className={clsx(
        "flex flex-col gap-6",
        // Preenche a altura util do layout (mesma faixa do sidebar fixo).
        viewMode === "kanban" && "md:h-full md:min-h-0 md:overflow-hidden",
        isDarkMode && "dashboard-dark bg-black",
      )}
    >
      <div className="shrink-0 space-y-6">
        <div>
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.15fr)_320px_auto] lg:items-end">
            <div>
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
                  placeholder="Buscar por nome, email ou telefone..."
                  aria-label="Buscar leads"
                  className={clsx(
                    "w-full rounded-2xl border py-3 pl-11 pr-4 text-sm outline-none transition-colors focus:border-[#FF0636]",
                    isDarkMode
                      ? "border-zinc-700 bg-[#111111] text-zinc-100 placeholder:text-zinc-500"
                      : "border-zinc-200 bg-white text-zinc-950 placeholder:text-zinc-400",
                  )}
                />
              </div>
            </div>

            <div>
              <div className="relative">
                <select
                  value={selectedClient}
                  onChange={(event) => handleClientChange(event.target.value)}
                  aria-label="Selecionar cliente"
                  className={fieldClass}
                >
                  {crmClients.map((client) => (
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

            <div className="flex items-center gap-2 lg:pb-[2px]">
              <span
                title={
                  realtimeStatus === "connected"
                    ? "Tempo real conectado"
                    : realtimeStatus === "offline"
                      ? "Sem conexão"
                      : "Reconectando…"
                }
                aria-label={`Tempo real: ${realtimeStatus}`}
                className={clsx(
                  "inline-flex h-2.5 w-2.5 shrink-0 rounded-full",
                  realtimeStatus === "connected"
                    ? "bg-emerald-500"
                    : realtimeStatus === "offline"
                      ? "bg-zinc-400"
                      : "animate-pulse bg-amber-500",
                )}
              />
              {(
                [
                  ["kanban", "Kanban", KanbanSquare],
                  ["compact", "Compacto", LayoutGrid],
                  ["list", "Lista", List],
                ] as const
              ).map(([value, label, Icon]) => (
                <button
                  key={value}
                  type="button"
                  title={label}
                  aria-label={label}
                  onClick={() => {
                    setViewMode(value);
                    localStorage.setItem("crm_view_mode", value);
                  }}
                  className={clsx(
                    "inline-flex items-center justify-center rounded-full p-2.5 transition-colors",
                    viewMode === value
                      ? "bg-[#FF0636] text-white"
                      : isDarkMode
                        ? "bg-[#1a1a1a] text-zinc-300 hover:bg-[#262626]"
                        : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200",
                  )}
                >
                  <Icon size={16} />
                </button>
              ))}
              <button
                type="button"
                onClick={() => {
                  if (selectionMode) exitSelectionMode();
                  else setSelectionMode(true);
                }}
                className={clsx(
                  "inline-flex items-center gap-2 rounded-full border px-4 py-2 text-xs font-semibold transition-colors",
                  selectionMode
                    ? "border-[#FF0636] bg-[#FF0636]/10 text-[#FF0636]"
                    : isDarkMode
                      ? "border-zinc-700 bg-[#111111] text-zinc-200 hover:bg-[#1b1b1b]"
                      : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50",
                )}
              >
                <CheckSquare size={14} />
                {selectionMode
                  ? `${selectedLeadIds.size} selecionados`
                  : "Selecionar"}
              </button>
              <div className="relative">
                <ArrowDownWideNarrow
                  size={14}
                  className={clsx(
                    "pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2",
                    isDarkMode ? "text-zinc-400" : "text-zinc-500",
                  )}
                />
                <select
                  value={cardSort}
                  onChange={(event) => {
                    const value = event.target.value as CardSort;
                    setCardSort(value);
                    localStorage.setItem(CARD_SORT_STORAGE_KEY, value);
                  }}
                  title="Ordenar cards dentro da etapa"
                  aria-label="Ordenar cards dentro da etapa"
                  className={clsx(
                    "cursor-pointer appearance-none rounded-full border py-2 pl-9 pr-8 text-xs font-semibold outline-none transition-colors focus:border-[#FF0636]",
                    isDarkMode
                      ? "border-zinc-700 bg-[#111111] text-zinc-200 hover:bg-[#1b1b1b]"
                      : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50",
                  )}
                >
                  {CARD_SORT_OPTIONS.map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
                <ChevronDown
                  size={14}
                  className={clsx(
                    "pointer-events-none absolute right-3 top-1/2 -translate-y-1/2",
                    isDarkMode ? "text-zinc-500" : "text-zinc-400",
                  )}
                />
              </div>
              <button
                type="button"
                onClick={() => setFiltersOpen(true)}
                className={clsx(
                  "inline-flex items-center gap-2 rounded-full border px-4 py-2 text-xs font-semibold transition-colors",
                  isDarkMode
                    ? "border-zinc-700 bg-[#111111] text-zinc-200 hover:bg-[#1b1b1b]"
                    : "border-[#FF0636]/15 bg-white text-zinc-700 hover:bg-zinc-50",
                )}
              >
                <Filter size={14} />
                Filtros
              </button>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setHideMenuOpen((value) => !value)}
                  title="Ocultar etapas"
                  className={clsx(
                    "inline-flex items-center gap-2 rounded-full border px-4 py-2 text-xs font-semibold transition-colors",
                    hiddenStageIds.size > 0
                      ? "border-[#FF0636]/40 bg-[#FF0636]/10 text-[#FF0636]"
                      : isDarkMode
                        ? "border-zinc-700 bg-[#111111] text-zinc-200 hover:bg-[#1b1b1b]"
                        : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50",
                  )}
                >
                  <EyeOff size={14} />
                  Ocultar
                  {hiddenStageIds.size > 0 ? ` (${hiddenStageIds.size})` : ""}
                </button>
                {hideMenuOpen && (
                  <>
                    <div
                      className="fixed inset-0 z-30"
                      onClick={() => setHideMenuOpen(false)}
                    />
                    <div
                      className={clsx(
                        "absolute right-0 z-40 mt-2 max-h-80 w-64 overflow-y-auto rounded-2xl border p-2 shadow-xl",
                        isDarkMode
                          ? "border-zinc-700 bg-[#141414]"
                          : "border-zinc-200 bg-white",
                      )}
                    >
                      <p className="px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-zinc-400">
                        Ocultar etapas do quadro
                      </p>
                      {kanbanColumns.length === 0 ? (
                        <p className="px-2 py-2 text-xs text-zinc-400">
                          Nenhuma etapa.
                        </p>
                      ) : (
                        kanbanColumns.map((stage) => (
                          <label
                            key={stage.id}
                            className={clsx(
                              "flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-2 text-sm",
                              isDarkMode
                                ? "text-zinc-200 hover:bg-[#1f1f1f]"
                                : "text-zinc-700 hover:bg-zinc-50",
                            )}
                          >
                            <input
                              type="checkbox"
                              checked={hiddenStageIds.has(stage.id)}
                              onChange={() => toggleHiddenStage(stage.id)}
                              className="h-4 w-4 rounded border-gray-300 text-[#FF0636] focus:ring-[#FF0636]"
                            />
                            <span
                              className="h-2.5 w-2.5 shrink-0 rounded-full"
                              style={{ backgroundColor: stage.color }}
                            />
                            <span className="truncate">{stage.label}</span>
                          </label>
                        ))
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
      {kanbanColumns.length === 0 && (
        <p className="shrink-0 text-center text-xs text-zinc-500">
          Carregando etapas do funil…
        </p>
      )}
      {/* Area do board: precisa ser irma do cabecalho (e nao filha dele) para
          herdar a altura util da raiz — e so assim o `flex-1`/`h-full` das
          colunas resolve e os cards ganham scroll proprio. */}
      <div className="flex min-h-0 flex-1 flex-col">
        <DndContext
          sensors={sensors}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          {viewMode === "list" ? (
            <div className="space-y-3">
              {kanbanColumns
                .filter(
                  (stage) =>
                    (stageFilter === "all" || stage.id === stageFilter) &&
                    !hiddenStageIds.has(stage.id),
                )
                .map((stage) => {
                  const stageLeads = visibleBoard[stage.id] ?? [];
                  if (stageLeads.length === 0) return null;
                  return (
                    <div
                      key={stage.id}
                      className={clsx(
                        "overflow-hidden rounded-[22px]",
                        isDarkMode ? "bg-[#0f0f0f]" : "bg-white",
                        "shadow-[0_4px_16px_rgba(15,23,42,0.06)]",
                      )}
                    >
                      {/* Colored header */}
                      <div
                        className="h-0.5 w-full"
                        style={{ backgroundColor: stage.color }}
                      />
                      <div className="flex items-center gap-3 px-5 py-3">
                        <p
                          className={clsx(
                            "flex-1 text-[13px] font-black",
                            isDarkMode ? "text-zinc-100" : "text-zinc-900",
                          )}
                        >
                          {stage.label}
                        </p>
                        <span
                          className="inline-flex h-6 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full px-2 text-[11px] font-black tabular-nums"
                          style={{
                            backgroundColor: `${stage.color}18`,
                            color: stage.color,
                          }}
                          title={`${stageLeads.length} leads`}
                        >
                          {formatStageLeadCount(stageLeads.length)}
                        </span>
                      </div>
                      <div className="px-3 pb-3 space-y-1.5">
                        {stageLeads.map((lead) => (
                          <div
                            key={lead.id}
                            onClick={() => setOpenLead(lead)}
                            className={clsx(
                              "flex cursor-pointer items-center gap-4 rounded-[14px] border px-4 py-2.5 transition-colors",
                              isDarkMode
                                ? "border-[#1a1a1a] bg-[#0a0a0a] hover:border-[#2a2a2a]"
                                : "border-zinc-50 bg-zinc-50/60 hover:bg-white hover:border-zinc-100",
                            )}
                          >
                            <div className="flex-1 min-w-0">
                              <p
                                className={clsx(
                                  "truncate text-[13px] font-bold",
                                  isDarkMode
                                    ? "text-zinc-100"
                                    : "text-zinc-900",
                                )}
                              >
                                {lead.name}
                              </p>
                              {lead.phone && (
                                <p
                                  className={clsx(
                                    "text-[11px]",
                                    isDarkMode
                                      ? "text-zinc-500"
                                      : "text-zinc-400",
                                  )}
                                >
                                  {lead.phone}
                                </p>
                              )}
                            </div>
                            <div className="flex shrink-0 items-center gap-2">
                              <SourceBadge source={lead.source} />
                              <ConfirmationBadge
                                status={lead.confirmation_status}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
            </div>
          ) : viewMode === "compact" ? (
            <div className="space-y-4">
              {visibleStages.map((stage) => (
                <StageColumn
                  key={stage.id}
                  stage={stage}
                  leads={visibleBoard[stage.id] ?? []}
                  dense
                  vendorsById={vendorsById}
                  dark={isDarkMode}
                  liveKind={liveStageKinds[stage.id]}
                  liveLeadKinds={liveLeadKinds}
                  selectionMode={selectionMode}
                  selectedLeadIds={selectedLeadIds}
                  onToggleSelect={toggleSelection}
                  onLeadOpen={setOpenLead}
                  onLeadKeyboardMove={moveLeadToNeighborStage}
                  totalCount={
                    cardFiltersActive ? undefined : stageCounts[stage.id]
                  }
                />
              ))}
            </div>
          ) : isMobileViewport ? (
            // Celular: uma etapa por vez. O quadro rolando na horizontal com
            // colunas de 272px nao cabe em tela estreita, e arrastar um card
            // para uma coluna fora da viewport e impraticavel — para trocar de
            // etapa aqui, use a trilha de etapas dentro do card.
            <div className="flex min-h-0 flex-1 flex-col gap-3">
              <div className="flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:thin]">
                {visibleStages.map((stage) => {
                  const isActive = activeMobileStage?.id === stage.id;
                  const count = cardFiltersActive
                    ? (visibleBoard[stage.id]?.length ?? 0)
                    : (stageCounts[stage.id] ??
                      visibleBoard[stage.id]?.length ??
                      0);
                  return (
                    <button
                      key={stage.id}
                      type="button"
                      aria-pressed={isActive}
                      onClick={(event) => {
                        setMobileStageId(stage.id);
                        event.currentTarget.scrollIntoView({
                          behavior: "smooth",
                          inline: "center",
                          block: "nearest",
                        });
                      }}
                      className={clsx(
                        "inline-flex shrink-0 items-center gap-2 rounded-full border px-3.5 py-2 text-xs font-bold transition-colors",
                        isActive
                          ? "border-[#FF0636] bg-[#FF0636]/10 text-[#FF0636]"
                          : isDarkMode
                            ? "border-zinc-800 bg-[#111111] text-zinc-300"
                            : "border-zinc-200 bg-white text-zinc-600",
                      )}
                    >
                      <span
                        className="h-2 w-2 shrink-0 rounded-full"
                        style={{ backgroundColor: stage.color }}
                      />
                      {stage.label}
                      <span
                        className={clsx(
                          "tabular-nums",
                          isActive ? "text-[#FF0636]" : "text-zinc-400",
                        )}
                      >
                        {formatStageLeadCount(count)}
                      </span>
                    </button>
                  );
                })}
              </div>
              {activeMobileStage && (
                <StageColumn
                  key={activeMobileStage.id}
                  stage={activeMobileStage}
                  leads={visibleBoard[activeMobileStage.id] ?? []}
                  vendorsById={vendorsById}
                  dark={isDarkMode}
                  liveKind={liveStageKinds[activeMobileStage.id]}
                  liveLeadKinds={liveLeadKinds}
                  selectionMode={selectionMode}
                  selectedLeadIds={selectedLeadIds}
                  onToggleSelect={toggleSelection}
                  onLeadOpen={setOpenLead}
                  onLeadKeyboardMove={moveLeadToNeighborStage}
                  totalCount={
                    cardFiltersActive
                      ? undefined
                      : stageCounts[activeMobileStage.id]
                  }
                />
              )}
            </div>
          ) : (
            <div className="min-h-0 max-h-full flex-1 overflow-x-auto overflow-y-hidden pb-2 [-ms-overflow-style:none] [scrollbar-width:thin]">
              <div
                className="flex h-full min-h-0 max-h-full items-stretch gap-3"
                style={{ minWidth: "max-content" }}
              >
                {visibleStages.map((stage) => (
                  <StageColumn
                    key={stage.id}
                    stage={stage}
                    leads={visibleBoard[stage.id] ?? []}
                    vendorsById={vendorsById}
                    dark={isDarkMode}
                    liveKind={liveStageKinds[stage.id]}
                    liveLeadKinds={liveLeadKinds}
                    selectionMode={selectionMode}
                    selectedLeadIds={selectedLeadIds}
                    onToggleSelect={toggleSelection}
                    onLeadOpen={setOpenLead}
                    onLeadKeyboardMove={moveLeadToNeighborStage}
                    totalCount={
                      cardFiltersActive ? undefined : stageCounts[stage.id]
                    }
                    fillHeight
                  />
                ))}
              </div>
            </div>
          )}

          <DragOverlay>
            {activeLead ? (
              <div
                className={clsx(
                  "w-[320px] rounded-[22px] border border-[#FF0636]/20 p-4 shadow-[0_24px_60px_rgba(15,23,42,0.18)]",
                  isDarkMode ? "bg-[#111111]" : "bg-white",
                )}
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p
                      className={clsx(
                        "font-black",
                        isDarkMode ? "text-zinc-100" : "text-zinc-950",
                      )}
                    >
                      {activeLead.name}
                    </p>
                    <p
                      className={clsx(
                        "text-xs",
                        isDarkMode ? "text-zinc-400" : "text-zinc-500",
                      )}
                    >
                      {activeLead.email}
                    </p>
                  </div>
                  {selectionMode &&
                  selectedLeadIds.has(activeLead.id) &&
                  selectedLeadIds.size > 1 ? (
                    <span className="inline-flex h-7 min-w-7 items-center justify-center rounded-full bg-[#FF0636] px-2 text-xs font-black text-white">
                      {selectedLeadIds.size}
                    </span>
                  ) : (
                    <GripVertical size={14} className="text-zinc-300" />
                  )}
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {selectionMode &&
                  selectedLeadIds.has(activeLead.id) &&
                  selectedLeadIds.size > 1 ? (
                    <span
                      className={clsx(
                        "text-xs font-semibold",
                        isDarkMode ? "text-zinc-400" : "text-zinc-500",
                      )}
                    >
                      Movendo {selectedLeadIds.size} leads selecionados
                    </span>
                  ) : (
                    <>
                      <SourceBadge source={activeLead.source} />
                      <ConfirmationBadge
                        status={activeLead.confirmation_status}
                      />
                    </>
                  )}
                </div>
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      </div>
      {openLead && (
        <LeadDetailModal
          lead={openLead}
          vendorsById={vendorsById}
          pipelineStages={kanbanColumns}
          dark={isDarkMode}
          historyVersion={openLeadHistoryVersion}
          onMoveStage={moveLeadToStage}
          onClose={() => {
            setOpenLead(null);
            if (!searchParams.get("lead_id")) return;
            const nextParams = new URLSearchParams(searchParams);
            nextParams.delete("lead_id");
            setSearchParams(nextParams, { replace: true });
          }}
          onOpenChat={(lead) => {
            setOpenLead(null);
            const params = new URLSearchParams();
            if (lead.client_id) params.set("client_id", lead.client_id);
            params.set("lead_id", lead.id);
            navigate(`/gestor/chat?${params.toString()}`);
          }}
          onLeadUpdated={(updated) => {
            setOpenLead(updated);
            setBoardState((prev) => {
              const next = { ...prev };
              for (const stage of kanbanColumns) {
                const idx = (next[stage.id] ?? []).findIndex(
                  (l) => l.id === updated.id,
                );
                if (idx !== -1) {
                  next[stage.id] = [...(next[stage.id] ?? [])];
                  next[stage.id][idx] = updated;
                  break;
                }
              }
              return next;
            });
            showToast("Lead atualizado com sucesso.", "success");
          }}
        />
      )}
      {selectionMode && selectedLeadIds.size > 0 && (
        <div className="pointer-events-none fixed bottom-6 left-1/2 z-[90] -translate-x-1/2">
          <div
            className={clsx(
              "pointer-events-auto flex items-center gap-3 rounded-2xl px-5 py-3 shadow-[0_8px_32px_rgba(0,0,0,0.22)]",
              isDarkMode
                ? "bg-[#1a1a1a] text-zinc-100"
                : "bg-zinc-900 text-white",
            )}
          >
            <Layers size={16} className="text-[#FF0636]" />
            <span className="text-sm font-semibold">
              {selectedLeadIds.size} leads
            </span>
            <span className="text-xs opacity-60">→</span>
            <div className="relative">
              <select
                value={bulkTargetStageId}
                onChange={(e) => setBulkTargetStageId(e.target.value)}
                className="appearance-none rounded-xl bg-white/10 py-1.5 pl-3 pr-8 text-xs font-semibold outline-none"
              >
                {kanbanColumns.map((stage) => (
                  <option
                    key={stage.id}
                    value={stage.id}
                    className="text-zinc-900"
                  >
                    {stage.label}
                  </option>
                ))}
              </select>
              <ChevronDown
                size={12}
                className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 opacity-60"
              />
            </div>
            <button
              type="button"
              disabled={bulkMoving}
              onClick={() => void handleBulkMove()}
              className="inline-flex items-center gap-1.5 rounded-xl bg-[#FF0636] px-4 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-[#d90530] disabled:opacity-60"
            >
              <Check size={13} />
              {bulkMoving ? "Movendo…" : "Mover"}
            </button>
            <button
              type="button"
              onClick={exitSelectionMode}
              className="inline-flex h-7 w-7 items-center justify-center rounded-full opacity-60 hover:opacity-100 transition-opacity"
              aria-label="Cancelar seleção"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      )}
      <ToastStack toasts={toasts} onDismiss={dismissToast} />
      {filtersOpen && (
        <div
          className={clsx(
            "fixed inset-0 z-50 flex items-center justify-center px-4 py-6 backdrop-blur-[2px]",
            isDarkMode ? "bg-black/60" : "bg-black/35",
          )}
        >
          <Card
            className={clsx(
              "w-full max-w-3xl rounded-xl shadow-none ring-0",
              isDarkMode ? "bg-[#0f0f0f]" : "bg-white",
            )}
            padding="sm"
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400">
                  Filtros
                </p>
                <h2
                  className={clsx(
                    "mt-1 text-2xl font-black tracking-tight",
                    isDarkMode ? "text-zinc-100" : "text-zinc-950",
                  )}
                >
                  Refinar visualização
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setFiltersOpen(false)}
                className={clsx(
                  "inline-flex h-10 w-10 items-center justify-center rounded-full transition-colors",
                  isDarkMode
                    ? "bg-[#1a1a1a] text-zinc-300 hover:bg-[#262626]"
                    : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200",
                )}
                aria-label="Fechar filtros"
              >
                <X size={16} />
              </button>
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <div>
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-400">
                  Cliente
                </p>
                <div className="relative">
                  <select
                    value={selectedClient}
                    onChange={(event) => handleClientChange(event.target.value)}
                    className={fieldClass}
                  >
                    <option value="">Selecione um cliente</option>
                    {crmClients.map((client) => (
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

              <div>
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-400">
                  Fonte
                </p>
                <div className="relative">
                  <select
                    value={sourceFilter}
                    onChange={(event) => setSourceFilter(event.target.value)}
                    className={fieldClass}
                  >
                    {SOURCE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
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

              <div>
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-400">
                  Vendedor
                </p>
                <div className="relative">
                  <select
                    value={vendorFilter}
                    onChange={(event) => setVendorFilter(event.target.value)}
                    className={fieldClass}
                  >
                    <option value="all">Todos os vendedores</option>
                    {vendors.map((vendor) => (
                      <option key={vendor.id} value={vendor.id}>
                        {vendor.name}
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

              <div>
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-400">
                  Tag
                </p>
                <div className="relative">
                  <select
                    value={tagFilter}
                    onChange={(event) => setTagFilter(event.target.value)}
                    className={fieldClass}
                  >
                    <option value="all">Todas as tags</option>
                    {allTags.map((tag) => (
                      <option key={tag} value={tag}>
                        {tag}
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

              <div>
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-400">
                  Etapa
                </p>
                <div className="relative">
                  <select
                    value={stageFilter}
                    onChange={(event) =>
                      setStageFilter(event.target.value as StageFilter)
                    }
                    className={fieldClass}
                  >
                    <option value="all">Todas as etapas</option>
                    {kanbanColumns.map((stage) => (
                      <option key={stage.id} value={stage.id}>
                        {stage.label}
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

              <div>
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-400">
                  Confirmacao
                </p>
                <div className="relative">
                  <select
                    value={confirmationFilter}
                    onChange={(event) =>
                      setConfirmationFilter(
                        event.target.value as ConfirmationFilter,
                      )
                    }
                    className={fieldClass}
                  >
                    <option value="all">Todos os status</option>
                    <option value="pending">Pendente</option>
                    <option value="confirmed">Confirmado</option>
                    <option value="checked_in">Check-in</option>
                    <option value="cancelled">Cancelado</option>
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

            <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-[#FF0636]/10 px-3 py-1 text-xs font-semibold text-[#FF0636]">
                  {visibleLeads.length} contatos visiveis
                </span>
                <span className="rounded-full bg-[#3D56A2]/10 px-3 py-1 text-xs font-semibold text-[#3D56A2]">
                  {responseRate}% resposta
                </span>
                <span className="rounded-full bg-[#FBBB49]/20 px-3 py-1 text-xs font-semibold text-[#8a5a00]">
                  {topTags.length} tags em uso
                </span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    resetFilters();
                    setFiltersOpen(false);
                  }}
                  className={clsx(
                    "rounded-full px-4 py-2 text-xs font-semibold transition-colors",
                    isDarkMode
                      ? "bg-[#1a1a1a] text-zinc-200 hover:bg-[#262626]"
                      : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200",
                  )}
                >
                  Limpar
                </button>
                <button
                  type="button"
                  onClick={() => setFiltersOpen(false)}
                  className={clsx(
                    "rounded-full px-4 py-2 text-xs font-semibold text-white",
                    isDarkMode ? "bg-[#FF0636]" : "bg-[#0b0b0b]",
                  )}
                >
                  Aplicar
                </button>
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
