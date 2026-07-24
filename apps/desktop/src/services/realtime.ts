import { io, Socket } from "socket.io-client";
import { readStoredSession } from "./auth";
import { API_BASE } from "./http";

export type RealtimeNewMessageEvent = {
  conversation_id: string;
  message_id: string;
  sender_type: "lead" | "user" | "system";
  sender_id: string | null;
  content: string;
  media_id?: string | null;
  media_url?: string | null;
  created_at: string;
};

export type RealtimeLeadEvent = {
  client_id: string;
  lead_id?: string;
  source?: string;
  action?: "created" | "updated" | "deleted" | "checkin" | "stage_changed";
  updated_at?: string;
  imported?: number;
};

function resolveRealtimeUrl() {
  if (!API_BASE) {
    return "";
  }

  if (API_BASE.startsWith("/")) {
    return `${window.location.origin}/realtime`;
  }

  return `${new URL(API_BASE).origin}/realtime`;
}

export function connectRealtime(clientId: string): Socket {
  const url = resolveRealtimeUrl();
  return io(url, {
    // 'polling' como fallback: redes/proxies que bloqueiam WebSocket ainda conectam.
    transports: ["websocket", "polling"],
    query: { client_id: clientId },
    // Funcao (nao objeto): o socket.io chama isto a cada (re)conexao, garantindo o
    // token vigente. Com objeto estatico, um token rotacionado quebrava o reconnect.
    auth: (cb) => {
      cb({ token: readStoredSession()?.accessToken ?? "" });
    },
  });
}
