import type { EventDashboardTvResponse } from "../../services/events";
import { CountdownCard } from "./CountdownCard";
import { FUNNEL_STEPS, pct } from "./shared";

export function Funnel({
  funnel,
  meta,
  eventEnd,
  now,
}: {
  funnel: EventDashboardTvResponse["funnel"];
  meta: number | null;
  eventEnd: Date | null;
  now: Date;
}) {
  return (
    <section className="grid shrink-0 grid-cols-[1fr_1fr_1fr_1fr_minmax(310px,1.2fr)] gap-3">
      {FUNNEL_STEPS.map((step, idx) => {
        const value = funnel[step.key] ?? 0;
        const prev = idx > 0 ? (funnel[FUNNEL_STEPS[idx - 1].key] ?? 0) : null;
        const rate = prev !== null ? pct(value, prev) : null;
        const isSold = step.key === "sold";
        const metaPct = isSold && meta ? pct(value, meta) : null;
        const Icon = step.icon;
        return (
          <div
            key={step.key}
            className="relative overflow-hidden rounded-xl border border-white/[0.08] bg-[#111114] p-4 shadow-[0_12px_30px_rgba(0,0,0,0.25)]"
            style={{
              borderTopColor: `${step.color}88`,
            }}
          >
            <div
              className="absolute right-0 top-0 h-px w-2/3 opacity-70"
              style={{ backgroundColor: step.color }}
            />
            <div className="relative flex items-center justify-between">
              <p
                className="text-[11px] font-semibold uppercase tracking-widest"
                style={{ color: step.color }}
              >
                {step.label}
              </p>
              <Icon size={18} style={{ color: step.color }} />
            </div>
            <div className="relative mt-1 flex items-baseline gap-2">
              <p
                className={`font-black tabular-nums leading-none ${isSold ? "text-6xl" : "text-5xl"}`}
                style={{ color: step.color }}
              >
                {value}
              </p>
              {isSold && meta && (
                <p className="text-2xl font-bold tabular-nums text-zinc-500">
                  / {meta}
                </p>
              )}
            </div>
            {isSold && meta ? (
              <div className="relative mt-3">
                <div className="h-2 overflow-hidden rounded-full bg-zinc-800/80">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${Math.min(100, metaPct ?? 0)}%`,
                      background: step.color,
                    }}
                  />
                </div>
                <p className="mt-1.5 text-[11px] font-medium text-zinc-400">
                  <span className="font-bold text-[#ff3159]">{metaPct}%</span>{" "}
                  da meta
                  {rate !== null && (
                    <>
                      {" · "}
                      <span className="text-zinc-300">{rate}%</span> do anterior
                    </>
                  )}
                </p>
              </div>
            ) : (
              rate !== null && (
                <p className="relative mt-1 text-xs text-zinc-400">
                  <span className="font-bold text-zinc-200">{rate}%</span> do
                  anterior
                </p>
              )
            )}
          </div>
        );
      })}
      <CountdownCard end={eventEnd} now={now} />
    </section>
  );
}
