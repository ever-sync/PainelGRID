import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { startPerformanceMonitoring } from "./performanceMonitoring";
import { API_BASE, getBackendOrigin } from "./services/http";
import { isNativePlatform } from "./utils/platform";

const STALE_CHUNK_RECOVERY_KEY = "painelgrid:stale-chunk-recovery";
const STALE_CHUNK_RECOVERY_WINDOW_MS = 60_000;

/**
 * Uma aba aberta durante um deploy ainda referencia os chunks da versão
 * anterior. Quando o usuário navega para uma rota lazy, o arquivo antigo já
 * não existe e o import dinâmico retorna 404. O Vite emite `vite:preloadError`;
 * recarregar busca o index atual e os hashes corretos. A janela evita loop caso
 * exista uma indisponibilidade real de rede/CDN.
 */
function recoverFromStaleChunk() {
  const lastRecovery = Number(
    window.sessionStorage.getItem(STALE_CHUNK_RECOVERY_KEY) ?? 0,
  );
  if (Date.now() - lastRecovery < STALE_CHUNK_RECOVERY_WINDOW_MS) return;

  window.sessionStorage.setItem(STALE_CHUNK_RECOVERY_KEY, String(Date.now()));
  window.location.reload();
}

window.addEventListener("vite:preloadError", (event) => {
  event.preventDefault();
  recoverFromStaleChunk();
});

window.addEventListener("unhandledrejection", (event) => {
  const message =
    event.reason instanceof Error
      ? event.reason.message
      : String(event.reason ?? "");
  if (/dynamically imported module|failed to fetch.*module/i.test(message)) {
    event.preventDefault();
    recoverFromStaleChunk();
  }
});

/**
 * Aquecimento da API logo no boot: abre a conexão (preconnect) e dispara um
 * health-check fire-and-forget. Reduz o cold start percebido — a API já vai
 * "acordando" enquanto o bundle renderiza e o usuário olha a tela.
 */
function warmUpApi() {
  if (typeof document === "undefined") return;
  // O warm-up só ajuda em produção. No Vite local ele pode atingir o Nest
  // durante uma recompilação e gerar um 500 transitório no console.
  if (import.meta.env.DEV) return;

  const origin = getBackendOrigin();
  if (origin) {
    const link = document.createElement("link");
    link.rel = "preconnect";
    link.href = origin;
    link.crossOrigin = "";
    document.head.appendChild(link);
  }

  if (API_BASE) {
    void fetch(`${API_BASE}/health`, {
      method: "GET",
      credentials: "omit",
    }).catch(() => {
      /* warm-up best-effort: ignora falhas */
    });
  }
}

warmUpApi();

/**
 * O `user-scalable=no` da viewport nao vale no iOS: o Safari e o WKWebView o
 * ignoram de proposito. Os eventos `gesture*` sao a unica trava que o WebKit
 * respeita para a pinca.
 */
function blockPinchZoom() {
  const cancel = (event: Event) => event.preventDefault();
  for (const name of ["gesturestart", "gesturechange", "gestureend"]) {
    document.addEventListener(name, cancel, { passive: false });
  }
}

blockPinchZoom();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

startPerformanceMonitoring();

const DEV_SW_CLEANUP_KEY = "gpv-dev-sw-cleanup-reload";

async function removeDevelopmentServiceWorkers() {
  const registrations = await navigator.serviceWorker.getRegistrations();
  const hadController = Boolean(navigator.serviceWorker.controller);

  await Promise.all(
    registrations.map((registration) => registration.unregister()),
  );

  if ("caches" in window) {
    const cacheNames = await caches.keys();
    await Promise.all(
      cacheNames
        .filter((cacheName) => cacheName.startsWith("grid-recepcao-"))
        .map((cacheName) => caches.delete(cacheName)),
    );
  }

  // Um SW já ativo continua controlando a aba até a próxima navegação.
  if (hadController && sessionStorage.getItem(DEV_SW_CLEANUP_KEY) !== "done") {
    sessionStorage.setItem(DEV_SW_CLEANUP_KEY, "done");
    window.location.reload();
  } else if (!hadController) {
    sessionStorage.removeItem(DEV_SW_CLEANUP_KEY);
  }
}

/** No app nativo os assets sao carregados do bundle local; em desenvolvimento
 * o SW também deve ficar desligado para não cachear módulos e HMR do Vite. */
if (!isNativePlatform() && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    if (import.meta.env.DEV) {
      void removeDevelopmentServiceWorkers().catch((err) => {
        console.warn("Service Worker cleanup failed:", err);
      });
      return;
    }

    navigator.serviceWorker.register("/sw.js").catch((err) => {
      console.warn("Service Worker registration failed:", err);
    });
  });
}
