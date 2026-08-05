import type { Metric } from "web-vitals";

export interface GridPerformanceMetric {
  name: Metric["name"];
  value: number;
  rating: Metric["rating"];
  delta: number;
  id: string;
  navigationType: Metric["navigationType"];
  path: string;
  recordedAt: string;
  sessionId: string;
  connectionType?: string;
  viewport: "mobile" | "tablet" | "desktop";
  deviceMemoryGb?: number;
}

declare global {
  interface Window {
    __GRID_WEB_VITALS__?: Partial<
      Record<Metric["name"], GridPerformanceMetric>
    >;
  }
}

function normalizeApiBaseUrl(raw: string): string {
  const base = raw.trim().replace(/\/+$/, "");
  return /\/api$/i.test(base) ? base : `${base}/api`;
}

function resolvePerformanceEndpoint(): string {
  const configured = import.meta.env.VITE_PERFORMANCE_ENDPOINT?.trim();
  if (configured) return configured;
  if (import.meta.env.DEV) return "/api/performance/web-vitals";

  const apiUrl = import.meta.env.VITE_API_URL?.trim();
  return apiUrl ? `${normalizeApiBaseUrl(apiUrl)}/performance/web-vitals` : "";
}

function getSessionId(): string {
  const key = "grid-performance-session";
  try {
    const existing = sessionStorage.getItem(key);
    if (existing) return existing;
    const created =
      typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    sessionStorage.setItem(key, created);
    return created;
  } catch {
    return "anonymous";
  }
}

function getDeviceContext() {
  const navigatorWithDeviceInfo = navigator as Navigator & {
    connection?: { effectiveType?: string };
    deviceMemory?: number;
  };
  const width = window.innerWidth;

  return {
    sessionId: getSessionId(),
    connectionType: navigatorWithDeviceInfo.connection?.effectiveType,
    viewport:
      width < 768
        ? ("mobile" as const)
        : width < 1_024
          ? ("tablet" as const)
          : ("desktop" as const),
    deviceMemoryGb: navigatorWithDeviceInfo.deviceMemory,
  };
}

const endpoint = resolvePerformanceEndpoint();
const debugMetrics =
  import.meta.env.DEV || import.meta.env.VITE_PERFORMANCE_DEBUG === "true";

function publishMetric(metric: Metric) {
  const payload: GridPerformanceMetric = {
    name: metric.name,
    value: Number(metric.value.toFixed(metric.name === "CLS" ? 4 : 1)),
    rating: metric.rating,
    delta: Number(metric.delta.toFixed(metric.name === "CLS" ? 4 : 1)),
    id: metric.id,
    navigationType: metric.navigationType,
    path: window.location.pathname,
    recordedAt: new Date().toISOString(),
    ...getDeviceContext(),
  };

  window.__GRID_WEB_VITALS__ ??= {};
  window.__GRID_WEB_VITALS__[metric.name] = payload;
  window.dispatchEvent(
    new CustomEvent<GridPerformanceMetric>("grid:web-vital", {
      detail: payload,
    }),
  );

  if (debugMetrics) {
    // Saida de depuracao pedida explicitamente pela flag `debugMetrics`.
    // eslint-disable-next-line no-console
    console.info("[Performance]", payload);
  }

  if (!endpoint) return;

  const body = JSON.stringify(payload);
  if (
    typeof navigator.sendBeacon === "function" &&
    navigator.sendBeacon(
      endpoint,
      new Blob([body], { type: "application/json" }),
    )
  ) {
    return;
  }

  void fetch(endpoint, {
    method: "POST",
    body,
    headers: { "Content-Type": "application/json" },
    keepalive: true,
    credentials: "omit",
  }).catch(() => {
    // Telemetria nunca deve afetar a experiência ou gerar erro para o usuário.
  });
}

async function observeWebVitals() {
  try {
    const { onCLS, onFCP, onINP, onLCP, onTTFB } = await import("web-vitals");
    const options = { reportAllChanges: false };

    onCLS(publishMetric, options);
    onFCP(publishMetric, options);
    onINP(publishMetric, options);
    onLCP(publishMetric, options);
    onTTFB(publishMetric, options);
  } catch {
    // Navegadores sem as APIs necessárias continuam funcionando normalmente.
  }
}

export function startPerformanceMonitoring() {
  if (
    typeof window === "undefined" ||
    typeof PerformanceObserver === "undefined"
  ) {
    return;
  }

  const start = () => {
    if ("requestIdleCallback" in window) {
      window.requestIdleCallback(() => void observeWebVitals(), {
        timeout: 3_000,
      });
      return;
    }
    globalThis.setTimeout(() => void observeWebVitals(), 0);
  };

  if (document.readyState === "complete") {
    start();
  } else {
    window.addEventListener("load", start, { once: true });
  }
}
