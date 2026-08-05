import clsx from "clsx";
import { X } from "lucide-react";
import type { Toast } from "./crm-view";

export function ToastStack({
  toasts,
  onDismiss,
}: {
  toasts: Toast[];
  onDismiss: (id: number) => void;
}) {
  if (!toasts.length) return null;
  return (
    <div className="pointer-events-none fixed bottom-6 left-1/2 z-[100] flex -translate-x-1/2 flex-col items-center gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={clsx(
            "pointer-events-auto flex items-center gap-3 rounded-2xl px-5 py-3 text-sm font-medium shadow-[0_8px_32px_rgba(0,0,0,0.22)]",
            t.type === "error" && "bg-[#FF0636] text-white",
            t.type === "success" && "bg-emerald-500 text-white",
            t.type === "info" && "bg-zinc-900 text-white",
          )}
        >
          <span>{t.message}</span>
          {t.action && (
            <button
              type="button"
              onClick={() => {
                t.action?.onAction();
                onDismiss(t.id);
              }}
              className="shrink-0 rounded-full bg-white/20 px-3 py-1 text-xs font-bold uppercase tracking-wide transition-colors hover:bg-white/30"
            >
              {t.action.label}
            </button>
          )}
          <button
            type="button"
            onClick={() => onDismiss(t.id)}
            className="opacity-70 hover:opacity-100"
            aria-label="Fechar"
          >
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}
