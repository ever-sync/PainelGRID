import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { useSearchParams } from "react-router-dom";
import clsx from "clsx";
import type { Socket } from "socket.io-client";
import {
  ArrowLeft,
  CalendarDays,
  Contact,
  Folder,
  Images,
  ListOrdered,
  Mic,
  Paperclip,
  SendHorizontal,
  SmilePlus,
  Sparkles,
  Square,
  X,
} from "lucide-react";
import {
  DASHBOARD_DARK_CHANGE_EVENT,
  readDashboardDarkEnabled,
} from "../../lib/dashboard-dark-mode";
import { readStoredSession } from "../../services/auth";
import {
  listClients,
  mapApiClientToClient,
  onlyActiveClients,
} from "../../services/clients";
import {
  listCrmPipelines,
  listPipelineStages,
  type ApiCrmPipeline,
  type ApiCrmStage,
} from "../../services/crm";
import {
  type ApiMessage,
  CONVERSATIONS_PAGE_SIZE,
  conversationFromListRow,
  ensureConversation,
  listConversations,
  listMessages,
  mapApiMessagesToMessages,
  postConversationMedia,
  postConversationMessage,
} from "../../services/conversations";
import { listEvents, mapApiEventToEvent } from "../../services/events";
import {
  connectRealtime,
  type RealtimeNewMessageEvent,
} from "../../services/realtime";
import {
  getLead,
  listLeads,
  mapApiLeadToLead,
  updateLead,
} from "../../services/leads";
import { pushToast } from "../../components/ui/Toast";
import type { Client, Conversation, Event, Lead, Message } from "../../types";
import { useGestorClient } from "../../hooks/useGestorClient";
import {
  ConversationSidebar,
  ChatThread,
} from "../../components/chat/ChatPanels";
import {
  LeadDrawer,
  makeLeadDrawerDraft,
  combineLeadDrawerDateTime,
  type LeadDrawerDraft,
} from "../../components/chat/LeadDrawer";
import { confirmationStatusFromLeadDrawer } from "../../components/chat/lead-drawer.model";

type ViewFilter = "all" | "unread" | "whatsapp" | "internal";
type ComposeModal = "contact" | "poll" | "event" | null;

const QUICK_REPLIES = [
  {
    id: "local",
    label: "📍 Confirmar Local",
    text: "Olá! Confirmando o local do nosso evento. Segue o endereço no mapa:",
  },
  {
    id: "horario",
    label: "⏰ Lembrete de Horário",
    text: "Olá! Lembrando que o seu agendamento está confirmado para hoje. Contamos com a sua presença!",
  },
  {
    id: "checkin",
    label: "📋 Link de Convite",
    text: "Aqui está o seu código de check-in para entrada rápida no evento:",
  },
  {
    id: "confirmacao",
    label: "✅ Confirmar Presença",
    text: "Podemos confirmar a sua presença para o evento? Por favor, responda com SIM.",
  },
];

const META_HSM_TEMPLATES = [
  {
    id: "confirmacao_evento",
    name: "Confirmação de Presença no Evento",
    category: "UTILITY",
    text: "Olá {{1}}, confirmamos a sua presença no evento {{2}}. O seu código de entrada rápida é {{3}}. Podemos te ajudar com algo mais?",
  },
  {
    id: "lembrete_agendamento",
    name: "Lembrete de Agendamento em Estande",
    category: "UTILITY",
    text: "Olá {{1}}, passando para lembrar do seu agendamento no evento {{2}} hoje às {{3}}. Aguardamos você!",
  },
  {
    id: "reativacao_lead",
    name: "Reativação de Contato & Oferta",
    category: "MARKETING",
    text: "Olá {{1}}, vimos o seu interesse durante o evento {{2}}. Temos ofertas especiais disponíveis nesta semana. Deseja receber?",
  },
];

const QUICK_EMOJIS = [
  "😀",
  "😂",
  "😍",
  "🙏",
  "👍",
  "👏",
  "🔥",
  "❤️",
  "✅",
  "🎉",
  "🤝",
  "📍",
  "⏰",
  "💬",
  "🚀",
  "⭐",
];

/** Evita mensagem duplicada quando o WebSocket confirma antes do POST responder. */
function stripFirstMatchingPendingOutbound(
  messages: Message[],
  incoming: Message,
): Message[] {
  if (incoming.sender !== "vendor") return messages;
  const pendingIdx = messages.findIndex(
    (m) =>
      m.id.startsWith("pending-") &&
      m.sender === "vendor" &&
      m.text.trim() === incoming.text.trim(),
  );
  if (pendingIdx === -1) return messages;
  return messages.filter((_, idx) => idx !== pendingIdx);
}

function stubLead(conv: Conversation, clientId: string): Lead {
  return {
    id: conv.lead_id,
    client_id: clientId,
    name: conv.lead_name,
    email: "",
    phone: "",
    source: "manual",
    crm_stage: "novo",
    crm_stage_id: null,
    crm_pipeline_id: null,
    tags: [],
    confirmation_status: "pending",
    assigned_vendor_id: null,
    registered_by_id: null,
    registered_by_name: null,
    event_interest: null,
    event_id: null,
    store_visit_datetime: null,
    notes: "",
    checkin_token: null,
    checkin_voucher: null,
    created_at: "",
    updated_at: "",
  };
}

/** Abaixo do breakpoint `lg` do Tailwind, onde o painel deixa de ter duas colunas. */
function useIsNarrowChatViewport() {
  const query = "(max-width: 1023px)";
  const [isNarrow, setIsNarrow] = useState(
    () => typeof window !== "undefined" && window.matchMedia(query).matches,
  );

  useEffect(() => {
    const media = window.matchMedia(query);
    const handleChange = (event: MediaQueryListEvent) =>
      setIsNarrow(event.matches);
    setIsNarrow(media.matches);
    media.addEventListener("change", handleChange);
    return () => media.removeEventListener("change", handleChange);
  }, []);

  return isNarrow;
}

export function ChatPage({ clientMode = false }: { clientMode?: boolean }) {
  const { user, gestorClientId, setGestorClientId } = useGestorClient();
  const [searchParams] = useSearchParams();
  const [isDarkMode, setIsDarkMode] = useState(() =>
    readDashboardDarkEnabled(user.id),
  );
  const [clients, setClients] = useState<Client[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [chatClientId, setChatClientId] = useState(() =>
    user.role === "gestor" ? "" : (user.client_id ?? ""),
  );
  const [selectedId, setSelectedId] = useState("");
  /**
   * Abaixo de `lg` a lista e a conversa não cabem lado a lado — uma de cada
   * vez, como em qualquer app de mensagem. Acima, as duas convivem.
   */
  const isNarrowChat = useIsNarrowChatViewport();
  const isNarrowChatRef = useRef(isNarrowChat);
  useEffect(() => {
    isNarrowChatRef.current = isNarrowChat;
  }, [isNarrowChat]);
  const [draft, setDraft] = useState("");
  const [search, setSearch] = useState("");
  /** `search` com debounce — é este que vai para a API. */
  const [serverSearch, setServerSearch] = useState("");
  const [hasMoreConversations, setHasMoreConversations] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [viewFilter, setViewFilter] = useState<ViewFilter>("all");
  const [sending, setSending] = useState(false);
  const [attachmentMenuOpen, setAttachmentMenuOpen] = useState(false);
  const [composeModal, setComposeModal] = useState<ComposeModal>(null);
  const [hsmModalOpen, setHsmModalOpen] = useState(false);
  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [pollQuestion, setPollQuestion] = useState("");
  const [pollOptions, setPollOptions] = useState("");
  const [eventTitle, setEventTitle] = useState("");
  const [eventWhen, setEventWhen] = useState("");
  const [eventLocation, setEventLocation] = useState("");
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordingStartedAt, setRecordingStartedAt] = useState<number | null>(
    null,
  );
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [leadDrawerOpen, setLeadDrawerOpen] = useState(false);
  const [leadDrawerSaving, setLeadDrawerSaving] = useState(false);
  const [leadDrawerDraft, setLeadDrawerDraft] = useState<LeadDrawerDraft>({
    name: "",
    phone: "",
    email: "",
    pipelineId: "",
    stageId: "",
    eventId: "",
    date: "",
    time: "",
    status: "pending",
    source: "manual",
  });
  const [crmPipelines, setCrmPipelines] = useState<ApiCrmPipeline[]>([]);
  const [pipelineStages, setPipelineStages] = useState<ApiCrmStage[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const selectedClientId =
    user.role === "gestor" ? chatClientId : (user.client_id ?? "");
  const requestedClientId = searchParams.get("client_id") ?? "";
  const requestedLeadId = searchParams.get("lead_id") ?? "";
  const effectiveClientId =
    user.role === "gestor" ? selectedClientId : (user.client_id ?? "");
  const isClientExperience = clientMode || user.role === "cliente";

  const token = readStoredSession()?.accessToken;

  // Refs estáveis evitam recriar `applyIncomingMessage` a cada render —
  // antes, mudar `selectedId` recriava a callback, o que disparava o
  // useEffect do socket e fazia disconnect/reconnect a cada clique no
  // chat (com janela de eventos perdidos).
  const selectedIdRef = useRef("");
  const selectedClientIdRef = useRef("");
  const tokenRef = useRef<string | undefined>(undefined);
  /** Estado da paginação da lista de conversas. */
  const conversationsRef = useRef<Conversation[]>([]);
  const serverSearchRef = useRef("");
  const loadingMoreRef = useRef(false);
  const attachmentButtonRef = useRef<HTMLButtonElement | null>(null);
  const attachmentMenuRef = useRef<HTMLDivElement | null>(null);
  const emojiPickerRef = useRef<HTMLDivElement | null>(null);
  const attachmentFileInputRef = useRef<HTMLInputElement | null>(null);
  const attachmentMediaInputRef = useRef<HTMLInputElement | null>(null);
  const conversationScrollRef = useRef<HTMLElement | null>(null);
  const pendingOpenConversationIdRef = useRef<string | null>(null);
  const requestedLeadHandledRef = useRef("");
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<BlobPart[]>([]);
  const audioStreamRef = useRef<MediaStream | null>(null);
  const crmPipelinesCacheRef = useRef(new Map<string, ApiCrmPipeline[]>());
  const crmStagesCacheRef = useRef(new Map<string, ApiCrmStage[]>());
  const eventCacheRef = useRef(new Map<string, Event[]>());

  const scrollConversationToBottom = useCallback(
    (behavior: ScrollBehavior = "auto") => {
      const viewport = conversationScrollRef.current;
      if (!viewport) return;
      viewport.scrollTo({ top: viewport.scrollHeight, behavior });
    },
    [],
  );

  const openConversation = useCallback((conversationId: string) => {
    if (!conversationId) return;
    pendingOpenConversationIdRef.current = conversationId;
    setSelectedId(conversationId);
  }, []);

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
    selectedIdRef.current = selectedId;
  }, [selectedId]);

  useEffect(() => {
    selectedClientIdRef.current = effectiveClientId;
  }, [effectiveClientId]);

  useEffect(() => {
    conversationsRef.current = conversations;
  }, [conversations]);

  // A busca agora vai ao servidor: filtrar só o que já foi baixado ignoraria
  // o resto da base. O debounce evita uma consulta por tecla digitada.
  useEffect(() => {
    const timer = window.setTimeout(() => setServerSearch(search.trim()), 350);
    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    serverSearchRef.current = serverSearch;
  }, [serverSearch]);

  useEffect(() => {
    if (user.role !== "gestor") return;
    if (requestedClientId && requestedClientId !== chatClientId) {
      setChatClientId(requestedClientId);
      setGestorClientId(requestedClientId);
    }
  }, [chatClientId, requestedClientId, setGestorClientId, user.role]);

  const handleSelectChatClient = useCallback(
    (clientId: string) => {
      setChatClientId(clientId);
      if (clientId) {
        setGestorClientId(clientId);
      }
    },
    [setGestorClientId],
  );

  useEffect(() => {
    tokenRef.current = token;
  }, [token]);

  useEffect(() => {
    if (!attachmentMenuOpen) return;
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (attachmentMenuRef.current?.contains(target)) return;
      if (attachmentButtonRef.current?.contains(target)) return;
      setAttachmentMenuOpen(false);
    };
    window.addEventListener("mousedown", onPointerDown);
    return () => window.removeEventListener("mousedown", onPointerDown);
  }, [attachmentMenuOpen]);

  useEffect(() => {
    if (!emojiPickerOpen) return;
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (emojiPickerRef.current?.contains(target)) return;
      setEmojiPickerOpen(false);
    };
    window.addEventListener("mousedown", onPointerDown);
    return () => window.removeEventListener("mousedown", onPointerDown);
  }, [emojiPickerOpen]);

  useEffect(() => {
    if (!recording || !recordingStartedAt) return;
    const interval = window.setInterval(() => {
      setRecordingSeconds(Math.floor((Date.now() - recordingStartedAt) / 1000));
    }, 250);
    return () => window.clearInterval(interval);
  }, [recording, recordingStartedAt]);

  /** Mantém mensagens/não-lidos já em memória ao reescrever uma linha da lista. */
  const mergeConversationRow = useCallback(
    (row: Conversation, previous: Map<string, Conversation>) => {
      const existing = previous.get(row.id);
      return existing
        ? {
            ...row,
            messages: existing.messages,
            unread_count: existing.unread_count,
          }
        : row;
    },
    [],
  );

  /**
   * Recarrega só a primeira página e funde no que já está em memória. Uma
   * substituição completa descartaria as páginas antigas que o usuário
   * pediu com "carregar mais".
   */
  const refreshConversations = useCallback(() => {
    const currentToken = tokenRef.current;
    if (!currentToken) return;

    void listConversations(
      selectedClientIdRef.current || undefined,
      currentToken,
      {
        search: serverSearchRef.current,
      },
    )
      .then((convRows) => {
        const mapped = convRows.map(conversationFromListRow);
        setConversations((prev) => {
          const previousById = new Map(prev.map((conv) => [conv.id, conv]));
          const merged = mapped.map((row) =>
            mergeConversationRow(row, previousById),
          );
          const mergedIds = new Set(merged.map((row) => row.id));
          // As páginas seguintes continuam onde estavam, na mesma ordem.
          return [...merged, ...prev.filter((conv) => !mergedIds.has(conv.id))];
        });
      })
      .catch(() => {
        /* fallback silencioso — evita estourar UI em pico de erros */
      });
  }, [mergeConversationRow]);

  const loadMoreConversations = useCallback(() => {
    const currentToken = tokenRef.current;
    if (!currentToken || loadingMoreRef.current) return;
    loadingMoreRef.current = true;
    setLoadingMore(true);

    void listConversations(
      selectedClientIdRef.current || undefined,
      currentToken,
      {
        search: serverSearchRef.current,
        skip: conversationsRef.current.length,
      },
    )
      .then((convRows) => {
        const mapped = convRows.map(conversationFromListRow);
        setHasMoreConversations(mapped.length === CONVERSATIONS_PAGE_SIZE);
        setConversations((prev) => {
          const known = new Set(prev.map((conv) => conv.id));
          return [...prev, ...mapped.filter((row) => !known.has(row.id))];
        });
      })
      .catch(() => {
        /* silencioso: o botão continua disponível para nova tentativa */
      })
      .finally(() => {
        loadingMoreRef.current = false;
        setLoadingMore(false);
      });
  }, []);

  const applyIncomingMessage = useCallback(
    (event: RealtimeNewMessageEvent) => {
      const sender: Message["sender"] =
        event.sender_type === "lead"
          ? "lead"
          : event.sender_type === "user"
            ? "vendor"
            : "system";

      const incoming: Message = {
        id: event.message_id,
        sender,
        author_type: event.author_type,
        origin: event.origin,
        workflow_key: event.workflow_key,
        template_name: event.template_name,
        text: event.content,
        media_id: event.media_id ?? null,
        media_url: event.media_url ?? null,
        timestamp: event.created_at,
        send_status:
          event.send_status ?? (sender === "vendor" ? "sent" : undefined),
      };

      let shouldRefresh = false;

      setConversations((current) => {
        const exists = current.some(
          (conversation) => conversation.id === event.conversation_id,
        );
        if (!exists) {
          // Mensagem para conversa que ainda não temos (lead novo, ou
          // chegou antes da listagem terminar). Pede um refresh — antes
          // a mensagem era simplesmente descartada.
          shouldRefresh = true;
          return current;
        }

        return current.map((conversation) => {
          if (conversation.id !== event.conversation_id) {
            return conversation;
          }

          const baseMessages = stripFirstMatchingPendingOutbound(
            conversation.messages,
            incoming,
          );

          const alreadyPresent = baseMessages.some(
            (message) => message.id === incoming.id,
          );
          if (alreadyPresent) {
            return baseMessages === conversation.messages
              ? conversation
              : { ...conversation, messages: baseMessages };
          }

          return {
            ...conversation,
            last_message: incoming.text,
            last_message_time: incoming.timestamp,
            unread_count:
              sender === "lead" && conversation.id !== selectedIdRef.current
                ? conversation.unread_count + 1
                : conversation.unread_count,
            messages: [...baseMessages, incoming],
          };
        });
      });

      if (shouldRefresh) {
        refreshConversations();
      }
    },
    [refreshConversations],
  );

  useEffect(() => {
    if (!token) return;
    void listClients(token)
      .then((rows) => {
        const mapped = onlyActiveClients(rows.map(mapApiClientToClient));
        setClients(mapped);
        const selectedClientStillAvailable = gestorClientId
          ? mapped.some((client) => client.id === gestorClientId)
          : false;
        if (!selectedClientStillAvailable && mapped[0]?.id) {
          setGestorClientId(mapped[0].id);
        }
      })
      .catch(() => setClients([]));
  }, [gestorClientId, token, setGestorClientId]);

  useEffect(() => {
    if (!token || !effectiveClientId) {
      setCrmPipelines([]);
      setPipelineStages([]);
      setEvents([]);
      return;
    }

    const cachedPipelines = crmPipelinesCacheRef.current.get(effectiveClientId);
    const cachedEvents = eventCacheRef.current.get(effectiveClientId);
    if (cachedPipelines) {
      setCrmPipelines(cachedPipelines);
    }
    if (cachedEvents) {
      setEvents(cachedEvents);
    }

    if (cachedPipelines && cachedEvents) {
      return;
    }

    let active = true;
    void Promise.all([
      listCrmPipelines(effectiveClientId, token),
      listEvents({ client_id: effectiveClientId }, token),
    ])
      .then(([pipelines, eventRows]) => {
        if (!active) return;
        setCrmPipelines(pipelines);
        const mappedEvents = eventRows.map(mapApiEventToEvent);
        setEvents(mappedEvents);
        crmPipelinesCacheRef.current.set(effectiveClientId, pipelines);
        eventCacheRef.current.set(effectiveClientId, mappedEvents);
      })
      .catch(() => {
        if (!active) return;
        setCrmPipelines([]);
        setEvents([]);
      });

    return () => {
      active = false;
    };
  }, [effectiveClientId, token]);

  const loadThread = useCallback(
    (conversationId: string, scrollToBottomOnLoad = false) => {
      if (!token) return;
      void listMessages(conversationId, token)
        .then((msgs: ApiMessage[]) => {
          const shouldSnapToLatest =
            scrollToBottomOnLoad &&
            pendingOpenConversationIdRef.current === conversationId;

          if (shouldSnapToLatest) {
            flushSync(() => {
              setConversations((curr) =>
                curr.map((c) =>
                  c.id === conversationId
                    ? { ...c, messages: mapApiMessagesToMessages(msgs) }
                    : c,
                ),
              );
            });
            scrollConversationToBottom("auto");
            pendingOpenConversationIdRef.current = null;
          } else {
            setConversations((curr) =>
              curr.map((c) =>
                c.id === conversationId
                  ? { ...c, messages: mapApiMessagesToMessages(msgs) }
                  : c,
              ),
            );
          }
        })
        .catch(() => {
          if (
            scrollToBottomOnLoad &&
            pendingOpenConversationIdRef.current === conversationId
          ) {
            pendingOpenConversationIdRef.current = null;
          }
        });
    },
    [scrollConversationToBottom, token],
  );

  const refreshLeads = useCallback(() => {
    if (!token) return;
    void listLeads(
      effectiveClientId ? { client_id: effectiveClientId } : {},
      token,
    )
      .then((leadRows) => setLeads(leadRows.map(mapApiLeadToLead)))
      .catch(() => setLeads([]));
  }, [effectiveClientId, token]);

  const handleLeadMutation = useCallback(() => {
    refreshConversations();
    refreshLeads();
  }, [refreshConversations, refreshLeads]);

  useEffect(() => {
    if (!token) return;
    void Promise.all([
      // Primeira página apenas: a lista inteira chegava a 560 conversas.
      listConversations(effectiveClientId || undefined, token, {
        search: serverSearch,
      }),
      listLeads(
        effectiveClientId ? { client_id: effectiveClientId } : {},
        token,
      ),
    ])
      .then(([convRows, leadRows]) => {
        const mapped = convRows.map(conversationFromListRow);
        const mappedLeads = leadRows.map(mapApiLeadToLead);

        setConversations(mapped);
        setHasMoreConversations(mapped.length === CONVERSATIONS_PAGE_SIZE);
        setLeads(mappedLeads);
        // No celular a lista e a primeira tela: abrir uma conversa sozinho
        // esconderia a lista logo de cara.
        if (mapped[0]?.id && !isNarrowChatRef.current) {
          openConversation(mapped[0].id);
        } else {
          setSelectedId("");
        }
      })
      .catch(() => {
        setConversations([]);
        setHasMoreConversations(false);
        setLeads([]);
        setSelectedId("");
        pushToast({
          message: "Não foi possível carregar as conversas.",
          type: "error",
        });
      });
  }, [effectiveClientId, openConversation, serverSearch, token]);

  useEffect(() => {
    if (!selectedId) return;
    loadThread(selectedId, true);
  }, [selectedId, loadThread]);

  const realtimeClientIds = useMemo(
    () =>
      effectiveClientId
        ? [effectiveClientId]
        : clients.map((client) => client.id),
    [clients, effectiveClientId],
  );

  useEffect(() => {
    if (realtimeClientIds.length === 0 || !token) {
      return;
    }

    let socket: Socket | null = connectRealtime(realtimeClientIds[0]);
    for (const clientId of realtimeClientIds) {
      socket.emit("join_client", { client_id: clientId });
    }
    socket.on("new_message", applyIncomingMessage);
    socket.on("lead_updated", handleLeadMutation);

    return () => {
      socket?.off("new_message", applyIncomingMessage);
      socket?.off("lead_updated", handleLeadMutation);
      socket?.disconnect();
      socket = null;
    };
  }, [applyIncomingMessage, handleLeadMutation, realtimeClientIds, token]);

  // Polling de segurança: além de cobrir quedas do WebSocket, importa a
  // memória do agente n8n que ainda não nasce no barramento realtime da API.
  // Cinco segundos mantém o chat operacional enquanto essa compatibilidade
  // com o workflow legado for necessária.
  useEffect(() => {
    if (!token) return;

    const POLL_MS = 5_000;
    const interval = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      refreshConversations();
      const currentSelectedId = selectedIdRef.current;
      if (currentSelectedId) {
        loadThread(currentSelectedId);
      }
    }, POLL_MS);

    const onFocus = () => {
      refreshConversations();
      const currentSelectedId = selectedIdRef.current;
      if (currentSelectedId) {
        loadThread(currentSelectedId);
      }
    };
    window.addEventListener("focus", onFocus);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", onFocus);
    };
  }, [effectiveClientId, token, refreshConversations, loadThread]);

  const clientsById = useMemo(
    () => new Map(clients.map((client) => [client.id, client] as const)),
    [clients],
  );

  const leadsById = useMemo(
    () => new Map(leads.map((lead) => [lead.id, lead] as const)),
    [leads],
  );

  const conversationsById = useMemo(
    () =>
      new Map(
        conversations.map(
          (conversation) => [conversation.id, conversation] as const,
        ),
      ),
    [conversations],
  );

  const conversationsByLeadId = useMemo(
    () =>
      new Map(
        conversations.map(
          (conversation) => [conversation.lead_id, conversation] as const,
        ),
      ),
    [conversations],
  );

  const selected = useMemo(
    () => conversationsById.get(selectedId) ?? conversations[0],
    [conversations, conversationsById, selectedId],
  );

  const selectedLead = useMemo(() => {
    if (!selected) return undefined;
    return leadsById.get(selected.lead_id);
  }, [leadsById, selected]);

  const profileLead = selected
    ? (selectedLead ?? stubLead(selected, selected.client_id))
    : undefined;

  /**
   * Ancora a conversa na última mensagem ao abrir. Um `scrollTo` só não basta:
   * a altura ainda muda depois do primeiro paint (imagens, áudio, fontes), e o
   * fim da conversa escapa para baixo. Reancoramos enquanto a altura crescer.
   */
  useEffect(() => {
    if (!selectedId) return;
    const viewport = conversationScrollRef.current;
    if (!viewport) return;

    let lastHeight = -1;
    let frame = 0;
    const deadline = Date.now() + 1200;

    const anchor = () => {
      const current = conversationScrollRef.current;
      if (!current) return;
      if (current.scrollHeight !== lastHeight) {
        lastHeight = current.scrollHeight;
        current.scrollTop = current.scrollHeight;
      }
      if (Date.now() < deadline) {
        frame = window.requestAnimationFrame(anchor);
      }
    };

    frame = window.requestAnimationFrame(anchor);
    return () => window.cancelAnimationFrame(frame);
  }, [selectedId, selected?.messages.length]);

  useEffect(() => {
    if (!requestedLeadId) return;
    if (
      user.role === "gestor" &&
      requestedClientId &&
      effectiveClientId !== requestedClientId
    )
      return;
    const requestKey = `${effectiveClientId}:${requestedLeadId}`;
    if (requestedLeadHandledRef.current === requestKey) return;

    const conversation = conversationsByLeadId.get(requestedLeadId);
    if (conversation) {
      requestedLeadHandledRef.current = requestKey;
      openConversation(conversation.id);
      setSearch("");
      setViewFilter("all");
      return;
    }

    const lead = leadsById.get(requestedLeadId);
    if (lead) {
      if (!token) return;
      requestedLeadHandledRef.current = requestKey;
      void ensureConversation(
        effectiveClientId,
        requestedLeadId,
        token,
        "whatsapp",
      )
        .then((row) => {
          const ensured = conversationFromListRow(row);
          setConversations((current) => {
            const existing = current.find(
              (conversation) => conversation.id === ensured.id,
            );
            if (existing) {
              return current.map((conversation) =>
                conversation.id === ensured.id
                  ? {
                      ...ensured,
                      messages: existing.messages,
                      unread_count: existing.unread_count,
                    }
                  : conversation,
              );
            }
            return [ensured, ...current];
          });
          openConversation(ensured.id);
          setSearch("");
          setViewFilter("all");
        })
        .catch(() => {
          requestedLeadHandledRef.current = "";
          setSearch(lead.name);
          setViewFilter("whatsapp");
        });
    }
  }, [
    conversationsByLeadId,
    leadsById,
    openConversation,
    requestedLeadId,
    requestedClientId,
    effectiveClientId,
    token,
    user.role,
  ]);

  useEffect(() => {
    if (!leadDrawerOpen || !leadDrawerDraft.pipelineId || !token) {
      setPipelineStages([]);
      return;
    }

    const cachedStages = crmStagesCacheRef.current.get(
      leadDrawerDraft.pipelineId,
    );
    if (cachedStages) {
      setPipelineStages(cachedStages);
      setLeadDrawerDraft((current) => {
        if (
          current.stageId &&
          cachedStages.some((stage) => stage.id === current.stageId)
        ) {
          return current;
        }
        return { ...current, stageId: cachedStages[0]?.id ?? "" };
      });
      return;
    }

    let active = true;
    void listPipelineStages(leadDrawerDraft.pipelineId, token)
      .then((rows) => {
        if (!active) return;
        setPipelineStages(rows);
        crmStagesCacheRef.current.set(leadDrawerDraft.pipelineId, rows);
        setLeadDrawerDraft((current) => {
          if (
            current.stageId &&
            rows.some((stage) => stage.id === current.stageId)
          ) {
            return current;
          }
          return { ...current, stageId: rows[0]?.id ?? "" };
        });
      })
      .catch(() => {
        if (!active) return;
        setPipelineStages([]);
      });

    return () => {
      active = false;
    };
  }, [leadDrawerDraft.pipelineId, leadDrawerOpen, token]);

  useEffect(() => {
    if (
      !leadDrawerOpen ||
      leadDrawerDraft.pipelineId ||
      !leadDrawerDraft.stageId ||
      !token ||
      crmPipelines.length === 0
    ) {
      return;
    }

    let active = true;
    void Promise.all(
      crmPipelines.map(async (pipeline) => {
        const cached = crmStagesCacheRef.current.get(pipeline.id);
        const stages = cached ?? (await listPipelineStages(pipeline.id, token));
        crmStagesCacheRef.current.set(pipeline.id, stages);
        return { pipeline, stages };
      }),
    )
      .then((results) => {
        if (!active) return;
        const match = results.find(({ stages }) =>
          stages.some((stage) => stage.id === leadDrawerDraft.stageId),
        );
        if (!match) return;
        setPipelineStages(match.stages);
        setLeadDrawerDraft((current) =>
          current.pipelineId
            ? current
            : { ...current, pipelineId: match.pipeline.id },
        );
      })
      .catch(() => undefined);

    return () => {
      active = false;
    };
  }, [
    crmPipelines,
    leadDrawerDraft.pipelineId,
    leadDrawerDraft.stageId,
    leadDrawerOpen,
    token,
  ]);

  useEffect(() => {
    if (!leadDrawerOpen || !profileLead) return;
    setLeadDrawerDraft(makeLeadDrawerDraft(profileLead));
  }, [leadDrawerOpen, profileLead]);

  function openLeadDrawer() {
    if (!profileLead) return;
    setLeadDrawerOpen(true);
    if (!token) return;
    void getLead(profileLead.id, token)
      .then((row) => {
        const mapped = mapApiLeadToLead(row);
        setLeads((current) => {
          const exists = current.some((lead) => lead.id === mapped.id);
          return exists
            ? current.map((lead) => (lead.id === mapped.id ? mapped : lead))
            : [mapped, ...current];
        });
        setLeadDrawerDraft(makeLeadDrawerDraft(mapped));
      })
      .catch(() => undefined);
  }

  function closeLeadDrawer() {
    if (leadDrawerSaving) return;
    setLeadDrawerOpen(false);
  }

  async function saveLeadDrawer() {
    if (!profileLead || !token) return;

    const payloadDate = combineLeadDrawerDateTime(leadDrawerDraft);
    setLeadDrawerSaving(true);

    try {
      const updated = await updateLead(
        profileLead.id,
        {
          name: leadDrawerDraft.name.trim(),
          phone: leadDrawerDraft.phone.trim() || null,
          email: leadDrawerDraft.email.trim() || null,
          crm_pipeline_id: leadDrawerDraft.pipelineId || null,
          crm_stage_id: leadDrawerDraft.stageId || null,
          event_interest_id: leadDrawerDraft.eventId || null,
          store_visit_datetime: payloadDate,
          confirmation_status: confirmationStatusFromLeadDrawer(
            leadDrawerDraft.status,
          ),
          source: leadDrawerDraft.source,
        },
        token,
      );

      const mapped = mapApiLeadToLead(updated);
      setLeads((current) =>
        current.map((lead) => (lead.id === mapped.id ? mapped : lead)),
      );
      setConversations((current) =>
        current.map((conversation) =>
          conversation.lead_id === mapped.id
            ? { ...conversation, lead_name: mapped.name }
            : conversation,
        ),
      );
      setLeadDrawerOpen(false);
    } catch (error) {
      pushToast({
        message:
          error instanceof Error
            ? error.message
            : "Nao foi possivel salvar o lead.",
        type: "error",
      });
    } finally {
      setLeadDrawerSaving(false);
    }
  }

  async function handleQuickChangeStage(stageId: string) {
    if (!profileLead || !token) return;
    try {
      const updated = await updateLead(
        profileLead.id,
        { crm_stage_id: stageId || null },
        token,
      );
      const mapped = mapApiLeadToLead(updated);
      setLeads((current) =>
        current.map((lead) => (lead.id === mapped.id ? mapped : lead)),
      );
      pushToast({ message: "Etapa CRM atualizada!", type: "success" });
    } catch {
      pushToast({ message: "Falha ao atualizar etapa", type: "error" });
    }
  }

  const filteredConversations = useMemo(() => {
    const query = search.trim().toLowerCase();

    const matched = conversations.filter((conversation) => {
      const client = clientsById.get(conversation.client_id);
      const lead = leadsById.get(conversation.lead_id);
      const matchesClient =
        !selectedClientId || conversation.client_id === selectedClientId;

      const matchesSearch =
        !query ||
        conversation.lead_name.toLowerCase().includes(query) ||
        conversation.last_message.toLowerCase().includes(query) ||
        client?.company_name.toLowerCase().includes(query) ||
        lead?.event_interest?.toLowerCase().includes(query) ||
        lead?.phone.toLowerCase().includes(query);

      const matchesView =
        viewFilter === "all" ||
        (viewFilter === "unread" && conversation.unread_count > 0) ||
        (viewFilter === "whatsapp" && conversation.channel === "whatsapp") ||
        (viewFilter === "internal" && conversation.channel === "internal");

      return matchesClient && matchesSearch && matchesView;
    });

    // Desduplicar conversas por número de telefone (apenas 1 conversa por número)
    const seenKeys = new Map<string, Conversation>();

    for (const conv of matched) {
      const lead = leadsById.get(conv.lead_id);
      const phoneDigits = lead?.phone ? lead.phone.replace(/\D/g, "") : "";
      const dedupKey =
        phoneDigits.length >= 8 ? phoneDigits : conv.lead_id || conv.id;

      const existing = seenKeys.get(dedupKey);
      if (!existing) {
        seenKeys.set(dedupKey, { ...conv });
      } else {
        const existingTime = new Date(existing.last_message_time).getTime();
        const convTime = new Date(conv.last_message_time).getTime();
        if (convTime > existingTime) {
          seenKeys.set(dedupKey, {
            ...conv,
            unread_count: conv.unread_count + existing.unread_count,
          });
        } else {
          existing.unread_count += conv.unread_count;
        }
      }
    }

    return Array.from(seenKeys.values());
  }, [
    clientsById,
    conversations,
    leadsById,
    search,
    selectedClientId,
    viewFilter,
  ]);

  useEffect(() => {
    if (!filteredConversations.length) {
      return;
    }

    const stillVisible = filteredConversations.some(
      (conversation) => conversation.id === selectedId,
    );
    if (!stillVisible) {
      openConversation(filteredConversations[0].id);
    }
  }, [filteredConversations, openConversation, selectedId]);

  function appendApiMessageToSelected(msg: ApiMessage) {
    if (!selected) return;
    const sender: Message["sender"] =
      msg.sender_type === "lead"
        ? "lead"
        : msg.sender_type === "user"
          ? "vendor"
          : "system";
    const mapped: Message = {
      id: msg.id,
      sender,
      text: msg.content,
      media_id: msg.media_id ?? null,
      media_url: msg.media_url ?? null,
      timestamp: msg.created_at,
      send_status: sender === "vendor" ? "sent" : undefined,
    };

    setConversations((current) =>
      current.map((conversation) => {
        if (conversation.id !== selected.id) return conversation;
        if (conversation.messages.some((message) => message.id === mapped.id))
          return conversation;
        return {
          ...conversation,
          last_message: mapped.text,
          last_message_time: mapped.timestamp,
          unread_count: 0,
          messages: [...conversation.messages, mapped],
        };
      }),
    );
  }

  async function sendMessage() {
    if (!selected || !draft.trim() || !token) return;
    const text = draft.trim();
    const optimisticId = `pending-${crypto.randomUUID()}`;
    const now = new Date().toISOString();
    const optimistic: Message = {
      id: optimisticId,
      sender: "vendor",
      text,
      timestamp: now,
      send_status: "sending",
      media_id: null,
      media_url: null,
    };
    const conversationId = selected.id;
    setConversations((current) =>
      current.map((c) =>
        c.id === conversationId
          ? {
              ...c,
              messages: [...c.messages, optimistic],
              last_message: text,
              last_message_time: now,
            }
          : c,
      ),
    );
    setDraft("");
    setSending(true);
    try {
      const msg = await postConversationMessage(conversationId, text, token);
      const mapped: Message = {
        id: msg.id,
        sender: "vendor",
        text: msg.content,
        media_id: msg.media_id ?? null,
        media_url: msg.media_url ?? null,
        timestamp: msg.created_at,
        send_status: "sent",
      };
      setConversations((current) =>
        current.map((conversation) => {
          if (conversation.id !== conversationId) return conversation;
          return {
            ...conversation,
            messages: conversation.messages.map((m) =>
              m.id === optimisticId ? mapped : m,
            ),
            last_message: mapped.text,
            last_message_time: mapped.timestamp,
          };
        }),
      );
    } catch (error) {
      setDraft(text);
      setConversations((current) =>
        current.map((conversation) => {
          if (conversation.id !== conversationId) return conversation;
          return {
            ...conversation,
            messages: conversation.messages.map((m) =>
              m.id === optimisticId ? { ...m, send_status: "failed" } : m,
            ),
          };
        }),
      );
      pushToast({
        message:
          error instanceof Error
            ? error.message
            : "Nao foi possivel enviar a mensagem.",
        type: "error",
      });
    } finally {
      setSending(false);
    }
  }

  async function sendQuickStructuredMessage(content: string) {
    if (!selected || !token) return;
    const optimisticId = `pending-${crypto.randomUUID()}`;
    const now = new Date().toISOString();
    const optimistic: Message = {
      id: optimisticId,
      sender: "vendor",
      text: content,
      timestamp: now,
      send_status: "sending",
      media_id: null,
      media_url: null,
    };
    const conversationId = selected.id;
    setConversations((current) =>
      current.map((c) =>
        c.id === conversationId
          ? {
              ...c,
              messages: [...c.messages, optimistic],
              last_message: content,
              last_message_time: now,
            }
          : c,
      ),
    );
    setSending(true);
    try {
      const msg = await postConversationMessage(conversationId, content, token);
      const mapped: Message = {
        id: msg.id,
        sender: "vendor",
        text: msg.content,
        media_id: msg.media_id ?? null,
        media_url: msg.media_url ?? null,
        timestamp: msg.created_at,
        send_status: "sent",
      };
      setConversations((current) =>
        current.map((conversation) => {
          if (conversation.id !== conversationId) return conversation;
          return {
            ...conversation,
            messages: conversation.messages.map((m) =>
              m.id === optimisticId ? mapped : m,
            ),
            last_message: mapped.text,
            last_message_time: mapped.timestamp,
          };
        }),
      );
    } catch (error) {
      setConversations((current) =>
        current.map((conversation) => {
          if (conversation.id !== conversationId) return conversation;
          return {
            ...conversation,
            messages: conversation.messages.map((m) =>
              m.id === optimisticId ? { ...m, send_status: "failed" } : m,
            ),
          };
        }),
      );
      pushToast({
        message:
          error instanceof Error
            ? error.message
            : "Nao foi possivel enviar a mensagem.",
        type: "error",
      });
    } finally {
      setSending(false);
    }
  }

  function openComposeModal(type: ComposeModal) {
    setAttachmentMenuOpen(false);
    setComposeModal(type);
  }

  function closeComposeModal() {
    setComposeModal(null);
  }

  const handleAttachmentSelection = async (fileList: FileList | null) => {
    const file = fileList?.[0];
    if (!file || !selected || !token) return;

    setSending(true);
    try {
      const msg = await postConversationMedia(
        selected.id,
        file,
        token,
        draft.trim() || undefined,
      );
      appendApiMessageToSelected(msg);
      setDraft("");
    } finally {
      setSending(false);
    }
  };

  function appendEmoji(emoji: string) {
    setDraft((current) => `${current}${emoji}`);
  }

  function resolveRecorderMimeType() {
    const candidates = [
      "audio/ogg;codecs=opus",
      "audio/mp4",
      "audio/webm;codecs=opus",
      "audio/webm",
    ];
    return candidates.find((type) => MediaRecorder.isTypeSupported(type)) ?? "";
  }

  async function startAudioRecording() {
    if (!selected || !token || recording || sending) return;
    if (
      !navigator.mediaDevices?.getUserMedia ||
      typeof MediaRecorder === "undefined"
    ) {
      pushToast({
        message: "Gravacao de audio nao disponivel neste navegador.",
        type: "error",
      });
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = resolveRecorderMimeType();
      const recorder = new MediaRecorder(
        stream,
        mimeType ? { mimeType } : undefined,
      );
      audioChunksRef.current = [];
      audioStreamRef.current = stream;
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        const finalMimeType = recorder.mimeType || mimeType || "audio/webm";
        const blob = new Blob(audioChunksRef.current, { type: finalMimeType });
        audioChunksRef.current = [];
        audioStreamRef.current?.getTracks().forEach((track) => track.stop());
        audioStreamRef.current = null;
        mediaRecorderRef.current = null;
        setRecording(false);
        setRecordingStartedAt(null);
        setRecordingSeconds(0);

        if (blob.size === 0 || !selected || !token) return;
        const extension = finalMimeType.includes("ogg")
          ? "ogg"
          : finalMimeType.includes("mp4")
            ? "m4a"
            : "webm";
        const file = new File([blob], `audio-${Date.now()}.${extension}`, {
          type: finalMimeType,
        });

        setSending(true);
        void postConversationMedia(selected.id, file, token)
          .then((msg) => appendApiMessageToSelected(msg))
          .catch((error) => {
            pushToast({
              message:
                error instanceof Error
                  ? error.message
                  : "Falha ao enviar audio.",
              type: "error",
            });
          })
          .finally(() => setSending(false));
      };

      recorder.start();
      setRecording(true);
      setRecordingStartedAt(Date.now());
      setRecordingSeconds(0);
    } catch {
      pushToast({
        message: "Nao foi possivel acessar o microfone.",
        type: "error",
      });
    }
  }

  function stopAudioRecording() {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state === "inactive") return;
    recorder.stop();
  }

  const attachmentActions = [
    {
      id: "file",
      label: "Arquivo",
      icon: Folder,
      iconClassName: "text-[#24a1de]",
      onClick: () => {
        setAttachmentMenuOpen(false);
        attachmentFileInputRef.current?.click();
      },
    },
    {
      id: "media",
      label: "Fotos e videos",
      icon: Images,
      iconClassName: "text-[#5aa9ff]",
      onClick: () => {
        setAttachmentMenuOpen(false);
        attachmentMediaInputRef.current?.click();
      },
    },
    {
      id: "contact",
      label: "Contato",
      icon: Contact,
      iconClassName: "text-[#ff7a32]",
      onClick: () => openComposeModal("contact"),
    },
    {
      id: "poll",
      label: "Enquete",
      icon: ListOrdered,
      iconClassName: "text-[#f6b73b]",
      onClick: () => openComposeModal("poll"),
    },
    {
      id: "event",
      label: "Evento",
      icon: CalendarDays,
      iconClassName: "text-[#f04b5e]",
      onClick: () => openComposeModal("event"),
    },
    {
      id: "ai-images",
      label: "Imagens de IA",
      icon: Sparkles,
      iconClassName: "text-[#5aa9ff]",
      onClick: () => {
        setAttachmentMenuOpen(false);
        setDraft((current) =>
          current
            ? `${current}\n[IA] Descreva a imagem que deseja gerar...`
            : "[IA] Descreva a imagem que deseja gerar...",
        );
      },
    },
  ] as const;

  if (!token) {
    return (
      <div className="flex min-h-[320px] items-center justify-center text-zinc-500">
        Faca login para ver o chat.
      </div>
    );
  }

  if (!clients.length) {
    return (
      <div className="flex min-h-[320px] items-center justify-center text-zinc-500">
        {isClientExperience
          ? "As conversas da sua empresa ainda não estão disponíveis."
          : "Nenhum cliente cadastrado. Crie um cliente para iniciar conversas."}
      </div>
    );
  }

  return (
    <div
      className={clsx(
        "h-full w-full overflow-hidden rounded-[28px] border shadow-sm transition-all flex",
        isDarkMode
          ? "border-zinc-800/80 bg-[#0f1015]"
          : "border-zinc-200/80 bg-white",
      )}
    >
      <div className="flex h-full min-h-0 w-full flex-col lg:flex-row">
        <ConversationSidebar
          className={clsx(
            // Uma tela de cada vez no celular: com a conversa aberta, a lista
            // sai de cena em vez de empurrar a conversa para fora da viewport.
            isNarrowChat && selected ? "hidden" : "flex",
          )}
          clients={clients}
          selectedClientId={selectedClientId}
          onSelectClientId={handleSelectChatClient}
          allowAllClients={user.role === "gestor"}
          hideClientSelector={isClientExperience}
          search={search}
          onSearchChange={setSearch}
          viewFilter={viewFilter}
          onViewFilterChange={setViewFilter}
          filteredConversations={filteredConversations}
          selectedConversationId={selected?.id ?? ""}
          dark={isDarkMode}
          onSelectConversation={openConversation}
          hasMore={hasMoreConversations}
          loadingMore={loadingMore}
          onLoadMore={loadMoreConversations}
        />

        <main
          className={clsx(
            "relative min-h-0 flex-1 flex-col",
            isNarrowChat && !selected ? "hidden" : "flex",
            isDarkMode ? "bg-[#0b0c10]" : "bg-zinc-50/50",
          )}
        >
          {isNarrowChat && selected ? (
            <button
              type="button"
              onClick={() => setSelectedId("")}
              className={clsx(
                "flex shrink-0 items-center gap-2 border-b px-4 py-3 text-sm font-semibold transition-colors",
                isDarkMode
                  ? "border-zinc-800/80 bg-[#15161b] text-zinc-200 hover:bg-zinc-800/60"
                  : "border-zinc-100 bg-white text-zinc-700 hover:bg-zinc-50",
              )}
            >
              <ArrowLeft size={18} />
              <span className="truncate">Conversas</span>
            </button>
          ) : null}
          {selected && profileLead ? (
            <>
              <ChatThread
                conversation={selected}
                profileLead={profileLead}
                pipelineStages={pipelineStages}
                token={token}
                dark={isDarkMode}
                scrollRef={conversationScrollRef}
                onOpenLeadDrawer={openLeadDrawer}
                onQuickChangeStage={(stageId) =>
                  void handleQuickChangeStage(stageId)
                }
              />

              <footer
                className={clsx(
                  "relative border-t p-3 space-y-2.5 sm:p-3.5",
                  isDarkMode
                    ? "border-zinc-800/80 bg-[#15161b]"
                    : "border-zinc-100 bg-white",
                )}
              >
                {/* 1-Click Quick Replies Bar */}
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
                  <button
                    type="button"
                    onClick={() => setHsmModalOpen(true)}
                    className={clsx(
                      "shrink-0 rounded-xl border px-3 py-1 text-xs font-extrabold transition-all hover:scale-105 active:scale-95 shadow-xs flex items-center gap-1",
                      isDarkMode
                        ? "border-amber-500/30 bg-amber-500/10 text-amber-400 hover:bg-amber-500/20"
                        : "border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100",
                    )}
                  >
                    <span>✉️</span>
                    <span>Templates HSM (Meta)</span>
                  </button>

                  {QUICK_REPLIES.map((reply) => (
                    <button
                      key={reply.id}
                      type="button"
                      onClick={() =>
                        setDraft((current) =>
                          current ? `${current} ${reply.text}` : reply.text,
                        )
                      }
                      className={clsx(
                        "shrink-0 rounded-xl border px-3 py-1 text-xs font-bold transition-all hover:scale-105 active:scale-95 shadow-xs",
                        isDarkMode
                          ? "border-zinc-800 bg-zinc-900 text-zinc-300 hover:bg-zinc-800 hover:text-white"
                          : "border-zinc-200 bg-zinc-50 text-zinc-700 hover:bg-zinc-100 hover:text-zinc-950",
                      )}
                    >
                      {reply.label}
                    </button>
                  ))}
                </div>

                <div className="flex w-full items-center gap-2">
                  <button
                    ref={attachmentButtonRef}
                    type="button"
                    onClick={() => setAttachmentMenuOpen((value) => !value)}
                    className={clsx(
                      "inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border transition-all hover:scale-105",
                      isDarkMode
                        ? "border-zinc-800 bg-zinc-900 text-zinc-300 hover:bg-zinc-800"
                        : "border-zinc-200 bg-zinc-50 text-zinc-600 hover:bg-zinc-100",
                    )}
                    aria-label="Anexo"
                  >
                    <Paperclip size={18} />
                  </button>
                  <input
                    ref={attachmentFileInputRef}
                    type="file"
                    className="hidden"
                    onChange={(event) => {
                      handleAttachmentSelection(event.target.files);
                      event.currentTarget.value = "";
                    }}
                  />
                  <input
                    ref={attachmentMediaInputRef}
                    type="file"
                    accept="image/*,video/*"
                    className="hidden"
                    onChange={(event) => {
                      handleAttachmentSelection(event.target.files);
                      event.currentTarget.value = "";
                    }}
                  />

                  <div
                    className={clsx(
                      "flex min-h-[44px] flex-1 items-center gap-2 rounded-2xl border px-3.5 transition-all focus-within:border-[#FF0636]",
                      isDarkMode
                        ? "border-zinc-800 bg-zinc-900/80"
                        : "border-zinc-200 bg-zinc-50",
                    )}
                  >
                    <textarea
                      value={draft}
                      onChange={(event) => setDraft(event.target.value)}
                      onKeyDown={(event) => {
                        if (
                          event.key === "Enter" &&
                          !event.shiftKey &&
                          !sending
                        ) {
                          event.preventDefault();
                          void sendMessage();
                        }
                      }}
                      placeholder="Escreva uma mensagem..."
                      rows={1}
                      className={clsx(
                        "max-h-32 min-h-[24px] flex-1 resize-none bg-transparent py-2.5 text-xs font-medium outline-none",
                        isDarkMode
                          ? "text-zinc-100 placeholder:text-zinc-400"
                          : "text-zinc-900 placeholder:text-zinc-400",
                      )}
                    />
                    <button
                      type="button"
                      onClick={() => setEmojiPickerOpen((value) => !value)}
                      className={clsx(
                        "inline-flex h-8 w-8 items-center justify-center rounded-xl transition-colors",
                        isDarkMode
                          ? "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
                          : "text-zinc-400 hover:bg-zinc-200 hover:text-zinc-700",
                      )}
                      aria-label="Emoji"
                    >
                      <SmilePlus size={18} />
                    </button>
                  </div>

                  {draft.trim().length > 0 ? (
                    <button
                      type="button"
                      disabled={sending}
                      onClick={() => void sendMessage()}
                      className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[#FF0636] text-white shadow-md transition-all hover:bg-[#e0002b] hover:scale-105 disabled:cursor-not-allowed disabled:opacity-50"
                      aria-label="Enviar"
                    >
                      <SendHorizontal size={18} />
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={sending}
                      onClick={() => {
                        if (recording) {
                          stopAudioRecording();
                        } else {
                          void startAudioRecording();
                        }
                      }}
                      className={clsx(
                        "inline-flex h-11 w-11 items-center justify-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-50",
                        recording
                          ? "bg-[#ff4b55] text-white hover:bg-[#e43f48]"
                          : isDarkMode
                            ? "text-[#c7c7c7] hover:bg-white/10"
                            : "text-[#54656f] hover:bg-[#e9edef]",
                      )}
                      aria-label={recording ? "Parar gravacao" : "Audio"}
                    >
                      {recording ? (
                        <Square size={18} fill="currentColor" />
                      ) : (
                        <Mic size={22} />
                      )}
                    </button>
                  )}
                </div>
                {recording && (
                  <div className="mt-1 flex w-full items-center gap-2 pl-1 text-[12px] font-medium text-[#ff4b55]">
                    <span className="h-2 w-2 rounded-full bg-[#ff4b55]" />
                    Gravando audio{" "}
                    {String(Math.floor(recordingSeconds / 60)).padStart(2, "0")}
                    :{String(recordingSeconds % 60).padStart(2, "0")}
                  </div>
                )}
                {emojiPickerOpen && (
                  <div
                    ref={emojiPickerRef}
                    className={clsx(
                      "absolute bottom-[calc(100%+8px)] right-16 z-20 grid w-[260px] grid-cols-8 gap-1 rounded-2xl p-3 shadow-[0_12px_32px_rgba(0,0,0,0.18)]",
                      isDarkMode
                        ? "border border-[#2a2a2a] bg-[#111111]"
                        : "bg-white",
                    )}
                  >
                    {QUICK_EMOJIS.map((emoji) => (
                      <button
                        key={emoji}
                        type="button"
                        onClick={() => appendEmoji(emoji)}
                        className={clsx(
                          "flex h-8 w-8 items-center justify-center rounded-lg text-[20px] transition-colors",
                          isDarkMode
                            ? "hover:bg-white/10"
                            : "hover:bg-[#f0f2f5]",
                        )}
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                )}
                {attachmentMenuOpen && (
                  <div className="pointer-events-none absolute bottom-[calc(100%+8px)] left-3 z-20">
                    <div
                      ref={attachmentMenuRef}
                      className="pointer-events-auto w-[300px] rounded-2xl bg-[#404346] p-3 shadow-[0_12px_32px_rgba(0,0,0,0.28)]"
                    >
                      <div className="space-y-1">
                        {attachmentActions.map((item) => {
                          const Icon = item.icon;
                          return (
                            <button
                              key={item.id}
                              type="button"
                              onClick={item.onClick}
                              className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors hover:bg-white/10"
                            >
                              <Icon size={22} className={item.iconClassName} />
                              <span className="text-[18px] font-medium text-white">
                                {item.label}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}
                {composeModal && (
                  <div className="absolute inset-0 z-30 flex items-end justify-center bg-black/35 p-4">
                    <div className="w-full max-w-md rounded-2xl bg-white p-4 shadow-2xl">
                      {composeModal === "contact" && (
                        <>
                          <h3 className="text-lg font-semibold text-[#111b21]">
                            Enviar contato
                          </h3>
                          <div className="mt-3 space-y-2">
                            <input
                              value={contactName}
                              onChange={(event) =>
                                setContactName(event.target.value)
                              }
                              placeholder="Nome do contato"
                              className="w-full rounded-lg border border-[#d1d7db] px-3 py-2 text-sm outline-none focus:border-[#00a884]"
                            />
                            <input
                              value={contactPhone}
                              onChange={(event) =>
                                setContactPhone(event.target.value)
                              }
                              placeholder="Telefone com DDI (ex: 5511999998888)"
                              className="w-full rounded-lg border border-[#d1d7db] px-3 py-2 text-sm outline-none focus:border-[#00a884]"
                            />
                          </div>
                          <div className="mt-4 flex justify-end gap-2">
                            <button
                              type="button"
                              onClick={closeComposeModal}
                              className="rounded-lg px-3 py-2 text-sm text-[#54656f] hover:bg-[#f0f2f5]"
                            >
                              Cancelar
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                const name = contactName.trim();
                                const phone = contactPhone.trim();
                                if (!name || !phone) return;
                                void sendQuickStructuredMessage(
                                  `Contato:\nNome: ${name}\nTelefone: ${phone}`,
                                );
                                setContactName("");
                                setContactPhone("");
                                closeComposeModal();
                              }}
                              className="rounded-lg bg-[#00a884] px-3 py-2 text-sm font-medium text-white hover:bg-[#02916f]"
                            >
                              Enviar
                            </button>
                          </div>
                        </>
                      )}
                      {composeModal === "poll" && (
                        <>
                          <h3 className="text-lg font-semibold text-[#111b21]">
                            Criar enquete
                          </h3>
                          <div className="mt-3 space-y-2">
                            <input
                              value={pollQuestion}
                              onChange={(event) =>
                                setPollQuestion(event.target.value)
                              }
                              placeholder="Pergunta"
                              className="w-full rounded-lg border border-[#d1d7db] px-3 py-2 text-sm outline-none focus:border-[#00a884]"
                            />
                            <textarea
                              value={pollOptions}
                              onChange={(event) =>
                                setPollOptions(event.target.value)
                              }
                              placeholder="Uma opção por linha"
                              rows={4}
                              className="w-full rounded-lg border border-[#d1d7db] px-3 py-2 text-sm outline-none focus:border-[#00a884]"
                            />
                          </div>
                          <div className="mt-4 flex justify-end gap-2">
                            <button
                              type="button"
                              onClick={closeComposeModal}
                              className="rounded-lg px-3 py-2 text-sm text-[#54656f] hover:bg-[#f0f2f5]"
                            >
                              Cancelar
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                const question = pollQuestion.trim();
                                const options = pollOptions
                                  .split("\n")
                                  .map((item) => item.trim())
                                  .filter(Boolean);
                                if (!question || options.length < 2) return;
                                const body = options
                                  .map((item, index) => `${index + 1}. ${item}`)
                                  .join("\n");
                                void sendQuickStructuredMessage(
                                  `Enquete:\n${question}\n${body}`,
                                );
                                setPollQuestion("");
                                setPollOptions("");
                                closeComposeModal();
                              }}
                              className="rounded-lg bg-[#00a884] px-3 py-2 text-sm font-medium text-white hover:bg-[#02916f]"
                            >
                              Enviar
                            </button>
                          </div>
                        </>
                      )}
                      {composeModal === "event" && (
                        <>
                          <h3 className="text-lg font-semibold text-[#111b21]">
                            Criar evento
                          </h3>
                          <div className="mt-3 space-y-2">
                            <input
                              value={eventTitle}
                              onChange={(event) =>
                                setEventTitle(event.target.value)
                              }
                              placeholder="Título"
                              className="w-full rounded-lg border border-[#d1d7db] px-3 py-2 text-sm outline-none focus:border-[#00a884]"
                            />
                            <input
                              value={eventWhen}
                              onChange={(event) =>
                                setEventWhen(event.target.value)
                              }
                              placeholder="Data e hora (ex: 10/05/2026 14:30)"
                              className="w-full rounded-lg border border-[#d1d7db] px-3 py-2 text-sm outline-none focus:border-[#00a884]"
                            />
                            <input
                              value={eventLocation}
                              onChange={(event) =>
                                setEventLocation(event.target.value)
                              }
                              placeholder="Local (opcional)"
                              className="w-full rounded-lg border border-[#d1d7db] px-3 py-2 text-sm outline-none focus:border-[#00a884]"
                            />
                          </div>
                          <div className="mt-4 flex justify-end gap-2">
                            <button
                              type="button"
                              onClick={closeComposeModal}
                              className="rounded-lg px-3 py-2 text-sm text-[#54656f] hover:bg-[#f0f2f5]"
                            >
                              Cancelar
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                const title = eventTitle.trim();
                                const when = eventWhen.trim();
                                const location = eventLocation.trim();
                                if (!title || !when) return;
                                const locationLine = location
                                  ? `\nLocal: ${location}`
                                  : "";
                                void sendQuickStructuredMessage(
                                  `Evento:\n${title}\nQuando: ${when}${locationLine}`,
                                );
                                setEventTitle("");
                                setEventWhen("");
                                setEventLocation("");
                                closeComposeModal();
                              }}
                              className="rounded-lg bg-[#00a884] px-3 py-2 text-sm font-medium text-white hover:bg-[#02916f]"
                            >
                              Enviar
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                )}
              </footer>

              <LeadDrawer
                open={leadDrawerOpen}
                dark={isDarkMode}
                lead={profileLead ?? null}
                pipelines={crmPipelines}
                pipelineStages={pipelineStages}
                events={events}
                draft={leadDrawerDraft}
                saving={leadDrawerSaving}
                onClose={closeLeadDrawer}
                onDraftChange={(patch) =>
                  setLeadDrawerDraft((current) => ({ ...current, ...patch }))
                }
                onSave={() => void saveLeadDrawer()}
              />
            </>
          ) : (
            <div
              className={clsx(
                "flex h-full items-center justify-center text-sm",
                isDarkMode ? "text-[#9a9a9a]" : "text-[#667781]",
              )}
            >
              Selecione uma conversa
            </div>
          )}
        </main>
        {hsmModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
            <div
              className={clsx(
                "w-full max-w-lg rounded-3xl border p-6 shadow-2xl transition-all space-y-4",
                isDarkMode
                  ? "border-zinc-800 bg-[#121318] text-zinc-100"
                  : "border-zinc-200 bg-white text-zinc-900",
              )}
            >
              <div className="flex items-center justify-between border-b pb-3 border-zinc-200 dark:border-zinc-800">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-500 border border-amber-500/20 text-lg">
                    ✉️
                  </div>
                  <div>
                    <h3 className="text-base font-bold tracking-tight">
                      Templates HSM WhatsApp Oficial (Meta)
                    </h3>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">
                      Modelos pré-aprovados para reengajamento após a janela de
                      24h
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setHsmModalOpen(false)}
                  className="rounded-full p-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400 transition-colors"
                  aria-label="Fechar"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="space-y-3 max-h-[380px] overflow-y-auto pr-1">
                {META_HSM_TEMPLATES.map((tpl) => (
                  <div
                    key={tpl.id}
                    onClick={() => {
                      const text = tpl.text
                        .replace("{{1}}", profileLead?.name || "Cliente")
                        .replace(
                          "{{2}}",
                          profileLead?.event_interest || "PainelGRID",
                        )
                        .replace("{{3}}", "14:00");
                      setDraft(text);
                      setHsmModalOpen(false);
                      pushToast({
                        message: `Template "${tpl.name}" selecionado!`,
                        type: "success",
                      });
                    }}
                    className={clsx(
                      "group cursor-pointer rounded-2xl border p-4 transition-all hover:scale-[1.01] hover:border-[#FF0636]",
                      isDarkMode
                        ? "border-zinc-800 bg-zinc-900/60 hover:bg-zinc-800/80"
                        : "border-zinc-200 bg-zinc-50 hover:bg-zinc-100",
                    )}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs font-bold text-[#FF0636] group-hover:underline">
                        {tpl.name}
                      </span>
                      <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                        {tpl.category}
                      </span>
                    </div>
                    <p
                      className={clsx(
                        "text-xs leading-relaxed",
                        isDarkMode ? "text-zinc-300" : "text-zinc-700",
                      )}
                    >
                      {tpl.text}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default ChatPage;
