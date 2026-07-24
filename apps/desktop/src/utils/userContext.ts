import type { User } from "../types";

/** ID da empresa vinculada ao token; sem fallback mock. */
export function resolveClientId(user: User): string | null {
  return user.client_id ?? null;
}

/** ID do vendedor logado; apenas quando `role === 'vendedor'`. */
export function resolveVendorId(user: User): string | null {
  if (user.role === "vendedor") return user.id;
  return null;
}

/**
 * Evento de check-in vem da API (lista de eventos do cliente).
 * Mantido para compatibilidade; não usar mocks.
 */
export function resolveReceptionEventId(_clientId: string): null {
  return null;
}
