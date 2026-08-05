import { httpRequest } from "./http";
import { API_BASE } from "./http";
import type {
  AgentActionLog,
  Conversation,
  ConversationChannel,
  Message,
} from "../types";

export type ApiConversationRow = {
  id: string;
  client_id: string;
  lead_id: string;
  lead_name: string;
  channel: ConversationChannel;
  last_message_at: string | null;
  last_message: string;
  handoff_required: boolean;
  handoff_reason: string | null;
  last_agent_action: string | null;
  handoff_updated_at: string | null;
  created_at: string;
};

export type ApiMessage = {
  id: string;
  conversation_id: string;
  sender_type: "system" | "user" | "lead";
  sender_id: string | null;
  content: string;
  media_id?: string | null;
  media_url?: string | null;
  created_at: string;
};

export type ApiAgentActionLog = AgentActionLog;

export function listConversations(clientId: string | undefined, token: string) {
  const qs = new URLSearchParams();
  if (clientId) qs.set("client_id", clientId);
  return httpRequest<ApiConversationRow[]>(`/conversations?${qs.toString()}`, {
    method: "GET",
    token,
  });
}

export function ensureConversation(
  clientId: string,
  leadId: string,
  token: string,
  channel: ConversationChannel = "whatsapp",
) {
  return httpRequest<ApiConversationRow>("/conversations/ensure", {
    method: "POST",
    token,
    body: {
      client_id: clientId,
      lead_id: leadId,
      channel,
    },
  });
}

export function listMessages(conversationId: string, token: string) {
  return httpRequest<ApiMessage[]>(
    `/conversations/${conversationId}/messages`,
    {
      method: "GET",
      token,
    },
  );
}

export function listConversationAgentActions(
  conversationId: string,
  token: string,
) {
  return httpRequest<ApiAgentActionLog[]>(
    `/conversations/${conversationId}/agent-actions`,
    {
      method: "GET",
      token,
    },
  );
}

function mapSender(t: ApiMessage["sender_type"]): Message["sender"] {
  if (t === "lead") return "lead";
  if (t === "user") return "vendor";
  return "system";
}

export function mapRowToConversation(
  row: ApiConversationRow,
  messages: ApiMessage[],
): Conversation {
  return {
    id: row.id,
    client_id: row.client_id,
    lead_id: row.lead_id,
    lead_name: row.lead_name,
    channel: row.channel,
    last_message: row.last_message,
    last_message_time: row.last_message_at ?? row.created_at,
    unread_count: 0,
    handoff_required: row.handoff_required,
    handoff_reason: row.handoff_reason,
    last_agent_action: row.last_agent_action,
    handoff_updated_at: row.handoff_updated_at,
    agent_actions: [],
    messages: mapApiMessagesToMessages(messages),
  };
}

export function conversationFromListRow(row: ApiConversationRow): Conversation {
  return mapRowToConversation(row, []);
}

export function mapApiMessagesToMessages(messages: ApiMessage[]): Message[] {
  return messages.map((m) => ({
    id: m.id,
    sender: mapSender(m.sender_type),
    text: m.content,
    media_id: m.media_id ?? null,
    media_url: m.media_url ?? null,
    timestamp: m.created_at,
  }));
}

export function postConversationMessage(
  conversationId: string,
  content: string,
  token: string,
) {
  return httpRequest<ApiMessage>(`/conversations/${conversationId}/messages`, {
    method: "POST",
    token,
    body: { content },
  });
}

export async function postConversationMedia(
  conversationId: string,
  file: File,
  token: string,
  caption?: string,
) {
  if (!API_BASE) {
    throw new Error("API nao configurada.");
  }
  const url = `${API_BASE}/conversations/${conversationId}/media`;
  const form = new FormData();
  form.append("file", file);
  if (caption?.trim()) {
    form.append("caption", caption.trim());
  }

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: form,
  });

  const raw = await response.text();
  let parsed: unknown = null;
  if (raw) {
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = raw;
    }
  }
  if (!response.ok) {
    const message =
      parsed && typeof parsed === "object" && "message" in parsed
        ? String((parsed as { message?: unknown }).message)
        : `Falha no envio de mídia (${response.status})`;
    throw new Error(message);
  }
  return parsed as ApiMessage;
}

export async function fetchConversationMessageMedia(
  messageId: string,
  token: string,
) {
  if (!API_BASE) {
    throw new Error("API nao configurada.");
  }

  const response = await fetch(
    `${API_BASE}/conversations/messages/${messageId}/media`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  );

  if (!response.ok) {
    throw new Error(`Falha ao carregar midia (${response.status})`);
  }

  return response.blob();
}

type CachedMessageMedia = {
  promise: Promise<Blob>;
  expiresAt: number;
};

const messageMediaCache = new Map<string, CachedMessageMedia>();
const MESSAGE_MEDIA_CACHE_TTL_MS = 10 * 60 * 1000;
const MESSAGE_MEDIA_CACHE_MAX_ENTRIES = 100;

function pruneMessageMediaCache() {
  while (messageMediaCache.size > MESSAGE_MEDIA_CACHE_MAX_ENTRIES) {
    const oldestKey = messageMediaCache.keys().next().value as
      string | undefined;
    if (!oldestKey) break;
    messageMediaCache.delete(oldestKey);
  }
}

export function fetchConversationMessageMediaCached(
  messageId: string,
  token: string,
) {
  const cacheKey = `${token}:${messageId}`;
  const cached = messageMediaCache.get(cacheKey);
  if (cached) {
    if (cached.expiresAt > Date.now()) {
      return cached.promise;
    }
    messageMediaCache.delete(cacheKey);
  }

  const request = fetchConversationMessageMedia(messageId, token).catch(
    (error) => {
      messageMediaCache.delete(cacheKey);
      throw error;
    },
  );
  messageMediaCache.set(cacheKey, {
    promise: request,
    expiresAt: Date.now() + MESSAGE_MEDIA_CACHE_TTL_MS,
  });
  pruneMessageMediaCache();
  return request;
}
