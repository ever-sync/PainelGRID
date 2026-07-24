import { isNativePlatform } from "./platform";

/**
 * Origem do site web publico (para links compartilhaveis, ex.: avaliacao de atendimento).
 * No app nativo, window.location.origin e capacitor://localhost — inacessivel para o cliente
 * final — entao ali e obrigatorio configurar VITE_PUBLIC_WEB_URL no build.
 */
export function resolvePublicWebOrigin(): string {
  const configured = import.meta.env.VITE_PUBLIC_WEB_URL?.trim();
  if (configured) {
    return configured.replace(/\/+$/, "");
  }
  if (!isNativePlatform() && typeof window !== "undefined") {
    return window.location.origin;
  }
  return "";
}
