import type { VendorCategory } from "../types";

/** Categorias que um vendedor pode atender. Fonte unica para painel e cadastro publico. */
export const VENDOR_CATEGORY_OPTIONS: Array<{
  value: VendorCategory;
  label: string;
}> = [
  { value: "novo", label: "Novo" },
  { value: "semininovo", label: "Semininovo" },
  { value: "pdc", label: "VD - Venda Direta" },
  { value: "consorcio", label: "Consorcio" },
  { value: "assinatura", label: "Assinatura" },
];

/** Mascara de telefone brasileiro conforme a pessoa digita. */
export function formatPhoneBr(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 11) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  if (digits.length > 2) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  }
  return digits;
}
