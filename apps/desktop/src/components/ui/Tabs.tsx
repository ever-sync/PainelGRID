import type { ReactNode } from "react";
import { cn } from "../../lib/utils";

interface TabItem {
  id: string;
  label: string;
  icon?: ReactNode;
}

interface TabsProps {
  tabs: TabItem[];
  active: string;
  onChange: (id: string) => void;
  className?: string;
}

export function Tabs({ tabs, active, onChange, className }: TabsProps) {
  return (
    <div
      role="tablist"
      aria-label="Navegação da página"
      className={cn("flex gap-1 border-b border-border", className)}
    >
      {tabs.map((tab) => {
        const selected = tab.id === active;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(tab.id)}
            onKeyDown={(event) => {
              if (
                !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)
              ) {
                return;
              }
              event.preventDefault();
              const currentIndex = tabs.findIndex((item) => item.id === tab.id);
              const nextIndex =
                event.key === "Home"
                  ? 0
                  : event.key === "End"
                    ? tabs.length - 1
                    : (currentIndex +
                        (event.key === "ArrowRight" ? 1 : -1) +
                        tabs.length) %
                      tabs.length;
              onChange(tabs[nextIndex].id);
              const tabButtons =
                event.currentTarget.parentElement?.querySelectorAll<HTMLElement>(
                  '[role="tab"]',
                );
              window.requestAnimationFrame(() =>
                tabButtons?.[nextIndex]?.focus(),
              );
            }}
            className={cn(
              "relative -mb-px inline-flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/30",
              selected
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {tab.icon}
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
