import type { ComponentType, ReactNode } from "react";
import {
  Bar as RechartsBar,
  BarChart as RechartsBarChart,
  CartesianGrid as RechartsCartesianGrid,
  Cell as RechartsCell,
  Legend as RechartsLegend,
  Pie as RechartsPie,
  PieChart as RechartsPieChart,
  ResponsiveContainer as RechartsResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis as RechartsXAxis,
  YAxis as RechartsYAxis,
} from "recharts";

export type DeferredChartProps = Record<string, unknown> & {
  children?: ReactNode;
};

const Components = {
  Bar: RechartsBar as unknown as ComponentType<DeferredChartProps>,
  BarChart: RechartsBarChart as unknown as ComponentType<DeferredChartProps>,
  CartesianGrid:
    RechartsCartesianGrid as unknown as ComponentType<DeferredChartProps>,
  Cell: RechartsCell as unknown as ComponentType<DeferredChartProps>,
  Legend: RechartsLegend as unknown as ComponentType<DeferredChartProps>,
  Pie: RechartsPie as unknown as ComponentType<DeferredChartProps>,
  PieChart: RechartsPieChart as unknown as ComponentType<DeferredChartProps>,
  ResponsiveContainer:
    RechartsResponsiveContainer as unknown as ComponentType<DeferredChartProps>,
  Tooltip: RechartsTooltip as unknown as ComponentType<DeferredChartProps>,
  XAxis: RechartsXAxis as unknown as ComponentType<DeferredChartProps>,
  YAxis: RechartsYAxis as unknown as ComponentType<DeferredChartProps>,
};

export function BarChart(props: DeferredChartProps) {
  return <Components.BarChart {...props} />;
}

export function Bar(props: DeferredChartProps) {
  return <Components.Bar {...props} />;
}

export function XAxis(props: DeferredChartProps) {
  return <Components.XAxis {...props} />;
}

export function YAxis(props: DeferredChartProps) {
  return <Components.YAxis {...props} />;
}

export function CartesianGrid(props: DeferredChartProps) {
  return <Components.CartesianGrid {...props} />;
}

export function Tooltip(props: DeferredChartProps) {
  return <Components.Tooltip {...props} />;
}

export function ResponsiveContainer(props: DeferredChartProps) {
  return <Components.ResponsiveContainer {...props} />;
}

export function PieChart(props: DeferredChartProps) {
  return <Components.PieChart {...props} />;
}

export function Pie(props: DeferredChartProps) {
  return <Components.Pie {...props} />;
}

export function Cell(props: DeferredChartProps) {
  return <Components.Cell {...props} />;
}

export function Legend(props: DeferredChartProps) {
  return <Components.Legend {...props} />;
}
