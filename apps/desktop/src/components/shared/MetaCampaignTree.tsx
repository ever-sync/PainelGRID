import { Fragment, useMemo, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import type {
  MetaAdSetReportRow,
  MetaCampaignReportRow,
  MetaCampaignsReportItem,
} from "../../services/meta";
import {
  META_COLUMN_BY_ID,
  type MetaColumn,
  type MetaColumnId,
} from "../../lib/metaCampaignColumns";

function formatCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  }).format(Number.isFinite(value) ? value : 0);
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("pt-BR").format(
    Number.isFinite(value) ? value : 0,
  );
}

/**
 * Custo unitario so existe quando ha denominador. A Meta devolve 0 nesse caso e
 * "R$ 0" na tela pareceria eficiencia perfeita, e nao ausencia de dado.
 */
function renderCell(row: MetaCampaignReportRow, column: MetaColumn) {
  const value = Number(row[column.id] ?? 0);

  if (column.denominator) {
    const divisor = Number(row[column.denominator] ?? 0);
    if (divisor <= 0) return "—";
  }

  switch (column.format) {
    case "currency":
      return formatCurrency(value);
    case "percent":
      return `${value.toFixed(2)}%`;
    case "decimal":
      return value.toFixed(2);
    default:
      return formatNumber(value);
  }
}

/** Cor por natureza da metrica, para a tabela nao virar um bloco cinza. */
function cellTone(column: MetaColumn, muted?: boolean) {
  if (muted) return "text-gray-600 dark:text-zinc-400";
  if (column.id === "spend") return "font-bold text-amber-600 dark:text-amber-400";
  if (column.format === "currency") return "text-rose-600 dark:text-rose-400";
  if (column.group === "Mensagens") return "font-bold text-blue-600 dark:text-blue-400";
  return "text-gray-700 dark:text-zinc-300";
}

function MetricCells({
  row,
  columns,
  muted,
}: {
  row: MetaCampaignReportRow;
  columns: MetaColumn[];
  muted?: boolean;
}) {
  return (
    <>
      {columns.map((column) => (
        <td
          key={column.id}
          className={`px-3 py-2.5 text-right font-mono ${cellTone(column, muted)}`}
        >
          {renderCell(row, column)}
        </td>
      ))}
    </>
  );
}

export function MetaCampaignTree({
  campaigns,
  columnIds,
}: {
  campaigns: MetaCampaignsReportItem[];
  columnIds: MetaColumnId[];
}) {
  const [expandedCampaigns, setExpandedCampaigns] = useState<
    Record<string, boolean>
  >({});
  const [expandedAdSets, setExpandedAdSets] = useState<Record<string, boolean>>(
    {},
  );

  const columns = useMemo(
    () =>
      columnIds
        .map((id) => META_COLUMN_BY_ID.get(id))
        .filter((column): column is MetaColumn => Boolean(column)),
    [columnIds],
  );

  const allIds = useMemo(() => {
    const campaignIds: string[] = [];
    const adSetIds: string[] = [];
    for (const campaign of campaigns) {
      campaignIds.push(campaign.id);
      for (const adSet of campaign.ad_sets ?? []) adSetIds.push(adSet.id);
    }
    return { campaignIds, adSetIds };
  }, [campaigns]);

  function expandAll() {
    setExpandedCampaigns(
      Object.fromEntries(allIds.campaignIds.map((id) => [id, true])),
    );
    setExpandedAdSets(
      Object.fromEntries(allIds.adSetIds.map((id) => [id, true])),
    );
  }

  function collapseAll() {
    setExpandedCampaigns({});
    setExpandedAdSets({});
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={expandAll}
          className="cursor-pointer rounded-lg bg-gray-100 px-2.5 py-1 text-xs font-semibold text-gray-700 transition-colors hover:bg-gray-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
        >
          Expandir Tudo
        </button>
        <button
          type="button"
          onClick={collapseAll}
          className="cursor-pointer rounded-lg bg-gray-100 px-2.5 py-1 text-xs font-semibold text-gray-700 transition-colors hover:bg-gray-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
        >
          Recolher Tudo
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-gray-100 font-semibold uppercase tracking-wider text-gray-500 dark:border-zinc-800 dark:text-zinc-400">
              <th className="px-3 pb-3">Nome (Campanha / Conjunto / Anúncio)</th>
              {columns.map((column) => (
                <th key={column.id} className="px-3 pb-3 text-right">
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-zinc-800/60">
            {campaigns.map((campaign) => {
              const campaignOpen = Boolean(expandedCampaigns[campaign.id]);
              const adSets: MetaAdSetReportRow[] = campaign.ad_sets ?? [];

              return (
                <Fragment key={campaign.id}>
                  <tr
                    onClick={() =>
                      setExpandedCampaigns((current) => ({
                        ...current,
                        [campaign.id]: !current[campaign.id],
                      }))
                    }
                    className="cursor-pointer bg-gray-50/80 font-semibold transition-colors hover:bg-gray-100/70 dark:bg-zinc-900/60 dark:hover:bg-zinc-800/80"
                  >
                    <td className="flex items-center gap-2 px-3 py-3 text-gray-900 dark:text-zinc-100">
                      <span className="text-gray-400">
                        {campaignOpen ? (
                          <ChevronDown size={16} />
                        ) : (
                          <ChevronRight size={16} />
                        )}
                      </span>
                      <span className="inline-flex items-center rounded bg-rose-100 px-1.5 py-0.5 text-[10px] font-extrabold uppercase text-[#FF0636] dark:bg-rose-950/60 dark:text-rose-400">
                        Campanha
                      </span>
                      <span>{campaign.name}</span>
                    </td>
                    <MetricCells row={campaign} columns={columns} />
                  </tr>

                  {campaignOpen &&
                    adSets.map((adSet) => {
                      const adSetOpen = Boolean(expandedAdSets[adSet.id]);

                      return (
                        <Fragment key={adSet.id}>
                          <tr
                            onClick={() =>
                              setExpandedAdSets((current) => ({
                                ...current,
                                [adSet.id]: !current[adSet.id],
                              }))
                            }
                            className="cursor-pointer bg-white text-xs transition-colors hover:bg-gray-100/40 dark:bg-zinc-950/40 dark:hover:bg-zinc-800/50"
                          >
                            <td className="flex items-center gap-2 px-3 py-2.5 pl-8 text-gray-800 dark:text-zinc-200">
                              <span className="text-gray-400">
                                {adSetOpen ? (
                                  <ChevronDown size={14} />
                                ) : (
                                  <ChevronRight size={14} />
                                )}
                              </span>
                              <span className="inline-flex items-center rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-bold uppercase text-blue-700 dark:bg-blue-950/50 dark:text-blue-400">
                                Conjunto
                              </span>
                              <span>{adSet.name}</span>
                            </td>
                            <MetricCells row={adSet} columns={columns} />
                          </tr>

                          {adSetOpen &&
                            (adSet.ads ?? []).map((ad) => (
                              <tr
                                key={ad.id}
                                className="bg-white text-xs dark:bg-zinc-950/20"
                              >
                                <td className="flex items-center gap-2 px-3 py-2 pl-16 text-gray-600 dark:text-zinc-400">
                                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-gray-300 dark:bg-zinc-600" />
                                  <span className="inline-flex items-center rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-gray-600 dark:bg-zinc-800 dark:text-zinc-400">
                                    Anúncio
                                  </span>
                                  <span>{ad.name}</span>
                                </td>
                                <MetricCells row={ad} columns={columns} muted />
                              </tr>
                            ))}
                        </Fragment>
                      );
                    })}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
