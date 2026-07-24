export function normalizeBrPhoneToE164(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (!digits) return "";

  let local = digits;
  if (
    (digits.length === 12 || digits.length === 13) &&
    digits.startsWith("55")
  ) {
    local = digits.slice(2);
  }

  if (local.length === 10 || local.length === 11) {
    return `+55${local}`;
  }

  return "";
}

export function phoneDigitsForCompare(raw: string): string {
  const normalized = normalizeBrPhoneToE164(raw);
  if (normalized) {
    return normalized.replace(/\D/g, "");
  }
  return raw.replace(/\D/g, "");
}
