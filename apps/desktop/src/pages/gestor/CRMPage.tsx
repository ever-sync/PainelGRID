import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import clsx from "clsx";
import {
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  ArrowDownWideNarrow,
  Check,
  CheckSquare,
  ChevronDown,
  Filter,
  Layers,
  Loader2,
  Search,
  X,
  GripVertical,
  KanbanSquare,
  LayoutGrid,
  List,
  EyeOff,
} from "lucide-react";
import { Card } from "../../components/ui/Card";
import { ConfirmationBadge, SourceBadge } from "../../components/ui/Badge";
import type { Client, Lead, User } from "../../types";
import { readStoredSession } from "../../services/auth";
import {
  listClients,
  mapApiClientToClient,
  onlyActiveClients,
} from "../../services/clients";
import {
  bulkMoveCrmLeads,
  createCrmPipeline,
  getCrmStageCounts,
  listCrmPipelines,
  listPipelineStages,
  moveCrmLead,
  type ApiCrmStage,
} from "../../services/crm";
import { fetchAllLeads, getLead, mapApiLeadToLead } from "../../services/leads";
import { HttpError } from "../../services/http";
import {
  apiStagesToColumns,
  clientIdToPipelineCode,
  defaultKanbanStages,
  distributeLeadsByStageId,
  pickDefaultPipeline,
  stageCodeById,
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
  CRM_SOURCE_OPTIONS as SOURCE_OPTIONS,
  formatStageLeadCount,
  isUuid,
  removeLeadFromBoard,
  upsertLeadInBoard,
} from "./crm-page.model";

import {
  CARD_SORT_OPTIONS,
  CARD_SORT_STORAGE_KEY,
  compareLeads,
  useIsMobileViewport,
  type CardSort,
  type ConfirmationFilter,
  type LeadMotionKind,
  type StageFilter,
  type StageMotionKind,
  type Toast,
  type ViewMode,
} from "./crm/crm-view";
import {} from "./crm/crm-timeline";
import { ToastStack } from "./crm/ToastStack";

import { LeadDetailModal } from "./crm/LeadDetailModal";

import { StageColumn } from "./crm/StageColumn";

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

  /** Desfazer de uma movimentacao em massa: os leads podem ter vindo de etapas
   *  diferentes, entao a volta e um bulk move por etapa de origem. */
  const undoBulkMove = async (stageByLeadId: Record<string, string>) => {
    const accessToken = readStoredSession()?.accessToken;
    if (!accessToken || !apiPipelineCode) {
      showToast("Sem sessao valida — nao foi possivel desfazer.", "error");
      return;
    }

    const byOriginStage = new Map<string, string[]>();
    for (const [leadId, stageId] of Object.entries(stageByLeadId)) {
      const group = byOriginStage.get(stageId) ?? [];
      group.push(leadId);
      byOriginStage.set(stageId, group);
    }

    let restored = 0;
    for (const [stageId, leadIds] of byOriginStage) {
      const stageCode = stageCodeById(apiStages, stageId);
      if (!stageCode) continue;
      markSelfMoved(leadIds);
      try {
        const result = await bulkMoveCrmLeads(
          {
            lead_ids: leadIds,
            pipeline_code: apiPipelineCode,
            stage_code: stageCode,
            source: "desktop_undo",
          },
          accessToken,
        );
        restored += result.moved;
      } catch {
        // Segue para as outras etapas; o total no fim conta o que voltou.
      }
    }

    showToast(
      restored > 0
        ? `${restored} de ${Object.keys(stageByLeadId).length} leads devolvidos para a etapa de origem.`
        : "Falha ao desfazer a movimentacao em massa.",
      restored > 0 ? "success" : "error",
    );
    // Volta em varias etapas de uma vez: um resync e mais simples (e mais
    // seguro) do que remontar o board otimista etapa por etapa.
    refreshBoard();
  };

  /** Acao "Desfazer" do toast para movimentacoes em massa. */
  const buildBulkUndoAction = (
    stageByLeadId: Record<string, string>,
  ): Toast["action"] => {
    const restorable = Object.fromEntries(
      Object.entries(stageByLeadId).filter(([, stageId]) =>
        kanbanColumns.some((stage) => stage.id === stageId),
      ),
    );
    if (Object.keys(restorable).length === 0) return undefined;
    return {
      label: "Desfazer",
      onAction: () => void undoBulkMove(restorable),
    };
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

    // Etapa de origem de cada selecionado, capturada antes do move: e o que
    // permite oferecer o desfazer depois.
    const originStageByLeadId: Record<string, string> = {};
    for (const stage of kanbanColumns) {
      if (stage.id === bulkTargetStageId) continue;
      for (const lead of boardState[stage.id] ?? []) {
        if (selectedLeadIds.has(lead.id)) {
          originStageByLeadId[lead.id] = stage.id;
        }
      }
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
        result.moved > 0 ? buildBulkUndoAction(originStageByLeadId) : undefined,
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
        const mapped = onlyActiveClients(rows.map(mapApiClientToClient));
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

    // Carrega todos os cards e a contagem oficial antes de publicar o novo
    // estado. Atualizar a cada pagina fazia os badges oscilarem durante o fetch.
    void Promise.all([
      fetchAllLeads(
        {
          client_id: selectedClient,
          search: searchTermRef.current || undefined,
        },
        accessToken,
        { signal: abort.signal },
      ),
      getCrmStageCounts(selectedClient, accessToken).catch(() => null),
    ])
      .then(([rows, stageCountResult]) => {
        if (!active || abort.signal.aborted) return;
        const mappedRows = rows.map(mapApiLeadToLead);
        const nextBoard = distributeLeadsByStageId(mappedRows, apiStages);

        setBoardState(nextBoard);
        setStageCounts(
          stageCountResult?.counts ??
            Object.fromEntries(
              apiStages.map((stage) => [
                stage.id,
                nextBoard[stage.id]?.length ?? 0,
              ]),
            ),
        );
      })
      .catch((error) => {
        if (!active || abort.signal.aborted) return;
        if (error instanceof DOMException && error.name === "AbortError")
          return;
        // Conserva o ultimo quadro confirmado. Zerar os cards em uma falha
        // temporaria tambem fazia os totais parecerem mudar sem alteracao real.
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

        // Auto-cria o pipeline padrão atualizado se ainda não existir.
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
                  name: "Tentativa 2 - Email",
                  code: `${idBase}_TENTATIVA_2_EMAIL`,
                  display_order: 5,
                  color: "#0EA5E9",
                },
                {
                  name: "Em contato",
                  code: `${idBase}_EM_CONTATO`,
                  display_order: 6,
                  color: "#7C3AED",
                },
                {
                  name: "Pré-agendamento",
                  code: `${idBase}_PRE_AGENDAMENTO`,
                  display_order: 7,
                  color: "#6366F1",
                },
                {
                  name: "Presença agendada",
                  code: `${idBase}_PRESENCA_AGENDADA`,
                  display_order: 8,
                  color: "#10B981",
                },
                {
                  name: "TEMP",
                  code: `${idBase}_TEMP`,
                  display_order: 9,
                  color: "#06B6D4",
                },
                {
                  name: "Enviar confirmação",
                  code: `${idBase}_ENVIAR_CONFIRMACAO`,
                  display_order: 10,
                  color: "#3D56A2",
                },
                {
                  name: "Leads Agendados - Confirmados",
                  code: `${idBase}_AGENDADOS_CONFIRMADOS`,
                  display_order: 11,
                  color: "#2563EB",
                },
                {
                  name: "Presença reagendada",
                  code: `${idBase}_PRESENCA_REAGENDADA`,
                  display_order: 12,
                  color: "#F59E0B",
                },
                {
                  name: "Presença cancelada",
                  code: `${idBase}_PRESENCA_CANCELADA`,
                  display_order: 13,
                  color: "#EF4444",
                },
                {
                  name: "Lembrete - Ainda dá tempo!",
                  code: `${idBase}_LEMBRETE`,
                  display_order: 14,
                  color: "#22D3EE",
                },
                {
                  name: "Perdido na Cadência",
                  code: `${idBase}_PERDIDO_CADENCIA`,
                  display_order: 15,
                  color: "#6B7280",
                  is_final_stage: true,
                },
                {
                  name: "Desinteresse",
                  code: `${idBase}_DESINTERESSE`,
                  display_order: 16,
                  color: "#F97316",
                  is_final_stage: true,
                },
                {
                  name: "Aguardando",
                  code: `${idBase}_AGUARDANDO`,
                  display_order: 17,
                  color: "#9CA3AF",
                },
                {
                  name: "Presença confirmada",
                  code: `${idBase}_PRESENCA_CONFIRMADA`,
                  display_order: 18,
                  color: "#059669",
                  is_final_stage: true,
                },
                {
                  name: "Lead perdido",
                  code: `${idBase}_LEAD_PERDIDO`,
                  display_order: 19,
                  color: "#4B5563",
                  is_final_stage: true,
                },
                {
                  name: "Lead ausente",
                  code: `${idBase}_LEAD_AUSENTE`,
                  display_order: 20,
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
    // Deps propositalmente limitadas a selectedClient: o efeito so precisa
    // refazer a carga quando o cliente muda.
  }, [selectedClient]);

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
        const originStageByLeadId: Record<string, string> = {};
        for (const leadId of movedIds) {
          const from = originalStageById[leadId];
          if (from) originStageByLeadId[leadId] = from;
        }
        showToast(
          `${result.moved} de ${result.total} leads movidos para ${targetColumn?.label ?? "nova etapa"}.`,
          result.moved > 0 ? "success" : "info",
          result.moved > 0
            ? buildBulkUndoAction(originStageByLeadId)
            : undefined,
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
        // `min-w-0` e `max-w-full`: sem eles, uma coluna ou um card largo
        // estica a raiz e a pagina toda passa a rolar na horizontal.
        "flex min-w-0 max-w-full flex-col gap-6",
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
              {boardLoading && (
                <span
                  className={clsx(
                    "inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide",
                    isDarkMode
                      ? "bg-[#1a1a1a] text-zinc-400"
                      : "bg-zinc-100 text-zinc-500",
                  )}
                >
                  <Loader2 size={11} className="animate-spin" />
                  Carregando
                </span>
              )}
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
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
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
                  loading={boardLoading}
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
            <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
              <div className="flex min-w-0 gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:thin]">
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
                  loading={boardLoading}
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
                    loading={boardLoading}
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
