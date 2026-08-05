/**
 * FRONTEND_URL pode ser uma origem ou varias separadas por virgula, ex.:
 * http://localhost:5173
 * http://localhost:5173,https://g-pde-vendas-desktop.vercel.app
 *
 * Normaliza para bater com o header Origin do browser (sem path, sem barra final).
 */
export function normalizeWebOrigin(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) {
    return trimmed;
  }
  try {
    return new URL(trimmed).origin;
  } catch {
    return trimmed.replace(/\/+$/, "");
  }
}

export function parseAllowedOrigins(
  raw: string | undefined,
  fallback: string,
): string[] {
  const value = raw?.trim() || fallback;
  return value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map(normalizeWebOrigin)
    .filter(Boolean);
}

/** @deprecated Prefira createCorsOriginDelegate com credentials: true */
export function resolveCorsOrigins(
  raw: string | undefined,
  fallback: string,
): string | string[] {
  const parts = parseAllowedOrigins(raw, fallback);
  if (parts.length === 0) {
    return fallback;
  }
  return parts.length === 1 ? parts[0]! : parts;
}

/**
 * Callback do pacote `cors`: com credentials, a origem na resposta deve espelhar o Origin do pedido
 * quando este estiver na allowlist.
 */
export function createCorsOriginDelegate(
  raw: string | undefined,
  fallback: string,
): (
  origin: string | undefined,
  cb: (err: Error | null, allow?: boolean) => void,
) => void {
  const allowed = new Set(parseAllowedOrigins(raw, fallback));

  return (origin, cb) => {
    if (!origin) {
      cb(null, true);
      return;
    }
    cb(null, allowed.has(normalizeWebOrigin(origin)));
  };
}
