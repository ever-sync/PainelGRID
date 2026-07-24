/** Alinhado à política da API (`IsStrongPasswordConstraint`). */

export const PASSWORD_REQUIREMENTS_HINT =
  "Use pelo menos 10 caracteres, com letra maiuscula, minuscula e um numero (evite senhas muito comuns).";

export function isLocallyReasonablePassword(raw: string): boolean {
  const value = typeof raw === "string" ? raw : "";
  if (value.length < 10 || value.length > 255) return false;
  if (!/[a-z]/.test(value) || !/[A-Z]/.test(value) || !/\d/.test(value))
    return false;
  return true;
}
