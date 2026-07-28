import clsx from "clsx";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export type CampaignChartPoint = {
  day: string;
  totalLeads: number;
  scheduledLeads: number;
  confirmedLeads: number;
  cancelledLeads: number;
  checkedInLeads: number;
};

export type CampaignMetricKey =
  | "totalLeads"
  | "scheduledLeads"
  | "confirmedLeads"
  | "cancelledLeads"
  | "checkedInLeads";

export type CampaignChartMetric = {
  key: CampaignMetricKey;
  label: string;
  stroke: string;
};

interface CampaignPerformanceChartProps {
  data: CampaignChartPoint[];
  metrics: CampaignChartMetric[];
  activeMetricKey: CampaignMetricKey;
  dark: boolean;
}

function CampaignChartTooltip({
  active,
  payload,
  label,
  dark,
  metrics,
}: {
  active?: boolean;
  payload?: Array<{
    dataKey?: string;
    value?: number | string;
  }>;
  label?: string;
  dark: boolean;
  metrics: CampaignChartMetric[];
}) {
  if (!active || !payload?.length) return null;

  const rowsByMetric = new Map<
    CampaignMetricKey,
    { key: CampaignMetricKey; label: string; color: string; value: number }
  >();

  payload.forEach((entry) => {
    const key = entry.dataKey as CampaignMetricKey | undefined;
    if (!key) return;
    const metric = metrics.find((item) => item.key === key);
    if (!metric || rowsByMetric.has(key)) return;
    rowsByMetric.set(key, {
      key,
      label: metric.label,
      color: metric.stroke,
      value: Number(entry.value ?? 0),
    });
  });

  const rows = Array.from(rowsByMetric.values()).sort(
    (left, right) => right.value - left.value,
  );

  return (
    <div
      className={clsx(
        "min-w-[180px] rounded-2xl p-3 shadow-xl backdrop-blur",
        dark
          ? "border border-zinc-700 bg-zinc-900/95"
          : "border border-zinc-200 bg-white/95",
      )}
    >
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-400">
        {label}
      </p>
      <div className="mt-2 space-y-1.5">
        {rows.map((row) => (
          <div
            key={row.key}
            className="flex items-center justify-between gap-3"
          >
            <span
              className={clsx(
                "flex items-center gap-2 text-xs",
                dark ? "text-zinc-300" : "text-zinc-600",
              )}
            >
              <span
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: row.color }}
              />
              {row.label}
            </span>
            <span
              className={clsx(
                "text-xs font-semibold",
                dark ? "text-zinc-100" : "text-zinc-900",
              )}
            >
              {row.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function CampaignPerformanceChart({
  data,
  metrics,
  activeMetricKey,
  dark,
}: CampaignPerformanceChartProps) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart
        data={data}
        margin={{ top: 20, right: 16, left: 8, bottom: 8 }}
        barGap={6}
        barCategoryGap="18%"
      >
        <CartesianGrid
          vertical={false}
          stroke={dark ? "#27272a" : "#f4f4f5"}
          strokeDasharray="4 4"
        />
        <XAxis
          dataKey="day"
          axisLine={false}
          tickLine={false}
          tickMargin={12}
          tick={{
            fill: dark ? "#a1a1aa" : "#71717a",
            fontSize: 12,
            fontWeight: 600,
          }}
        />
        <YAxis
          axisLine={false}
          tickLine={false}
          allowDecimals={false}
          tick={{
            fill: dark ? "#a1a1aa" : "#71717a",
            fontSize: 11,
            fontWeight: 600,
          }}
          width={28}
        />
        <Tooltip
          cursor={{
            fill: dark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.03)",
          }}
          content={<CampaignChartTooltip dark={dark} metrics={metrics} />}
        />

        {metrics.map((metric) => (
          <Bar
            key={`bar-${metric.key}`}
            dataKey={metric.key}
            name={metric.label}
            fill={metric.stroke}
            radius={[6, 6, 0, 0]}
            maxBarSize={24}
            fillOpacity={metric.key === activeMetricKey ? 1 : 0.45}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}
