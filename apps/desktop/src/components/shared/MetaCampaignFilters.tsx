import { useEffect, useRef, useState } from "react";
import { Columns3, Check } from "lucide-react";
import clsx from "clsx";
import {
  META_COLUMNS,
  objectiveLabel,
  type MetaColumnId,
} from "../../lib/metaCampaignColumns";

export type PeriodPreset = 7 | 15 | 30 | "max" | "custom";

export const PERIOD_PRESETS: Array<{ id: PeriodPreset; label: string }> = [
  { id: 7, label: "7 dias" },
  { id: 15, label: "15 dias" },
  { id: 30, label: "30 dias" },
  { id: "max", label: "Máximo" },
];

/** Converte o preset em datas. `max` devolve vazio: o backend usa tudo. */
export function periodToRange(
  preset: PeriodPreset,
  custom: { from: string; to: string },
): { from?: string; to?: string } {
  if (preset === "max") return {};
  if (preset === "custom") {
    return {
      from: custom.from || undefined,
      to: custom.to || undefined,
    };
  }

  const to = new Date();
  const from = new Date(to);
  // -1 porque o intervalo inclui hoje: "7 dias" = hoje + 6 anteriores.
  from.setDate(from.getDate() - (preset - 1));

  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
  };
}

export function MetaCampaignFilters({
  period,
  onPeriodChange,
  customRange,
  onCustomRangeChange,
  objective,
  onObjectiveChange,
  statusFilter,
  onStatusChange,
  availableObjectives,
  columnIds,
  onColumnsChange,
  availableRange,
  isDarkMode,
}: {
  period: PeriodPreset;
  onPeriodChange: (period: PeriodPreset) => void;
  customRange: { from: string; to: string };
  onCustomRangeChange: (range: { from: string; to: string }) => void;
  objective: string | null;
  onObjectiveChange: (objective: string | null) => void;
  statusFilter: string | null;
  onStatusChange: (status: string | null) => void;
  availableObjectives: string[];
  columnIds: MetaColumnId[];
  onColumnsChange: (columns: MetaColumnId[]) => void;
  availableRange: { from: string | null; to: string | null };
  isDarkMode: boolean;
}) {
  const [columnsOpen, setColumnsOpen] = useState(false);
  const columnsRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!columnsOpen) return;
    const onClickOutside = (event: MouseEvent) => {
      if (!columnsRef.current?.contains(event.target as Node)) {
        setColumnsOpen(false);
      }
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [columnsOpen]);

  const grouped = META_COLUMNS.reduce<Record<string, typeof META_COLUMNS>>(
    (acc, column) => {
      (acc[column.group] ??= []).push(column);
      return acc;
    },
    {},
  );

  function toggleColumn(id: MetaColumnId) {
    onColumnsChange(
      columnIds.includes(id)
        ? columnIds.filter((value) => value !== id)
        : // Mantem a ordem canonica em vez da ordem de clique.
          META_COLUMNS.filter(
            (column) => column.id === id || columnIds.includes(column.id),
          ).map((column) => column.id),
    );
  }

  const pill = (active: boolean) =>
    clsx(
      "h-9 cursor-pointer rounded-xl px-3 text-xs font-bold transition-colors",
      active
        ? "bg-[#FF0636] text-white shadow-sm"
        : isDarkMode
          ? "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
          : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200",
    );

  const field = clsx(
    "h-9 rounded-xl border px-2.5 text-xs font-medium",
    isDarkMode
      ? "border-zinc-700 bg-zinc-900 text-zinc-200"
      : "border-zinc-200 bg-white text-zinc-700",
  );

  return (
    <div className="space-y-2.5">
      <div className="flex flex-wrap items-center gap-2">
        {PERIOD_PRESETS.map((preset) => (
          <button
            key={String(preset.id)}
            type="button"
            onClick={() => onPeriodChange(preset.id)}
            className={pill(period === preset.id)}
          >
            {preset.label}
          </button>
        ))}

        <button
          type="button"
          onClick={() => onPeriodChange("custom")}
          className={pill(period === "custom")}
        >
          Escolher datas
        </button>

        <span className="mx-1 h-6 w-px bg-zinc-200 dark:bg-zinc-700" />

        <select
          value={statusFilter ?? ""}
          onChange={(event) => onStatusChange(event.target.value || null)}
          className={clsx(field, "cursor-pointer")}
          title="Status da campanha"
        >
          <option value="">Todos os status</option>
          <option value="ACTIVE">Só ativas</option>
          <option value="PAUSED">Só pausadas</option>
        </select>

        <select
          value={objective ?? ""}
          onChange={(event) => onObjectiveChange(event.target.value || null)}
          className={clsx(field, "cursor-pointer")}
          title="Tipo de campanha"
        >
          <option value="">Todos os tipos</option>
          {availableObjectives.map((value) => (
            <option key={value} value={value}>
              {objectiveLabel(value)}
            </option>
          ))}
        </select>

        <div className="relative ml-auto" ref={columnsRef}>
          <button
            type="button"
            onClick={() => setColumnsOpen((open) => !open)}
            className={clsx(
              "inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-xl border px-3 text-xs font-bold transition-colors",
              isDarkMode
                ? "border-zinc-700 bg-zinc-900 text-zinc-200 hover:bg-zinc-800"
                : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50",
            )}
          >
            <Columns3 size={14} />
            Colunas ({columnIds.length})
          </button>

          {columnsOpen ? (
            <div
              className={clsx(
                "absolute right-0 z-30 mt-2 max-h-80 w-64 overflow-y-auto rounded-2xl border p-2 shadow-xl",
                isDarkMode
                  ? "border-zinc-700 bg-[#121212]"
                  : "border-zinc-200 bg-white",
              )}
            >
              {Object.entries(grouped).map(([group, columns]) => (
                <div key={group} className="mb-1">
                  <p className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                    {group}
                  </p>
                  {columns.map((column) => {
                    const checked = columnIds.includes(column.id);
                    return (
                      <button
                        key={column.id}
                        type="button"
                        onClick={() => toggleColumn(column.id)}
                        className={clsx(
                          "flex w-full cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs transition-colors",
                          isDarkMode
                            ? "hover:bg-zinc-800"
                            : "hover:bg-zinc-100",
                        )}
                      >
                        <span
                          className={clsx(
                            "flex h-4 w-4 shrink-0 items-center justify-center rounded border",
                            checked
                              ? "border-[#FF0636] bg-[#FF0636] text-white"
                              : "border-zinc-300 dark:border-zinc-600",
                          )}
                        >
                          {checked ? <Check size={11} strokeWidth={3} /> : null}
                        </span>
                        <span className="text-zinc-700 dark:text-zinc-300">
                          {column.label}
                        </span>
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      {period === "custom" ? (
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400">
            De
          </label>
          <input
            type="date"
            value={customRange.from}
            min={availableRange.from ?? undefined}
            max={customRange.to || availableRange.to || undefined}
            onChange={(event) =>
              onCustomRangeChange({ ...customRange, from: event.target.value })
            }
            className={field}
          />
          <label className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400">
            até
          </label>
          <input
            type="date"
            value={customRange.to}
            min={customRange.from || availableRange.from || undefined}
            max={availableRange.to ?? undefined}
            onChange={(event) =>
              onCustomRangeChange({ ...customRange, to: event.target.value })
            }
            className={field}
          />
          {availableRange.from ? (
            <span className="text-[11px] text-zinc-400">
              Sincronizado: {availableRange.from} a {availableRange.to}
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
