import * as QRCode from "qrcode";

export type GenerateQrPngOptions = {
  /** Largura/altura da imagem em px. Default 600. */
  size?: number;
  /** Margem em módulos. Default 2. */
  margin?: number;
  /** Nivel de correção de erro. Default 'M'. */
  errorCorrectionLevel?: "L" | "M" | "Q" | "H";
};

/** Gera um PNG (Buffer) a partir de um conteúdo arbitrário. */
export async function generateQrPngBuffer(
  content: string,
  options: GenerateQrPngOptions = {},
): Promise<Buffer> {
  const value = content.trim();
  if (!value) {
    throw new Error("QR code content is empty");
  }
  return QRCode.toBuffer(value, {
    type: "png",
    width: options.size ?? 600,
    margin: options.margin ?? 2,
    errorCorrectionLevel: options.errorCorrectionLevel ?? "M",
  });
}
