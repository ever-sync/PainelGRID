const VALID_BRAZILIAN_AREA_CODES = new Set([
  11, 12, 13, 14, 15, 16, 17, 18, 19, 21, 22, 24, 27, 28, 31, 32, 33, 34, 35,
  37, 38, 41, 42, 43, 44, 45, 46, 47, 48, 49, 51, 53, 54, 55, 61, 62, 63, 64,
  65, 66, 67, 68, 69, 71, 73, 74, 75, 77, 79, 81, 82, 83, 84, 85, 86, 87, 88,
  89, 91, 92, 93, 94, 95, 96, 97, 98, 99,
]);

function localBrazilianPhoneDigits(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (
    (digits.length === 12 || digits.length === 13) &&
    digits.startsWith("55")
  ) {
    return digits.slice(2);
  }
  return digits;
}

export function brazilianPhoneValidationError(raw: string): string {
  const local = localBrazilianPhoneDigits(raw);
  if (!local) return "Informe o telefone do lead.";
  if (local.length !== 10 && local.length !== 11) {
    return "O telefone deve ter DDD e 8 ou 9 dígitos.";
  }
  if (!VALID_BRAZILIAN_AREA_CODES.has(Number(local.slice(0, 2)))) {
    return "Informe um DDD brasileiro válido.";
  }
  if (/^(\d)\1+$/.test(local)) {
    return "Este telefone possui uma sequência inválida.";
  }

  const subscriber = local.slice(2);
  if (/^(\d)\1+$/.test(subscriber)) {
    return "Este telefone possui uma sequência inválida.";
  }
  if (subscriber.length === 9 && !/^9/.test(subscriber)) {
    return "Celular inválido: após o DDD, informe um número iniciado por 9.";
  }
  if (subscriber.length === 8 && !/^[2-5]/.test(subscriber)) {
    return "Telefone fixo inválido: o número deve começar entre 2 e 5.";
  }
  return "";
}

export function normalizeBrPhoneToE164(raw: string): string {
  if (brazilianPhoneValidationError(raw)) return "";
  return `+55${localBrazilianPhoneDigits(raw)}`;
}

/** Máscara progressiva para telefone brasileiro, aceitando também o prefixo +55. */
export function formatBrPhoneInput(raw: string): string {
  let digits = raw.replace(/\D/g, "").slice(0, 13);
  if (digits.length > 11 && digits.startsWith("55")) {
    digits = digits.slice(2);
  }
  digits = digits.slice(0, 11);
  if (digits.length <= 2) return digits;
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

export function phoneDigitsForCompare(raw: string): string {
  const normalized = normalizeBrPhoneToE164(raw);
  if (normalized) {
    return normalized.replace(/\D/g, "");
  }
  return raw.replace(/\D/g, "");
}
