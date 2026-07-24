import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import clsx from "clsx";

interface Breadcrumb {
  label: string;
  href?: string;
}

interface PageHeaderProps {
  title?: string;
  breadcrumbs?: Breadcrumb[];
  actions?: ReactNode;
  subtitle?: string;
  dark?: boolean;
}

export function PageHeader({
  title,
  breadcrumbs,
  actions,
  subtitle,
  dark,
}: PageHeaderProps) {
  return (
    <div className="mb-5 flex items-start justify-between gap-3 md:mb-6">
      <div className="min-w-0">
        {breadcrumbs && breadcrumbs.length > 0 && (
          <nav
            className={clsx(
              "mb-1 hidden items-center gap-1 text-xs md:flex",
              dark ? "text-zinc-500" : "text-gray-400",
            )}
          >
            {breadcrumbs.map((crumb, i) => (
              <span key={i} className="flex items-center gap-1">
                {i > 0 && <ChevronRight size={12} />}
                <span
                  className={clsx(
                    i === breadcrumbs.length - 1
                      ? dark
                        ? "text-zinc-300"
                        : "text-gray-600"
                      : dark
                        ? "cursor-pointer hover:text-zinc-300"
                        : "cursor-pointer hover:text-gray-600",
                  )}
                >
                  {crumb.label}
                </span>
              </span>
            ))}
          </nav>
        )}
        {title && (
          <h1
            className={clsx(
              "text-2xl font-bold tracking-tight md:text-3xl",
              dark ? "text-zinc-100" : "text-gray-900",
            )}
          >
            {title}
          </h1>
        )}
        {subtitle && (
          <p
            className={clsx(
              "mt-1 max-w-xl text-sm leading-relaxed",
              dark ? "text-zinc-400" : "text-gray-500",
            )}
          >
            {subtitle}
          </p>
        )}
      </div>
      {actions && <div className="flex items-center gap-3">{actions}</div>}
    </div>
  );
}
