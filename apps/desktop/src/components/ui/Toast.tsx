import { X } from "lucide-react";
import clsx from "clsx";
import { useEffect, useRef, useState } from "react";

export type ToastType = "success" | "error" | "warning" | "info";

export type ToastPayload = {
  message: string;
  type?: ToastType;
  durationMs?: number;
};

type ToastItem = Required<
  Pick<ToastPayload, "message" | "type" | "durationMs">
> & {
  id: number;
};

const TOAST_EVENT = "leadflow:toast";
const DEFAULT_DURATION_MS = 5000;

export function pushToast(payload: ToastPayload) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<ToastPayload>(TOAST_EVENT, {
      detail: payload,
    }),
  );
}

export function ToastHost() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const counterRef = useRef(0);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleToast = (event: Event) => {
      const customEvent = event as CustomEvent<ToastPayload>;
      const message = customEvent.detail?.message?.trim();
      if (!message) return;

      const id = ++counterRef.current;
      const toast: ToastItem = {
        id,
        message,
        type: customEvent.detail?.type ?? "info",
        durationMs: customEvent.detail?.durationMs ?? DEFAULT_DURATION_MS,
      };

      setToasts((current) => [...current, toast]);
      window.setTimeout(() => {
        setToasts((current) => current.filter((item) => item.id !== id));
      }, toast.durationMs);
    };

    window.addEventListener(TOAST_EVENT, handleToast as EventListener);
    return () =>
      window.removeEventListener(TOAST_EVENT, handleToast as EventListener);
  }, []);

  if (!toasts.length) return null;

  return (
    <div className="pointer-events-none fixed bottom-6 left-6 z-[200] flex max-w-[min(92vw,420px)] flex-col gap-2">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={clsx(
            "pointer-events-auto flex items-start gap-3 rounded-2xl px-4 py-3 text-sm font-medium shadow-lg ring-1 backdrop-blur",
            toast.type === "error" && "bg-red-600 text-white ring-red-700/40",
            toast.type === "success" &&
              "bg-green-600 text-white ring-green-700/40",
            toast.type === "warning" &&
              "bg-amber-400 text-zinc-950 ring-amber-500/40",
            toast.type === "info" &&
              "bg-popover text-popover-foreground ring-foreground/10",
          )}
        >
          <span className="min-w-0 flex-1 whitespace-pre-line break-words">
            {toast.message}
          </span>
          <button
            type="button"
            aria-label="Fechar aviso"
            onClick={() =>
              setToasts((current) =>
                current.filter((item) => item.id !== toast.id),
              )
            }
            className="mt-0.5 opacity-75 transition hover:opacity-100"
          >
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}
