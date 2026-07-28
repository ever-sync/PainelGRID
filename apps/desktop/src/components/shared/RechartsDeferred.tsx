import type { ComponentType } from "react";
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

type ChartProps = Record<string, any>;

const Components = {
  Bar: RechartsBar as unknown as ComponentType<ChartProps>,
  BarChart: RechartsBarChart as unknown as ComponentType<ChartProps>,
  CartesianGrid: RechartsCartesianGrid as unknown as ComponentType<ChartProps>,
  Cell: RechartsCell as unknown as ComponentType<ChartProps>,
  Legend: RechartsLegend as unknown as ComponentType<ChartProps>,
  Pie: RechartsPie as unknown as ComponentType<ChartProps>,
  PieChart: RechartsPieChart as unknown as ComponentType<ChartProps>,
  ResponsiveContainer:
    RechartsResponsiveContainer as unknown as ComponentType<ChartProps>,
  Tooltip: RechartsTooltip as unknown as ComponentType<ChartProps>,
  XAxis: RechartsXAxis as unknown as ComponentType<ChartProps>,
  YAxis: RechartsYAxis as unknown as ComponentType<ChartProps>,
};

export function BarChart(props: ChartProps) {
  return <Components.BarChart {...props} />;
}

export function Bar(props: ChartProps) {
  return <Components.Bar {...props} />;
}

export function XAxis(props: ChartProps) {
  return <Components.XAxis {...props} />;
}

export function YAxis(props: ChartProps) {
  return <Components.YAxis {...props} />;
}

export function CartesianGrid(props: ChartProps) {
  return <Components.CartesianGrid {...props} />;
}

export function Tooltip(props: ChartProps) {
  return <Components.Tooltip {...props} />;
}

export function ResponsiveContainer(props: ChartProps) {
  return <Components.ResponsiveContainer {...props} />;
}

export function PieChart(props: ChartProps) {
  return <Components.PieChart {...props} />;
}

export function Pie(props: ChartProps) {
  return <Components.Pie {...props} />;
}

export function Cell(props: ChartProps) {
  return <Components.Cell {...props} />;
}

export function Legend(props: ChartProps) {
  return <Components.Legend {...props} />;
}
