import { useEffect, useState } from "react";
import { BellRing } from "lucide-react";
import clsx from "clsx";

export type VendorCallEvent = {
  id: string; // unique event id to avoid duplicates
  vendor_name: string;
  lead_name: string;
  timestamp: string;
};

type VendorCallAlertProps = {
  event: VendorCallEvent | null;
  onClose: () => void;
};

export function VendorCallAlert({ event, onClose }: VendorCallAlertProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (event) {
      setVisible(true);

      // Falar o nome do vendedor usando IA (SpeechSynthesis)
      if ("speechSynthesis" in window) {
        window.speechSynthesis.cancel();
        const firstName = event.vendor_name.split(" ")[0];
        const textToSpeak = `Vendedor ${firstName}, seu cliente chegou.`;
        const utterance = new SpeechSynthesisUtterance(textToSpeak);
        utterance.lang = "pt-BR";
        utterance.rate = 1.0;
        window.speechSynthesis.speak(utterance);
      }

      const timer = setTimeout(() => {
        setVisible(false);
        setTimeout(onClose, 500); // tempo da animação de saída
      }, 7000); // 7 segundos visível

      return () => {
        clearTimeout(timer);
        window.speechSynthesis?.cancel(); // cancela a fala se fechar antes
      };
    } else {
      setVisible(false);
    }
  }, [event, onClose]);

  if (!event && !visible) return null;

  return (
    <div
      className={clsx(
        "fixed inset-0 z-50 flex items-center justify-center p-4 transition-all duration-500",
        visible
          ? "opacity-100 bg-black/80 backdrop-blur-md"
          : "opacity-0 pointer-events-none",
      )}
    >
      <div
        className={clsx(
          "relative w-full max-w-5xl overflow-hidden rounded-[2rem] bg-gradient-to-br from-[#e51838] to-[#990a21] p-1.5 shadow-[0_0_80px_rgba(229,24,56,0.5)] transition-all duration-500",
          visible ? "scale-100 translate-y-0" : "scale-90 translate-y-12",
        )}
      >
        <div className="relative flex flex-col items-center justify-center rounded-[1.7rem] bg-zinc-950/90 px-10 py-24 text-center backdrop-blur-xl">
          <div className="mb-8 flex h-40 w-40 items-center justify-center rounded-full bg-[#e51838]/20 ring-8 ring-[#e51838]/40 animate-pulse">
            <BellRing size={80} className="text-[#e51838]" />
          </div>

          <h2 className="mb-6 text-4xl font-bold uppercase tracking-[0.3em] text-[#e51838]">
            Atenção Vendedor
          </h2>

          <p className="text-6xl font-black text-white leading-tight max-w-4xl">
            <span className="text-zinc-300">{event?.vendor_name}</span>, seu
            cliente <span className="text-emerald-400">{event?.lead_name}</span>{" "}
            acabou de chegar!
          </p>

          <p className="mt-12 text-3xl font-medium text-zinc-400 uppercase tracking-widest">
            Dirija-se à recepção
          </p>
        </div>
      </div>
    </div>
  );
}
