import { lazy, Suspense, useEffect, useRef, useState } from "react";
import type {
  CampaignChartMetric,
  CampaignChartPoint,
  CampaignMetricKey,
} from "./CampaignPerformanceChart";

const CampaignPerformanceChart = lazy(
  () => import("./CampaignPerformanceChart"),
);

interface DeferredCampaignPerformanceChartProps {
  data: CampaignChartPoint[];
  metrics: CampaignChartMetric[];
  activeMetricKey: CampaignMetricKey;
  dark: boolean;
}

function ChartFallback({ dark }: { dark: boolean }) {
  return (
    <div
      className={`flex h-full items-end gap-3 overflow-hidden rounded-2xl px-6 pb-8 pt-12 ${
        dark ? "bg-[#111217]" : "bg-white"
      }`}
      aria-label="Carregando gráfico de desempenho"
    >
      {[42, 68, 51, 82, 59, 74, 47].map((height, index) => (
        <span
          key={`${height}-${index}`}
          className={`min-w-0 flex-1 animate-pulse rounded-t-lg ${
            dark ? "bg-zinc-800" : "bg-zinc-100"
          }`}
          style={{ height: `${height}%` }}
        />
      ))}
    </div>
  );
}

export function DeferredCampaignPerformanceChart(
  props: DeferredCampaignPerformanceChartProps,
) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [shouldLoad, setShouldLoad] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || shouldLoad) return;

    if (!("IntersectionObserver" in window)) {
      setShouldLoad(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        setShouldLoad(true);
        observer.disconnect();
      },
      { rootMargin: "320px 0px" },
    );

    observer.observe(container);
    return () => observer.disconnect();
  }, [shouldLoad]);

  return (
    <div ref={containerRef} className="h-full w-full">
      {shouldLoad ? (
        <Suspense fallback={<ChartFallback dark={props.dark} />}>
          <CampaignPerformanceChart {...props} />
        </Suspense>
      ) : (
        <ChartFallback dark={props.dark} />
      )}
    </div>
  );
}
