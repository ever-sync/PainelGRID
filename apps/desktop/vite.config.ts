import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

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

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  plugins: [
    react(),
    {
      name: 'preconnect-api',
      transformIndexHtml(html) {
        const origin = apiOriginFromEnv();
        if (!origin) {
          return html;
        }
        return html.replace(
          '</head>',
          `  <link rel="dns-prefetch" href="${origin}" />\n` +
            `  <link rel="preconnect" href="${origin}" crossorigin />\n` +
            '</head>',
        );
      },
    },
  ],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) {
            return;
          }
          if (id.includes('recharts')) {
            return 'charts';
          }
          if (id.includes('@dnd-kit')) {
            return 'dnd';
          }
          if (id.includes('lucide-react')) {
            return 'icons';
          }
          if (id.includes('socket.io-client')) {
            return 'realtime';
          }
          if (id.includes('react-router')) {
            return 'router';
          }
          if (id.includes('react') || id.includes('react-dom')) {
            return 'react-vendor';
          }
        },
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      '/socket.io': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        ws: true,
      },
    },
  },
  preview: {
    allowedHosts: ['leadflowdesktop-production.up.railway.app', '.railway.app', 'gpdevendas.app'],
  },
});
