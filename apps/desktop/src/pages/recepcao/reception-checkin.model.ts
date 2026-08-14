export const MAX_WRISTBAND_STORAGE_LENGTH = 50;

export function parseWristbandNumbers(value?: string | null): string[] {
  const numbers = (value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  return numbers.length ? numbers : [""];
}

export function serializeWristbandNumbers(values: string[]): string | null {
  const serialized = values
    .map((item) => item.trim())
    .filter(Boolean)
    .join(", ");
  return serialized || null;
}

export function validateWristbandNumbers(
  values: string[],
  required: boolean,
): string {
  const normalized = values.map((item) => item.trim());
  const filled = normalized.filter(Boolean);
  if (required && filled.length === 0) {
    return "Informe pelo menos uma pulseira.";
  }
  if (values.length > 1 && normalized.some((item) => !item)) {
    return "Preencha ou remova os campos de pulseira vazios.";
  }
  const unique = new Set(filled.map((item) => item.toLocaleLowerCase("pt-BR")));
  if (unique.size !== filled.length) {
    return "O mesmo número de pulseira foi informado mais de uma vez.";
  }
  if (
    (serializeWristbandNumbers(values)?.length ?? 0) >
    MAX_WRISTBAND_STORAGE_LENGTH
  ) {
    return "Os números das pulseiras ultrapassam o limite de 50 caracteres.";
  }
  return "";
}
