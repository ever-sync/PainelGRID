import { useEffect, useMemo, useState } from "react";
import type { EventDashboardTvResponse } from "../../services/events";
import { EmptyChart } from "./EmptyChart";
import { Section } from "./Section";
import { MEDAL_STYLE } from "./shared";

const MODELS_PER_PAGE = 5;
const PAGE_DURATION_MS = 6_000;

export function TopModelsLeaderboard({
  topModels,
  className,
}: {
  topModels: EventDashboardTvResponse["cars"]["top_models"];
  className?: string;
}) {
  const totalPages = Math.max(1, Math.ceil(topModels.length / MODELS_PER_PAGE));
  const [page, setPage] = useState(0);

  useEffect(() => {
    if (totalPages <= 1) return;
    const interval = setInterval(() => {
      setPage((current) => (current + 1) % totalPages);
    }, PAGE_DURATION_MS);
    return () => clearInterval(interval);
  }, [totalPages]);

  useEffect(() => {
    if (page >= totalPages) setPage(0);
  }, [page, totalPages]);

  const visible = useMemo(
    () => topModels.slice(page * MODELS_PER_PAGE, (page + 1) * MODELS_PER_PAGE),
    [topModels, page],
  );

  const maxCount = topModels[0]?.count ?? 1;

  return (
    <Section className={className} title="Modelos mais vendidos">
      {topModels.length === 0 ? (
        <EmptyChart>Nenhum modelo vendido ainda.</EmptyChart>
      ) : (
        <div className="flex h-full flex-col">
          <ul className="flex flex-1 flex-col gap-2">
            {visible.map((item, idx) => {
              const globalRank = page * MODELS_PER_PAGE + idx;
              const widthPct = Math.max(8, (item.count / maxCount) * 100);
              const medal = globalRank < 3 ? MEDAL_STYLE[globalRank] : null;
              return (
                <li
                  key={`${page}-${item.model}`}
                  className="flex items-center gap-3"
                >
                  <span
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-black tabular-nums ${
                      medal
                        ? `${medal.bg} ${medal.text} ring-1 ${medal.ring}`
                        : "bg-zinc-800 text-zinc-400"
                    }`}
                  >
                    {globalRank + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-sm font-semibold text-zinc-100">
                        {item.model}
                      </span>
                      <span className="shrink-0 text-lg font-black tabular-nums text-amber-300">
                        {item.count}
                      </span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-zinc-800/70">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-amber-500 to-amber-300 transition-all duration-500"
                        style={{ width: `${widthPct}%` }}
                      />
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
          {totalPages > 1 && (
            <div className="mt-3 flex items-center justify-center gap-1.5">
              {Array.from({ length: totalPages }).map((_, idx) => (
                <span
                  key={idx}
                  className={`h-1.5 rounded-full transition-all ${
                    idx === page ? "w-6 bg-amber-400" : "w-1.5 bg-zinc-700"
                  }`}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </Section>
  );
}
