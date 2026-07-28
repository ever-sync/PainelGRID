import { lazy, Suspense } from "react";
import type { QrScannerProps } from "./QrScanner";

const QrScanner = lazy(() =>
  import("./QrScanner").then((module) => ({
    default: module.QrScanner,
  })),
);

function ScannerBundleFallback() {
  return (
    <div className="flex min-h-[292px] items-center justify-center rounded-2xl bg-black text-center text-xs font-semibold text-white">
      Preparando leitor de QR Code...
    </div>
  );
}

export function LazyQrScanner(props: QrScannerProps) {
  return (
    <Suspense fallback={<ScannerBundleFallback />}>
      <QrScanner {...props} />
    </Suspense>
  );
}
