import { useMemo } from "react";
import clsx from "clsx";
import { CalendarDays, Mail, Phone, Target } from "lucide-react";
import { Drawer } from "../ui/Modal";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import { Select } from "../ui/Select";
import { Badge, ConfirmationBadge, SourceBadge, StageBadge } from "../ui/Badge";
import type { ApiCrmPipeline, ApiCrmStage } from "../../services/crm";
import type { Event, Lead } from "../../types";

export type LeadStatusValue =
  "pending" | "scheduled" | "confirmed" | "checked_in" | "cancelled";

export type LeadDrawerDraft = {
  name: string;
  phone: string;
  email: string;
  pipelineId: string;
  stageId: string;
  eventId: string;
  date: string;
  time: string;
  status: LeadStatusValue;
  source: Lead["source"];
};

type LeadLifecycleStatus = "novo" | "agendado" | "confirmado" | "compareceu";

const LEAD_STATUS_OPTIONS: Array<{ value: LeadStatusValue; label: string }> = [
  { value: "pending", label: "Novo lead" },
  { value: "scheduled", label: "Agendado" },
  { value: "confirmed", label: "Confirmado" },
  { value: "checked_in", label: "Compareceu" },
  { value: "cancelled", label: "Cancelado" },
];

const LEAD_SOURCE_OPTIONS: Array<{ value: Lead["source"]; label: string }> = [
  { value: "whatsapp", label: "WhatsApp" },
  { value: "form_page", label: "Formulário" },
  { value: "facebook_ads", label: "Meta" },
  { value: "manual", label: "Manual" },
  { value: "import_excel", label: "Importação Excel" },
];

const PIPELINE_STAGE_LABELS: Record<string, string> = {
  novo: "Novo lead",
  contactado: "Contactado",
  agendado: "Agendado",
  convertido: "Convertido",
  perdido: "Perdido",
};

function formatDateInputValue(date: string | null | undefined) {
  if (!date) return "";
  const parsed = new Date(date);
  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const day = String(parsed.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatTimeInputValue(date: string | null | undefined) {
  if (!date) return "";
  const parsed = new Date(date);
  const hours = String(parsed.getHours()).padStart(2, "0");
  const minutes = String(parsed.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

function combineDateTime(dateValue: string, timeValue: string) {
  if (!dateValue) return null;
  const time = timeValue || "00:00";
  const combined = new Date(`${dateValue}T${time}:00`);
  return Number.isNaN(combined.getTime()) ? null : combined.toISOString();
}

function hashName(name: string) {
  let hash = 0;
  for (let index = 0; index < name.length; index += 1) {
    hash = (hash * 31 + name.charCodeAt(index)) | 0;
  }
  return Math.abs(hash);
}

function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function getLeadLifecycleStatus(
  lead: Lead,
  status: LeadStatusValue,
): LeadLifecycleStatus {
  if (status === "checked_in") return "compareceu";
  if (status === "confirmed") return "confirmado";
  if (status === "scheduled" || lead.crm_stage === "agendado")
    return "agendado";
  return "novo";
}

function lifecycleBadgeColor(status: LeadLifecycleStatus) {
  switch (status) {
    case "agendado":
      return "orange";
    case "confirmado":
      return "green";
    case "compareceu":
      return "blue";
    default:
      return "gray";
  }
}

function lifecycleLabel(status: LeadLifecycleStatus) {
  switch (status) {
    case "agendado":
      return "Agendado";
    case "confirmado":
      return "Confirmado";
    case "compareceu":
      return "Compareceu";
    default:
      return "Novo lead";
  }
}

export function leadDrawerStatusFromLead(lead: Lead): LeadStatusValue {
  if (lead.confirmation_status === "scheduled") return "scheduled";
  if (lead.confirmation_status === "confirmed") return "confirmed";
  if (lead.confirmation_status === "checked_in") return "checked_in";
  if (lead.confirmation_status === "cancelled") return "cancelled";
  return "pending";
}

export function makeLeadDrawerDraft(lead: Lead): LeadDrawerDraft {
  return {
    name: lead.name,
    phone: lead.phone,
    email: lead.email,
    pipelineId: lead.crm_pipeline_id ?? "",
    stageId: lead.crm_stage_id ?? "",
    eventId: lead.event_id ?? "",
    date: formatDateInputValue(lead.store_visit_datetime),
    time: formatTimeInputValue(lead.store_visit_datetime),
    status: leadDrawerStatusFromLead(lead),
    source: lead.source,
  };
}

export function combineLeadDrawerDateTime(draft: LeadDrawerDraft) {
  return combineDateTime(draft.date, draft.time);
}

function toneForName(name: string) {
  const hues = [
    "from-[#3d56a2] to-[#7c3aed]",
    "from-[#0f766e] to-[#14b8a6]",
    "from-[#b45309] to-[#f59e0b]",
  ];
  return hues[hashName(name) % hues.length];
}

interface LeadDrawerProps {
  open: boolean;
  dark: boolean;
  lead: Lead | null;
  pipelines: ApiCrmPipeline[];
  pipelineStages: ApiCrmStage[];
  events: Event[];
  draft: LeadDrawerDraft;
  saving: boolean;
  onClose: () => void;
  onDraftChange: (patch: Partial<LeadDrawerDraft>) => void;
  onSave: () => void;
}

export function LeadDrawer({
  open,
  dark,
  lead,
  pipelines,
  pipelineStages,
  events,
  draft,
  saving,
  onClose,
  onDraftChange,
  onSave,
}: LeadDrawerProps) {
  const leadLifecycle = lead
    ? getLeadLifecycleStatus(lead, draft.status)
    : "novo";
  const selectedEventLabel = useMemo(() => {
    if (!lead) return "Nenhum evento";
    if (!draft.eventId) return lead.event_interest || "Nenhum evento";
    return (
      events.find((event) => event.id === draft.eventId)?.name ??
      lead.event_interest ??
      "Nenhum evento"
    );
  }, [draft.eventId, events, lead]);

  const hasChanges = useMemo(() => {
    if (!lead) return false;
    const date = formatDateInputValue(lead.store_visit_datetime);
    const time = formatTimeInputValue(lead.store_visit_datetime);
    return (
      draft.name.trim() !== lead.name.trim() ||
      draft.phone.trim() !== lead.phone.trim() ||
      draft.email.trim() !== lead.email.trim() ||
      draft.pipelineId !== (lead.crm_pipeline_id ?? "") ||
      draft.stageId !== (lead.crm_stage_id ?? "") ||
      draft.eventId !== (lead.event_id ?? "") ||
      draft.date !== date ||
      draft.time !== time ||
      draft.status !== leadDrawerStatusFromLead(lead) ||
      draft.source !== lead.source
    );
  }, [draft, lead]);

  const pipelineOptions = useMemo(
    () =>
      pipelines.map((pipeline) => ({
        value: pipeline.id,
        label: pipeline.name,
      })),
    [pipelines],
  );

  const stageOptions = useMemo(
    () =>
      pipelineStages.map((stage) => ({
        value: stage.id,
        label: stage.name || PIPELINE_STAGE_LABELS[stage.code] || "Etapa",
      })),
    [pipelineStages],
  );

  const eventOptions = useMemo(
    () =>
      events.map((event) => ({
        value: event.id,
        label: event.name,
      })),
    [events],
  );

  if (!lead) return null;

  const avatarText = initials(lead.name);
  const avatarTone = toneForName(lead.name);

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Ficha do lead"
      width="w-[420px]"
      dark={dark}
    >
      <div className="flex h-full min-h-0 flex-col">
        <div className="space-y-5">
          <div
            className={clsx(
              "flex items-center gap-4 rounded-2xl border p-4",
              dark
                ? "border-zinc-800 bg-[#121212]"
                : "border-gray-100 bg-gray-50",
            )}
          >
            <div
              className={clsx(
                "flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-gradient-to-br text-lg font-semibold text-white shadow-sm",
                avatarTone,
              )}
            >
              {avatarText}
            </div>
            <div className="min-w-0">
              <p
                className={clsx(
                  "text-xs uppercase tracking-[0.14em]",
                  dark ? "text-zinc-500" : "text-gray-500",
                )}
              >
                Foto
              </p>
              <p
                className={clsx(
                  "mt-1 truncate text-base font-semibold",
                  dark ? "text-zinc-100" : "text-gray-900",
                )}
              >
                {lead.name}
              </p>
              <p
                className={clsx(
                  "truncate text-sm",
                  dark ? "text-zinc-400" : "text-gray-500",
                )}
              >
                {lead.phone || "Telefone não informado"}
              </p>
            </div>
          </div>

          <div
            className={clsx(
              "flex items-center justify-between rounded-2xl border px-4 py-3",
              dark
                ? "border-zinc-800 bg-[#121212]"
                : "border-gray-100 bg-white",
            )}
          >
            <div>
              <p
                className={clsx(
                  "text-xs uppercase tracking-[0.14em]",
                  dark ? "text-zinc-500" : "text-gray-500",
                )}
              >
                Status do lead
              </p>
              <p
                className={clsx(
                  "mt-1 text-sm",
                  dark ? "text-zinc-300" : "text-gray-600",
                )}
              >
                Separado da confirmação para evitar ambiguidade no fluxo.
              </p>
            </div>
            <Badge variant={lifecycleBadgeColor(leadLifecycle)} dot>
              {lifecycleLabel(leadLifecycle)}
            </Badge>
          </div>

          <div className="grid gap-3">
            <Input
              label="Nome"
              value={draft.name}
              onChange={(event) => onDraftChange({ name: event.target.value })}
              dark={dark}
            />
            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Telefone"
                value={draft.phone}
                onChange={(event) =>
                  onDraftChange({ phone: event.target.value })
                }
                dark={dark}
              />
              <Input
                label="E-mail"
                type="email"
                value={draft.email}
                onChange={(event) =>
                  onDraftChange({ email: event.target.value })
                }
                dark={dark}
              />
            </div>

            <Select
              label="Pipeline"
              value={draft.pipelineId}
              onChange={(event) =>
                onDraftChange({ pipelineId: event.target.value, stageId: "" })
              }
              options={pipelineOptions}
              placeholder="Selecione uma pipeline"
              dark={dark}
            />

            <Select
              label="Etapa da pipeline"
              value={draft.stageId}
              onChange={(event) =>
                onDraftChange({ stageId: event.target.value })
              }
              options={stageOptions}
              placeholder={
                draft.pipelineId
                  ? "Selecione uma etapa"
                  : "Escolha uma pipeline primeiro"
              }
              disabled={!draft.pipelineId}
              dark={dark}
            />

            <Select
              label="Evento de interesse"
              value={draft.eventId}
              onChange={(event) =>
                onDraftChange({ eventId: event.target.value })
              }
              options={eventOptions}
              placeholder="Selecione um evento"
              dark={dark}
            />

            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Data"
                type="date"
                value={draft.date}
                onChange={(event) =>
                  onDraftChange({ date: event.target.value })
                }
                dark={dark}
              />
              <Input
                label="Período"
                type="time"
                value={draft.time}
                onChange={(event) =>
                  onDraftChange({ time: event.target.value })
                }
                dark={dark}
              />
            </div>

            <Select
              label="Status de confirmação"
              value={draft.status}
              onChange={(event) =>
                onDraftChange({ status: event.target.value as LeadStatusValue })
              }
              options={LEAD_STATUS_OPTIONS}
              dark={dark}
            />
            <p
              className={clsx(
                "text-xs",
                dark ? "text-zinc-500" : "text-gray-500",
              )}
            >
              Pipeline controla a etapa; confirmação controla o comparecimento.
            </p>

            <Select
              label="Origem"
              value={draft.source}
              onChange={(event) =>
                onDraftChange({ source: event.target.value as Lead["source"] })
              }
              options={LEAD_SOURCE_OPTIONS}
              dark={dark}
            />

            <div
              className={clsx(
                "grid gap-2 rounded-2xl border p-4",
                dark
                  ? "border-zinc-800 bg-[#121212]"
                  : "border-gray-100 bg-white",
              )}
            >
              <div className="flex items-center justify-between gap-3">
                <span
                  className={clsx(
                    "text-sm",
                    dark ? "text-zinc-400" : "text-gray-500",
                  )}
                >
                  Origem
                </span>
                <SourceBadge source={draft.source} />
              </div>
              <div className="flex items-center justify-between gap-3">
                <span
                  className={clsx(
                    "text-sm",
                    dark ? "text-zinc-400" : "text-gray-500",
                  )}
                >
                  Etapa atual
                </span>
                <StageBadge stage={lead.crm_stage} />
              </div>
              <div className="flex items-center justify-between gap-3">
                <span
                  className={clsx(
                    "text-sm",
                    dark ? "text-zinc-400" : "text-gray-500",
                  )}
                >
                  Confirmação
                </span>
                <ConfirmationBadge status={lead.confirmation_status} />
              </div>
              <div className="flex items-center justify-between gap-3">
                <span
                  className={clsx(
                    "text-sm",
                    dark ? "text-zinc-400" : "text-gray-500",
                  )}
                >
                  Data e período
                </span>
                <span
                  className={clsx(
                    "inline-flex items-center gap-1 text-sm",
                    dark ? "text-zinc-300" : "text-gray-600",
                  )}
                >
                  <CalendarDays size={14} />
                  {draft.date
                    ? `${draft.date}${draft.time ? ` ${draft.time}` : ""}`
                    : "Sem agendamento"}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span
                  className={clsx(
                    "text-sm",
                    dark ? "text-zinc-400" : "text-gray-500",
                  )}
                >
                  Contato
                </span>
                <span
                  className={clsx(
                    "inline-flex items-center gap-1 text-sm",
                    dark ? "text-zinc-300" : "text-gray-600",
                  )}
                >
                  <Phone size={14} />
                  {lead.phone || "Sem telefone"}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span
                  className={clsx(
                    "text-sm",
                    dark ? "text-zinc-400" : "text-gray-500",
                  )}
                >
                  E-mail
                </span>
                <span
                  className={clsx(
                    "inline-flex items-center gap-1 text-sm",
                    dark ? "text-zinc-300" : "text-gray-600",
                  )}
                >
                  <Mail size={14} />
                  {lead.email || "Sem e-mail"}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span
                  className={clsx(
                    "text-sm",
                    dark ? "text-zinc-400" : "text-gray-500",
                  )}
                >
                  Evento
                </span>
                <span
                  className={clsx(
                    "inline-flex items-center gap-1 text-sm",
                    dark ? "text-zinc-300" : "text-gray-600",
                  )}
                >
                  <Target size={14} />
                  {selectedEventLabel}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span
                  className={clsx(
                    "text-sm",
                    dark ? "text-zinc-400" : "text-gray-500",
                  )}
                >
                  Status operacional
                </span>
                <Badge variant={lifecycleBadgeColor(leadLifecycle)}>
                  {lifecycleLabel(leadLifecycle)}
                </Badge>
              </div>
            </div>
          </div>
        </div>

        <div
          className={clsx(
            "mt-auto flex items-center justify-end gap-3 border-t pt-4",
            dark ? "border-zinc-800" : "border-gray-100",
          )}
        >
          <Button variant="secondary" onClick={onClose} isDisabled={saving}>
            Cancelar
          </Button>
          <Button
            onClick={onSave}
            loading={saving}
            isDisabled={
              !draft.name.trim() ||
              !hasChanges ||
              (draft.pipelineId !== "" && !draft.stageId)
            }
          >
            Salvar alterações
          </Button>
        </div>
      </div>
    </Drawer>
  );
}
