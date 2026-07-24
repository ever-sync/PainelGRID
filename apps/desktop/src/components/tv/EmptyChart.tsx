import type { ReactNode } from "react";

export function EmptyChart({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-[200px] items-center justify-center text-sm text-zinc-500">
      {children}
    </div>
  );
}
