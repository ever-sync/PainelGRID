import { useEffect, useState } from "react";

type Props = {
  value: string;
  /** Largura/altura em px (quadrado). */
  size?: number;
  className?: string;
};

/**
 * Gera QR Code localmente (sem serviço externo) para o token de check-in.
 * Carrega `qrcode` sob demanda para não pesar o bundle inicial.
 */
export function CheckinQrImage({ value, size = 96, className }: Props) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void import("qrcode")
      .then((mod) =>
        mod.default.toDataURL(value.trim(), {
          width: size,
          margin: 1,
          errorCorrectionLevel: "M",
        }),
      )
      .then((url) => {
        if (!cancelled) setDataUrl(url);
      })
      .catch(() => {
        if (!cancelled) setDataUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [value, size]);

  if (!dataUrl) {
    return (
      <div
        className={`animate-pulse rounded border border-gray-100 bg-gray-100 ${className ?? ""}`}
        style={{ width: size, height: size }}
        aria-hidden
      />
    );
  }

  return (
    <img
      src={dataUrl}
      alt=""
      width={size}
      height={size}
      className={`rounded border border-gray-100 ${className ?? ""}`}
    />
  );
}
