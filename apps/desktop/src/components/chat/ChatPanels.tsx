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
  Phone,
  Search,
  UserRound,
} from "lucide-react";
import type { Client, Conversation, Lead, Message } from "../../types";
import { fetchConversationMessageMediaCached } from "../../services/conversations";

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
            "rounded-md px-3 py-1 text-xs shadow-sm",
            dark ? "bg-[#151515] text-[#a6a6a6]" : "bg-white/80 text-[#54656f]",
          )}
        >
          {message.text}
        </span>
      </div>
    );
  }

  return (
    <div className={clsx("flex", isVendor ? "justify-end" : "justify-start")}>
      <article
        className={clsx(
          "w-fit max-w-[88%] rounded-lg px-3.5 py-2 text-[15px] leading-relaxed shadow-[0_1px_0.5px_rgba(11,20,26,0.13)] sm:max-w-[78%] lg:max-w-[68%] xl:max-w-[62%]",
          isVendor
            ? dark
              ? "rounded-tr-sm bg-[#1f1f1f] text-[#f1f1f1]"
              : "rounded-tr-sm bg-[#d9fdd3] text-[#111b21]"
            : dark
              ? "rounded-tl-sm bg-[#121212] text-[#f1f1f1]"
              : "rounded-tl-sm bg-white text-[#111b21]",
        )}
        style={{ contentVisibility: "auto", containIntrinsicSize: "1px 160px" }}
      >
        {((!message.media_url && !message.media_id) ||
          !isMediaPlaceholder(message.text)) && (
          <p className="whitespace-pre-line break-words">{message.text}</p>
        )}
        {(message.media_url || message.media_id) && (
          <MediaAttachment message={message} token={token} dark={dark} />
        )}
        <div
          className={clsx(
            "mt-1 flex items-center justify-end gap-1 text-[11px]",
            dark ? "text-[#9a9a9a]" : "text-[#667781]",
          )}
        >
          {isVendor && outboundStatus === "sending" && (
            <Clock3
              size={13}
              strokeWidth={2}
              aria-hidden
              className="shrink-0 text-[#667781]"
            />
          )}
          {isVendor && outboundStatus === "failed" && (
            <AlertCircle
              size={13}
              strokeWidth={2}
              aria-hidden
              className="shrink-0 text-red-500/90 dark:text-red-400/90"
            />
          )}
          <span>{formatTime(message.timestamp)}</span>
          {isVendor && outboundStatus === "sent" && (
            <CheckCheck
              size={13}
              className="shrink-0 text-[#53bdeb]"
              aria-hidden
            />
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
  search,
  onSearchChange,
  viewFilter,
  onViewFilterChange,
  filteredConversations,
  selectedConversationId,
  dark,
  onSelectConversation,
}: {
  clients: Client[];
  selectedClientId: string;
  onSelectClientId: (clientId: string) => void;
  search: string;
  onSearchChange: (value: string) => void;
  viewFilter: ViewFilter;
  onViewFilterChange: (value: ViewFilter) => void;
  filteredConversations: Conversation[];
  selectedConversationId: string;
  dark: boolean;
  onSelectConversation: (conversationId: string) => void;
}) {
  return (
    <aside
      className={clsx(
        "flex min-h-0 flex-col",
        dark ? "border-r border-[#242424] bg-[#000000]" : "bg-white",
      )}
    >
      <div
        className={clsx(
          "flex items-center justify-between px-4 py-3",
          dark ? "border-b border-[#242424] bg-[#0f0f0f]" : "bg-[#f0f2f5]",
        )}
      >
        <h1
          className={clsx(
            "text-[30px] font-semibold tracking-[-0.02em] sm:text-[32px]",
            dark ? "text-[#f1f1f1]" : "text-[#111b21]",
          )}
        >
          Conversas
        </h1>
        <button
          type="button"
          className={clsx(
            "inline-flex h-10 w-10 items-center justify-center rounded-full transition-colors",
            dark
              ? "text-[#c7c7c7] hover:bg-white/10"
              : "text-[#54656f] hover:bg-[#e9edef]",
          )}
          aria-label="Nova conversa"
        >
          <UserRound size={20} />
        </button>
      </div>

      <div
        className={clsx(
          "space-y-3 px-4 pb-4 pt-3",
          dark ? "bg-[#000000]" : "bg-white",
        )}
      >
        <div
          className={clsx(
            "rounded-lg px-3 py-2",
            dark ? "bg-[#121212]" : "bg-[#f0f2f5]",
          )}
        >
          <label htmlFor="client-select" className="sr-only">
            Cliente
          </label>
          <div
            className={clsx(
              "flex items-center gap-2 text-xs uppercase tracking-[0.1em]",
              dark ? "text-[#9a9a9a]" : "text-[#667781]",
            )}
          >
            Cliente
            <ChevronDown size={14} />
          </div>
          <select
            id="client-select"
            value={selectedClientId}
            onChange={(event) => onSelectClientId(event.target.value)}
            className={clsx(
              "mt-1 w-full bg-transparent text-sm font-medium outline-none",
              dark ? "text-[#f1f1f1]" : "text-[#111b21]",
            )}
          >
            {clients.map((client) => (
              <option key={client.id} value={client.id}>
                {client.company_name}
              </option>
            ))}
          </select>
        </div>

        <div className="relative">
          <Search
            size={18}
            className={clsx(
              "pointer-events-none absolute left-3 top-1/2 -translate-y-1/2",
              dark ? "text-[#9a9a9a]" : "text-[#667781]",
            )}
          />
          <input
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Pesquisar"
            className={clsx(
              "w-full rounded-lg py-2.5 pl-10 pr-3 text-[16px] outline-none transition-colors",
              dark
                ? "bg-[#121212] text-[#f1f1f1] placeholder:text-[#9a9a9a] focus:bg-[#1a1a1a]"
                : "bg-[#f0f2f5] text-[#111b21] focus:bg-[#e9edef]",
            )}
          />
        </div>

        <div className="flex flex-wrap gap-1 text-xs">
          {(
            [
              { id: "all", label: "Todos" },
              { id: "unread", label: "Nao lidas" },
              { id: "whatsapp", label: "WhatsApp" },
              { id: "internal", label: "Interno" },
            ] as const
          ).map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onViewFilterChange(item.id)}
              className={clsx(
                "rounded-full px-3 py-1.5 font-medium transition-colors",
                viewFilter === item.id
                  ? "bg-[#d9fdd3] text-[#025144]"
                  : dark
                    ? "bg-[#121212] text-[#9a9a9a] hover:bg-[#1a1a1a]"
                    : "bg-[#f0f2f5] text-[#667781] hover:bg-[#e9edef]",
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <div
        className={clsx(
          "min-h-0 flex-1 overflow-y-auto",
          dark ? "bg-[#000000]" : "bg-white",
        )}
      >
        {filteredConversations.length > 0 ? (
          filteredConversations.map((conversation) => (
            <MemoConversationRow
              key={conversation.id}
              conversation={conversation}
              selected={conversation.id === selectedConversationId}
              dark={dark}
              onClick={() => onSelectConversation(conversation.id)}
            />
          ))
        ) : (
          <div
            className={clsx(
              "px-6 py-16 text-center text-sm",
              dark ? "text-[#9a9a9a]" : "text-[#667781]",
            )}
          >
            Nenhuma conversa encontrada com estes filtros.
          </div>
        )}
      </div>
    </aside>
  );
}

interface ChatThreadProps {
  conversation: Conversation | null;
  token: string;
  dark: boolean;
  scrollRef: MutableRefObject<HTMLElement | null>;
  onOpenLeadDrawer: () => void;
}

export function ChatThread({
  conversation,
  token,
  dark,
  scrollRef,
  onOpenLeadDrawer,
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

  if (!conversation) {
    return (
      <div
        className={clsx(
          "flex h-full items-center justify-center text-sm",
          dark ? "text-[#9a9a9a]" : "text-[#667781]",
        )}
      >
        Selecione uma conversa
      </div>
    );
  }

  return (
    <>
      <header
        className={clsx(
          "flex items-center justify-between gap-3 px-4 py-3",
          dark ? "border-b border-[#242424] bg-[#0f0f0f]" : "bg-[#f0f2f5]",
        )}
      >
        <div className="flex min-w-0 items-center gap-3">
          <div
            className={clsx(
              "flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sm font-semibold",
              dark
                ? "bg-[#1d1d1d] text-[#d7d7d7]"
                : "bg-[#dfe5e7] text-[#3b4a54]",
            )}
          >
            {getInitials(conversation.lead_name)}
          </div>
          <div className="min-w-0">
            <p
              className={clsx(
                "truncate text-[17px] font-medium",
                dark ? "text-[#f1f1f1]" : "text-[#111b21]",
              )}
            >
              {conversation.lead_name}
            </p>
            <p
              className={clsx(
                "truncate text-[13px]",
                dark ? "text-[#9a9a9a]" : "text-[#667781]",
              )}
            >
              {conversation.last_message_time
                ? `visto por ultimo hoje as ${formatTime(conversation.last_message_time)}`
                : "visto recentemente"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            className={clsx(
              "inline-flex h-10 w-10 items-center justify-center rounded-full transition-colors",
              dark
                ? "text-[#c7c7c7] hover:bg-white/10"
                : "text-[#54656f] hover:bg-[#e9edef]",
            )}
            aria-label="Ligacao"
          >
            <Phone size={20} />
          </button>
          <button
            type="button"
            onClick={onOpenLeadDrawer}
            className={clsx(
              "inline-flex h-10 w-10 items-center justify-center rounded-full transition-colors",
              dark
                ? "text-[#c7c7c7] hover:bg-white/10"
                : "text-[#54656f] hover:bg-[#e9edef]",
            )}
            aria-label="Abrir ficha do lead"
          >
            <UserRound size={20} />
          </button>
        </div>
      </header>

      <section
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-2 py-4 sm:px-3 sm:py-5 lg:px-4 xl:px-5"
        style={
          dark
            ? {
                backgroundColor: "#000000",
                backgroundImage:
                  "radial-gradient(rgba(255,255,255,0.05) 1.2px, transparent 1.2px), radial-gradient(rgba(255,255,255,0.05) 1.2px, #000000 1.2px)",
                backgroundSize: "32px 32px",
                backgroundPosition: "0 0, 16px 16px",
              }
            : {
                backgroundColor: "#efeae2",
                backgroundImage:
                  "radial-gradient(rgba(211, 205, 193, 0.45) 1.2px, transparent 1.2px), radial-gradient(rgba(211, 205, 193, 0.45) 1.2px, #efeae2 1.2px)",
                backgroundSize: "32px 32px",
                backgroundPosition: "0 0, 16px 16px",
              }
        }
      >
        {conversation.messages.length > visibleMessages.length && (
          <div className="mb-3 flex justify-center">
            <button
              type="button"
              onClick={() => setWindowSize((current) => current + 120)}
              className={clsx(
                "rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                dark
                  ? "bg-[#151515] text-[#d7d7d7] hover:bg-[#1d1d1d]"
                  : "bg-white text-[#54656f] hover:bg-[#f0f2f5]",
              )}
            >
              Carregar anteriores
            </button>
          </div>
        )}

        <div className="flex w-full flex-col gap-2">
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
