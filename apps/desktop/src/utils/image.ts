/**
 * Redimensiona uma imagem no client para um data URL leve.
 *
 * - SVG é preservado como-é (vetorial, não faz sentido rasterizar).
 * - Outros formatos são desenhados num <canvas>, exportados como WebP
 *   (fallback PNG quando o browser não suporta WebP) e devolvidos como data URL.
 *
 * Use para evitar mandar logos de 1.5MB pro backend quando o que aparece em
 * tela é um avatar de 200px.
 */
export async function resizeImageToDataUrl(
  file: File,
  options: { maxDimension?: number; quality?: number } = {},
): Promise<string> {
  const { maxDimension = 512, quality = 0.85 } = options;

  const originalDataUrl = await readFileAsDataUrl(file);

  // SVG: mantém vetorial
  if (file.type === "image/svg+xml") return originalDataUrl;

  const image = await loadImage(originalDataUrl);
  const ratio = Math.min(
    maxDimension / image.width,
    maxDimension / image.height,
    1,
  );
  const width = Math.max(1, Math.round(image.width * ratio));
  const height = Math.max(1, Math.round(image.height * ratio));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D não disponível neste browser");
  ctx.drawImage(image, 0, 0, width, height);

  const webpDataUrl = canvas.toDataURL("image/webp", quality);
  if (webpDataUrl.startsWith("data:image/webp")) return webpDataUrl;
  return canvas.toDataURL("image/png");
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") resolve(reader.result);
      else reject(new Error("Resultado da leitura inválido"));
    };
    reader.onerror = () =>
      reject(reader.error ?? new Error("Falha ao ler arquivo"));
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Falha ao decodificar imagem"));
    image.src = src;
  });
}

/** Aproxima o tamanho do payload em bytes a partir de um data URL base64. */
export function dataUrlByteSize(dataUrl: string): number {
  const commaIdx = dataUrl.indexOf(",");
  if (commaIdx === -1) return 0;
  const base64Len = dataUrl.length - commaIdx - 1;
  // Base64 codifica 3 bytes em 4 chars; subtrai padding ('=')
  const padding = dataUrl.endsWith("==") ? 2 : dataUrl.endsWith("=") ? 1 : 0;
  return Math.floor((base64Len * 3) / 4) - padding;
}
