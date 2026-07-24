import { Wallet } from "lucide-react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import type {
  EventDashboardTvResponse,
  SaleSegment,
} from "../../services/events";
import { EmptyChart } from "./EmptyChart";
import { Section } from "./Section";
import { formatCurrency, SEGMENT_COLORS, SEGMENT_LABELS } from "./shared";

export function SegmentDonut({
  bySegment,
  totalSold,
  totalValue,
  className,
}: {
  bySegment: EventDashboardTvResponse["cars"]["by_segment"];
  totalSold: number;
  totalValue: string;
  className?: string;
}) {
  const data = bySegment.map((row) => ({
    ...row,
    label: SEGMENT_LABELS[row.type as SaleSegment],
    color: SEGMENT_COLORS[row.type as SaleSegment],
  }));

  return (
    <Section className={className} title="Vendas por segmento">
      {data.length === 0 ? (
        <EmptyChart>Nenhuma venda registrada ainda.</EmptyChart>
      ) : (
        <>
          <div className="relative h-[180px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data}
                  dataKey="count"
                  nameKey="label"
                  innerRadius={58}
                  outerRadius={88}
                  stroke="#0a0a0a"
                  strokeWidth={3}
                  paddingAngle={2}
                >
                  {data.map((entry) => (
                    <Cell key={entry.type} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    background: "#18181B",
                    border: "none",
                    borderRadius: 8,
                  }}
                  labelStyle={{ color: "#E4E4E7" }}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <p className="text-3xl font-black tabular-nums text-zinc-100">
                {totalSold}
              </p>
              <p className="text-[10px] uppercase tracking-widest text-zinc-500">
                vendas
              </p>
            </div>
          </div>
          <ul className="mt-2 flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
            {data.map((entry) => (
              <li key={entry.type} className="flex items-center gap-2 text-xs">
                <span
                  className="inline-block h-2.5 w-2.5 rounded-sm"
                  style={{ backgroundColor: entry.color }}
                />
                <span className="font-semibold text-zinc-200">
                  {entry.label}
                </span>
                <span className="tabular-nums font-bold text-zinc-100">
                  {entry.count}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
      <div className="mt-3 flex items-center justify-center gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-3 py-1.5">
        <Wallet size={14} className="text-emerald-400" />
        <span className="text-[10px] uppercase tracking-widest text-emerald-300">
          Faturamento
        </span>
        <span className="text-base font-black tabular-nums text-emerald-300">
          {formatCurrency(totalValue)}
        </span>
      </div>
    </Section>
  );
}
