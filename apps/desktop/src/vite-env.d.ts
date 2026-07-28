/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_PERFORMANCE_ENDPOINT?: string;
  readonly VITE_PERFORMANCE_DEBUG?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
