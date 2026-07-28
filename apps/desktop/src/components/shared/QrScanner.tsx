import { useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { Camera, CameraOff, AlertCircle, Zap, ZapOff } from "lucide-react";
import { triggerHapticFeedback } from "../../utils/haptics";
import { createAudioContext } from "../../utils/audioContext";

type TorchCapabilities = MediaTrackCapabilities & { torch?: boolean };
type TorchConstraintSet = MediaTrackConstraintSet & { torch?: boolean };

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

export function QrScanner({ onScan, onClose, dark = false }: QrScannerProps) {
  const qrRef = useRef<Html5Qrcode | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [hasTorch, setHasTorch] = useState(false);
  const [torchOn, setTorchOn] = useState(false);

  useEffect(() => {
    const html5QrCode = new Html5Qrcode("qr-reader-element");
    qrRef.current = html5QrCode;

    const startScanning = async () => {
      try {
        setLoading(true);
        setErrorMsg(null);
        await html5QrCode.start(
          { facingMode: "environment" },
          {
            fps: 10,
            qrbox: (width, height) => {
              const size = Math.min(width, height) * 0.7;
              return { width: size, height: size };
            },
          },
          (decodedText) => {
            playBeep();
            triggerHapticFeedback(150);
            // Stop scanning on first successful match
            if (html5QrCode.isScanning) {
              html5QrCode
                .stop()
                .then(() => {
                  onScan(decodedText);
                })
                .catch((err) => {
                  console.error("Erro ao parar camera apos scan", err);
                  onScan(decodedText);
                });
            } else {
              onScan(decodedText);
            }
          },
          () => {
            // Constant verbose logging suppressed
          },
        );

        // Check for torch capability
        try {
          const capabilities =
            html5QrCode.getRunningTrackCapabilities() as TorchCapabilities;
          if (capabilities && capabilities.torch) {
            setHasTorch(true);
          }
        } catch (e) {
          console.warn("Torch capabilities check failed", e);
        }

        setLoading(false);
      } catch (err) {
        console.error("Falha ao iniciar escaneamento", err);
        setErrorMsg(
          "Não foi possível acessar a câmera. Verifique as permissões do seu navegador.",
        );
        setLoading(false);
      }
    };

    void startScanning();

    return () => {
      if (qrRef.current && qrRef.current.isScanning) {
        void qrRef.current
          .stop()
          .then(() => {
            qrRef.current?.clear();
          })
          .catch((err) => {
            console.error("Erro ao parar camera no cleanup", err);
          });
      }
    };
  }, [onScan]);

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
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-zinc-800 rounded-xl text-xs font-bold hover:bg-zinc-700 transition-colors"
            >
              Voltar
            </button>
          </div>
        ) : (
          <>
            <div id="qr-reader-element" className="w-full h-full" />

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
    </div>
  );
}
