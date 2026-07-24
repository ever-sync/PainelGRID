import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { API_BASE, getBackendOrigin } from "./services/http";
import { isNativePlatform } from "./utils/platform";

/**
 * Aquecimento da API logo no boot: abre a conexão (preconnect) e dispara um
 * health-check fire-and-forget. Reduz o cold start percebido — a API já vai
 * "acordando" enquanto o bundle renderiza e o usuário olha a tela.
 */
function warmUpApi() {
  if (typeof document === "undefined") return;

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

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

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
