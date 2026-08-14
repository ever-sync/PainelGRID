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
      className={`relative overflow-hidden rounded-xl border border-white/[0.08] bg-[#111114]/95 p-4 shadow-[0_18px_45px_rgba(0,0,0,0.28)] ${className ?? ""}`}
    >
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-[#ff0038] via-[#ff0038]/40 to-transparent" />
      <div className="mb-3 flex items-center gap-2.5">
        <span className="h-4 w-1 rounded-full bg-[#ff0038]" />
        <h2 className="text-[11px] font-bold uppercase tracking-[0.2em] text-zinc-300">
          {title}
        </h2>
      </div>
      {children}
    </section>
  );
}
