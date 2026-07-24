/** Chave legada (única global): migrada só para o utilizador atual no primeiro read. */
const LEGACY_GLOBAL_DARK_KEY = "dashboard:dark-mode";
const STORAGE_KEY_PREFIX = "painelgrid:dashboard-dark:";

export const DASHBOARD_DARK_CHANGE_EVENT = "painelgrid-dashboard-dark-mode";

export function dashboardDarkStorageKey(userId: string): string {
  return `${STORAGE_KEY_PREFIX}${userId}`;
}

/** Preferência só por conta — não há `userId`, não há tema persistido aqui. */
export function readDashboardDarkEnabled(userId: string | undefined): boolean {
  if (!userId || typeof window === "undefined") return false;

  const key = dashboardDarkStorageKey(userId);
  let v = window.localStorage.getItem(key);

  if (v !== "1" && v !== "0") {
    const legacy = window.localStorage.getItem(LEGACY_GLOBAL_DARK_KEY);
    if (legacy === "1" || legacy === "0") {
      window.localStorage.setItem(key, legacy);
      window.localStorage.removeItem(LEGACY_GLOBAL_DARK_KEY);
      v = legacy;
    }
  }

  return v === "1";
}

export function applyDashboardDarkEnabled(
  userId: string | undefined,
  enabled: boolean,
): void {
  if (
    !userId ||
    typeof window === "undefined" ||
    typeof document === "undefined"
  )
    return;

  const key = dashboardDarkStorageKey(userId);
  window.localStorage.setItem(key, enabled ? "1" : "0");
  document.body.classList.toggle("dashboard-dark-active", enabled);
  /** Classe padrao shadcn/Tailwind (`darkMode: 'class'`) — componentes novos (Button, Badge, ...) leem essa. */
  document.documentElement.classList.toggle("dark", enabled);
  window.dispatchEvent(new Event(DASHBOARD_DARK_CHANGE_EVENT));
}
