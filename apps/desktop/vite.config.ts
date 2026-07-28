import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const REACT_PACKAGES = new Set([
  "react",
  "react-dom",
  "react-is",
  "scheduler",
  "use-sync-external-store",
]);
const ROUTER_PACKAGES = new Set(["react-router", "react-router-dom"]);
function apiOriginFromEnv(): string | null {
  const raw = process.env.VITE_API_URL?.trim();
  if (!raw || !/^https?:\/\//i.test(raw)) {
    return null;
  }
  try {
    return new URL(raw).origin;
  } catch {
    return null;
  }
}

function packageNameFromModuleId(id: string): string | null {
  const normalizedId = id.replaceAll("\\", "/");
  const marker = "/node_modules/";
  const markerIndex = normalizedId.lastIndexOf(marker);
  if (markerIndex === -1) {
    return null;
  }

  const packagePath = normalizedId.slice(markerIndex + marker.length);
  const [firstSegment, secondSegment] = packagePath.split("/");
  if (!firstSegment) {
    return null;
  }

  return firstSegment.startsWith("@") && secondSegment
    ? `${firstSegment}/${secondSegment}`
    : firstSegment;
}

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  plugins: [
    react(),
    {
      name: "preconnect-api",
      transformIndexHtml(html) {
        const origin = apiOriginFromEnv();
        if (!origin) {
          return html;
        }
        return html.replace(
          "</head>",
          `  <link rel="dns-prefetch" href="${origin}" />\n` +
            `  <link rel="preconnect" href="${origin}" crossorigin />\n` +
            "</head>",
        );
      },
    },
  ],
  build: {
    manifest: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          const packageName = packageNameFromModuleId(id);
          if (!packageName) {
            return;
          }

          if (packageName.startsWith("@dnd-kit/")) {
            return "dnd";
          }
          if (packageName === "lucide-react") {
            return "icons";
          }
          if (packageName === "socket.io-client") {
            return "realtime";
          }
          if (ROUTER_PACKAGES.has(packageName)) {
            return "router";
          }
          if (packageName === "clsx") {
            return "ui-utils";
          }
          if (REACT_PACKAGES.has(packageName)) {
            return "react-vendor";
          }
        },
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:3000",
        changeOrigin: true,
      },
      "/socket.io": {
        target: "http://localhost:3000",
        changeOrigin: true,
        ws: true,
      },
    },
  },
  preview: {
    allowedHosts: [
      "leadflowdesktop-production.up.railway.app",
      ".railway.app",
      "gpdevendas.app",
    ],
  },
});
