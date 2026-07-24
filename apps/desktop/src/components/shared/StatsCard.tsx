import type { ReactNode } from "react";
import clsx from "clsx";
import { Card } from "../ui/Card";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

interface StatsCardProps {
  title: string;
  value: string | number;
  change?: string;
  changeType?: "positive" | "negative" | "neutral";
  icon?: ReactNode;
  iconColor?: string;
  subtitle?: string;
}

export function StatsCard({
  title,
  value,
  change,
  changeType = "neutral",
  icon,
  iconColor = "bg-blue-100 text-blue-600",
  subtitle,
}: StatsCardProps) {
  const changeColors = {
    positive: "text-green-600",
    negative: "text-red-500",
    neutral: "text-gray-400",
  };

  const ChangeIcon =
    changeType === "positive"
      ? TrendingUp
      : changeType === "negative"
        ? TrendingDown
        : Minus;

  return (
    <Card padding="sm" className="min-h-[132px] md:min-h-[160px]">
      <div className="flex h-full items-start justify-between gap-3">
        <div className="flex-1">
          <p className="text-[13px] font-medium text-gray-500 md:text-sm">
            {title}
          </p>
          <p className="mt-1 text-3xl font-bold tracking-tight text-gray-900 md:text-4xl">
            {value}
          </p>
          {(change || subtitle) && (
            <div className="mt-2 flex flex-wrap items-center gap-1">
              {change && (
                <>
                  <ChangeIcon size={14} className={changeColors[changeType]} />
                  <span
                    className={clsx(
                      "text-[11px] font-medium md:text-xs",
                      changeColors[changeType],
                    )}
                  >
                    {change}
                  </span>
                </>
              )}
              {subtitle && (
                <span className="text-[11px] text-gray-400 md:text-xs">
                  {subtitle}
                </span>
              )}
            </div>
          )}
        </div>
        {icon && (
          <div className={clsx("rounded-xl p-3", iconColor)}>{icon}</div>
        )}
      </div>
    </Card>
  );
}
