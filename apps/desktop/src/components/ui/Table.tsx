import type { ReactNode } from "react";
import clsx from "clsx";

interface Column<T> {
  key: string;
  header: string;
  render?: (row: T) => ReactNode;
  width?: string;
  align?: "left" | "center" | "right";
}

interface TableProps<T> {
  columns: Column<T>[];
  data: T[];
  onRowClick?: (row: T) => void;
  emptyMessage?: string;
  loading?: boolean;
  /** Texto acessível para a tabela. Renderizado como <caption> visualmente oculto
   *  quando `captionVisible` é false (padrão) ou como legenda visível acima do header. */
  caption?: string;
  captionVisible?: boolean;
}

export function Table<T extends { id: string }>({
  columns,
  data,
  onRowClick,
  emptyMessage = "Nenhum registro encontrado.",
  loading = false,
  caption,
  captionVisible = false,
}: TableProps<T>) {
  return (
    <div className="overflow-x-auto rounded-lg border border-gray-100">
      <table className="w-full text-sm" aria-label={caption}>
        {caption && (
          <caption
            className={
              captionVisible
                ? "px-4 py-2 text-left text-sm font-semibold text-gray-700"
                : "sr-only"
            }
          >
            {caption}
          </caption>
        )}
        <thead>
          <tr className="bg-gray-50 border-b border-gray-100">
            {columns.map((col) => (
              <th
                key={col.key}
                className={clsx(
                  "px-4 py-3 font-medium text-gray-500 whitespace-nowrap",
                  col.align === "center" && "text-center",
                  col.align === "right" && "text-right",
                  !col.align && "text-left",
                  col.width,
                )}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr>
              <td
                colSpan={columns.length}
                className="px-4 py-8 text-center text-gray-400"
              >
                Carregando...
              </td>
            </tr>
          ) : data.length === 0 ? (
            <tr>
              <td
                colSpan={columns.length}
                className="px-4 py-8 text-center text-gray-400"
              >
                {emptyMessage}
              </td>
            </tr>
          ) : (
            data.map((row, i) => (
              <tr
                key={row.id}
                className={clsx(
                  "border-b border-gray-50 last:border-0",
                  i % 2 === 0 ? "bg-white" : "bg-gray-50/30",
                  onRowClick &&
                    "cursor-pointer hover:bg-blue-50/50 transition-colors",
                )}
                onClick={() => onRowClick?.(row)}
              >
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={clsx(
                      "px-4 py-3 text-gray-700",
                      col.align === "center" && "text-center",
                      col.align === "right" && "text-right",
                    )}
                  >
                    {col.render
                      ? col.render(row)
                      : String((row as Record<string, unknown>)[col.key] ?? "")}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
