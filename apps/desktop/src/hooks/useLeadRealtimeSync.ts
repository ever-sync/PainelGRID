import { useEffect, useRef } from "react";
import { readStoredSession } from "../services/auth";
import { connectRealtime, type RealtimeLeadEvent } from "../services/realtime";

type RefreshHandler = () => unknown;
type RealtimeLeadEventName = "lead_updated" | "lead_checkin" | "stage_changed";
export type RealtimeStatus = "connected" | "reconnecting" | "offline";

/** Janela para agrupar eventos em rajada (ex.: bulk move dispara N eventos quase juntos). */
const COALESCE_WINDOW_MS = 200;
/** Acima disso, um refresh completo sai mais barato do que N getLead direcionados. */
const MAX_TARGETED_FETCHES = 8;

export function useLeadRealtimeSync(
  clientId: string | null | undefined,
  refresh: RefreshHandler,
  options?: {
    enabled?: boolean;
    pollMs?: number;
    connectDelayMs?: number;
    refreshOnEvent?: boolean;
    onEvent?: (
      event: RealtimeLeadEventName,
      payload: RealtimeLeadEvent,
    ) => unknown;
    onStatus?: (status: RealtimeStatus) => unknown;
    onOnlineVendors?: (userIds: string[]) => unknown;
  },
) {
  const refreshRef = useRef(refresh);
  const onEventRef = useRef(options?.onEvent);
  const onStatusRef = useRef(options?.onStatus);
  const onOnlineVendorsRef = useRef(options?.onOnlineVendors);
  const frameRef = useRef<number | null>(null);

  useEffect(() => {
    refreshRef.current = refresh;
  }, [refresh]);

  useEffect(() => {
    onEventRef.current = options?.onEvent;
  }, [options?.onEvent]);

  useEffect(() => {
    onStatusRef.current = options?.onStatus;
  }, [options?.onStatus]);

  useEffect(() => {
    onOnlineVendorsRef.current = options?.onOnlineVendors;
  }, [options?.onOnlineVendors]);

  useEffect(() => {
    if (options?.enabled === false) return;
    const session = readStoredSession();
    if (!session?.accessToken) return;

    const queueRefresh = () => {
      if (frameRef.current != null) return;
      frameRef.current = window.requestAnimationFrame(() => {
        frameRef.current = null;
        void refreshRef.current();
      });
    };

    // Coalescing: acumulamos eventos numa janela curta. Lote pequeno -> upsert
    // direcionado (1 getLead por lead, ultimo evento vence). Lote grande ou evento
    // sem lead_id (import em massa) -> um unico refresh completo.
    const pending = new Map<
      string,
      { eventName: RealtimeLeadEventName; payload: RealtimeLeadEvent }
    >();
    let pendingNoId = false;
    let flushTimer: number | null = null;

    const flushEvents = () => {
      flushTimer = null;
      const entries = Array.from(pending.values());
      const hadNoId = pendingNoId;
      pending.clear();
      pendingNoId = false;

      if (hadNoId || entries.length > MAX_TARGETED_FETCHES) {
        queueRefresh();
        return;
      }

      for (const { eventName, payload } of entries) {
        void onEventRef.current?.(eventName, payload);
      }
      if (options?.refreshOnEvent !== false) {
        queueRefresh();
      }
    };

    const handleRealtimeEvent =
      (eventName: RealtimeLeadEventName) => (payload: RealtimeLeadEvent) => {
        if (payload?.lead_id) {
          pending.set(payload.lead_id, { eventName, payload });
        } else {
          pendingNoId = true;
        }
        if (flushTimer == null) {
          flushTimer = window.setTimeout(flushEvents, COALESCE_WINDOW_MS);
        }
      };

    const leadUpdatedHandler = handleRealtimeEvent("lead_updated");
    const leadCheckinHandler = handleRealtimeEvent("lead_checkin");
    const stageChangedHandler = handleRealtimeEvent("stage_changed");
    const onlineVendorsHandler = (userIds: string[]) => {
      onOnlineVendorsRef.current?.(userIds);
    };

    // Conexao recuperada (sleep, troca de rede, deploy): a cada (re)conexao refazemos
    // o board inteiro para recuperar eventos perdidos offline. queueRefresh coalesce.
    const handleConnect = () => {
      onStatusRef.current?.("connected");
      queueRefresh();
    };
    const handleReconnect = () => {
      queueRefresh();
    };
    const handleDisconnect = () => onStatusRef.current?.("reconnecting");
    const handleReconnectAttempt = () => onStatusRef.current?.("reconnecting");
    const handleConnectError = () => onStatusRef.current?.("reconnecting");

    // Rede do SO caiu/voltou: status imediato (o socket.io cuida da reconexao).
    const handleBrowserOffline = () => onStatusRef.current?.("offline");
    const handleBrowserOnline = () => onStatusRef.current?.("reconnecting");
    // Voltar para a aba: atualiza na hora, sem esperar o proximo poll.
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        queueRefresh();
      }
    };
    window.addEventListener("offline", handleBrowserOffline);
    window.addEventListener("online", handleBrowserOnline);
    document.addEventListener("visibilitychange", handleVisibility);

    let socket: ReturnType<typeof connectRealtime> | null = null;
    const connectTimer =
      clientId != null && clientId !== ""
        ? window.setTimeout(() => {
            socket = connectRealtime(clientId);
            socket.on("lead_updated", leadUpdatedHandler);
            socket.on("lead_checkin", leadCheckinHandler);
            socket.on("stage_changed", stageChangedHandler);
            socket.on("online_vendors", onlineVendorsHandler);
            socket.on("connect", handleConnect);
            socket.on("disconnect", handleDisconnect);
            socket.on("connect_error", handleConnectError);
            socket.io.on("reconnect", handleReconnect);
            socket.io.on("reconnect_attempt", handleReconnectAttempt);
          }, options?.connectDelayMs ?? 0)
        : null;
    const pollMs = options?.pollMs ?? 0;
    const pollTimer =
      pollMs > 0
        ? window.setInterval(() => {
            if (document.visibilityState !== "visible") return;
            queueRefresh();
          }, pollMs)
        : null;

    return () => {
      if (connectTimer != null) {
        window.clearTimeout(connectTimer);
      }
      if (pollTimer != null) {
        window.clearInterval(pollTimer);
      }
      if (flushTimer != null) {
        window.clearTimeout(flushTimer);
      }
      window.removeEventListener("offline", handleBrowserOffline);
      window.removeEventListener("online", handleBrowserOnline);
      document.removeEventListener("visibilitychange", handleVisibility);
      if (socket) {
        socket.off("lead_updated", leadUpdatedHandler);
        socket.off("lead_checkin", leadCheckinHandler);
        socket.off("stage_changed", stageChangedHandler);
        socket.off("online_vendors", onlineVendorsHandler);
        socket.off("connect", handleConnect);
        socket.off("disconnect", handleDisconnect);
        socket.off("connect_error", handleConnectError);
        socket.io.off("reconnect", handleReconnect);
        socket.io.off("reconnect_attempt", handleReconnectAttempt);
        socket.disconnect();
      }
      if (frameRef.current != null) {
        window.cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
    };
  }, [
    clientId,
    options?.connectDelayMs,
    options?.enabled,
    options?.pollMs,
    options?.refreshOnEvent,
  ]);
}
