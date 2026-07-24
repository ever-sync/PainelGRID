import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { useSearchParams } from "react-router-dom";
import clsx from "clsx";
import type { Socket } from "socket.io-client";
import {
  CalendarDays,
  CheckCheck,
  Contact,
  ChevronDown,
  Clock3,
  Folder,
  Images,
  ListOrdered,
  Mic,
  Paperclip,
  Phone,
  Search,
  SendHorizontal,
  SmilePlus,
  Sparkles,
  SquarePen,
  Square,
  UserRound,
  X,
} from "lucide-react";
import {
  DASHBOARD_DARK_CHANGE_EVENT,
  readDashboardDarkEnabled,
} from "../../lib/dashboard-dark-mode";
import { readStoredSession } from "../../services/auth";
import { listClients, mapApiClientToClient } from "../../services/clients";
import {
  listCrmPipelines,
  listPipelineStages,
  type ApiCrmPipeline,
  type ApiCrmStage,
} from "../../services/crm";
import {
  type ApiMessage,
  conversationFromListRow,
  ensureConversation,
  fetchConversationMessageMedia,
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
import { listLeads, mapApiLeadToLead, updateLead } from "../../services/leads";
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

const DEMO_MOCK_CONVERSATIONS: Conversation[] = [
  {
    id: "demo-conv-1",
    client_id: "demo-client-1",
    lead_id: "demo-lead-1",
    lead_name: "Edney Ulisses",
    channel: "whatsapp",
    unread_count: 2,
    last_message: "Olá! Gostaria de confirmar o meu agendamento para o evento de hoje à tarde.",
    last_message_time: new Date().toISOString(),
    handoff_required: false,
    handoff_reason: null,
    last_agent_action: null,
    handoff_updated_at: null,
    agent_actions: [],
    messages: [
      {
        id: "msg-1-1",
        sender: "lead",
        text: "Olá! Boa tarde! Recebi o convite do evento.",
        timestamp: new Date(Date.now() - 3600000 * 3).toISOString(),
      },
      {
        id: "msg-1-2",
        sender: "vendor",
        text: "Olá Edney! Que excelente. O seu agendamento está confirmado no nosso estande exclusivo.",
        timestamp: new Date(Date.now() - 3600000 * 2).toISOString(),
      },
      {
        id: "msg-1-3",
        sender: "lead",
        text: "Perfeito! Qual é o horário exato e onde posso fazer o check-in?",
        timestamp: new Date(Date.now() - 3600000 * 1).toISOString(),
      },
      {
        id: "msg-1-4",
        sender: "lead",
        text: "Olá! Gostaria de confirmar o meu agendamento para o evento de hoje à tarde.",
        timestamp: new Date(Date.now() - 60000 * 5).toISOString(),
      },
    ],
  },
  {
    id: "demo-conv-2",
    client_id: "demo-client-1",
    lead_id: "demo-lead-2",
    lead_name: "Mariana Costa",
    channel: "whatsapp",
    unread_count: 0,
    last_message: "Obrigada pelas informações! Nos vemos no estande.",
    last_message_time: new Date(Date.now() - 3600000 * 5).toISOString(),
    handoff_required: false,
    handoff_reason: null,
    last_agent_action: null,
    handoff_updated_at: null,
    agent_actions: [],
    messages: [
      {
        id: "msg-2-1",
        sender: "lead",
        text: "Vocês possuem condições especiais de financiamento para o evento?",
        timestamp: new Date(Date.now() - 3600000 * 6).toISOString(),
      },
      {
        id: "msg-2-2",
        sender: "vendor",
        text: "Sim Mariana! Teremos taxas exclusivas de evento a partir de 0,99% a.m. com avaliação FIPE no seu usado.",
        timestamp: new Date(Date.now() - 3600000 * 5.5).toISOString(),
      },
      {
        id: "msg-2-3",
        sender: "lead",
        text: "Obrigada pelas informações! Nos vemos no estande.",
        timestamp: new Date(Date.now() - 3600000 * 5).toISOString(),
      },
    ],
  },
  {
    id: "demo-conv-3",
    client_id: "demo-client-1",
    lead_id: "demo-lead-3",
    lead_name: "Carlos Eduardo Santos",
    channel: "whatsapp",
    unread_count: 1,
    last_message: "Podem me enviar a localização exata no Waze?",
    last_message_time: new Date(Date.now() - 3600000 * 8).toISOString(),
    handoff_required: true,
    handoff_reason: "Atendimento humano solicitado",
    last_agent_action: null,
    handoff_updated_at: new Date(Date.now() - 3600000 * 8).toISOString(),
    agent_actions: [],
    messages: [
      {
        id: "msg-3-1",
        sender: "lead",
        text: "Podem me enviar a localização exata no Waze?",
        timestamp: new Date(Date.now() - 3600000 * 8).toISOString(),
      },
    ],
  },
];

function makeDemoLead(
  overrides: Pick<Lead, "id" | "name" | "phone" | "email" | "source"> &
    Partial<Lead>,
): Lead {
  const now = new Date().toISOString();
  return {
    client_id: "demo-client-1",
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
    active_appointment: null,
    created_at: now,
    updated_at: now,
    ...overrides,
  };
}

const DEMO_MOCK_LEADS: Lead[] = [
  makeDemoLead({
    id: "demo-lead-1",
    name: "Edney Ulisses",
    phone: "(11) 98765-4321",
    email: "edney.ulisses@email.com",
    event_interest: "Mega Feirão de Seminovos",
    crm_stage_id: "stage-confirmed",
    confirmation_status: "confirmed",
    source: "whatsapp",
  }),
  makeDemoLead({
    id: "demo-lead-2",
    name: "Mariana Costa",
    phone: "(11) 99887-6655",
    email: "mariana.costa@email.com",
    event_interest: "VIP Test Drive Premium",
    crm_stage_id: "stage-[#FF0636]",
    confirmation_status: "scheduled",
    source: "form_page",
  }),
  makeDemoLead({
    id: "demo-lead-3",
    name: "Carlos Eduardo Santos",
    phone: "(11) 97112-3344",
    email: "carlos.eduardo@email.com",
    event_interest: "Mega Feirão de Seminovos",
    crm_stage_id: "stage-new",
    confirmation_status: "pending",
    source: "facebook_ads",
  }),
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

function formatTime(date: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(date));
}

function getInitials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function formatLastSeen(date: string | null | undefined) {
  if (!date) return "visto recentemente";
  return `visto por ultimo hoje as ${formatTime(date)}`;
}

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

function isImageMessage(message: Message) {
  if (!message.media_url && !message.media_id) return false;
  const lowerText = message.text.trim().toLowerCase();
  if (lowerText === "[imagem]") return true;
  return /\.(png|jpe?g|gif|webp|bmp|svg)(\?.*)?$/i.test(
    message.media_url ?? "",
  );
}

function isMediaPlaceholder(text: string) {
  return [
    "[imagem]",
    "[audio]",
    "[video]",
    "[documento]",
    "[sticker]",
  ].includes(text.trim().toLowerCase());
}

function MediaAttachment({
  message,
  token,
  dark = false,
}: {
  message: Message;
  token: string;
  dark?: boolean;
}) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [contentType, setContentType] = useState("");
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!message.media_url && !message.media_id) return;

    let active = true;
    let currentObjectUrl: string | null = null;

    void fetchConversationMessageMedia(message.id, token)
      .then((blob) => {
        if (!active) return;
        currentObjectUrl = URL.createObjectURL(blob);
        setObjectUrl(currentObjectUrl);
        setContentType(blob.type);
        setFailed(false);
      })
      .catch(() => {
        if (active) setFailed(true);
      });

    return () => {
      active = false;
      if (currentObjectUrl) {
        URL.revokeObjectURL(currentObjectUrl);
      }
    };
  }, [message.id, message.media_id, message.media_url, token]);

  if (!message.media_url && !message.media_id) return null;

  if (failed) {
    return (
      <div
        className={clsx(
          "mt-2 rounded-md px-3 py-2 text-[13px]",
          dark ? "bg-[#151515] text-[#a6a6a6]" : "bg-black/5 text-[#54656f]",
        )}
      >
        Midia indisponivel. Tente reenviar ou aguarde a proxima mensagem.
      </div>
    );
  }

  if (!objectUrl) {
    return (
      <div
        className={clsx(
          "mt-2 h-24 animate-pulse rounded-md",
          dark ? "bg-[#151515]" : "bg-black/10",
        )}
      />
    );
  }

  const label = message.text.trim().toLowerCase();
  const isImage =
    contentType.startsWith("image/") ||
    label === "[imagem]" ||
    isImageMessage(message);
  const isAudio = contentType.startsWith("audio/") || label === "[audio]";
  const isVideo = contentType.startsWith("video/") || label === "[video]";

  if (isImage) {
    return (
      <a
        href={objectUrl}
        target="_blank"
        rel="noreferrer"
        className={clsx(
          "mt-2 block overflow-hidden rounded-md border",
          dark ? "border-white/10" : "border-black/10",
        )}
      >
        <img
          src={objectUrl}
          alt="Imagem enviada no WhatsApp"
          loading="lazy"
          className="max-h-72 w-full object-cover"
        />
      </a>
    );
  }

  if (isAudio) {
    return (
      <audio
        controls
        src={objectUrl}
        className="mt-2 block w-[260px] max-w-full"
      />
    );
  }

  if (isVideo) {
    return (
      <video
        controls
        src={objectUrl}
        className="mt-2 block max-h-72 w-[320px] max-w-full rounded-md bg-black"
      />
    );
  }

  return (
    <a
      href={objectUrl}
      target="_blank"
      rel="noreferrer"
      className={clsx(
        "mt-2 block rounded-md px-3 py-2 text-[13px] font-medium underline",
        dark ? "bg-[#151515] text-[#d7d7d7]" : "bg-black/5 text-[#005c4b]",
      )}
    >
      Abrir arquivo
    </a>
  );
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

function ConversationRow({
  conversation,
  selected,
  dark,
  onClick,
}: {
  conversation: Conversation;
  selected: boolean;
  dark: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        "group flex w-full items-center gap-3 px-3 py-3 text-left transition-colors",
        dark
          ? selected
            ? "bg-[#1f1f1f]"
            : "bg-[#0f0f0f] hover:bg-[#171717]"
          : selected
            ? "bg-[#f0f2f5]"
            : "bg-white hover:bg-[#f5f6f6]",
      )}
    >
      <div
        className={clsx(
          "flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-sm font-bold",
          dark ? "bg-[#1d1d1d] text-[#d7d7d7]" : "bg-[#dfe5e7] text-[#3b4a54]",
        )}
      >
        {getInitials(conversation.lead_name)}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <p
            className={clsx(
              "truncate text-[16px] font-medium leading-none",
              dark ? "text-[#f1f1f1]" : "text-[#111b21]",
            )}
          >
            {conversation.lead_name}
          </p>
          <span
            className={clsx(
              "text-xs",
              dark ? "text-[#9a9a9a]" : "text-[#667781]",
            )}
          >
            {formatTime(conversation.last_message_time)}
          </span>
        </div>

        <div className="mt-1 flex items-center gap-2">
          {conversation.unread_count > 0 && (
            <span className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[#25d366] px-1.5 text-[11px] font-semibold text-[#0b141a]">
              {conversation.unread_count}
            </span>
          )}
          <p
            className={clsx(
              "truncate text-[15px]",
              dark ? "text-[#9a9a9a]" : "text-[#667781]",
            )}
          >
            {conversation.last_message}
          </p>
        </div>
      </div>
    </button>
  );
}

export function ChatPage() {
  const { user, gestorClientId, setGestorClientId } = useGestorClient();
  const [searchParams] = useSearchParams();
  const [isDarkMode, setIsDarkMode] = useState(() =>
    readDashboardDarkEnabled(user.id),
  );
  const [clients, setClients] = useState<Client[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [draft, setDraft] = useState("");
  const [search, setSearch] = useState("");
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
  const selectedClientId = gestorClientId;
  const requestedClientId = searchParams.get("client_id") ?? "";
  const requestedLeadId = searchParams.get("lead_id") ?? "";
  const effectiveClientId =
    user.role === "gestor" ? selectedClientId : (user.client_id ?? "");

  const token = readStoredSession()?.accessToken;

  // Refs estáveis evitam recriar `applyIncomingMessage` a cada render —
  // antes, mudar `selectedId` recriava a callback, o que disparava o
  // useEffect do socket e fazia disconnect/reconnect a cada clique no
  // chat (com janela de eventos perdidos).
  const selectedIdRef = useRef("");
  const selectedClientIdRef = useRef("");
  const tokenRef = useRef<string | undefined>(undefined);
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
    if (user.role !== "gestor") return;
    if (requestedClientId && requestedClientId !== selectedClientId) {
      setGestorClientId(requestedClientId);
    }
  }, [requestedClientId, selectedClientId, setGestorClientId, user.role]);

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

  const refreshConversations = useCallback(() => {
    const currentClientId = selectedClientIdRef.current;
    const currentToken = tokenRef.current;
    if (!currentClientId || !currentToken) return;

    void listConversations(currentClientId, currentToken)
      .then((convRows) => {
        const mapped = convRows.map(conversationFromListRow);
        setConversations((prev) => {
          // Preserva mensagens já carregadas em cada conversa para evitar piscar a thread aberta.
          const previousById = new Map(prev.map((conv) => [conv.id, conv]));
          return mapped.map((row) => {
            const existing = previousById.get(row.id);
            return existing
              ? {
                  ...row,
                  messages: existing.messages,
                  unread_count: existing.unread_count,
                }
              : row;
          });
        });
      })
      .catch(() => {
        /* fallback silencioso — evita estourar UI em pico de erros */
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
        text: event.content,
        media_id: event.media_id ?? null,
        media_url: event.media_url ?? null,
        timestamp: event.created_at,
        send_status: sender === "vendor" ? "sent" : undefined,
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
        const mapped = rows.map(mapApiClientToClient);
        setClients(mapped);
        const selectedClientStillAvailable = selectedClientId
          ? mapped.some((client) => client.id === selectedClientId)
          : false;
        if (!selectedClientStillAvailable && mapped[0]?.id) {
          setGestorClientId(mapped[0].id);
        }
      })
      .catch(() => setClients([]));
  }, [token, selectedClientId, setGestorClientId]);

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
    if (!token || !effectiveClientId) return;
    void listLeads({ client_id: effectiveClientId }, token)
      .then((leadRows) => setLeads(leadRows.map(mapApiLeadToLead)))
      .catch(() => setLeads([]));
  }, [effectiveClientId, token]);

  const handleLeadMutation = useCallback(() => {
    refreshConversations();
    refreshLeads();
  }, [refreshConversations, refreshLeads]);

  useEffect(() => {
    if (!token || !effectiveClientId) return;
    void Promise.all([
      listConversations(effectiveClientId, token),
      listLeads({ client_id: effectiveClientId }, token),
    ])
      .then(([convRows, leadRows]) => {
        const mapped = convRows.map(conversationFromListRow);
        const finalConvs = mapped.length > 0 ? mapped : DEMO_MOCK_CONVERSATIONS;
        const mappedLeads = leadRows.map(mapApiLeadToLead);
        const finalLeads = mappedLeads.length > 0 ? mappedLeads : DEMO_MOCK_LEADS;

        setConversations(finalConvs);
        setLeads(finalLeads);
        if (finalConvs[0]?.id) {
          openConversation(finalConvs[0].id);
        } else {
          setSelectedId("");
        }
      })
      .catch(() => {
        setConversations(DEMO_MOCK_CONVERSATIONS);
        setLeads(DEMO_MOCK_LEADS);
        openConversation(DEMO_MOCK_CONVERSATIONS[0].id);
      });
  }, [effectiveClientId, openConversation, token]);

  useEffect(() => {
    if (!selectedId) return;
    loadThread(selectedId, true);
  }, [selectedId, loadThread]);

  useEffect(() => {
    if (!effectiveClientId || !token) {
      return;
    }

    let socket: Socket | null = connectRealtime(effectiveClientId);
    socket.emit("join_client", { client_id: effectiveClientId });
    socket.on("new_message", applyIncomingMessage);
    socket.on("lead_updated", handleLeadMutation);

    return () => {
      socket?.off("new_message", applyIncomingMessage);
      socket?.off("lead_updated", handleLeadMutation);
      socket?.disconnect();
      socket = null;
    };
  }, [applyIncomingMessage, effectiveClientId, handleLeadMutation, token]);

  // Polling de segurança: garante que mensagens cheguem mesmo quando o
  // WebSocket falha (ex.: deploy serverless no Vercel não mantém conexões
  // persistentes; rede instável; bloqueio por proxy corporativo).
  // Intervalo conservador (30s) para não sobrecarregar a API.
  useEffect(() => {
    if (!effectiveClientId || !token) return;

    const POLL_MS = 30_000;
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

  const selectedClient = useMemo(
    () => clientsById.get(selectedClientId) ?? clients[0],
    [clients, clientsById, selectedClientId],
  );

  const selectedLead = useMemo(() => {
    if (!selected) return undefined;
    return leadsById.get(selected.lead_id);
  }, [leadsById, selected]);

  const profileLead = selected
    ? (selectedLead ?? stubLead(selected, selected.client_id))
    : undefined;

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
    if (!leadDrawerOpen || !profileLead) return;
    setLeadDrawerDraft(makeLeadDrawerDraft(profileLead));
  }, [leadDrawerOpen, profileLead]);

  function openLeadDrawer() {
    if (!profileLead) return;
    setLeadDrawerOpen(true);
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
          confirmation_status:
            leadDrawerDraft.status === "confirmed"
              ? "confirmed"
              : leadDrawerDraft.status === "checked_in"
                ? "checked_in"
                : leadDrawerDraft.status === "cancelled"
                  ? "cancelled"
                  : "pending",
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
      const dedupKey = phoneDigits.length >= 8 ? phoneDigits : conv.lead_id || conv.id;

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
        Nenhum cliente cadastrado. Crie um cliente para iniciar conversas.
      </div>
    );
  }

  return (
    <div
      className={clsx(
        "h-full w-full overflow-hidden rounded-[28px] border shadow-sm transition-all flex",
        isDarkMode ? "border-zinc-800/80 bg-[#0f1015]" : "border-zinc-200/80 bg-white",
      )}
    >
      <div className="flex flex-col lg:flex-row h-full min-h-0 w-full">
        <ConversationSidebar
          clients={clients}
          selectedClientId={selectedClientId}
          onSelectClientId={setGestorClientId}
          search={search}
          onSearchChange={setSearch}
          viewFilter={viewFilter}
          onViewFilterChange={setViewFilter}
          filteredConversations={filteredConversations}
          selectedConversationId={selected?.id ?? ""}
          dark={isDarkMode}
          onSelectConversation={openConversation}
        />

        <main
          className={clsx(
            "relative flex flex-1 min-h-0 flex-col",
            isDarkMode ? "bg-[#0b0c10]" : "bg-zinc-50/50",
          )}
        >
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
                onQuickChangeStage={(stageId) => void handleQuickChangeStage(stageId)}
              />

              <footer
                className={clsx(
                  "relative p-3.5 border-t space-y-2.5",
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
                      onClick={() => setDraft((current) => current ? `${current} ${reply.text}` : reply.text)}
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
          <div className={clsx(
            "w-full max-w-lg rounded-3xl border p-6 shadow-2xl transition-all space-y-4",
            isDarkMode ? "border-zinc-800 bg-[#121318] text-zinc-100" : "border-zinc-200 bg-white text-zinc-900"
          )}>
            <div className="flex items-center justify-between border-b pb-3 border-zinc-200 dark:border-zinc-800">
              <div className="flex items-center gap-2.5">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-500 border border-amber-500/20 text-lg">
                  ✉️
                </div>
                <div>
                  <h3 className="text-base font-bold tracking-tight">Templates HSM WhatsApp Oficial (Meta)</h3>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">Modelos pré-aprovados para reengajamento após a janela de 24h</p>
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
                      .replace("{{2}}", profileLead?.event_interest || "PainelGRID")
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
                    isDarkMode ? "border-zinc-800 bg-zinc-900/60 hover:bg-zinc-800/80" : "border-zinc-200 bg-zinc-50 hover:bg-zinc-100"
                  )}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-bold text-[#FF0636] group-hover:underline">{tpl.name}</span>
                    <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                      {tpl.category}
                    </span>
                  </div>
                  <p className={clsx("text-xs leading-relaxed", isDarkMode ? "text-zinc-300" : "text-zinc-700")}>
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
