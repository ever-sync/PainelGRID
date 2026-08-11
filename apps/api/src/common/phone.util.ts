const VALID_BRAZILIAN_AREA_CODES = new Set([
  11, 12, 13, 14, 15, 16, 17, 18, 19, 21, 22, 24, 27, 28, 31, 32, 33, 34, 35,
  37, 38, 41, 42, 43, 44, 45, 46, 47, 48, 49, 51, 53, 54, 55, 61, 62, 63, 64,
  65, 66, 67, 68, 69, 71, 73, 74, 75, 77, 79, 81, 82, 83, 84, 85, 86, 87, 88,
  89, 91, 92, 93, 94, 95, 96, 97, 98, 99,
]);

export function isValidBrazilianPhone(raw: string): boolean {
  const digits = raw?.replace(/\D/g, "") ?? "";
  const local =
    (digits.length === 12 || digits.length === 13) && digits.startsWith("55")
      ? digits.slice(2)
      : digits;
  if (local.length !== 10 && local.length !== 11) return false;
  if (!VALID_BRAZILIAN_AREA_CODES.has(Number(local.slice(0, 2)))) return false;
  if (/^(\d)\1+$/.test(local)) return false;
  const subscriber = local.slice(2);
  if (/^(\d)\1+$/.test(subscriber)) return false;
  return subscriber.length === 9
    ? /^9/.test(subscriber)
    : /^[2-5]/.test(subscriber);
}

/**
 * Normaliza números de telefone brasileiros para o formato E.164: +55XXXXXXXXXXX
 *
 * Aceita qualquer formato de entrada:
 *   - internacional com DDI: +5512981092776 / 5512981092776
 *   - com parênteses: (12) 98109-2776
 *   - somente dígitos locais: 12981092776
 *
 * Retorna o valor original sem alteração se não for possível identificar
 * um número brasileiro válido (10 ou 11 dígitos locais).
 */
export function normalizeBrazilianPhone(raw: string): string {
  if (!raw?.trim()) return raw;

  const digits = raw.replace(/\D/g, "");

  // Remove DDI 55 se o número tiver comprimento compatível (12 ou 13 dígitos)
  let local = digits;
  if (
    (digits.length === 12 || digits.length === 13) &&
    digits.startsWith("55")
  ) {
    local = digits.slice(2);
  }

  if (local.length === 11 || local.length === 10) {
    return `+55${local}`;
  }

  // Não reconhecido — devolve como veio (sem quebrar nada)
  return raw.trim();
}

/**
 * Extrai apenas os dígitos locais de um telefone para comparação de deduplicação.
 * Remove DDI e código de país (+55 / 55).
 */
export function phoneDigits(raw: string): string {
  if (!raw?.trim()) return "";
  const digits = raw.replace(/\D/g, "");
  if (
    (digits.length === 12 || digits.length === 13) &&
    digits.startsWith("55")
  ) {
    return digits.slice(2);
  }
  return digits;
}
