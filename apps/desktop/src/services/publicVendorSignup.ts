import type { VendorCategory } from "../types";
import { API_BASE } from "./http";

/**
 * Endpoints publicos: fetch cru, sem Authorization e sem a logica de refresh
 * do httpRequest — a pessoa que abre o link nao tem sessao.
 */

export type VendorSignupTarget = {
  company_name: string;
  logo_url: string | null;
};

export type VendorSignupPayload = {
  name: string;
  email: string;
  phone: string;
  vendor_categories: VendorCategory[];
};

export async function fetchVendorSignupTarget(
  token: string,
): Promise<VendorSignupTarget> {
  const response = await fetch(
    `${API_BASE}/public/vendor-signup/${encodeURIComponent(token)}`,
  );
  if (!response.ok) {
    throw new Error("Link de cadastro inválido");
  }
  return (await response.json()) as VendorSignupTarget;
}

export async function submitVendorSignup(
  token: string,
  payload: VendorSignupPayload,
): Promise<void> {
  const response = await fetch(
    `${API_BASE}/public/vendor-signup/${encodeURIComponent(token)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
  );

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      message?: string | string[];
    } | null;
    const raw = body?.message;
    const message = Array.isArray(raw) ? raw[0] : raw;
    throw new Error(message || "Não foi possível enviar o cadastro.");
  }
}
