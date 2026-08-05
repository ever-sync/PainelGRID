import type { User } from "../types";
import {
  AUTH_SESSION_UPDATED_EVENT,
  AUTH_STORAGE_KEY,
  clearPersistedSession,
  isSessionRemembered,
  notifyAuthSessionUpdated,
  readPersistedSession,
  writePersistedSession,
  type PersistedAuthSession,
} from "./auth-session";

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();

  get length() {
    return this.values.size;
  }

  clear() {
    this.values.clear();
  }

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  key(index: number) {
    return Array.from(this.values.keys())[index] ?? null;
  }

  removeItem(key: string) {
    this.values.delete(key);
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
}

const user: User = {
  id: "user-1",
  name: "Ana",
  email: "ana@example.com",
  role: "gestor",
};

const session: PersistedAuthSession = {
  user,
  accessToken: "access-token",
};

describe("auth-session", () => {
  const localStorage = new MemoryStorage();
  const sessionStorage = new MemoryStorage();
  const dispatchEvent = jest.fn();

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    dispatchEvent.mockClear();
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: { localStorage, sessionStorage, dispatchEvent },
    });
  });

  afterAll(() => {
    Reflect.deleteProperty(globalThis, "window");
  });

  it("persiste uma sessao lembrada somente no localStorage", () => {
    writePersistedSession(session, true);

    expect(localStorage.getItem(AUTH_STORAGE_KEY)).toBe(
      JSON.stringify(session),
    );
    expect(sessionStorage.getItem(AUTH_STORAGE_KEY)).toBeNull();
    expect(readPersistedSession()).toEqual(session);
    expect(isSessionRemembered()).toBe(true);
  });

  it("persiste uma sessao temporaria somente no sessionStorage", () => {
    writePersistedSession(session, false);

    expect(sessionStorage.getItem(AUTH_STORAGE_KEY)).toBe(
      JSON.stringify(session),
    );
    expect(localStorage.getItem(AUTH_STORAGE_KEY)).toBeNull();
    expect(readPersistedSession()).toEqual(session);
    expect(isSessionRemembered()).toBe(false);
  });

  it("ignora sessao corrompida ou incompleta", () => {
    localStorage.setItem(AUTH_STORAGE_KEY, "{invalido");
    expect(readPersistedSession()).toBeNull();

    localStorage.setItem(
      AUTH_STORAGE_KEY,
      JSON.stringify({ user, accessToken: "" }),
    );
    expect(readPersistedSession()).toBeNull();
  });

  it("descarta refresh token legado ao ler a sessao do navegador", () => {
    localStorage.setItem(
      AUTH_STORAGE_KEY,
      JSON.stringify({ ...session, refreshToken: "nao-deve-ser-recuperado" }),
    );

    expect(readPersistedSession()).toEqual(session);
  });

  it("limpa as duas formas de persistencia", () => {
    localStorage.setItem(AUTH_STORAGE_KEY, "local");
    sessionStorage.setItem(AUTH_STORAGE_KEY, "session");

    clearPersistedSession();

    expect(localStorage.getItem(AUTH_STORAGE_KEY)).toBeNull();
    expect(sessionStorage.getItem(AUTH_STORAGE_KEY)).toBeNull();
  });

  it("notifica a aplicacao depois de uma renovacao silenciosa", () => {
    notifyAuthSessionUpdated(session);

    expect(dispatchEvent).toHaveBeenCalledTimes(1);
    const event = dispatchEvent.mock
      .calls[0][0] as CustomEvent<PersistedAuthSession>;
    expect(event.type).toBe(AUTH_SESSION_UPDATED_EVENT);
    expect(event.detail).toEqual(session);
  });
});
