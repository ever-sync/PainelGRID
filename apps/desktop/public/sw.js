const CACHE_NAME = "grid-recepcao-v3";
const DEVELOPMENT_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);
const VERSIONED_ASSET_PATTERN =
  /^\/assets\/.+-[A-Za-z0-9_-]{8,}\.[A-Za-z0-9]+$/;

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        }),
      );
    }),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Nunca intercepte módulos, HMR ou navegações do servidor de desenvolvimento.
  if (DEVELOPMENT_HOSTS.has(url.hostname)) return;

  // Cache somente GETs HTTP(S) de mesma origem. API e realtime são sempre rede.
  if (url.protocol !== "http:" && url.protocol !== "https:") return;
  if (event.request.method !== "GET") return;
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api") || url.pathname.startsWith("/socket.io"))
    return;
  if (url.pathname === "/sw.js") return;

  event.respondWith(
    (async () => {
      const cachedResponse = await caches.match(event.request);

      // Assets do Vite possuem hash no nome: o conteúdo nunca muda para a
      // mesma URL, então cache-first elimina rede e revalidação com segurança.
      if (VERSIONED_ASSET_PATTERN.test(url.pathname)) {
        if (cachedResponse) {
          return cachedResponse;
        }

        try {
          const networkResponse = await fetch(event.request);
          if (networkResponse.ok) {
            const cache = await caches.open(CACHE_NAME);
            await cache.put(event.request, networkResponse.clone());
          }
          return networkResponse;
        } catch {
          return cachedResponse ?? Response.error();
        }
      }

      // HTML e arquivos sem hash continuam network-first para receber novas
      // versões imediatamente, mantendo o cache como fallback offline.
      try {
        const networkResponse = await fetch(event.request);

        if (networkResponse.ok) {
          const cache = await caches.open(CACHE_NAME);
          await cache.put(event.request, networkResponse.clone());

          if (event.request.mode === "navigate") {
            await cache.put("/index.html", networkResponse.clone());
          }
        }

        return networkResponse;
      } catch {
        if (cachedResponse) {
          return cachedResponse;
        }

        if (
          event.request.mode === "navigate" ||
          event.request.headers.get("accept")?.includes("text/html")
        ) {
          const appShell = await caches.match("/index.html");
          if (appShell) {
            return appShell;
          }
        }

        // Resposta de erro controlada: evita rejeições não tratadas no FetchEvent.
        return Response.error();
      }
    })(),
  );
});
