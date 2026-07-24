import {
  Bar,
  BarChart,
  Cell,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { EventDashboardTvResponse } from "../../services/events";
import type { LeadSource } from "../../types";
import { EmptyChart } from "./EmptyChart";
import { Section } from "./Section";
import { SOURCE_COLORS, SOURCE_LABELS } from "./shared";

export function SourceBars({
  data,
  className,
}: {
  data: EventDashboardTvResponse["checkin_by_source"];
  className?: string;
}) {
  const chartData = data.map((row) => ({
    ...row,
    label: SOURCE_LABELS[row.source as LeadSource] ?? row.source,
    color: SOURCE_COLORS[row.source as LeadSource] ?? "#6B7280",
  }));

  return (
    <Section className={className} title="Comparecimento por canal">
      {chartData.length === 0 ? (
        <EmptyChart>Nenhum check-in registrado ainda.</EmptyChart>
      ) : (
        <>
          <div className="h-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={chartData}
                margin={{ top: 22, right: 12, left: 0, bottom: 4 }}
              >
                <XAxis
                  dataKey="label"
                  stroke="#A1A1AA"
                  fontSize={12}
                  interval={0}
                  tickLine={false}
                  axisLine={{ stroke: "#27272A" }}
                />
                <YAxis hide />
                <Tooltip
                  cursor={{ fill: "#FFFFFF08" }}
                  contentStyle={{
                    background: "#18181B",
                    border: "none",
                    borderRadius: 8,
                  }}
                  labelStyle={{ color: "#E4E4E7" }}
                />
                <Bar dataKey="count" radius={[8, 8, 0, 0]} maxBarSize={56}>
                  {chartData.map((entry) => (
                    <Cell key={entry.source} fill={entry.color} />
                  ))}
                  <LabelList
                    dataKey="count"
                    position="top"
                    fill="#F4F4F5"
                    fontSize={16}
                    fontWeight={800}
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-2 flex items-center justify-center gap-2 rounded-lg border border-zinc-700/60 bg-zinc-900/40 px-3 py-1.5">
            <span className="text-[10px] uppercase tracking-widest text-zinc-400">
              Canal mais forte
            </span>
            <span
              className="inline-block h-2.5 w-2.5 rounded-sm"
              style={{ backgroundColor: chartData[0].color }}
            />
            <span className="text-sm font-bold text-zinc-100">
              {chartData[0].label}
            </span>
            <span className="text-sm font-black tabular-nums text-zinc-300">
              · {chartData[0].count}
            </span>
          </div>
        </>
      )}
    </Section>
  );
}
