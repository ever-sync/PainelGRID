import type { ReactNode } from "react";

export function Section({
  title,
  className,
  children,
}: {
  title: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      className={`rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4 ${className ?? ""}`}
    >
      <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
        {title}
      </h2>
      {children}
    </section>
  );
}
