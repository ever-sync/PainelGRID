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

  const digits = raw.replace(/\D/g, '');

  // Remove DDI 55 se o número tiver comprimento compatível (12 ou 13 dígitos)
  let local = digits;
  if ((digits.length === 12 || digits.length === 13) && digits.startsWith('55')) {
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
  if (!raw?.trim()) return '';
  const digits = raw.replace(/\D/g, '');
  if ((digits.length === 12 || digits.length === 13) && digits.startsWith('55')) {
    return digits.slice(2);
  }
  return digits;
}
