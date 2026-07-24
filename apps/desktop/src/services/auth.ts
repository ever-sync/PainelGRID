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
import { httpRequest } from "./http";
import {
  clearNativeRefreshToken,
  readNativeRefreshToken,
  writeNativeRefreshToken,
} from "./native-refresh-store";

type LoginResponse = {
  user: AuthApiUserPayload;
  access_token: string;
  /** Presente apenas para o app nativo (ver X-Client-Platform no http.ts). */
  refresh_token?: string;
};

type RefreshResponse = {
  user: AuthApiUserPayload;
  access_token: string;
  refresh_token?: string;
};

export type AuthSession = PersistedAuthSession;

export async function loginWithPassword(
  email: string,
  password: string,
  rememberMe = true,
): Promise<AuthSession> {
  const result = await httpRequest<LoginResponse>("/auth/login", {
    method: "POST",
    body: {
      email,
      password,
      remember_me: rememberMe,
    },
  });

  if (isNativePlatform() && result.refresh_token) {
    await writeNativeRefreshToken(result.refresh_token);
  }

  return toSession(result);
}

export async function refreshAuthSession(): Promise<AuthSession> {
  const nativeRefreshToken = isNativePlatform()
    ? await readNativeRefreshToken()
    : null;
  const result = await httpRequest<RefreshResponse>("/auth/refresh", {
    method: "POST",
    body: nativeRefreshToken ? { refreshToken: nativeRefreshToken } : {},
  });

  if (isNativePlatform() && result.refresh_token) {
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
  const nativeRefreshToken = isNativePlatform()
    ? await readNativeRefreshToken()
    : null;
  try {
    await httpRequest<{ message: string }>("/auth/logout", {
      method: "POST",
      body: nativeRefreshToken ? { refreshToken: nativeRefreshToken } : {},
    });
  } finally {
    if (isNativePlatform()) {
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

function toSession(payload: LoginResponse | RefreshResponse): AuthSession {
  return {
    user: mapAuthApiUser(payload.user),
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token,
  };
}

export { AUTH_STORAGE_KEY } from "./auth-session";
