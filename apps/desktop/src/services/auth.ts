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

export type LoginStepResult = {
  requires2fa: true;
  tempToken: string;
  message: string;
  devCodeHint?: string;
};

type LoginApiResponse = {
  requires_2fa: true;
  temp_token: string;
  message: string;
  dev_code_hint?: string;
};

type SessionApiResponse = {
  user: AuthApiUserPayload;
  access_token: string;
  refresh_token?: string;
};

type RefreshResponse = SessionApiResponse;

export type AuthSession = PersistedAuthSession;

export async function loginWithPassword(
  email: string,
  password: string,
  rememberMe = true,
): Promise<LoginStepResult> {
  const native = isNativePlatform();
  const result = await httpRequest<LoginApiResponse>(
    native ? "/auth/mobile/login" : "/auth/login",
    {
      method: "POST",
      body: {
        email,
        password,
        remember_me: rememberMe,
      },
    },
  );

  return {
    requires2fa: true,
    tempToken: result.temp_token,
    message: result.message,
    devCodeHint: result.dev_code_hint,
  };
}

export async function verifyTwoFactorCode(
  tempToken: string,
  code: string,
): Promise<AuthSession> {
  const native = isNativePlatform();
  const result = await httpRequest<SessionApiResponse>(
    native ? "/auth/mobile/2fa/verify" : "/auth/2fa/verify",
    {
    method: "POST",
    body: {
      temp_token: tempToken,
      code,
    },
    },
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

function toSession(payload: SessionApiResponse): AuthSession {
  return {
    user: mapAuthApiUser(payload.user),
    accessToken: payload.access_token,
  };
}

export { AUTH_STORAGE_KEY } from "./auth-session";
