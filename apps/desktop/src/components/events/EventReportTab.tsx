import { useEffect, useState } from "react";
import clsx from "clsx";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { Download, Users, ArrowRight } from "lucide-react";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import type { Event, Lead } from "../../types";
import type { VendorScoreRankingItem } from "../../services/vendorScore";
import type { SalesTeam } from "../../services/salesTeams";

// ── constants ────────────────────────────────────────────────────────────────

const SOURCE_COLORS: Record<string, string> = {
  facebook_ads: "#1877F2",
  whatsapp: "#25D366",
  manual: "#6B7280",
  form_page: "#8B5CF6",
  import_excel: "#F59E0B",
};

const SOURCE_LABELS: Record<string, string> = {
  facebook_ads: "Facebook Ads",
  whatsapp: "WhatsApp",
  manual: "Manual",
  form_page: "Formulário",
  import_excel: "Importação",
};

const STAGE_COLORS: Record<string, string> = {
  novo: "#94A3B8",
  contactado: "#60A5FA",
  agendado: "#3D56A2",
  convertido: "#10B981",
  perdido: "#FF0636",
};

const CRM_STAGE_PALETTE = [
  "#94A3B8",
  "#60A5FA",
  "#8B5CF6",
  "#F59E0B",
  "#10B981",
  "#EF4444",
  "#14B8A6",
  "#F97316",
  "#6366F1",
  "#EC4899",
];

const MEDAL = ["text-amber-400", "text-zinc-400", "text-amber-700"];

// ── helpers ──────────────────────────────────────────────────────────────────

function pct(num: number, den: number) {
  if (den === 0) return 0;
  return Math.round((num / den) * 100);
}

function ago(date: Date): string {
  const s = Math.round((Date.now() - date.getTime()) / 1000);
  if (s < 5) return "agora mesmo";
  if (s < 60) return `há ${s}s`;
  return `há ${Math.round(s / 60)}min`;
}

// ── sub-components ────────────────────────────────────────────────────────────

function MetricCard({
  title,
  value,
  helper,
  tone = "rose",
  dark,
}: {
  title: string;
  value: string | number;
  helper?: string;
  tone?: "rose" | "blue" | "amber" | "emerald";
  dark: boolean;
}) {
  const colors = {
    rose: "text-[#FF0636]",
    blue: "text-[#3D56A2]",
    amber: "text-[#FBBB49]",
    emerald: "text-emerald-600",
  };
  return (
    <div
      className={clsx(
        "rounded-[22px] border p-4 shadow-[0_12px_30px_rgba(15,23,42,0.04)]",
        dark ? "border-zinc-800 bg-[#111111]" : "border-zinc-100 bg-white",
      )}
    >
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-400">
        {title}
      </p>
      <p
        className={clsx(
          "mt-2 text-3xl font-black tracking-tight",
          colors[tone],
        )}
      >
        {value}
      </p>
      {helper && <p className="mt-2 text-xs text-zinc-500">{helper}</p>}
    </div>
  );
}

function FunnelStep({
  label,
  count,
  rate,
  color,
  isLast,
  dark,
}: {
  label: string;
  count: number;
  rate?: number;
  color: string;
  isLast?: boolean;
  dark: boolean;
}) {
  return (
    <div className="flex flex-col items-center gap-1">
      <div
        className="flex w-full flex-col items-center justify-center rounded-2xl py-4 px-3 text-center"
        style={{
          backgroundColor: `${color}18`,
          border: `1.5px solid ${color}40`,
        }}
      >
        <p
          className="text-[11px] font-semibold uppercase tracking-widest"
          style={{ color }}
        >
          {label}
        </p>
        <p className="mt-1 text-2xl font-black" style={{ color }}>
          {count}
        </p>
        {rate !== undefined && (
          <p className="mt-0.5 text-[11px] font-medium text-zinc-400">
            {rate}% do anterior
          </p>
        )}
      </div>
      {!isLast && (
        <ArrowRight
          size={16}
          className={
            dark ? "text-zinc-600 rotate-90" : "text-zinc-400 rotate-90"
          }
        />
      )}
    </div>
  );
}

// ── main component ────────────────────────────────────────────────────────────

interface Props {
  event: Event;
  leads: Lead[];
  rankingData: VendorScoreRankingItem[];
  teams: SalesTeam[];
  isDarkMode: boolean;
  loading: boolean;
  lastUpdatedAt: Date | null;
  onExportCsv: () => void;
}

export function EventReportTab({
  event,
  leads,
  rankingData,
  teams,
  isDarkMode,
  loading,
  lastUpdatedAt,
  onExportCsv,
}: Props) {
  // Live "Xseg ago" counter
  const [agoLabel, setAgoLabel] = useState(() =>
    lastUpdatedAt ? ago(lastUpdatedAt) : "",
  );
  const [justRefreshed, setJustRefreshed] = useState(false);

  useEffect(() => {
    if (!lastUpdatedAt) return;
    setAgoLabel(ago(lastUpdatedAt));
    setJustRefreshed(true);
    const clear = setTimeout(() => setJustRefreshed(false), 1500);
    const interval = setInterval(() => setAgoLabel(ago(lastUpdatedAt)), 5_000);
    return () => {
      clearTimeout(clear);
      clearInterval(interval);
    };
  }, [lastUpdatedAt]);

  // ── aggregations ────────────────────────────────────────────────────────────

  const totalLeads = leads.length;
  const totalScheduled = rankingData.reduce((s, v) => s + v.scheduled.count, 0);
  const totalCheckin = rankingData.reduce((s, v) => s + v.checked_in.count, 0);
  const totalSales = rankingData.reduce((s, v) => s + v.sold.count, 0);
  const totalPts = rankingData.reduce((s, v) => s + v.total_points, 0);
  const totalConfirmed = leads.filter(
    (l) =>
      l.confirmation_status === "confirmed" ||
      l.confirmation_status === "checked_in",
  ).length;

  // leads without any vendor responsibility
  const unassignedLeads = leads.filter(
    (l) => !l.registered_by_id && !l.assigned_vendor_id,
  ).length;

  // source breakdown + conversion by channel
  const sourceMap: Record<string, { total: number; converted: number }> = {};
  for (const lead of leads) {
    if (!sourceMap[lead.source])
      sourceMap[lead.source] = { total: 0, converted: 0 };
    sourceMap[lead.source].total += 1;
    if (
      lead.confirmation_status === "confirmed" ||
      lead.confirmation_status === "checked_in"
    ) {
      sourceMap[lead.source].converted += 1;
    }
  }
  const sourceData = Object.entries(sourceMap)
    .map(([source, { total, converted }]) => ({
      source,
      label: SOURCE_LABELS[source] ?? source,
      count: total,
      convRate: pct(converted, total),
    }))
    .sort((a, b) => b.count - a.count);

  // CRM stages reais do evento
  const crmStageSummary = new Map<
    string,
    { label: string; count: number; fallbackKey: string; hasRealStage: boolean }
  >();
  for (const lead of leads) {
    const stageId = lead.crm_stage_id ?? `fallback:${lead.crm_stage}`;
    const hasRealStage = Boolean(lead.crm_stage_id);
    const label =
      lead.crm_stage_name?.trim() ||
      (hasRealStage ? "Etapa sem nome" : "Sem etapa");
    const current = crmStageSummary.get(stageId);

    if (current) {
      current.count += 1;
      continue;
    }

    crmStageSummary.set(stageId, {
      label,
      count: 1,
      fallbackKey: lead.crm_stage,
      hasRealStage,
    });
  }

  const stageData = Array.from(crmStageSummary.entries())
    .map(([stageId, item], index) => ({
      id: stageId,
      label: item.label,
      count: item.count,
      color: item.hasRealStage
        ? CRM_STAGE_PALETTE[index % CRM_STAGE_PALETTE.length]
        : (STAGE_COLORS[item.fallbackKey] ?? "#94A3B8"),
      hasRealStage: item.hasRealStage,
    }))
    .sort((a, b) => {
      if (a.hasRealStage !== b.hasRealStage) {
        return a.hasRealStage ? -1 : 1;
      }
      return b.count - a.count || a.label.localeCompare(b.label, "pt-BR");
    });

  // leads registered per vendor
  const leadsByVendor: Record<string, number> = {};
  for (const lead of leads) {
    const key = lead.registered_by_id ?? lead.assigned_vendor_id;
    if (key) leadsByVendor[key] = (leadsByVendor[key] ?? 0) + 1;
  }

  // vendor → team name
  const vendorTeamName: Record<string, string> = {};
  for (const team of teams) {
    for (const m of team.members) {
      vendorTeamName[m.user_id] = team.name;
    }
  }

  // team ranking
  const vendorById = new Map(rankingData.map((v) => [v.vendor_id, v]));
  const totalTeamPts = teams.reduce((s, team) => {
    const pts = team.members
      .map((m) => vendorById.get(m.user_id))
      .filter(Boolean)
      .reduce((ss, v) => ss + v!.total_points, 0);
    return s + pts;
  }, 0);

  const teamRanking = teams
    .map((team) => {
      const members = team.members
        .map((m) => vendorById.get(m.user_id))
        .filter(Boolean) as VendorScoreRankingItem[];
      const pts = members.reduce((s, v) => s + v.total_points, 0);
      return {
        id: team.id,
        name: team.name,
        member_count: team.members.length,
        total_points: pts,
        share: pct(pts, totalTeamPts),
        leads: team.members.reduce(
          (s, m) => s + (leadsByVendor[m.user_id] ?? 0),
          0,
        ),
        scheduled: members.reduce((s, v) => s + v.scheduled.count, 0),
        checked_in: members.reduce((s, v) => s + v.checked_in.count, 0),
        sold: members.reduce((s, v) => s + v.sold.count, 0),
      };
    })
    .sort((a, b) => b.total_points - a.total_points || b.sold - a.sold);

  // ── style shortcuts ─────────────────────────────────────────────────────────

  const cardCls = clsx(
    "rounded-[28px] border",
    isDarkMode ? "border-zinc-800 bg-[#111111]" : "border-zinc-100 bg-white",
  );
  const headCls = clsx(
    "text-base font-black tracking-tight",
    isDarkMode ? "text-zinc-100" : "text-zinc-950",
  );
  const divCls = isDarkMode ? "divide-zinc-800" : "divide-zinc-100";
  const textCls = isDarkMode ? "text-zinc-100" : "text-zinc-900";
  const subCls = "text-[11px] text-zinc-400";
  const thCls = clsx(
    "pb-2 text-[11px] font-semibold uppercase tracking-widest",
    isDarkMode ? "text-zinc-500" : "text-zinc-400",
  );
  const tooltipStyle = {
    backgroundColor: isDarkMode ? "#1a1a1a" : "#fff",
    border: `1px solid ${isDarkMode ? "#333" : "#e5e7eb"}`,
    borderRadius: 12,
    fontSize: 12,
    color: isDarkMode ? "#e4e4e7" : "#18181b",
  };
  const maxPts = rankingData[0]?.total_points ?? 1;

  // capacity
  const capacity = event.capacity;
  const capacityPct = capacity ? pct(totalConfirmed, capacity) : null;

  if (loading) {
    return (
      <div className="py-20 text-center text-sm text-zinc-400">
        Carregando relatório…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── Capacity progress ── */}
      {capacity != null && (
        <Card className={cardCls} padding="md">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p
                className={clsx(
                  "text-[11px] font-semibold uppercase tracking-widest text-zinc-400",
                )}
              >
                Ocupação do evento
              </p>
              <p className={clsx("mt-1 text-2xl font-black", textCls)}>
                {totalConfirmed}
                <span className="text-base font-normal text-zinc-400">
                  {" "}
                  / {capacity} vagas
                </span>
              </p>
            </div>
            <div className="shrink-0 text-right">
              <p
                className={clsx(
                  "text-3xl font-black",
                  capacityPct! >= 80 ? "text-emerald-500" : "text-[#3D56A2]",
                )}
              >
                {capacityPct}%
              </p>
            </div>
          </div>
          <div
            className={clsx(
              "mt-3 h-3 w-full overflow-hidden rounded-full",
              isDarkMode ? "bg-zinc-800" : "bg-zinc-100",
            )}
          >
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{
                width: `${Math.min(capacityPct!, 100)}%`,
                backgroundColor: capacityPct! >= 80 ? "#10B981" : "#3D56A2",
              }}
            />
          </div>
        </Card>
      )}

      {/* ── Header: last updated + export ── */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span
            className={clsx(
              "inline-block h-2 w-2 rounded-full",
              justRefreshed ? "animate-ping bg-emerald-400" : "bg-zinc-400",
            )}
          />
          <p
            className={clsx(
              "text-xs",
              isDarkMode ? "text-zinc-500" : "text-zinc-400",
            )}
          >
            {lastUpdatedAt
              ? `Atualizado ${agoLabel} · auto-refresh a cada 30s`
              : "Atualização automática a cada 30s"}
          </p>
        </div>
        <Button
          variant="secondary"
          size="sm"
          icon={<Download size={14} />}
          onClick={onExportCsv}
        >
          Exportar CSV
        </Button>
      </div>

      {/* ── Summary cards ── */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
        <MetricCard
          title="Total Leads"
          value={totalLeads}
          tone="rose"
          dark={isDarkMode}
          helper="cadastrados no evento"
        />
        <MetricCard
          title="Agendamentos"
          value={totalScheduled}
          tone="blue"
          dark={isDarkMode}
          helper="1 pt cada"
        />
        <MetricCard
          title="Confirmações"
          value={totalConfirmed}
          tone="rose"
          dark={isDarkMode}
          helper="confirmado ou check-in"
        />
        <MetricCard
          title="Check-ins"
          value={totalCheckin}
          tone="amber"
          dark={isDarkMode}
          helper="2 pts cada"
        />
        <MetricCard
          title="Vendas"
          value={totalSales}
          tone="emerald"
          dark={isDarkMode}
          helper="7 pts cada"
        />
        <MetricCard
          title="Total Pontos"
          value={totalPts}
          tone="blue"
          dark={isDarkMode}
          helper="soma geral"
        />
      </div>

      {/* ── Conversion funnel ── */}
      <Card className={cardCls} padding="lg">
        <h3 className={headCls}>Funil de Conversão</h3>
        <p
          className={clsx(
            "mt-1 text-xs",
            isDarkMode ? "text-zinc-500" : "text-zinc-400",
          )}
        >
          Taxa de cada etapa em relação à anterior
        </p>
        <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <FunnelStep
            label="Leads"
            count={totalLeads}
            color="#6B7280"
            dark={isDarkMode}
          />
          <FunnelStep
            label="Agendados"
            count={totalScheduled}
            rate={pct(totalScheduled, totalLeads)}
            color="#3D56A2"
            dark={isDarkMode}
          />
          <FunnelStep
            label="Check-ins"
            count={totalCheckin}
            rate={pct(totalCheckin, totalScheduled)}
            color="#FBBB49"
            dark={isDarkMode}
          />
          <FunnelStep
            label="Vendas"
            count={totalSales}
            rate={pct(totalSales, totalCheckin)}
            color="#10B981"
            isLast
            dark={isDarkMode}
          />
        </div>
      </Card>

      {/* ── Leads por origem + conversão por canal ── */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card className={cardCls} padding="lg">
          <h3 className={headCls}>Leads por Origem</h3>
          {sourceData.length === 0 ? (
            <p className="mt-6 text-center text-sm text-zinc-400">
              Sem leads cadastrados.
            </p>
          ) : (
            <div className="mt-4 h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={sourceData}
                  layout="vertical"
                  margin={{ left: 8, right: 24, top: 4, bottom: 4 }}
                >
                  <XAxis type="number" hide />
                  <YAxis
                    type="category"
                    dataKey="label"
                    width={90}
                    tick={{
                      fontSize: 11,
                      fill: isDarkMode ? "#a1a1aa" : "#52525b",
                    }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    cursor={{
                      fill: isDarkMode
                        ? "rgba(255,255,255,0.04)"
                        : "rgba(0,0,0,0.04)",
                    }}
                    contentStyle={tooltipStyle}
                    formatter={(value: number) => [value, "Leads"]}
                  />
                  <Bar dataKey="count" radius={[0, 6, 6, 0]} maxBarSize={28}>
                    {sourceData.map((entry) => (
                      <Cell
                        key={entry.source}
                        fill={SOURCE_COLORS[entry.source] ?? "#94A3B8"}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>

        {/* Conversão por canal — substitui o donut duplicado */}
        <Card className={cardCls} padding="lg">
          <h3 className={headCls}>Conversão por Canal</h3>
          <p
            className={clsx(
              "mt-1 text-xs",
              isDarkMode ? "text-zinc-500" : "text-zinc-400",
            )}
          >
            % de leads confirmados ou com check-in por origem
          </p>
          {sourceData.length === 0 ? (
            <p className="mt-6 text-center text-sm text-zinc-400">
              Sem leads cadastrados.
            </p>
          ) : (
            <div className="mt-5 space-y-4">
              {sourceData.map((entry) => (
                <div key={entry.source}>
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      <div
                        className="h-2.5 w-2.5 rounded-full shrink-0"
                        style={{
                          backgroundColor:
                            SOURCE_COLORS[entry.source] ?? "#94A3B8",
                        }}
                      />
                      <span className={clsx("text-sm font-medium", textCls)}>
                        {entry.label}
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={subCls}>{entry.count} leads</span>
                      <span
                        className={clsx(
                          "text-sm font-bold tabular-nums",
                          entry.convRate >= 50
                            ? "text-emerald-500"
                            : "text-zinc-400",
                        )}
                      >
                        {entry.convRate}%
                      </span>
                    </div>
                  </div>
                  <div
                    className={clsx(
                      "h-2 w-full overflow-hidden rounded-full",
                      isDarkMode ? "bg-zinc-800" : "bg-zinc-100",
                    )}
                  >
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${entry.convRate}%`,
                        backgroundColor:
                          SOURCE_COLORS[entry.source] ?? "#94A3B8",
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* ── CRM stage ── */}
      {stageData.length > 0 && (
        <Card className={cardCls} padding="lg">
          <h3 className={headCls}>Leads por Etapa do CRM</h3>
          <div className="mt-4 h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={stageData}
                margin={{ left: 8, right: 24, top: 4, bottom: 4 }}
              >
                <XAxis
                  dataKey="label"
                  tick={{
                    fontSize: 11,
                    fill: isDarkMode ? "#a1a1aa" : "#52525b",
                  }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis hide />
                <Tooltip
                  cursor={{
                    fill: isDarkMode
                      ? "rgba(255,255,255,0.04)"
                      : "rgba(0,0,0,0.04)",
                  }}
                  contentStyle={tooltipStyle}
                  formatter={(value: number) => [value, "Leads"]}
                />
                <Bar dataKey="count" radius={[6, 6, 0, 0]} maxBarSize={52}>
                  {stageData.map((entry) => (
                    <Cell key={entry.label} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}

      {/* ── Individual vendor table ── */}
      <Card className={cardCls} padding="lg">
        <h3 className={headCls}>Desempenho Individual por Vendedor</h3>
        {rankingData.length === 0 && unassignedLeads === 0 ? (
          <p className="mt-6 text-center text-sm text-zinc-400">
            Nenhuma pontuação registrada neste evento.
          </p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr
                  className={clsx(
                    "border-b",
                    isDarkMode ? "border-zinc-800" : "border-zinc-100",
                  )}
                >
                  <th className={clsx(thCls, "pb-2 text-left w-6")}>#</th>
                  <th className={clsx(thCls, "pb-2 text-left pl-2")}>
                    Vendedor
                  </th>
                  <th
                    className={clsx(
                      thCls,
                      "pb-2 text-left pl-2 hidden sm:table-cell",
                    )}
                  >
                    Time
                  </th>
                  <th className={clsx(thCls, "pb-2 text-center px-3")}>
                    Leads
                  </th>
                  <th className={clsx(thCls, "pb-2 text-center px-3")}>
                    Agend.
                  </th>
                  <th className={clsx(thCls, "pb-2 text-center px-3")}>
                    Check-in
                  </th>
                  <th className={clsx(thCls, "pb-2 text-center px-3")}>
                    Vendas
                  </th>
                  <th className={clsx(thCls, "pb-2 text-right pl-3")}>Pts</th>
                  <th className="pb-2 pl-4 w-28" />
                </tr>
              </thead>
              <tbody className={clsx("divide-y", divCls)}>
                {rankingData.map((vendor, idx) => {
                  const barPct =
                    maxPts > 0
                      ? Math.round((vendor.total_points / maxPts) * 100)
                      : 0;
                  const teamName = vendorTeamName[vendor.vendor_id];
                  return (
                    <tr key={vendor.vendor_id} className="align-middle">
                      <td
                        className={clsx(
                          "py-3 text-sm font-black w-6",
                          MEDAL[idx] ??
                            (isDarkMode ? "text-zinc-500" : "text-zinc-400"),
                        )}
                      >
                        {idx + 1}
                      </td>
                      <td className="py-3 pl-2">
                        <div className="flex items-center gap-2">
                          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-100 text-[10px] font-bold text-blue-700">
                            {vendor.vendor_name
                              .split(" ")
                              .slice(0, 2)
                              .map((p) => p[0])
                              .join("")}
                          </div>
                          <span
                            className={clsx(
                              "truncate font-semibold max-w-[130px]",
                              textCls,
                            )}
                          >
                            {vendor.vendor_name}
                          </span>
                        </div>
                      </td>
                      <td className="py-3 pl-2 hidden sm:table-cell">
                        {teamName ? (
                          <span
                            className={clsx(
                              "rounded-full px-2 py-0.5 text-[11px] font-medium",
                              isDarkMode
                                ? "bg-zinc-800 text-zinc-300"
                                : "bg-zinc-100 text-zinc-600",
                            )}
                          >
                            {teamName}
                          </span>
                        ) : (
                          <span className="text-[11px] text-zinc-400">—</span>
                        )}
                      </td>
                      <td
                        className={clsx(
                          "py-3 text-center px-3 tabular-nums",
                          textCls,
                        )}
                      >
                        {leadsByVendor[vendor.vendor_id] ?? 0}
                      </td>
                      <td
                        className={clsx(
                          "py-3 text-center px-3 tabular-nums",
                          textCls,
                        )}
                      >
                        {vendor.scheduled.count}
                      </td>
                      <td
                        className={clsx(
                          "py-3 text-center px-3 tabular-nums",
                          textCls,
                        )}
                      >
                        {vendor.checked_in.count}
                      </td>
                      <td
                        className={clsx(
                          "py-3 text-center px-3 tabular-nums",
                          textCls,
                        )}
                      >
                        {vendor.sold.count}
                      </td>
                      <td
                        className={clsx(
                          "py-3 text-right pl-3 tabular-nums font-black",
                          idx === 0 ? "text-amber-500" : textCls,
                        )}
                      >
                        {vendor.total_points}
                      </td>
                      <td className="py-3 pl-4 w-28">
                        <div
                          className={clsx(
                            "h-2 w-full rounded-full overflow-hidden",
                            isDarkMode ? "bg-zinc-800" : "bg-zinc-100",
                          )}
                        >
                          <div
                            className="h-full rounded-full transition-all duration-500"
                            style={{
                              width: `${barPct}%`,
                              backgroundColor:
                                idx === 0 ? "#FBBB49" : "#3D56A2",
                            }}
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })}

                {/* Sem vendedor row */}
                {unassignedLeads > 0 && (
                  <tr className="align-middle opacity-60">
                    <td
                      className={clsx(
                        "py-3 text-sm font-black w-6",
                        isDarkMode ? "text-zinc-600" : "text-zinc-300",
                      )}
                    >
                      —
                    </td>
                    <td className="py-3 pl-2">
                      <div className="flex items-center gap-2">
                        <div
                          className={clsx(
                            "flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
                            isDarkMode ? "bg-zinc-800" : "bg-zinc-100",
                          )}
                        >
                          <span className="text-[10px] text-zinc-400">?</span>
                        </div>
                        <span className="truncate text-[13px] font-medium text-zinc-400 italic">
                          Sem vendedor
                        </span>
                      </div>
                    </td>
                    <td className="py-3 pl-2 hidden sm:table-cell">
                      <span className="text-[11px] text-zinc-400">—</span>
                    </td>
                    <td
                      className={clsx(
                        "py-3 text-center px-3 tabular-nums",
                        isDarkMode ? "text-zinc-400" : "text-zinc-500",
                      )}
                    >
                      {unassignedLeads}
                    </td>
                    <td
                      colSpan={4}
                      className="py-3 text-center text-[11px] text-zinc-400"
                    >
                      —
                    </td>
                    <td />
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* ── Team ranking ── */}
      <Card className={cardCls} padding="lg">
        <h3 className={headCls}>Ranking de Times</h3>
        {teamRanking.length === 0 ? (
          <p className="mt-6 text-center text-sm text-zinc-400">
            Nenhum time criado para este evento.
          </p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[540px] text-sm">
              <thead>
                <tr
                  className={clsx(
                    "border-b",
                    isDarkMode ? "border-zinc-800" : "border-zinc-100",
                  )}
                >
                  <th className={clsx(thCls, "pb-2 text-left w-6")}>#</th>
                  <th className={clsx(thCls, "pb-2 text-left pl-2")}>Time</th>
                  <th className={clsx(thCls, "pb-2 text-center px-3")}>
                    Membros
                  </th>
                  <th className={clsx(thCls, "pb-2 text-center px-3")}>
                    Leads
                  </th>
                  <th className={clsx(thCls, "pb-2 text-center px-3")}>
                    Agend.
                  </th>
                  <th className={clsx(thCls, "pb-2 text-center px-3")}>
                    Check-in
                  </th>
                  <th className={clsx(thCls, "pb-2 text-center px-3")}>
                    Vendas
                  </th>
                  <th className={clsx(thCls, "pb-2 text-right pl-3")}>Pts</th>
                  <th className={clsx(thCls, "pb-2 text-right pl-2")}>Share</th>
                </tr>
              </thead>
              <tbody className={clsx("divide-y", divCls)}>
                {teamRanking.map((team, idx) => (
                  <tr key={team.id} className="align-middle">
                    <td
                      className={clsx(
                        "py-3 text-sm font-black w-6",
                        MEDAL[idx] ??
                          (isDarkMode ? "text-zinc-500" : "text-zinc-400"),
                      )}
                    >
                      {idx + 1}
                    </td>
                    <td className="py-3 pl-2">
                      <div className="flex items-center gap-2">
                        <div
                          className={clsx(
                            "flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
                            isDarkMode ? "bg-zinc-800" : "bg-red-50",
                          )}
                        >
                          <Users
                            size={13}
                            className={
                              isDarkMode ? "text-zinc-300" : "text-red-500"
                            }
                          />
                        </div>
                        <span
                          className={clsx(
                            "truncate font-semibold max-w-[150px]",
                            textCls,
                          )}
                        >
                          {team.name}
                        </span>
                      </div>
                    </td>
                    <td
                      className={clsx(
                        "py-3 text-center px-3 tabular-nums",
                        textCls,
                      )}
                    >
                      {team.member_count}
                    </td>
                    <td
                      className={clsx(
                        "py-3 text-center px-3 tabular-nums",
                        textCls,
                      )}
                    >
                      {team.leads}
                    </td>
                    <td
                      className={clsx(
                        "py-3 text-center px-3 tabular-nums",
                        textCls,
                      )}
                    >
                      {team.scheduled}
                    </td>
                    <td
                      className={clsx(
                        "py-3 text-center px-3 tabular-nums",
                        textCls,
                      )}
                    >
                      {team.checked_in}
                    </td>
                    <td
                      className={clsx(
                        "py-3 text-center px-3 tabular-nums",
                        textCls,
                      )}
                    >
                      {team.sold}
                    </td>
                    <td
                      className={clsx(
                        "py-3 text-right pl-3 tabular-nums font-black",
                        idx === 0 ? "text-amber-500" : textCls,
                      )}
                    >
                      {team.total_points}
                    </td>
                    <td className="py-3 pl-2 text-right">
                      <span
                        className={clsx(
                          "rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums",
                          idx === 0
                            ? "bg-amber-100 text-amber-700"
                            : isDarkMode
                              ? "bg-zinc-800 text-zinc-300"
                              : "bg-zinc-100 text-zinc-600",
                        )}
                      >
                        {team.share}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
