import type { ComponentProps } from "react";
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

export function BarChart(props: ComponentProps<typeof RechartsBarChart>) {
  return <RechartsBarChart {...props} />;
}

export function Bar(props: ComponentProps<typeof RechartsBar>) {
  return <RechartsBar {...props} />;
}

export function XAxis(props: ComponentProps<typeof RechartsXAxis>) {
  return <RechartsXAxis {...props} />;
}

export function YAxis(props: ComponentProps<typeof RechartsYAxis>) {
  return <RechartsYAxis {...props} />;
}

export function CartesianGrid(
  props: ComponentProps<typeof RechartsCartesianGrid>,
) {
  return <RechartsCartesianGrid {...props} />;
}

export function Tooltip(props: ComponentProps<typeof RechartsTooltip>) {
  return <RechartsTooltip {...props} />;
}

export function ResponsiveContainer(
  props: ComponentProps<typeof RechartsResponsiveContainer>,
) {
  return <RechartsResponsiveContainer {...props} />;
}

export function PieChart(props: ComponentProps<typeof RechartsPieChart>) {
  return <RechartsPieChart {...props} />;
}

export function Pie(props: ComponentProps<typeof RechartsPie>) {
  return <RechartsPie {...props} />;
}

export function Cell(props: ComponentProps<typeof RechartsCell>) {
  return <RechartsCell {...props} />;
}

export function Legend(props: ComponentProps<typeof RechartsLegend>) {
  return <RechartsLegend {...props} />;
}
