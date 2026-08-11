import type { User } from "../types";
import { isNativePlatform } from "../utils/platform";
import { mapAuthApiUser, type AuthApiUserPayload } from "./auth-map-user";
import {
  clearPersistedSession,
  isSessionRemembered,
  readPersistedSession,
  writePersistedSession,
  type PersistedAuthSession,
} from "./auth-session";
import { API_BASE, httpRequest } from "./http";
import {
  clearNativeRefreshToken,
  readNativeRefreshToken,
  writeNativeRefreshToken,
} from "./native-refresh-store";

export type LoginStepResult =
  | {
      requires2fa: true;
      tempToken: string;
      message: string;
      devCodeHint?: string;
    }
  | {
      requires2fa: false;
      session: AuthSession;
    };

type LoginApiResponse =
  | {
      requires_2fa: true;
      temp_token: string;
      message: string;
      dev_code_hint?: string;
    }
  | SessionApiResponse;

type SessionApiResponse = {
  user: AuthApiUserPayload;
  access_token: string;
  refresh_token?: string;
};

type RefreshResponse = SessionApiResponse;

export type AuthSession = PersistedAuthSession;

const AUTH_REQUEST_TIMEOUT_MS = 20_000;

async function withAuthRequestTimeout<T>(
  request: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const controller = new AbortController();
  const timeout = globalThis.setTimeout(
    () => controller.abort(),
    AUTH_REQUEST_TIMEOUT_MS,
  );
  try {
    return await request(controller.signal);
  } catch (error) {
    if (
      controller.signal.aborted &&
      error instanceof Error &&
      error.name === "AbortError"
    ) {
      throw new Error(
        "O servidor demorou para responder. Tente novamente; se persistir, verifique o serviço de e-mail.",
      );
    }
    throw error;
  } finally {
    globalThis.clearTimeout(timeout);
  }
}

export async function loginWithPassword(
  email: string,
  password: string,
  rememberMe = true,
): Promise<LoginStepResult> {
  const native = isNativePlatform();
  const result = await withAuthRequestTimeout((signal) =>
    httpRequest<LoginApiResponse>(
      native ? "/auth/mobile/login" : "/auth/login",
      {
        method: "POST",
        body: {
          email,
          password,
          remember_me: rememberMe,
        },
        signal,
      },
    ),
  );

  if ("requires_2fa" in result) {
    return {
      requires2fa: true,
      tempToken: result.temp_token,
      message: result.message,
      devCodeHint: result.dev_code_hint,
    };
  }

  if (native && result.refresh_token) {
    await writeNativeRefreshToken(result.refresh_token);
  }

  return {
    requires2fa: false,
    session: toSession(result),
  };
}

export async function verifyTwoFactorCode(
  tempToken: string,
  code: string,
): Promise<AuthSession> {
  const native = isNativePlatform();
  const result = await withAuthRequestTimeout((signal) =>
    httpRequest<SessionApiResponse>(
      native ? "/auth/mobile/2fa/verify" : "/auth/2fa/verify",
      {
        method: "POST",
        body: {
          temp_token: tempToken,
          code,
        },
        signal,
      },
    ),
  );

  if (native && result.refresh_token) {
    await writeNativeRefreshToken(result.refresh_token);
  }

  return toSession(result);
}

export async function refreshAuthSession(): Promise<AuthSession> {
  const native = isNativePlatform();
  const nativeRefreshToken = native ? await readNativeRefreshToken() : null;
  const result = await httpRequest<RefreshResponse>(
    native ? "/auth/mobile/refresh" : "/auth/refresh",
    {
      method: "POST",
      body: nativeRefreshToken ? { refreshToken: nativeRefreshToken } : {},
    },
  );

  if (native && result.refresh_token) {
    await writeNativeRefreshToken(result.refresh_token);
  }

  return toSession(result);
}

export async function fetchMe(accessToken: string): Promise<User> {
  const me = await httpRequest<AuthApiUserPayload>("/auth/me", {
    method: "GET",
    token: accessToken,
    suppressAuthRedirect: true,
  });
  return mapAuthApiUser(me);
}

export async function logoutSession() {
  const native = isNativePlatform();
  let nativeRefreshToken: string | null = null;
  try {
    if (native) {
      nativeRefreshToken = await readNativeRefreshToken();
      if (!nativeRefreshToken) {
        return;
      }
    }
    await httpRequest<{ message: string }>(
      native ? "/auth/mobile/logout" : "/auth/logout",
      {
        method: "POST",
        body: nativeRefreshToken ? { refreshToken: nativeRefreshToken } : {},
      },
    );
  } finally {
    if (native) {
      await clearNativeRefreshToken();
    }
  }
}

export async function changePassword(
  accessToken: string,
  current_password: string,
  new_password: string,
) {
  return httpRequest<{ message: string }>("/auth/password", {
    method: "PATCH",
    token: accessToken,
    body: {
      current_password,
      new_password,
    },
  });
}

const AVATAR_UPLOAD_TIMEOUT_MS = 45_000;

export async function uploadAvatar(
  file: File,
  accessToken: string,
): Promise<User> {
  if (!API_BASE) {
    throw new Error("API nao configurada.");
  }
  const form = new FormData();
  form.append("file", file);

  const controller = new AbortController();
  const timeout = globalThis.setTimeout(
    () => controller.abort(),
    AVATAR_UPLOAD_TIMEOUT_MS,
  );

  let response: Response;
  try {
    response = await fetch(`${API_BASE}/auth/me/avatar`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      body: form,
      signal: controller.signal,
    });
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error(
        "O envio demorou demais e foi cancelado. Tente novamente.",
      );
    }
    throw error;
  } finally {
    globalThis.clearTimeout(timeout);
  }

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
        : `Falha ao enviar foto de perfil (${response.status})`;
    throw new Error(message);
  }
  return mapAuthApiUser(parsed as AuthApiUserPayload);
}

export async function updateOwnProfile(
  accessToken: string,
  dto: { name?: string; email?: string },
): Promise<User> {
  const updated = await httpRequest<AuthApiUserPayload>("/auth/me", {
    method: "PATCH",
    token: accessToken,
    body: dto,
  });
  return mapAuthApiUser(updated);
}

export async function requestPasswordReset(email: string) {
  return httpRequest<{
    message: string;
    reset_token?: string;
    expires_in_minutes: number;
  }>("/auth/password/forgot", {
    method: "POST",
    body: { email },
  });
}

export async function resetPassword(reset_token: string, new_password: string) {
  return httpRequest<{ message: string }>("/auth/password/reset", {
    method: "POST",
    body: { reset_token, new_password },
  });
}

/** Valida o link de primeira senha e devolve so o primeiro nome. Rota publica. */
export async function fetchPasswordSetupPreview(token: string) {
  return httpRequest<{ first_name: string }>(
    `/auth/password/setup/${encodeURIComponent(token)}`,
    { method: "GET" },
  );
}

export async function setupPassword(setup_token: string, new_password: string) {
  return httpRequest<{ message: string }>("/auth/password/setup", {
    method: "POST",
    body: { setup_token, new_password },
  });
}

export function readStoredSession(): AuthSession | null {
  return readPersistedSession();
}

/** Sem remember explicito, preserva o modo atual (nao reseta "nao lembrar" para "lembrar" em revalidacoes). */
export function writeStoredSession(
  session: AuthSession,
  remember: boolean = isSessionRemembered(),
) {
  writePersistedSession(session, remember);
}

export function clearStoredSession() {
  clearPersistedSession();
}

function toSession(payload: SessionApiResponse): AuthSession {
  return {
    user: mapAuthApiUser(payload.user),
    accessToken: payload.access_token,
  };
}

export { AUTH_STORAGE_KEY } from "./auth-session";
