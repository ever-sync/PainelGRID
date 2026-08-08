import {
  memo,
  useEffect,
  useMemo,
  useState,
  type MutableRefObject,
} from "react";
import clsx from "clsx";
import {
  AlertCircle,
  CheckCheck,
  ChevronDown,
  Clock3,
  Search,
  UserRound,
  Sparkles,
} from "lucide-react";
import type { Client, Conversation, Lead, Message } from "../../types";
import { fetchConversationMessageMediaCached } from "../../services/conversations";
import type { ApiCrmStage } from "../../services/crm";

type ViewFilter = "all" | "unread" | "whatsapp" | "internal";

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
        "group flex w-full items-center gap-3.5 px-4 py-3.5 text-left transition-all duration-200 border-b",
        dark
          ? selected
            ? "bg-zinc-800/80 border-zinc-700/60"
            : "bg-transparent border-zinc-900 hover:bg-zinc-900/60"
          : selected
            ? "bg-rose-50/70 border-rose-100"
            : "bg-transparent border-zinc-100 hover:bg-zinc-50/80",
      )}
    >
      <div
        className={clsx(
          "flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-xs font-black shadow-sm transition-transform group-hover:scale-105",
          selected
            ? "bg-[#FF0636] text-white ring-2 ring-[#FF0636]/30"
            : dark
              ? "bg-zinc-800 text-zinc-200 border border-zinc-700/60"
              : "bg-zinc-100 text-zinc-700 border border-zinc-200/80",
        )}
      >
        {getInitials(conversation.lead_name)}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <p
            className={clsx(
              "truncate text-sm font-semibold tracking-tight",
              dark ? "text-zinc-100" : "text-zinc-900",
              selected && !dark && "text-[#FF0636]",
            )}
          >
            {conversation.lead_name}
          </p>
          <span
            className={clsx(
              "text-[11px] font-medium shrink-0",
              dark ? "text-zinc-400" : "text-zinc-400",
            )}
          >
            {formatTime(conversation.last_message_time)}
          </span>
        </div>

        <div className="mt-1 flex items-center justify-between gap-2">
          <p
            className={clsx(
              "truncate text-xs leading-normal",
              dark ? "text-zinc-400" : "text-zinc-500",
            )}
          >
            {conversation.last_message}
          </p>
          {conversation.unread_count > 0 && (
            <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-[#FF0636] px-1.5 text-[10px] font-extrabold text-white shadow-sm shrink-0">
              {conversation.unread_count}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}

const MemoConversationRow = memo(ConversationRow);

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

    void fetchConversationMessageMediaCached(message.id, token)
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
          "mt-2 rounded-xl px-3 py-2 text-xs font-medium",
          dark ? "bg-zinc-800 text-zinc-400" : "bg-zinc-100 text-zinc-600",
        )}
      >
        Mídia indisponível. Tente reenviar ou aguarde a próxima mensagem.
      </div>
    );
  }

  if (!objectUrl) {
    return (
      <div
        className={clsx(
          "mt-2 h-28 animate-pulse rounded-xl",
          dark ? "bg-zinc-800" : "bg-zinc-200",
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
          "mt-2 block overflow-hidden rounded-2xl border shadow-sm transition-transform hover:scale-[1.01]",
          dark ? "border-zinc-700" : "border-zinc-200",
        )}
      >
        <img
          src={objectUrl}
          alt="Imagem enviada no chat"
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
        className="mt-2 block max-h-72 w-[320px] max-w-full rounded-2xl bg-black"
      />
    );
  }

  return (
    <a
      href={objectUrl}
      target="_blank"
      rel="noreferrer"
      className={clsx(
        "mt-2 inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-semibold shadow-sm transition-colors",
        dark
          ? "bg-zinc-800 text-zinc-100 hover:bg-zinc-700"
          : "bg-zinc-100 text-zinc-900 hover:bg-zinc-200",
      )}
    >
      Abrir arquivo
    </a>
  );
}

function MessageBubble({
  message,
  token,
  dark,
}: {
  message: Message;
  token: string;
  dark: boolean;
}) {
  const isVendor = message.sender === "vendor";
  const isSystem = message.sender === "system";
  const outboundStatus = message.send_status ?? "sent";

  if (isSystem) {
    return (
      <div className="flex justify-center py-2">
        <span
          className={clsx(
            "rounded-full px-4 py-1 text-[11px] font-semibold shadow-sm border",
            dark
              ? "border-zinc-800 bg-zinc-900 text-zinc-400"
              : "border-zinc-200 bg-white/90 text-zinc-500",
          )}
        >
          {message.text}
        </span>
      </div>
    );
  }

  return (
    <div
      className={clsx("flex my-1", isVendor ? "justify-end" : "justify-start")}
    >
      <article
        className={clsx(
          "w-fit max-w-[85%] px-4 py-2.5 text-sm leading-relaxed shadow-sm sm:max-w-[75%] lg:max-w-[65%]",
          isVendor
            ? "rounded-2xl rounded-tr-xs bg-[#FF0636] text-white"
            : dark
              ? "rounded-2xl rounded-tl-xs bg-[#181920] text-zinc-100 border border-zinc-800"
              : "rounded-2xl rounded-tl-xs bg-zinc-100 text-zinc-900 border border-zinc-200/60",
        )}
      >
        {((!message.media_url && !message.media_id) ||
          !isMediaPlaceholder(message.text)) && (
          <p className="whitespace-pre-line break-words font-medium">
            {message.text}
          </p>
        )}
        {(message.media_url || message.media_id) && (
          <MediaAttachment message={message} token={token} dark={dark} />
        )}
        <div
          className={clsx(
            "mt-1.5 flex items-center justify-end gap-1.5 text-[10px] font-semibold tracking-wide",
            isVendor
              ? "text-white/80"
              : dark
                ? "text-zinc-400"
                : "text-zinc-400",
          )}
        >
          {isVendor && outboundStatus === "sending" && (
            <Clock3
              size={12}
              strokeWidth={2}
              aria-hidden
              className="shrink-0 text-white/70"
            />
          )}
          {isVendor && outboundStatus === "failed" && (
            <AlertCircle
              size={12}
              strokeWidth={2}
              aria-hidden
              className="shrink-0 text-white"
            />
          )}
          <span>{formatTime(message.timestamp)}</span>
          {isVendor &&
            (outboundStatus === "sent" ||
              outboundStatus === "delivered" ||
              outboundStatus === "read") && (
              <span
                title={
                  outboundStatus === "read" ? "Lida pelo cliente" : "Entregue"
                }
              >
                <CheckCheck
                  size={14}
                  className={clsx(
                    "shrink-0 transition-colors",
                    outboundStatus === "read"
                      ? "text-cyan-300"
                      : "text-white/80",
                  )}
                  aria-hidden
                />
              </span>
            )}
        </div>
      </article>
    </div>
  );
}

const MemoMessageBubble = memo(MessageBubble);

export function ConversationSidebar({
  clients,
  selectedClientId,
  onSelectClientId,
  allowAllClients = false,
  search,
  onSearchChange,
  viewFilter,
  onViewFilterChange,
  filteredConversations,
  selectedConversationId,
  dark,
  onSelectConversation,
  hasMore = false,
  loadingMore = false,
  onLoadMore,
}: {
  clients: Client[];
  selectedClientId: string;
  onSelectClientId: (clientId: string) => void;
  allowAllClients?: boolean;
  search: string;
  onSearchChange: (value: string) => void;
  viewFilter: ViewFilter;
  onViewFilterChange: (value: ViewFilter) => void;
  filteredConversations: Conversation[];
  selectedConversationId: string;
  dark: boolean;
  onSelectConversation: (conversationId: string) => void;
  /** Paginacao: a lista deixou de vir inteira em uma resposta so. */
  hasMore?: boolean;
  loadingMore?: boolean;
  onLoadMore?: () => void;
}) {
  return (
    <aside
      className={clsx(
        "flex h-full w-full lg:w-[320px] xl:w-[340px] shrink-0 min-h-0 flex-col border-r",
        dark
          ? "border-zinc-800/80 bg-[#111217]"
          : "border-zinc-200/80 bg-white",
      )}
    >
      <div
        className={clsx(
          "flex items-center justify-between px-5 py-4 border-b",
          dark
            ? "border-zinc-800/80 bg-[#15161b]"
            : "border-zinc-100 bg-zinc-50/60",
        )}
      >
        <div className="flex items-center gap-2">
          <h1
            className={clsx(
              "text-xl font-bold tracking-tight",
              dark ? "text-zinc-100" : "text-zinc-950",
            )}
          >
            Conversas
          </h1>
          <span className="rounded-full bg-[#FF0636]/10 px-2.5 py-0.5 text-xs font-bold text-[#FF0636]">
            {filteredConversations.length}
          </span>
        </div>
      </div>

      <div className="space-y-3 p-4">
        {clients.length > 0 && (
          <div
            className={clsx(
              "rounded-2xl border px-3.5 py-2 transition-all",
              dark
                ? "border-zinc-800 bg-zinc-900/60 focus-within:border-zinc-700"
                : "border-zinc-200 bg-zinc-50 focus-within:border-zinc-300",
            )}
          >
            <label htmlFor="client-select" className="sr-only">
              Cliente
            </label>
            <div
              className={clsx(
                "flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.16em]",
                dark ? "text-zinc-400" : "text-zinc-400",
              )}
            >
              <span>Cliente Selecionado</span>
              <ChevronDown size={12} />
            </div>
            <select
              id="client-select"
              value={selectedClientId}
              onChange={(event) => onSelectClientId(event.target.value)}
              className={clsx(
                "mt-0.5 w-full bg-transparent text-xs font-semibold outline-none cursor-pointer",
                dark ? "text-zinc-100" : "text-zinc-900",
              )}
            >
              {allowAllClients ? (
                <option
                  value=""
                  className={dark ? "bg-zinc-900 text-zinc-100" : ""}
                >
                  Todos os clientes
                </option>
              ) : null}
              {clients.map((client) => (
                <option
                  key={client.id}
                  value={client.id}
                  className={dark ? "bg-zinc-900 text-zinc-100" : ""}
                >
                  {client.company_name}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="relative">
          <Search
            size={16}
            className={clsx(
              "pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2",
              dark ? "text-zinc-400" : "text-zinc-400",
            )}
          />
          <input
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Pesquisar conversa ou lead..."
            className={clsx(
              "w-full rounded-2xl border py-2.5 pl-10 pr-3.5 text-xs font-medium outline-none transition-all",
              dark
                ? "border-zinc-800 bg-zinc-900/60 text-zinc-100 placeholder:text-zinc-400 focus:border-[#FF0636]"
                : "border-zinc-200 bg-zinc-50 text-zinc-900 placeholder:text-zinc-400 focus:border-[#FF0636] focus:bg-white",
            )}
          />
        </div>

        <div className="flex flex-wrap gap-1.5 text-xs">
          {(
            [
              { id: "all", label: "Todos" },
              { id: "unread", label: "Não lidas" },
              { id: "whatsapp", label: "WhatsApp" },
              { id: "internal", label: "Interno" },
            ] as const
          ).map((item) => {
            const isActive = viewFilter === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onViewFilterChange(item.id)}
                className={clsx(
                  "rounded-xl px-3 py-1.5 text-xs font-bold transition-all",
                  isActive
                    ? "bg-[#FF0636] text-white shadow-sm"
                    : dark
                      ? "bg-zinc-900 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 border border-zinc-800"
                      : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 hover:text-zinc-900 border border-zinc-200/60",
                )}
              >
                {item.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {filteredConversations.length > 0 ? (
          <>
            {filteredConversations.map((conversation) => (
              <MemoConversationRow
                key={conversation.id}
                conversation={conversation}
                selected={conversation.id === selectedConversationId}
                dark={dark}
                onClick={() => onSelectConversation(conversation.id)}
              />
            ))}
            {hasMore && (
              <button
                type="button"
                onClick={onLoadMore}
                disabled={loadingMore}
                className={clsx(
                  "w-full px-6 py-4 text-xs font-semibold transition-colors disabled:opacity-60 cursor-pointer",
                  dark
                    ? "text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-200"
                    : "text-zinc-500 hover:bg-zinc-50 hover:text-zinc-800",
                )}
              >
                {loadingMore ? "Carregando…" : "Carregar mais conversas"}
              </button>
            )}
          </>
        ) : (
          <div
            className={clsx(
              "px-6 py-16 text-center text-xs font-medium",
              dark ? "text-zinc-400" : "text-zinc-400",
            )}
          >
            Nenhuma conversa encontrada.
          </div>
        )}
      </div>
    </aside>
  );
}

interface ChatThreadProps {
  conversation: Conversation | null;
  profileLead?: Lead | null;
  pipelineStages?: ApiCrmStage[];
  token: string;
  dark: boolean;
  scrollRef: MutableRefObject<HTMLElement | null>;
  onOpenLeadDrawer: () => void;
  onQuickChangeStage?: (stageId: string) => void;
}

export function ChatThread({
  conversation,
  profileLead,
  pipelineStages,
  token,
  dark,
  scrollRef,
  onOpenLeadDrawer,
  onQuickChangeStage,
}: ChatThreadProps) {
  const [windowSize, setWindowSize] = useState(120);

  useEffect(() => {
    setWindowSize(120);
  }, [conversation?.id]);

  const visibleMessages = useMemo(() => {
    if (!conversation) return [];
    if (conversation.messages.length <= windowSize)
      return conversation.messages;
    return conversation.messages.slice(-windowSize);
  }, [conversation, windowSize]);

  const lastLeadMessage = useMemo(() => {
    if (!conversation) return null;
    const leadMsgs = conversation.messages.filter((m) => m.sender === "lead");
    return leadMsgs[leadMsgs.length - 1] ?? null;
  }, [conversation]);

  const window24hStatus = useMemo(() => {
    if (!lastLeadMessage)
      return { isOpen: false, text: "Janela 24h Expirada", hoursLeft: 0 };
    const leadTime = new Date(lastLeadMessage.timestamp).getTime();
    const now = Date.now();
    const diffMs = now - leadTime;
    const twentyFourHoursMs = 24 * 60 * 60 * 1000;
    if (diffMs < twentyFourHoursMs) {
      const hoursLeft = Math.max(
        1,
        Math.floor((twentyFourHoursMs - diffMs) / (60 * 60 * 1000)),
      );
      return {
        isOpen: true,
        text: `Janela 24h Aberta (${hoursLeft}h)`,
        hoursLeft,
      };
    }
    return { isOpen: false, text: "Janela 24h Expirada", hoursLeft: 0 };
  }, [lastLeadMessage]);

  if (!conversation) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
        <div
          className={clsx(
            "flex h-16 w-16 items-center justify-center rounded-3xl border shadow-sm",
            dark
              ? "border-zinc-800 bg-zinc-900 text-zinc-400"
              : "border-zinc-200 bg-zinc-50 text-zinc-400",
          )}
        >
          <Sparkles size={28} className="text-[#FF0636]" />
        </div>
        <div>
          <p
            className={clsx(
              "text-base font-bold tracking-tight",
              dark ? "text-zinc-200" : "text-zinc-900",
            )}
          >
            Selecione uma conversa
          </p>
          <p
            className={clsx(
              "mt-1 text-xs",
              dark ? "text-zinc-400" : "text-zinc-500",
            )}
          >
            Escolha um lead na barra lateral para visualizar as mensagens e
            interagir.
          </p>
        </div>
      </div>
    );
  }

  return (
    <>
      <header
        className={clsx(
          "flex items-center justify-between gap-3 px-6 py-4 border-b",
          dark
            ? "border-zinc-800/80 bg-[#15161b]"
            : "border-zinc-100 bg-white/90",
        )}
      >
        <div className="flex min-w-0 items-center gap-3.5">
          <div
            className={clsx(
              "flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-xs font-black text-white shadow-sm bg-[#FF0636]",
            )}
          >
            {getInitials(conversation.lead_name)}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <p
                className={clsx(
                  "truncate text-base font-bold tracking-tight",
                  dark ? "text-zinc-100" : "text-zinc-950",
                )}
              >
                {conversation.lead_name}
              </p>
              {window24hStatus.isOpen ? (
                <span className="shrink-0 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 px-2.5 py-0.5 text-[10px] font-extrabold flex items-center gap-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  {window24hStatus.text}
                </span>
              ) : (
                <span
                  className="shrink-0 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 px-2.5 py-0.5 text-[10px] font-extrabold flex items-center gap-1"
                  title="Janela de 24h da Meta expirada. Requer envio de Template HSM para retomar contato."
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                  {window24hStatus.text}
                </span>
              )}
            </div>
            <p
              className={clsx(
                "truncate text-xs font-medium",
                dark ? "text-zinc-400" : "text-zinc-400",
              )}
            >
              {conversation.last_message_time
                ? `Visto por último hoje às ${formatTime(conversation.last_message_time)}`
                : "Visto recentemente"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {pipelineStages && pipelineStages.length > 0 && profileLead && (
            <div className="relative">
              <select
                value={profileLead.crm_stage_id ?? ""}
                onChange={(e) => onQuickChangeStage?.(e.target.value)}
                className={clsx(
                  "rounded-2xl border px-3 py-2 text-xs font-bold transition-all cursor-pointer outline-none shadow-xs",
                  dark
                    ? "border-zinc-700 bg-zinc-800 text-[#FF0636] focus:border-[#FF0636]"
                    : "border-rose-200 bg-rose-50 text-[#FF0636] focus:border-[#FF0636]",
                )}
              >
                <option value="">Sem Etapa CRM</option>
                {pipelineStages.map((stage) => (
                  <option
                    key={stage.id}
                    value={stage.id}
                    className={
                      dark
                        ? "bg-zinc-900 text-zinc-100"
                        : "bg-white text-zinc-900"
                    }
                  >
                    📍 {stage.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <button
            type="button"
            onClick={onOpenLeadDrawer}
            className={clsx(
              "inline-flex items-center gap-1.5 rounded-2xl border px-3.5 py-2 text-xs font-bold shadow-sm transition-all hover:scale-[1.02]",
              dark
                ? "border-zinc-700 bg-zinc-800/80 text-zinc-100 hover:bg-zinc-800"
                : "border-zinc-200 bg-zinc-50 text-zinc-800 hover:bg-zinc-100",
            )}
          >
            <UserRound size={15} className="text-[#FF0636]" />
            <span>Ficha do Lead</span>
          </button>
        </div>
      </header>

      <section
        ref={scrollRef}
        className={clsx(
          "flex-1 overflow-y-auto px-4 py-5 sm:px-6",
          dark ? "bg-[#0b0c10]" : "bg-zinc-50/50",
        )}
      >
        {conversation.messages.length > visibleMessages.length && (
          <div className="mb-4 flex justify-center">
            <button
              type="button"
              onClick={() => setWindowSize((current) => current + 120)}
              className={clsx(
                "rounded-full px-4 py-1.5 text-xs font-bold shadow-sm transition-all border",
                dark
                  ? "border-zinc-800 bg-zinc-900 text-zinc-300 hover:bg-zinc-800"
                  : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-100",
              )}
            >
              Carregar mensagens anteriores
            </button>
          </div>
        )}

        <div className="flex w-full flex-col gap-1.5">
          {visibleMessages.map((message) => (
            <MemoMessageBubble
              key={message.id}
              message={message}
              token={token}
              dark={dark}
            />
          ))}
        </div>
      </section>
    </>
  );
}

export default ChatThread;
