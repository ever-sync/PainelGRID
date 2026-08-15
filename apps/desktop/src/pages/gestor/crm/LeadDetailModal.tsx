import { useEffect, useState } from "react";
import clsx from "clsx";
import {
  Car,
  CalendarDays,
  Check,
  ChevronRight,
  Clock,
  FileText,
  Mail,
  MessageCircle,
  Phone,
  Plus,
  Tag,
  Target,
  TrendingUp,
  Users,
  User as UserIcon,
  UserCheck,
  X,
} from "lucide-react";
import { SourceBadge, StageBadge } from "../../../components/ui/Badge";
import type { Lead } from "../../../types";
import type { KanbanColumn } from "../../../lib/crm-kanban";
import { readStoredSession } from "../../../services/auth";
import {
  createCrmTask,
  listCrmTasks,
  listLeadTimeline,
  updateCrmTask,
  type ApiCrmTask,
  type CrmTaskType,
  type ApiLeadTimelineItem,
} from "../../../services/crm";
import { updateLead } from "../../../services/leads";
import {
  CRM_SOURCE_LABELS as SOURCE_LABELS,
  LEGACY_STAGES as STAGES,
} from "../crm-page.model";
import {
  CONFIRMATION_LABELS,
  TIMELINE_ORIGIN_COLOR,
  TIMELINE_ORIGIN_LABEL,
  formatDateFull,
  formatDateOnly,
  formatDateShort,
  timelineDotColor,
  timelineTitle,
} from "./crm-timeline";

export function LeadDetailModal({
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
  const [activeTab, setActiveTab] = useState<
    | "pessoais"
    | "atendimento"
    | "qualificacao"
    | "veiculo"
    | "meta"
    | "tarefas"
    | "historico"
  >("pessoais");
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
  const [editQualification, setEditQualification] = useState<
    NonNullable<Lead["qualification"]>
  >(lead.qualification ?? {});
  const [history, setHistory] = useState<ApiLeadTimelineItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [tasks, setTasks] = useState<ApiCrmTask[]>([]);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [taskSaving, setTaskSaving] = useState(false);
  const [taskType, setTaskType] = useState<CrmTaskType>("follow_up");
  const [taskTitle, setTaskTitle] = useState("Retornar contato");
  const [taskDueAt, setTaskDueAt] = useState(() => {
    const value = new Date(Date.now() + 60 * 60 * 1000);
    value.setMinutes(0, 0, 0);
    return new Date(value.getTime() - value.getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 16);
  });
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
    setEditQualification(initialLead.qualification ?? {});
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

  const loadTasks = async () => {
    const token = readStoredSession()?.accessToken;
    if (!token || !lead.client_id) return;
    setTasksLoading(true);
    try {
      const response = await listCrmTasks(
        { client_id: lead.client_id, lead_id: lead.id },
        token,
      );
      setTasks(response.tasks);
    } finally {
      setTasksLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === "tarefas") void loadTasks();
  }, [activeTab, lead.id]);

  const handleCreateTask = async () => {
    const token = readStoredSession()?.accessToken;
    if (!token || !lead.client_id || !taskTitle.trim() || !taskDueAt) return;
    setTaskSaving(true);
    try {
      await createCrmTask(
        {
          client_id: lead.client_id,
          lead_id: lead.id,
          assigned_user_id: lead.assigned_vendor_id ?? undefined,
          type: taskType,
          title: taskTitle.trim(),
          due_at: new Date(taskDueAt).toISOString(),
        },
        token,
      );
      await loadTasks();
      setHistory((current) => current);
    } finally {
      setTaskSaving(false);
    }
  };

  const handleCompleteTask = async (taskId: string) => {
    const token = readStoredSession()?.accessToken;
    if (!token) return;
    await updateCrmTask(taskId, { status: "completed" }, token);
    await loadTasks();
  };

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
          qualification: editQualification,
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
        qualification: updated.qualification ?? {},
      };
      setLead(mapped);
      onLeadUpdated(mapped);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  const vendors = Object.entries(vendorsById);

  type InfoRow = {
    label: string;
    value: string | null;
    icon: typeof Phone;
  };

  const personalRows: InfoRow[] = [
    { label: "Telefone", value: lead.phone || null, icon: Phone },
    { label: "E-mail", value: lead.email || null, icon: Mail },
    {
      label: "Data de nascimento",
      value: formatDateOnly(lead.birth_date),
      icon: CalendarDays,
    },
    {
      label: "Nome",
      value: lead.first_name || lead.name || null,
      icon: UserIcon,
    },
    { label: "Sobrenome", value: lead.last_name || null, icon: UserIcon },
    { label: "Entrada", value: formatDateShort(lead.created_at), icon: Clock },
  ];

  const attendanceRows: InfoRow[] = [
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
    { label: "Acompanhantes", value: lead.companions || null, icon: Users },
    { label: "Descrição", value: lead.description || null, icon: FileText },
  ];

  const vehicleRows: InfoRow[] = [
    { label: "Placa do veículo", value: lead.vehicle_plate || null, icon: Car },
    { label: "Marca do veículo", value: lead.vehicle_brand || null, icon: Car },
    {
      label: "Modelo do veículo",
      value: lead.vehicle_model || null,
      icon: Car,
    },
    { label: "Ano do veículo", value: lead.vehicle_year || null, icon: Car },
    {
      label: "Valor FIPE",
      value: lead.vehicle_fipe_value || null,
      icon: TrendingUp,
    },
  ];

  const qualificationRows: InfoRow[] = [
    {
      label: "Categoria de interesse",
      value: lead.qualification?.interest_category ?? null,
      icon: Target,
    },
    {
      label: "Modelo desejado",
      value: lead.qualification?.desired_model ?? null,
      icon: Car,
    },
    {
      label: "Temperatura",
      value: lead.qualification?.temperature ?? null,
      icon: TrendingUp,
    },
    {
      label: "Prazo de compra",
      value: lead.qualification?.purchase_timeline ?? null,
      icon: Clock,
    },
    {
      label: "Forma de pagamento",
      value: lead.qualification?.payment_method ?? null,
      icon: FileText,
    },
    {
      label: "Faixa de valor",
      value: lead.qualification?.price_range ?? null,
      icon: TrendingUp,
    },
    {
      label: "Possui usado na troca",
      value:
        lead.qualification?.trade_in == null
          ? null
          : lead.qualification.trade_in
            ? "Sim"
            : "Não",
      icon: Car,
    },
  ];

  const metaRows: InfoRow[] = [
    {
      label: "ID do lead Meta",
      value: lead.facebook_lead_id || null,
      icon: FileText,
    },
    {
      label: "ID do formulário",
      value: lead.facebook_form_id || null,
      icon: FileText,
    },
    {
      label: "Campanha",
      value: lead.facebook_campaign_name || null,
      icon: FileText,
    },
    {
      label: "ID da campanha",
      value: lead.facebook_campaign_id || null,
      icon: FileText,
    },
    {
      label: "Conjunto de anúncios",
      value: lead.facebook_ad_set_name || null,
      icon: FileText,
    },
    {
      label: "ID do conjunto",
      value: lead.facebook_ad_set_id || null,
      icon: FileText,
    },
    { label: "Anúncio", value: lead.facebook_ad_name || null, icon: FileText },
    {
      label: "ID do anúncio",
      value: lead.facebook_ad_id || null,
      icon: FileText,
    },
    {
      label: "Canal preferido",
      value: lead.preferred_contact_channel || null,
      icon: FileText,
    },
    {
      label: "Criado na Meta",
      value: lead.source_created_at
        ? formatDateShort(lead.source_created_at)
        : null,
      icon: Clock,
    },
    {
      label: "Respostas do formulário",
      value: lead.source_payload?.todos_os_campos
        ? JSON.stringify(lead.source_payload.todos_os_campos, null, 2)
        : null,
      icon: FileText,
    },
  ];

  const sidebarRows = personalRows.slice(0, 3);

  const tabRows =
    activeTab === "pessoais"
      ? personalRows
      : activeTab === "atendimento"
        ? attendanceRows
        : activeTab === "veiculo"
          ? vehicleRows
          : activeTab === "qualificacao"
            ? qualificationRows
            : metaRows;

  return (
    <div
      // A barra de abas do celular e fixa e cobre o rodape: sem esta folga o
      // fim do modal (e o botao de fechar de quem rola ate embaixo) some.
      className="fixed inset-0 z-50 flex items-center justify-center p-4 pb-[calc(1rem+4.75rem+env(safe-area-inset-bottom))] backdrop-blur-[3px] md:pb-4"
      style={{ backgroundColor: "rgba(0,0,0,0.45)" }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={clsx(
          "flex h-full max-h-[88vh] w-full max-w-6xl flex-col overflow-hidden rounded-[28px] shadow-[0_32px_80px_rgba(0,0,0,0.28)]",
          dark ? "bg-[#0f0f0f]" : "bg-white",
        )}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* ── Header ── */}
        <div
          className={clsx(
            "flex shrink-0 items-start justify-between gap-3 px-4 py-4 sm:gap-4 sm:px-6 sm:py-5",
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
                "mt-1 truncate text-xl font-black tracking-tight sm:text-2xl",
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
            "shrink-0 px-4 py-3 sm:px-6 sm:py-4",
            dark
              ? "border-b border-[#1f1f1f] bg-[#080808]"
              : "border-b border-zinc-100 bg-zinc-50/60",
          )}
        >
          {/* A trilha rola sozinha; `min-w-0` evita que ela estique o modal. */}
          <div className="flex min-w-0 items-center overflow-x-auto pb-1 [scrollbar-width:thin]">
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
        {/* Empilha no celular: lado a lado, a coluna fixa de 340px nao deixa
            espaco para o painel da direita, que ficava cortado fora da tela. */}
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto lg:flex-row lg:overflow-hidden">
          {/* Left panel — dados do lead */}
          <aside
            className={clsx(
              "flex w-full shrink-0 flex-col lg:w-[340px] lg:overflow-y-auto",
              dark
                ? "border-b border-[#1f1f1f] bg-[#080808] lg:border-b-0 lg:border-r"
                : "border-b border-zinc-100 bg-zinc-50/40 lg:border-b-0 lg:border-r",
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
                    {sidebarRows.map(({ label, value, icon: Icon }) => (
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
          <main className="flex min-w-0 flex-1 flex-col lg:overflow-hidden">
            {/* Tabs */}
            <div
              className={clsx(
                "flex shrink-0 gap-1 border-b px-5 pt-3",
                dark ? "border-[#1f1f1f]" : "border-zinc-100",
              )}
            >
              {(
                [
                  { id: "pessoais", label: "Dados pessoais" },
                  { id: "atendimento", label: "Atendimento" },
                  { id: "qualificacao", label: "Qualificação" },
                  { id: "veiculo", label: "Veículo" },
                  { id: "meta", label: "Origem Meta" },
                  { id: "tarefas", label: "Próxima ação" },
                  { id: "historico", label: "Histórico" },
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

              {activeTab === "tarefas" && (
                <div className="space-y-5">
                  <section
                    className={clsx(
                      "rounded-2xl border p-4",
                      dark
                        ? "border-zinc-800 bg-[#111]"
                        : "border-zinc-200 bg-zinc-50",
                    )}
                  >
                    <div className="mb-4 flex items-center gap-2">
                      <Clock size={16} className="text-[#FF0636]" />
                      <h3 className="text-sm font-black">Agendar próxima ação</h3>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <select
                        value={taskType}
                        onChange={(event) =>
                          setTaskType(event.target.value as CrmTaskType)
                        }
                        className={clsx(
                          "rounded-xl border px-3 py-2.5 text-sm",
                          dark
                            ? "border-zinc-700 bg-[#0b0b0b]"
                            : "border-zinc-200 bg-white",
                        )}
                      >
                        <option value="follow_up">Retorno</option>
                        <option value="call">Ligação</option>
                        <option value="whatsapp">WhatsApp</option>
                        <option value="appointment">Agendamento</option>
                        <option value="proposal">Proposta</option>
                        <option value="other">Outra ação</option>
                      </select>
                      <input
                        type="datetime-local"
                        value={taskDueAt}
                        onChange={(event) => setTaskDueAt(event.target.value)}
                        className={clsx(
                          "rounded-xl border px-3 py-2.5 text-sm",
                          dark
                            ? "border-zinc-700 bg-[#0b0b0b]"
                            : "border-zinc-200 bg-white",
                        )}
                      />
                      <input
                        value={taskTitle}
                        onChange={(event) => setTaskTitle(event.target.value)}
                        placeholder="Ex.: retornar proposta"
                        className={clsx(
                          "rounded-xl border px-3 py-2.5 text-sm sm:col-span-2",
                          dark
                            ? "border-zinc-700 bg-[#0b0b0b]"
                            : "border-zinc-200 bg-white",
                        )}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={handleCreateTask}
                      disabled={taskSaving || !taskTitle.trim() || !taskDueAt}
                      className="mt-3 inline-flex items-center gap-2 rounded-xl bg-[#FF0636] px-4 py-2.5 text-xs font-black text-white disabled:opacity-50"
                    >
                      <Plus size={15} />
                      {taskSaving ? "Salvando…" : "Criar próxima ação"}
                    </button>
                  </section>

                  <section className="space-y-2">
                    <h3 className="text-xs font-black uppercase tracking-[0.16em]">
                      Histórico de tarefas
                    </h3>
                    {tasksLoading ? (
                      <p className="py-4 text-sm text-zinc-500">Carregando…</p>
                    ) : tasks.length === 0 ? (
                      <p className="rounded-2xl border border-dashed p-5 text-sm text-zinc-500">
                        Nenhuma próxima ação cadastrada.
                      </p>
                    ) : (
                      tasks.map((task) => (
                        <article
                          key={task.id}
                          className={clsx(
                            "flex items-center justify-between gap-3 rounded-2xl border p-4",
                            dark ? "border-zinc-800" : "border-zinc-200",
                            task.status !== "pending" && "opacity-55",
                          )}
                        >
                          <div className="min-w-0">
                            <p className="truncate text-sm font-bold">{task.title}</p>
                            <p className="mt-1 text-xs text-zinc-500">
                              {new Date(task.due_at).toLocaleString("pt-BR")} · {task.assigned_user?.name ?? "Sem responsável"}
                            </p>
                          </div>
                          {task.status === "pending" ? (
                            <button
                              type="button"
                              onClick={() => handleCompleteTask(task.id)}
                              className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-emerald-500 px-3 py-2 text-xs font-black text-white"
                            >
                              <Check size={14} /> Concluir
                            </button>
                          ) : (
                            <span className="text-xs font-bold text-emerald-500">Concluída</span>
                          )}
                        </article>
                      ))
                    )}
                  </section>
                </div>
              )}

              {activeTab === "qualificacao" && editing && (
                <div className="grid gap-4 sm:grid-cols-2">
                  {[
                    [
                      "Categoria de interesse",
                      "interest_category",
                      ["novo", "seminovo", "pcd", "venda_direta", "assinatura"],
                    ],
                    ["Temperatura", "temperature", ["quente", "morno", "frio"]],
                  ].map(([label, key, options]) => (
                    <label
                      key={String(key)}
                      className="space-y-1 text-xs font-semibold"
                    >
                      {String(label)}
                      <select
                        value={String(
                          editQualification[
                            key as keyof typeof editQualification
                          ] ?? "",
                        )}
                        onChange={(event) =>
                          setEditQualification((current) => ({
                            ...current,
                            [String(key)]: event.target.value || undefined,
                          }))
                        }
                        className={clsx(
                          "w-full rounded-xl border px-3 py-2.5",
                          dark
                            ? "border-zinc-700 bg-[#111]"
                            : "border-zinc-200 bg-white",
                        )}
                      >
                        <option value="">Não informado</option>
                        {(options as string[]).map((option) => (
                          <option key={option} value={option}>
                            {option.replace(/_/g, " ")}
                          </option>
                        ))}
                      </select>
                    </label>
                  ))}
                  {[
                    ["Modelo desejado", "desired_model"],
                    ["Prazo de compra", "purchase_timeline"],
                    ["Forma de pagamento", "payment_method"],
                    ["Faixa de valor", "price_range"],
                  ].map(([label, key]) => (
                    <label
                      key={key}
                      className="space-y-1 text-xs font-semibold"
                    >
                      {label}
                      <input
                        value={String(
                          editQualification[
                            key as keyof typeof editQualification
                          ] ?? "",
                        )}
                        onChange={(event) =>
                          setEditQualification((current) => ({
                            ...current,
                            [key]: event.target.value,
                          }))
                        }
                        className={clsx(
                          "w-full rounded-xl border px-3 py-2.5",
                          dark
                            ? "border-zinc-700 bg-[#111]"
                            : "border-zinc-200 bg-white",
                        )}
                      />
                    </label>
                  ))}
                  <label className="flex items-center gap-3 rounded-xl border p-3 text-sm sm:col-span-2">
                    <input
                      type="checkbox"
                      checked={editQualification.trade_in ?? false}
                      onChange={(event) =>
                        setEditQualification((current) => ({
                          ...current,
                          trade_in: event.target.checked,
                        }))
                      }
                    />
                    Possui veículo usado na troca
                  </label>
                </div>
              )}

              {activeTab !== "historico" &&
                activeTab !== "tarefas" &&
                !(activeTab === "qualificacao" && editing) && (
                  <div className="grid gap-3 sm:grid-cols-2">
                    {tabRows.map(({ label, value, icon: Icon }) => (
                      <div
                        key={label}
                        className={clsx(
                          "rounded-2xl border p-4",
                          dark
                            ? "border-[#242424] bg-[#111]"
                            : "border-zinc-100 bg-zinc-50/70",
                          label === "Respostas do formulário" &&
                            "sm:col-span-2",
                        )}
                      >
                        <div className="flex items-center gap-2">
                          <Icon
                            size={14}
                            className={dark ? "text-zinc-500" : "text-zinc-400"}
                          />
                          <p
                            className={clsx(
                              "text-[10px] font-semibold uppercase tracking-[0.14em]",
                              dark ? "text-zinc-500" : "text-zinc-400",
                            )}
                          >
                            {label}
                          </p>
                        </div>
                        {label === "Respostas do formulário" && value ? (
                          <pre
                            className={clsx(
                              "mt-3 max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-xl p-3 text-[12px] leading-5",
                              dark
                                ? "bg-black/30 text-zinc-300"
                                : "bg-white text-zinc-700",
                            )}
                          >
                            {value}
                          </pre>
                        ) : (
                          <p
                            className={clsx(
                              "mt-3 break-words text-[13px] font-medium leading-5",
                              value
                                ? dark
                                  ? "text-zinc-100"
                                  : "text-zinc-900"
                                : dark
                                  ? "text-zinc-600"
                                  : "text-zinc-400",
                            )}
                          >
                            {value ?? "—"}
                          </p>
                        )}
                      </div>
                    ))}

                    {activeTab === "atendimento" && lead.notes && (
                      <div
                        className={clsx(
                          "rounded-2xl border p-4 sm:col-span-2",
                          dark
                            ? "border-[#242424] bg-[#111]"
                            : "border-zinc-100 bg-zinc-50/70",
                        )}
                      >
                        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-400">
                          Observações
                        </p>
                        <p
                          className={clsx(
                            "mt-3 whitespace-pre-wrap text-[13px] leading-6",
                            dark ? "text-zinc-300" : "text-zinc-700",
                          )}
                        >
                          {lead.notes}
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
