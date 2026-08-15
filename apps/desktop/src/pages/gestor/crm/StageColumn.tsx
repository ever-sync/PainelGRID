import {
  memo,
  useRef,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent,
  type WheelEvent as ReactWheelEvent,
} from "react";
import { useNavigate } from "react-router-dom";
import clsx from "clsx";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import {
  CalendarDays,
  Clock,
  GripVertical,
  MessageCircle,
  Phone,
  Square,
  CheckSquare,
  Target,
} from "lucide-react";
import { ConfirmationBadge, SourceBadge } from "../../../components/ui/Badge";
import type { Lead } from "../../../types";
import type { KanbanColumn } from "../../../lib/crm-kanban";
import {
  formatCrmDate as formatDate,
  formatStageLeadCount,
} from "../crm-page.model";
import {
  STAGE_AGE_CRITICAL_DAYS,
  STAGE_AGE_WARNING_DAYS,
  stageAgeInDays,
  type LeadMotionKind,
  type StageMotionKind,
} from "./crm-view";
import { formatDateFull } from "./crm-timeline";

export const LeadCard = memo(function LeadCard({
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
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    isDragging,
  } = useDraggable({
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

  const stageAgeDays = stageAgeInDays(lead);

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
      role="group"
      tabIndex={0}
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
        {(!selectionMode || selected) && (
          <button
            ref={setActivatorNodeRef}
            type="button"
            data-crm-drag-handle
            {...attributes}
            {...listeners}
            onClick={(event) => event.stopPropagation()}
            aria-label={`Mover ${lead.name} para outra etapa`}
            title="Arrastar lead"
            className={clsx(
              "mt-0.5 inline-flex h-7 w-6 shrink-0 cursor-grab items-center justify-center rounded-md transition-colors active:cursor-grabbing",
              dark
                ? "text-zinc-600 hover:bg-zinc-800 hover:text-zinc-300"
                : "text-zinc-300 hover:bg-zinc-100 hover:text-zinc-600",
            )}
          >
            <GripVertical size={15} />
          </button>
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
        {stageAgeDays !== null && stageAgeDays >= 1 && (
          <div
            className={clsx(
              "flex items-center gap-1.5 font-semibold",
              stageAgeDays >= STAGE_AGE_CRITICAL_DAYS
                ? "text-[#FF0636]"
                : stageAgeDays >= STAGE_AGE_WARNING_DAYS
                  ? "text-amber-500"
                  : dark
                    ? "text-zinc-500"
                    : "text-zinc-400",
            )}
            title={`Nesta etapa desde ${formatDateFull(lead.crm_stage_since)}`}
          >
            <Clock size={10} className="shrink-0" />
            <span>
              {stageAgeDays === 1
                ? "1 dia nesta etapa"
                : `${stageAgeDays} dias nesta etapa`}
            </span>
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

/** Placeholder de card enquanto a primeira pagina de leads nao chega. Evita a
 *  etapa parecer vazia durante o carregamento. */
function LeadCardSkeleton({
  dark,
  dense,
}: {
  dark?: boolean;
  dense?: boolean;
}) {
  const bar = dark ? "bg-[#1c1c1c]" : "bg-zinc-100";
  return (
    <div
      aria-hidden="true"
      className={clsx(
        "shrink-0 animate-pulse rounded-[18px] border p-3.5",
        dense ? "space-y-2" : "space-y-2.5",
        dark ? "border-[#1a1a1a] bg-[#0d0d0d]" : "border-zinc-100 bg-white",
      )}
    >
      <div className={clsx("h-3 w-2/3 rounded-full", bar)} />
      <div className={clsx("h-2.5 w-1/2 rounded-full", bar)} />
      {!dense && (
        <div className="flex gap-1.5">
          <div className={clsx("h-4 w-16 rounded-full", bar)} />
          <div className={clsx("h-4 w-12 rounded-full", bar)} />
        </div>
      )}
    </div>
  );
}

export function StageColumn({
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
  loading,
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
  /** Board ainda carregando: etapa vazia mostra esqueleto, nao "Nenhum lead". */
  loading?: boolean;
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
        // O piso de 36rem vale no desktop; no celular ele deixava a coluna
        // vazia com 576px de altura, empurrando o resto da tela.
        "h-[calc(100vh-11.5rem)] md:min-h-[36rem]",
        fillHeight
          ? "w-[272px] shrink-0 md:h-full md:max-h-full md:min-h-0"
          : "w-full min-w-0 max-w-full",
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
          {leads.length === 0 &&
            loading &&
            [0, 1, 2].map((index) => (
              <LeadCardSkeleton key={index} dark={dark} dense={dense} />
            ))}
          {leads.length === 0 && !loading && (
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
