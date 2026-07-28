/**
 * Nest usa prefixo global `api` — a base deve ser .../api.
 * Aceita VITE_API_URL só com o host (ex.: https://g-pde-vendas-api.vercel.app) e completa automaticamente.
 */
import type { AuthApiUserPayload } from "./auth-map-user";
import { mapAuthApiUser } from "./auth-map-user";
import {
  clearPersistedSession,
  isSessionRemembered,
  notifyAuthSessionUpdated,
  writePersistedSession,
  type PersistedAuthSession,
} from "./auth-session";
import {
  clearNativeRefreshToken,
  readNativeRefreshToken,
  writeNativeRefreshToken,
} from "./native-refresh-store";
import { isNativePlatform } from "../utils/platform";

function normalizeApiBaseUrl(raw: string): string {
  const base = raw.trim().replace(/\/+$/, "");
  if (/\/api$/i.test(base)) {
    return base;
  }
  return `${base}/api`;
}

/** Em dev, prefira proxy do Vite (mesma origem, sem CORS). Em producao, defina VITE_API_URL no build (Vercel). */
function resolveApiBase(): string {
  if (import.meta.env.DEV) {
    return "/api";
  }

  const v = import.meta.env.VITE_API_URL?.trim();
  if (v) {
    return normalizeApiBaseUrl(v);
  }
  console.error(
    "[LeadFlow] VITE_API_URL nao definida no build. Na Vercel (desktop): Environment Variables → " +
      "VITE_API_URL = https://<sua-api>.vercel.app (o sufixo /api e adicionado automaticamente). Depois redeploy.",
  );
  return "";
}

/** Base para fetch (ex.: https://host/api ou /api em dev). */
export const API_BASE = resolveApiBase();

/** Origem do Nest (ex.: postMessage do OAuth Meta). */
export function getBackendOrigin(): string {
  const v = import.meta.env.VITE_API_URL?.trim();
  if (v && /^https?:\/\//i.test(v)) {
    return new URL(v).origin;
  }
  if (import.meta.env.DEV) {
    return "http://localhost:3000";
  }
  return "";
}

type RequestOptions = {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  token?: string | null;
  body?: unknown;
  signal?: AbortSignal;
  cache?: RequestCache;
  suppressAuthRedirect?: boolean;
  /** Interno: evita loop após uma tentativa de refresh + retry. */
  _retryAfterRefresh?: boolean;
};

function extractErrorMessage(parsed: unknown, status: number): string {
  if (
    parsed &&
    typeof parsed === "object" &&
    !Array.isArray(parsed) &&
    "message" in parsed
  ) {
    const message = (parsed as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) {
      return message;
    }
    if (Array.isArray(message)) {
      const parts = message
        .filter(
          (item): item is string =>
            typeof item === "string" && item.trim().length > 0,
        )
        .map((item) => item.trim());
      if (parts.length > 0) {
        return parts.join(" | ");
      }
    }
  }

  return `Falha na requisição (${status})`;
}

export class HttpError extends Error {
  status: number;
  payload?: unknown;

  constructor(message: string, status: number, payload?: unknown) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.payload = payload;
  }
}

/** Uma única renovação por vez quando várias requisições recebem 401 juntas. */
let refreshInFlight: Promise<string | null> | null = null;

function refreshAccessTokenSingleFlight(): Promise<string | null> {
  if (!refreshInFlight) {
    refreshInFlight = doRefreshSession().finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}

async function clearServerSessionCookie(): Promise<void> {
  if (!API_BASE) return;
  const native = isNativePlatform();
  try {
    const nativeRefreshToken = native ? await readNativeRefreshToken() : null;
    if (native && !nativeRefreshToken) {
      return;
    }
    await fetch(`${API_BASE}${native ? "/auth/mobile/logout" : "/auth/logout"}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        nativeRefreshToken ? { refreshToken: nativeRefreshToken } : {},
      ),
      credentials: "include",
    });
  } catch {
    /* noop */
  } finally {
    if (native) {
      try {
        await clearNativeRefreshToken();
      } catch {
        /* o armazenamento nativo pode estar indisponivel enquanto o dispositivo esta bloqueado */
      }
    }
  }
}

async function doRefreshSession(): Promise<string | null> {
  const native = isNativePlatform();
  const url = `${API_BASE}${native ? "/auth/mobile/refresh" : "/auth/refresh"}`;
  let response: Response;
  try {
    const nativeRefreshToken = native ? await readNativeRefreshToken() : null;
    if (native && !nativeRefreshToken) {
      return null;
    }
    response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        nativeRefreshToken ? { refreshToken: nativeRefreshToken } : {},
      ),
      credentials: "include",
    });
  } catch {
    return null;
  }

  const raw = await response.text();
  const parsed = raw ? safeJsonParse(raw) : null;
  if (
    !response.ok ||
    !parsed ||
    typeof parsed !== "object" ||
    Array.isArray(parsed)
  ) {
    return null;
  }

  const p = parsed as Record<string, unknown>;
  const access_token = p.access_token;
  const userRaw = p.user;
  if (
    typeof access_token !== "string" ||
    !userRaw ||
    typeof userRaw !== "object" ||
    Array.isArray(userRaw)
  ) {
    return null;
  }

  if (native && typeof p.refresh_token === "string") {
    await writeNativeRefreshToken(p.refresh_token);
  }

  const session: PersistedAuthSession = {
    user: mapAuthApiUser(userRaw as AuthApiUserPayload),
    accessToken: access_token,
  };
  writePersistedSession(session, isSessionRemembered());
  notifyAuthSessionUpdated(session);
  return access_token;
}

export async function httpRequest<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  if (!API_BASE) {
    throw new Error(
      "API nao configurada: defina VITE_API_URL no projeto Vercel do desktop e faca um novo deploy.",
    );
  }

  const url = `${API_BASE}${path.startsWith("/") ? path : `/${path}`}`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: options.method ?? "GET",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: options.signal,
      cache: options.cache,
    });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw err;
    }
    const hint = import.meta.env.DEV
      ? "Em desenvolvimento o front usa o proxy /api → localhost:3000. Suba o backend (npm run dev na raiz)."
      : `Base usada: ${API_BASE}. Verifique se a API está no ar, se FRONTEND_URL na Vercel (API) inclui a origem deste site (CORS) e redeploy do front após mudar VITE_API_URL.`;
    throw new Error(`Não foi possível conectar à API. ${hint}`);
  }

  const raw = await response.text();
  const parsed = raw ? safeJsonParse(raw) : null;

  if (!response.ok) {
    /** Access JWT expira cedo (~15m). Antes de deslogar, tenta `/auth/refresh` uma vez. */
    const canAttemptRefreshRetry =
      response.status === 401 && !!options.token && !options._retryAfterRefresh;

    if (canAttemptRefreshRetry) {
      const newAccessToken = await refreshAccessTokenSingleFlight();
      if (newAccessToken) {
        return httpRequest<T>(path, {
          ...options,
          token: newAccessToken,
          _retryAfterRefresh: true,
        });
      }
    }

    if (
      response.status === 401 &&
      options.token &&
      !options.suppressAuthRedirect
    ) {
      void clearServerSessionCookie();
      clearPersistedSession();
      if (
        typeof window !== "undefined" &&
        window.location.pathname !== "/login"
      ) {
        window.location.assign("/login");
      }
    }

    const message = extractErrorMessage(parsed, response.status);
    throw new HttpError(message, response.status, parsed);
  }

  return (parsed as T) ?? ({} as T);
}

function safeJsonParse(value: string) {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}
