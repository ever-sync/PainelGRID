import type { User } from "../types";

export const AUTH_STORAGE_KEY = "painelgrid.auth.session";

/** Sessao persistida: apenas access + user; refresh fica em cookie httpOnly. */
export type PersistedAuthSession = {
  user: User;
  accessToken: string;
};

/** Mesmo nome de evento usado para sincronizar React após refresh no `http.ts`. */
export const AUTH_SESSION_UPDATED_EVENT = "painelgrid-auth-session-updated";

function readFromStorage(storage: Storage): PersistedAuthSession | null {
  const raw = storage.getItem(AUTH_STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as PersistedAuthSession;
    if (!parsed?.accessToken || !parsed?.user?.id) return null;
    return {
      user: parsed.user,
      accessToken: parsed.accessToken,
    };
  } catch {
    return null;
  }
}

/** localStorage sobrevive a fechar o navegador/app ("lembrar-me"); sessionStorage nao. */
export function readPersistedSession(): PersistedAuthSession | null {
  if (typeof window === "undefined") return null;
  return (
    readFromStorage(window.localStorage) ??
    readFromStorage(window.sessionStorage)
  );
}

/** "Lembrar-me" desmarcado nao tem equivalente confiavel na WebView nativa: sempre persiste lá. */
export function isSessionRemembered(): boolean {
  if (typeof window === "undefined") return true;
  return window.sessionStorage.getItem(AUTH_STORAGE_KEY) == null;
}

/**
 * remember=true (padrao): localStorage, sobrevive ao fechar. remember=false: sessionStorage,
 * some ao fechar o navegador. Sempre limpa a outra chave para não deixar copia obsoleta.
 */
export function writePersistedSession(
  session: PersistedAuthSession,
  remember = true,
): void {
  if (typeof window === "undefined") return;
  const target = remember ? window.localStorage : window.sessionStorage;
  const other = remember ? window.sessionStorage : window.localStorage;
  target.setItem(AUTH_STORAGE_KEY, JSON.stringify(session));
  other.removeItem(AUTH_STORAGE_KEY);
}

export function clearPersistedSession(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(AUTH_STORAGE_KEY);
    window.sessionStorage.removeItem(AUTH_STORAGE_KEY);
  } catch {
    // noop
  }
}

export function notifyAuthSessionUpdated(session: PersistedAuthSession): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(AUTH_SESSION_UPDATED_EVENT, { detail: session }),
  );
}
