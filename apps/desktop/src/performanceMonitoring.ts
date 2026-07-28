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
}

declare global {
  interface Window {
    __GRID_WEB_VITALS__?: Partial<
      Record<Metric["name"], GridPerformanceMetric>
    >;
  }
}

const endpoint = import.meta.env.VITE_PERFORMANCE_ENDPOINT?.trim();
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
  };

  window.__GRID_WEB_VITALS__ ??= {};
  window.__GRID_WEB_VITALS__[metric.name] = payload;
  window.dispatchEvent(
    new CustomEvent<GridPerformanceMetric>("grid:web-vital", {
      detail: payload,
    }),
  );

  if (debugMetrics) {
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
