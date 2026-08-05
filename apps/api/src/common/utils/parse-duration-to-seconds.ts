/** Converte valores estilo JWT/Nest (`15m`, `7d`, `3600` ou `3600s`) em segundos. */
export function parseDurationToSeconds(value: string): number {
  const normalizedValue = value.trim().toLowerCase();
  const match = normalizedValue.match(/^(\d+)([smhd])$/);

  if (!match) {
    const numericValue = Number(normalizedValue);
    return Number.isFinite(numericValue) && numericValue > 0
      ? numericValue
      : 604800;
  }

  const amount = Number(match[1]);
  const unit = match[2];

  switch (unit) {
    case "s":
      return amount;
    case "m":
      return amount * 60;
    case "h":
      return amount * 60 * 60;
    case "d":
      return amount * 60 * 60 * 24;
    default:
      return 604800;
  }
}
