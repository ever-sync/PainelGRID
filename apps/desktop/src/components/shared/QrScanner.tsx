import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Html5Qrcode, Html5QrcodeSupportedFormats } from "html5-qrcode";
import {
  Camera,
  CameraOff,
  AlertCircle,
  ImageUp,
  Zap,
  ZapOff,
} from "lucide-react";
import { triggerHapticFeedback } from "../../utils/haptics";
import { createAudioContext } from "../../utils/audioContext";

type TorchCapabilities = MediaTrackCapabilities & { torch?: boolean };
type TorchConstraintSet = MediaTrackConstraintSet & { torch?: boolean };
type CameraCapabilities = MediaTrackCapabilities & {
  focusMode?: string[];
};
type CameraConstraintSet = MediaTrackConstraintSet & {
  focusMode?: "continuous";
};

const cameraScanConfig = {
  // Uma taxa um pouco maior reduz o tempo para capturar um quadro nítido
  // quando o QR está sendo exibido em outra tela.
  fps: 15,
  aspectRatio: 1,
  disableFlip: false,
  qrbox: (width: number, height: number) => {
    // O recorte anterior usava só 72% do quadro e descartava partes do QR
    // quando ele parecia estar dentro da moldura, sobretudo em telas pequenas.
    // Mantemos uma margem mínima para a quiet zone sem perder módulos do código.
    const size = Math.floor(Math.min(width, height) * 0.9);
    return { width: size, height: size };
  },
};

export interface QrScannerProps {
  onScan: (decodedText: string) => void;
  onClose: () => void;
  dark?: boolean;
}

function playBeep() {
  try {
    const ctx = createAudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.frequency.setValueAtTime(987.77, ctx.currentTime); // B5 note (pleasant high beep)
    gain.gain.setValueAtTime(0.08, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15); // fade out

    osc.start();
    osc.stop(ctx.currentTime + 0.15);
  } catch (e) {
    console.error("AudioContext check-in beep error", e);
  }
}

export function QrScanner({ onScan, onClose }: QrScannerProps) {
  const qrRef = useRef<Html5Qrcode | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const onScanRef = useRef(onScan);
  const decodedRef = useRef(false);
  const readerId = `qr-reader-${useId().replace(/:/g, "")}`;
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [loading, setLoading] = useState(true);
  const [hasTorch, setHasTorch] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [readingImage, setReadingImage] = useState(false);

  useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);

  const stopScanner = useCallback(async () => {
    const scanner = qrRef.current;
    qrRef.current = null;
    if (!scanner) return;

    try {
      if (scanner.isScanning) await scanner.stop();
      scanner.clear();
    } catch (err) {
      console.warn("Erro ao encerrar câmera do QR Code", err);
    }
  }, []);

  const startScanning = useCallback(async () => {
    await stopScanner();
    decodedRef.current = false;
    setLoading(true);
    setErrorMsg(null);
    setPermissionDenied(false);

    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      setErrorMsg(
        "Este navegador não liberou o acesso à câmera. Abra o painel diretamente no Safari ou Chrome usando HTTPS.",
      );
      setLoading(false);
      return;
    }

    const html5QrCode = new Html5Qrcode(readerId, {
      formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
      experimentalFeatures: { useBarCodeDetectorIfSupported: true },
      verbose: false,
    });
    qrRef.current = html5QrCode;

    try {
      // Restrições simples são mais compatíveis com Safari/iOS. A resolução
      // anterior podia causar OverconstrainedError em algumas câmeras.
      try {
        await html5QrCode.start(
          { facingMode: "environment" },
          cameraScanConfig,
          (decodedText) => {
            if (decodedRef.current) return;
            decodedRef.current = true;
            playBeep();
            triggerHapticFeedback(150);
            void stopScanner().finally(() => onScanRef.current(decodedText));
          },
          () => {
            // Constant verbose logging suppressed
          },
        );
      } catch (rearCameraError) {
        // Alguns aparelhos não aceitam facingMode, mas funcionam quando a
        // câmera é escolhida pelo ID retornado pelo próprio navegador.
        const cameras = await Html5Qrcode.getCameras();
        const preferredCamera =
          cameras.find((camera) =>
            /back|rear|traseira|ambiente/i.test(camera.label),
          ) ?? cameras[cameras.length - 1];
        if (!preferredCamera) throw rearCameraError;

        await html5QrCode.start(
          preferredCamera.id,
          cameraScanConfig,
          (decodedText) => {
            if (decodedRef.current) return;
            decodedRef.current = true;
            playBeep();
            triggerHapticFeedback(150);
            void stopScanner().finally(() => onScanRef.current(decodedText));
          },
          () => undefined,
        );
      }

      // Check for torch capability
      try {
        const capabilities =
          html5QrCode.getRunningTrackCapabilities() as CameraCapabilities &
            TorchCapabilities;
        if (capabilities && capabilities.torch) {
          setHasTorch(true);
        }
        if (capabilities.focusMode?.includes("continuous")) {
          await html5QrCode.applyVideoConstraints({
            width: { ideal: 1920 },
            height: { ideal: 1080 },
            advanced: [{ focusMode: "continuous" } as CameraConstraintSet],
          });
        } else {
          // `ideal` é apenas uma preferência: não derruba câmeras que não
          // oferecem Full HD, mas evita leitura em resolução muito baixa.
          await html5QrCode.applyVideoConstraints({
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          });
        }
      } catch (e) {
        console.warn("Camera capabilities check failed", e);
      }

      setLoading(false);
    } catch (err) {
      console.error("Falha ao iniciar escaneamento", err);
      const errorName =
        err instanceof DOMException
          ? err.name
          : typeof err === "object" && err && "name" in err
            ? String(err.name)
            : "";
      const errorText = err instanceof Error ? err.message : String(err ?? "");
      const denied =
        /NotAllowed|PermissionDenied|SecurityError|permission denied|not permitted/i.test(
          `${errorName} ${errorText}`,
        );
      setPermissionDenied(denied);
      setErrorMsg(
        denied
          ? "A câmera está bloqueada para este site. No iPhone, toque em aA na barra de endereço, abra Ajustes do Site, selecione Câmera e escolha Permitir."
          : "Não foi possível iniciar a câmera. Toque em Tentar novamente para liberar o acesso.",
      );
      setLoading(false);
    }
  }, [readerId, stopScanner]);

  useEffect(() => {
    void startScanning();

    return () => {
      void stopScanner();
    };
  }, [startScanning, stopScanner]);

  const toggleTorch = async () => {
    if (!qrRef.current || !hasTorch) return;
    const nextTorchState = !torchOn;
    try {
      await qrRef.current.applyVideoConstraints({
        advanced: [{ torch: nextTorchState } as TorchConstraintSet],
      });
      setTorchOn(nextTorchState);
    } catch (e) {
      console.error("Falha ao alternar lanterna", e);
    }
  };

  const scanImage = async (file: File) => {
    const scanner = qrRef.current;
    if (!scanner || readingImage) return;

    setReadingImage(true);
    setErrorMsg(null);
    decodedRef.current = false;
    try {
      if (scanner.isScanning) await scanner.stop();
      const decodedText = await scanner.scanFile(file, true);
      if (!decodedText.trim()) throw new Error("QR Code vazio");
      decodedRef.current = true;
      playBeep();
      triggerHapticFeedback(150);
      onScanRef.current(decodedText);
    } catch (error) {
      console.error("Falha ao ler QR Code da imagem", error);
      setErrorMsg(
        "Não foi possível reconhecer o QR Code nesta imagem. Tente uma imagem sem cortes, reflexos ou desfoque.",
      );
    } finally {
      setReadingImage(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <div className="flex flex-col items-center justify-center p-4">
      <div
        className="relative w-full max-w-sm aspect-square rounded-2xl overflow-hidden bg-black flex items-center justify-center border-2 border-zinc-200 shadow-inner"
        style={{ minHeight: "260px" }}
      >
        {loading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 text-white z-10">
            <Camera className="animate-pulse mb-2 text-[#E51838]" size={32} />
            <p className="text-xs font-semibold">Iniciando câmera...</p>
          </div>
        )}

        {errorMsg ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-zinc-950 text-center p-6 text-white z-10">
            <CameraOff className="mb-3 text-red-500" size={36} />
            <p className="text-xs leading-relaxed font-semibold text-zinc-300 mb-4">
              {errorMsg}
            </p>
            <div className="flex flex-col items-center gap-2">
              <button
                type="button"
                onClick={() => void startScanning()}
                className="px-4 py-2 bg-[#E51838] rounded-xl text-xs font-bold hover:bg-[#c91430] transition-colors"
              >
                Tentar novamente
              </button>
              {permissionDenied && (
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 text-xs font-bold text-zinc-300 hover:text-white transition-colors"
                >
                  Voltar
                </button>
              )}
            </div>
          </div>
        ) : (
          <>
            <div id={readerId} className="w-full h-full" />

            {hasTorch && !loading && (
              <button
                type="button"
                onClick={() => void toggleTorch()}
                className="absolute bottom-4 right-4 z-20 flex h-10 w-10 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80 transition-colors"
                title={torchOn ? "Desligar lanterna" : "Ligar lanterna"}
              >
                {torchOn ? (
                  <ZapOff size={18} className="text-amber-400" />
                ) : (
                  <Zap size={18} />
                )}
              </button>
            )}
          </>
        )}
      </div>

      {!errorMsg && (
        <p className="mt-3 text-center text-xs text-zinc-500 flex items-center gap-1.5 justify-center">
          <AlertCircle size={13} />
          <span>Aponte a câmera para o QR Code do convite</span>
        </p>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="sr-only"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void scanImage(file);
        }}
      />
      <button
        type="button"
        disabled={readingImage}
        onClick={() => fileInputRef.current?.click()}
        className="mt-3 inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-zinc-300 bg-white px-4 py-2 text-xs font-bold text-zinc-700 transition-colors hover:bg-zinc-50 disabled:cursor-wait disabled:opacity-60"
      >
        <ImageUp size={16} />
        {readingImage ? "Lendo imagem..." : "Selecionar imagem do QR Code"}
      </button>

      {errorMsg && (
        <button
          type="button"
          onClick={() => {
            setErrorMsg(null);
            fileInputRef.current?.click();
          }}
          className="mt-2 text-xs font-semibold text-[#E51838] hover:underline"
        >
          Escolher outra imagem
        </button>
      )}
    </div>
  );
}
