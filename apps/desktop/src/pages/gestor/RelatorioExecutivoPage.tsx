import { useEffect, useMemo, useState } from "react";
import { useOutletContext } from "react-router-dom";
import clsx from "clsx";
import {
  Printer,
  TrendingUp,
  Trophy,
  Bot,
  Filter,
  Sparkles,
  Clock,
  Swords,
  UserRound,
  Banknote,
  Users,
  Target,
  Eye,
  Radio,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { PageHeader } from "../../components/shared/PageHeader";
import { Modal } from "../../components/ui/Modal";
import type { AppOutletContext } from "../../layouts/AppLayout";
import { readStoredSession } from "../../services/auth";
import { listClients, mapApiClientToClient } from "../../services/clients";
import {
  listEvents,
  getEventDashboardTv,
  getEventExecutiveReport,
  mapApiEventToEvent,
  type ExecutiveAttributionRow,
  type EventDashboardTvResponse,
  type ExecutiveReportResponse,
} from "../../services/events";
import type { Client, Event } from "../../types";
import {
  DASHBOARD_DARK_CHANGE_EVENT,
  readDashboardDarkEnabled,
} from "../../lib/dashboard-dark-mode";

/**
 * Relatório Executivo — o "dossiê perfeito" de um evento, em 10 capítulos.
 *
 * A atribuição campanha→venda, os números do Rubinho e o histórico entre eventos
 * vêm do endpoint /events/:id/executive-report (dados reais rastreados no banco).
 * O que ainda depende de premissa — apenas a margem de lucro — usa uma tabela de
 * margens por segmento, exposta na tela e marcada com a etiqueta "est.".
 */

// Margem de lucro estimada por segmento de venda (ajuste conforme a operação real).
const MARGENS_SEGMENTO: Record<string, number> = {
  NOVO: 0.05,
  SEMINOVO: 0.12,
  VENDA_DIRETA: 0.03,
  PCD: 0.05,
};
const MARGEM_PADRAO = 0.07;

const BRAND = "#FF0636";

function formatCurrency(val: number, maxFrac = 0) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: maxFrac,
  }).format(Number.isFinite(val) ? val : 0);
}

function formatCurrencyCompact(val: number) {
  if (!Number.isFinite(val)) return "R$ 0";
  if (Math.abs(val) >= 1_000_000)
    return `R$ ${(val / 1_000_000).toFixed(2)} mi`;
  if (Math.abs(val) >= 1_000) return `R$ ${(val / 1_000).toFixed(0)} mil`;
  return formatCurrency(val);
}

function formatNumber(val: number) {
  return new Intl.NumberFormat("pt-BR").format(
    Math.round(Number.isFinite(val) ? val : 0),
  );
}

function pct(part: number, whole: number) {
  if (!whole) return 0;
  return (part / whole) * 100;
}

const SEGMENT_LABEL: Record<string, string> = {
  NOVO: "0km",
  SEMINOVO: "Seminovo",
  VENDA_DIRETA: "Venda Direta",
  PCD: "PcD",
};

const SOURCE_LABEL: Record<string, string> = {
  facebook_ads: "Facebook Ads",
  form_page: "Formulário",
  whatsapp: "WhatsApp",
  import_excel: "Importação",
  manual: "Manual",
};

const WEEKDAY_LABEL = [
  "Domingo",
  "Segunda",
  "Terça",
  "Quarta",
  "Quinta",
  "Sexta",
  "Sábado",
];

export function RelatorioExecutivoPage() {
  const { user } = useOutletContext<AppOutletContext>();
  const [isDarkPref, setIsDarkPref] = useState(() =>
    readDashboardDarkEnabled(user.id),
  );
  const [printing, setPrinting] = useState(false);
  const isDark = isDarkPref && !printing;

  const [clients, setClients] = useState<Client[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [tv, setTv] = useState<EventDashboardTvResponse | null>(null);
  const [exec, setExec] = useState<ExecutiveReportResponse | null>(null);
  const [selectedClientId, setSelectedClientId] = useState<string>("");
  const [selectedEventId, setSelectedEventId] = useState<string>("");
  const [loading, setLoading] = useState(true);

  // Alterna para tema claro durante a impressão e volta depois.
  useEffect(() => {
    const before = () => setPrinting(true);
    const after = () => setPrinting(false);
    window.addEventListener("beforeprint", before);
    window.addEventListener("afterprint", after);
    return () => {
      window.removeEventListener("beforeprint", before);
      window.removeEventListener("afterprint", after);
    };
  }, []);

  // Dark mode sync
  useEffect(() => {
    if (typeof window === "undefined") return;
    const sync = () => setIsDarkPref(readDashboardDarkEnabled(user.id));
    sync();
    window.addEventListener("storage", sync);
    window.addEventListener("focus", sync);
    window.addEventListener(DASHBOARD_DARK_CHANGE_EVENT, sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener("focus", sync);
      window.removeEventListener(DASHBOARD_DARK_CHANGE_EVENT, sync);
    };
  }, [user.id]);

  // Carrega clientes
  useEffect(() => {
    const token = readStoredSession()?.accessToken;
    if (!token) return;
    listClients(token)
      .then((rows) => {
        const mapped = rows.map(mapApiClientToClient);
        setClients(mapped);
        setSelectedClientId((prev) => prev || mapped[0]?.id || "");
      })
      .catch(() => setClients([]));
  }, []);

  // Carrega eventos do cliente selecionado ("all" = todos os clientes do gestor)
  useEffect(() => {
    const token = readStoredSession()?.accessToken;
    if (!token || !selectedClientId) return;
    setLoading(true);
    listEvents(
      selectedClientId === "all" ? {} : { client_id: selectedClientId },
      token,
    )
      .then((apiEvents) => {
        const mapped = apiEvents.map(mapApiEventToEvent);
        mapped.sort(
          (a, b) =>
            new Date(b.event_date).getTime() - new Date(a.event_date).getTime(),
        );
        setEvents(mapped);
        setSelectedEventId((prev) => {
          if (prev && mapped.some((e) => e.id === prev)) return prev;
          return mapped[0]?.id || "";
        });
      })
      .catch(() => setEvents([]))
      .finally(() => setLoading(false));
  }, [selectedClientId]);

  // Carrega snapshot e relatório executivo. Toda métrica Meta já vem filtrada
  // no backend pelas campanhas vinculadas/importadas para este evento.
  useEffect(() => {
    const token = readStoredSession()?.accessToken;
    if (!token || !selectedEventId) {
      setTv(null);
      setExec(null);
      return;
    }
    getEventDashboardTv(selectedEventId, token)
      .then(setTv)
      .catch(() => setTv(null));
    getEventExecutiveReport(selectedEventId, token)
      .then(setExec)
      .catch(() => setExec(null));
  }, [selectedEventId, events, selectedClientId]);

  const report = useMemo(() => buildReport(tv, exec), [tv, exec]);
  const selectedEvent = events.find((e) => e.id === selectedEventId);

  const panel = clsx(
    "exec-chapter rounded-[24px] border p-6 md:p-8",
    isDark
      ? "border-zinc-800 bg-[#0f0f0f]"
      : "border-zinc-100 bg-white shadow-sm",
  );

  return (
    <div
      className={clsx(
        "exec-report space-y-6 pb-16",
        isDark && "dashboard-dark bg-black",
      )}
    >
      <PageHeader
        title="Relatório Executivo"
        subtitle={selectedEvent ? selectedEvent.name : "Selecione um evento"}
        breadcrumbs={[{ label: "Gestor" }, { label: "Relatório Executivo" }]}
        dark={isDark}
        actions={
          <div className="no-print flex flex-wrap items-center gap-2">
            <Selector
              value={selectedClientId}
              onChange={setSelectedClientId}
              dark={isDark}
              options={[
                { value: "all", label: "🌐 Todos os clientes" },
                ...clients.map((c) => ({
                  value: c.id,
                  label: c.company_name,
                })),
              ]}
              placeholder="Cliente"
            />
            <Selector
              value={selectedEventId}
              onChange={setSelectedEventId}
              dark={isDark}
              options={events.map((e) => ({ value: e.id, label: e.name }))}
              placeholder="Evento"
            />
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 rounded-full bg-[#FF0636] px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#d90530]"
            >
              <Printer size={14} /> Imprimir / PDF
            </button>
          </div>
        }
      />

      {loading && !tv ? (
        <div
          className={clsx(
            "flex min-h-[240px] items-center justify-center text-sm",
            isDark ? "text-zinc-400" : "text-zinc-500",
          )}
        >
          Carregando relatório…
        </div>
      ) : !tv ? (
        <div className={panel}>
          <p
            className={clsx(
              "text-sm",
              isDark ? "text-zinc-400" : "text-zinc-500",
            )}
          >
            Nenhum dado disponível para este evento ainda. Assim que houver
            leads, check-ins e vendas registrados, o relatório será populado
            automaticamente.
          </p>
        </div>
      ) : (
        <>
          <ExecutiveSummary report={report} isDark={isDark} panel={panel} />

          {report.narrative.length > 0 && (
            <div className={panel}>
              <Narrative lines={report.narrative} isDark={isDark} />
            </div>
          )}

          <Chapter
            n={2}
            title="Campanhas"
            subtitle="O que aconteceu antes do evento — mídia paga"
            isDark={isDark}
          >
            <div className={panel}>
              <CampaignsMediaTable report={report} isDark={isDark} />
            </div>
          </Chapter>

          <Chapter
            n={3}
            title="Campanhas → CRM"
            subtitle="Não interessa quem gerou lead. Interessa quem gerou venda."
            isDark={isDark}
          >
            <div className={panel}>
              <CampaignsToCrm report={report} isDark={isDark} />
            </div>
          </Chapter>

          <Chapter
            n={4}
            title="Performance do Rubinho"
            subtitle="A IA como ativo financeiro"
            isDark={isDark}
          >
            <div className={panel}>
              <RubinhoPerformance report={report} isDark={isDark} />
            </div>
          </Chapter>

          <Chapter
            n={5}
            title="O Grande Funil"
            subtitle="Da mídia à venda, em um só olhar"
            isDark={isDark}
          >
            <div className={panel}>
              <GrandFunnel report={report} isDark={isDark} />
            </div>
          </Chapter>

          <Chapter
            n={6}
            title="Evento"
            subtitle="O que aconteceu no dia"
            isDark={isDark}
          >
            <div className={panel}>
              <EventStats report={report} isDark={isDark} />
            </div>
          </Chapter>

          <Chapter
            n={7}
            title="Ranking Comercial"
            subtitle="A competição começa"
            isDark={isDark}
          >
            <div className={panel}>
              <SalesRanking report={report} isDark={isDark} />
            </div>
          </Chapter>

          <Chapter
            n={8}
            title="Inteligência Comercial"
            subtitle="Onde colocar vendedores e dinheiro"
            isDark={isDark}
          >
            <div className={panel}>
              <CommercialIntelligence report={report} isDark={isDark} />
            </div>
          </Chapter>

          <Chapter
            n={9}
            title="Evento vs Eventos Anteriores"
            subtitle="A evolução que vende renovação"
            isDark={isDark}
          >
            <div className={panel}>
              <HistoricalComparison
                report={report}
                currentId={selectedEventId}
                isDark={isDark}
              />
            </div>
          </Chapter>

          <Chapter
            n={10}
            title="Evento vs Campanhas"
            subtitle="A matriz de performance — a tela mais importante"
            isDark={isDark}
          >
            <div className={panel}>
              <PerformanceMatrix report={report} isDark={isDark} />
            </div>
            <div className={clsx(panel, "mt-4")}>
              <MoneyJourney report={report} isDark={isDark} />
            </div>
          </Chapter>

          <Chapter
            n="★"
            title="Grand Prix Score"
            subtitle="O índice proprietário de performance (0–100)"
            isDark={isDark}
          >
            <div className={clsx(panel, "relative overflow-hidden")}>
              <GrandPrixScore report={report} isDark={isDark} />
            </div>
          </Chapter>
        </>
      )}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────── */
/* Modelo de dados                                                              */
/* ────────────────────────────────────────────────────────────────────────── */

type CampaignRow = {
  id: string;
  name: string;
  investimento: number;
  leads: number;
  cpl: number;
  impressoes: number;
  conversas: number;
  custoConversa: number;
  alcance: number;
  agendados: number;
  compareceram: number;
  vendas: number;
  receita: number;
  roas: number;
  roiPercent: number;
};

type ReportModel = ReturnType<typeof buildReport>;

function buildReport(
  tv: EventDashboardTvResponse | null,
  exec: ExecutiveReportResponse | null,
) {
  const f = tv?.funnel ?? {
    leads: 0,
    scheduled: 0,
    confirmed: 0,
    checked_in: 0,
    sold: 0,
  };

  const legacyCampaignAttribution: ExecutiveAttributionRow[] = (
    exec?.attribution ?? []
  ).map((row) => ({
    ...row,
    level: "campaign",
    entity_id: row.entity_id ?? row.meta_campaign_id,
    meta_ad_set_id: null,
    spend: row.spend ?? 0,
    meta_leads: row.meta_leads ?? row.leads ?? 0,
    impressions: row.impressions ?? 0,
    reach: row.reach ?? 0,
    conversations: row.conversations ?? 0,
    cpl: row.cpl ?? 0,
    cost_per_conversation: row.cost_per_conversation ?? 0,
    cost_per_scheduled: row.cost_per_scheduled ?? 0,
    cost_per_sale: row.cost_per_sale ?? 0,
    roas: row.roas ?? 0,
    roi_percent: row.roi_percent ?? 0,
  }));
  const levelAttribution = exec?.attribution_by_level ?? {
    campaigns: legacyCampaignAttribution,
    ad_sets: [],
    ads: [],
  };
  const metaSpend = levelAttribution.campaigns.reduce(
    (sum, row) => sum + (row.spend || 0),
    0,
  );
  // Prefere o investimento declarado no evento; cai para o gasto do Meta.
  const investimento = exec?.investment?.total ?? metaSpend;
  const paidTraffic = exec?.investment?.paid_traffic ?? metaSpend;
  const investimentoDeclarado = exec?.investment?.total != null;
  const leadsMidia = levelAttribution.campaigns.reduce(
    (sum, row) => sum + (row.meta_leads || 0),
    0,
  );
  const impressoes = levelAttribution.campaigns.reduce(
    (sum, row) => sum + (row.impressions || 0),
    0,
  );
  const conversas = levelAttribution.campaigns.reduce(
    (sum, row) => sum + (row.conversations || 0),
    0,
  );
  const alcance = levelAttribution.campaigns.reduce(
    (sum, row) => sum + (row.reach || 0),
    0,
  );
  const cplMedio = leadsMidia > 0 ? paidTraffic / leadsMidia : 0;

  const faturamento = tv ? Number(tv.cars.total_value) || 0 : 0;
  const veiculos = f.sold;
  const ticketMedio = veiculos > 0 ? faturamento / veiculos : 0;

  // Lucro por margem de segmento (receita do segmento estimada pela fatia de vendas)
  const bySegment = (tv?.cars.by_segment ?? []).map((s) => ({
    type: s.type,
    label: SEGMENT_LABEL[s.type] ?? s.type,
    count: s.count,
  }));
  const totalSegCount = bySegment.reduce((s, x) => s + x.count, 0) || 1;
  let lucro = 0;
  for (const seg of bySegment) {
    const segRevenue = faturamento * (seg.count / totalSegCount);
    lucro += segRevenue * (MARGENS_SEGMENTO[seg.type] ?? MARGEM_PADRAO);
  }
  if (bySegment.length === 0) lucro = faturamento * MARGEM_PADRAO;

  const roi =
    investimento > 0 ? ((faturamento - investimento) / investimento) * 100 : 0;
  const retornoPorReal = investimento > 0 ? faturamento / investimento : 0;

  // Métricas e atribuição vêm da mesma fonte, já restrita ao evento no backend.
  const attrById = new Map(
    levelAttribution.campaigns.map((attribution) => [
      attribution.entity_id,
      attribution,
    ]),
  );
  const campaignIds = new Set(attrById.keys());
  const campaignRows: CampaignRow[] = [...campaignIds].map((campaignId) => {
    const a = attrById.get(campaignId);
    const receita = a?.revenue ?? 0;
    return {
      id: campaignId,
      name: a?.name ?? "Campanha sem nome",
      investimento: a?.spend ?? 0,
      leads: a?.meta_leads ?? 0,
      cpl:
        (a?.meta_leads ?? 0) > 0 ? (a?.spend ?? 0) / (a?.meta_leads ?? 1) : 0,
      impressoes: a?.impressions ?? 0,
      conversas: a?.conversations ?? 0,
      custoConversa: a?.cost_per_conversation ?? 0,
      alcance: a?.reach ?? 0,
      agendados: a?.scheduled ?? 0,
      compareceram: a?.checked_in ?? 0,
      vendas: a?.sold ?? 0,
      receita,
      roas: a?.roas ?? 0,
      roiPercent: a?.roi_percent ?? 0,
    };
  });
  const attrReal = Boolean(exec);
  const coverage = exec?.attribution_coverage;
  const attributionPeriod = exec?.attribution_period ?? null;
  const dataQuality = exec?.data_quality ?? null;

  // Avaliações dos clientes por vendedor (real, do exec)
  const ratingByVendor = new Map(
    (exec?.ratings?.by_vendor ?? []).map((r) => [r.vendor_id, r]),
  );

  // Ranking comercial: receita e ticket calculados com os valores reais das vendas.
  const vendorCommercial = new Map(
    (exec?.commercial_revenue?.by_vendor ?? []).map((row) => [
      row.vendor_id,
      row,
    ]),
  );
  const vendors = (tv?.vendors ?? [])
    .map((v) => {
      const rt = ratingByVendor.get(v.vendor_id);
      const commercial = vendorCommercial.get(v.vendor_id);

      return {
        id: v.vendor_id,
        name: v.vendor_name,
        team: v.team_name,
        atendimentos: v.leads,
        agendados: v.scheduled,
        compareceram: v.checked_in,
        vendas: v.sold,
        pontos: v.points,
        receita: commercial?.revenue ?? v.revenue ?? 0,
        ticketMedio: commercial?.average_ticket ?? 0,
        avaliacao: rt?.avg_score ?? 0,
        avaliacaoCount: rt?.count ?? 0,
      };
    })
    .sort((a, b) => b.vendas - a.vendas || b.pontos - a.pontos);

  const ratingsOverall = exec?.ratings?.overall_avg ?? 0;
  const ratingsTotal = exec?.ratings?.total ?? 0;
  const eventFeedback = exec?.event_feedback ?? null;

  const teamCommercial = new Map(
    (exec?.commercial_revenue?.by_team ?? []).map((row) => [row.team_id, row]),
  );
  const teams = (tv?.teams ?? [])
    .map((t) => ({
      id: t.team_id,
      name: t.team_name,
      vendas: t.sold,
      pontos: t.points,
      receita: teamCommercial.get(t.team_id)?.revenue ?? t.revenue ?? 0,
      ticketMedio: teamCommercial.get(t.team_id)?.average_ticket ?? 0,
    }))
    .sort((a, b) => b.vendas - a.vendas);

  // Vendas por dia da semana (real)
  const byWeekday = new Map<number, number>();
  (tv?.daily ?? []).forEach((d) => {
    const wd = new Date(`${d.date}T12:00:00`).getDay();
    byWeekday.set(wd, (byWeekday.get(wd) || 0) + d.sold);
  });
  const salesByWeekday = Array.from(byWeekday.entries())
    .map(([wd, sold]) => ({ label: WEEKDAY_LABEL[wd], sold }))
    .filter((r) => r.sold > 0)
    .sort((a, b) => b.sold - a.sold);

  // Chegada de clientes por horário: somente check-ins concluídos.
  const arrivalsByHour = (tv?.arrivals_by_hour ?? []).map(
    ({ hour, count }) => ({
      label: `${String(hour).padStart(2, "0")}h`,
      hour,
      value: count,
    }),
  );
  const peakHour =
    arrivalsByHour.length > 0
      ? arrivalsByHour.reduce((max, x) => (x.value > max.value ? x : max))
      : null;

  // Origem (real)
  const bySource = (tv?.checkin_by_source ?? [])
    .map((s) => ({ label: SOURCE_LABEL[s.source] ?? s.source, count: s.count }))
    .sort((a, b) => b.count - a.count);

  const topModels = tv?.cars.top_models ?? [];
  const vehicleIntelligence = exec?.vehicle_intelligence ?? null;

  // Rubinho (real quando exec disponível)
  const rubinho = exec?.rubinho ?? null;

  // Histórico (real, do exec)
  const history = exec?.history ?? [];

  // Grand Prix Score
  const scoreLeads = clamp(pct(f.scheduled, f.leads) * 2.2);
  const scoreComparecimento = clamp(
    pct(f.checked_in, f.confirmed || f.scheduled),
  );
  const scoreConversao = clamp(pct(f.sold, f.checked_in) * 3);
  const scoreRubinho = rubinho
    ? clamp(rubinho.taxa_comparecimento * 1.1)
    : clamp(pct(f.scheduled, f.leads) * 2.4);
  const topShare = vendors.length
    ? pct(vendors[0].vendas, vendors.reduce((s, v) => s + v.vendas, 0) || 1)
    : 0;
  const scoreEquipe = clamp(
    100 - Math.abs(topShare - 100 / Math.max(vendors.length, 1)),
  );
  const scoreRoi = clamp((retornoPorReal / 5) * 100);
  const grandPrix =
    scoreLeads * 0.15 +
    scoreComparecimento * 0.15 +
    scoreConversao * 0.2 +
    scoreRubinho * 0.15 +
    scoreEquipe * 0.15 +
    scoreRoi * 0.2;

  // Narrativa automática
  const narrative: string[] = [];
  if (retornoPorReal > 0) {
    const investmentLabel = investimentoDeclarado
      ? "investido no evento"
      : "investido em mídia rastreada";
    narrative.push(
      `Cada R$ 1 ${investmentLabel} retornou ${formatCurrency(retornoPorReal, 2)} em faturamento (ROI de ${formatNumber(roi)}%).`,
    );
  }
  if (salesByWeekday.length > 0) {
    const best = salesByWeekday[0];
    narrative.push(
      `${best.label} concentrou o maior volume de vendas (${formatNumber(best.sold)} veículos).`,
    );
  }
  const bestCamp = [...campaignRows].sort((a, b) => b.receita - a.receita)[0];
  if (bestCamp && bestCamp.receita > 0) {
    narrative.push(
      `A campanha "${bestCamp.name}" gerou a maior receita atribuída (${formatCurrencyCompact(bestCamp.receita)}), com ROAS de ${bestCamp.roas.toFixed(2)}x.`,
    );
  }
  if (peakHour) {
    narrative.push(
      `O pico de chegada de clientes foi às ${peakHour.label} — concentre a escala de vendedores nesse horário.`,
    );
  }

  return {
    funnel: f,
    investimento,
    metaSpend,
    paidTraffic,
    investimentoDeclarado,
    leadsMidia,
    impressoes,
    conversas,
    alcance,
    cplMedio,
    faturamento,
    veiculos,
    ticketMedio,
    lucro,
    roi,
    retornoPorReal,
    campaignRows,
    attributionByLevel: levelAttribution,
    attrReal,
    coverage,
    attributionPeriod,
    dataQuality,
    vendors,
    teams,
    commercialRevenueCoverage: exec?.commercial_revenue?.coverage ?? null,
    ratingsOverall,
    ratingsTotal,
    eventFeedback,
    salesByWeekday,
    arrivalsByHour,
    arrivalDataQuality: tv?.arrival_data_quality ?? null,
    peakHour,
    bySource,
    bySegment,
    topModels,
    vehicleIntelligence,
    rubinho,
    history,
    narrative,
    scores: {
      leads: scoreLeads,
      comparecimento: scoreComparecimento,
      conversao: scoreConversao,
      rubinho: scoreRubinho,
      equipe: scoreEquipe,
      roi: scoreRoi,
      total: grandPrix,
    },
  };
}

function clamp(v: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, Number.isFinite(v) ? v : 0));
}

/* ────────────────────────────────────────────────────────────────────────── */
/* Componentes                                                                  */
/* ────────────────────────────────────────────────────────────────────────── */

function Selector({
  value,
  onChange,
  options,
  dark,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
  dark: boolean;
  placeholder: string;
}) {
  return (
    <div className="relative">
      <Filter
        size={13}
        className={clsx(
          "pointer-events-none absolute left-3 top-1/2 -translate-y-1/2",
          dark ? "text-zinc-500" : "text-zinc-400",
        )}
      />
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={clsx(
          "min-w-[150px] cursor-pointer rounded-full border py-2 pl-8 pr-3 text-[13px] outline-none transition-colors focus:border-[#FF0636]",
          dark
            ? "border-zinc-700 bg-[#111] text-zinc-100"
            : "border-zinc-200 bg-white text-zinc-800",
        )}
      >
        {options.length === 0 && <option value="">{placeholder}</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function Chapter({
  n,
  title,
  subtitle,
  isDark,
  children,
}: {
  n: number | string;
  title: string;
  subtitle: string;
  isDark: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-center gap-3">
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-sm font-black text-white"
          style={{ background: BRAND }}
        >
          {n}
        </span>
        <div>
          <h2
            className={clsx(
              "text-lg font-black tracking-tight",
              isDark ? "text-zinc-50" : "text-zinc-950",
            )}
          >
            {title}
          </h2>
          <p
            className={clsx(
              "text-xs",
              isDark ? "text-zinc-500" : "text-zinc-400",
            )}
          >
            {subtitle}
          </p>
        </div>
      </div>
      {children}
    </section>
  );
}

function EstTag({ isDark, hint }: { isDark: boolean; hint?: string }) {
  return (
    <span
      className={clsx(
        "ml-1.5 rounded px-1 py-0.5 text-[9px] font-bold uppercase tracking-wide",
        isDark
          ? "bg-amber-500/15 text-amber-400"
          : "bg-amber-100 text-amber-700",
      )}
      title={hint ?? "Valor estimado a partir dos dados reais"}
    >
      est.
    </span>
  );
}

function BigStat({
  label,
  value,
  accent,
  isDark,
  est,
}: {
  label: string;
  value: string;
  accent?: string;
  isDark: boolean;
  est?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1 py-2">
      <span
        className={clsx(
          "text-[11px] font-semibold uppercase tracking-[0.14em]",
          isDark ? "text-zinc-500" : "text-zinc-400",
        )}
      >
        {label}
        {est && <EstTag isDark={isDark} />}
      </span>
      <span
        className="text-2xl font-black tracking-tight md:text-3xl"
        style={{ color: accent ?? (isDark ? "#fafafa" : "#09090b") }}
      >
        {value}
      </span>
    </div>
  );
}

function Narrative({ lines, isDark }: { lines: string[]; isDark: boolean }) {
  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <Sparkles size={16} style={{ color: BRAND }} />
        <span
          className={clsx(
            "text-xs font-black uppercase tracking-[0.18em]",
            isDark ? "text-zinc-400" : "text-zinc-500",
          )}
        >
          Leitura em 30 segundos
        </span>
      </div>
      <ul className="space-y-1.5">
        {lines.map((l, i) => (
          <li
            key={i}
            className={clsx(
              "flex gap-2 text-sm",
              isDark ? "text-zinc-300" : "text-zinc-700",
            )}
          >
            <span style={{ color: BRAND }}>▸</span>
            <span>{l}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ExecutiveSummary({
  report,
  isDark,
  panel,
}: {
  report: ReportModel;
  isDark: boolean;
  panel: string;
}) {
  return (
    <div
      className={clsx(
        panel,
        "relative overflow-hidden",
        isDark
          ? "!bg-gradient-to-br !from-[#1a0308] !to-[#0f0f0f]"
          : "!bg-gradient-to-br !from-[#fff5f6] !to-white",
      )}
    >
      <div className="mb-4 flex items-center gap-2">
        <Trophy size={18} style={{ color: BRAND }} />
        <span
          className={clsx(
            "text-xs font-black uppercase tracking-[0.2em]",
            isDark ? "text-zinc-400" : "text-zinc-500",
          )}
        >
          Grand Prix Performance
        </span>
      </div>
      <div className="grid grid-cols-2 gap-x-8 gap-y-4 md:grid-cols-3">
        <BigStat
          label="Investimento Total"
          value={formatCurrency(report.investimento)}
          isDark={isDark}
          est={!report.investimentoDeclarado}
        />
        <BigStat
          label="Faturamento Gerado"
          value={formatCurrency(report.faturamento)}
          accent="#10b981"
          isDark={isDark}
        />
        <BigStat
          label="Lucro Estimado"
          value={formatCurrency(report.lucro)}
          isDark={isDark}
          est
        />
        <BigStat
          label="ROI"
          value={`${formatNumber(report.roi)}%`}
          accent={BRAND}
          isDark={isDark}
        />
        <BigStat
          label="Veículos Vendidos"
          value={formatNumber(report.veiculos)}
          isDark={isDark}
        />
        <BigStat
          label="Ticket Médio"
          value={formatCurrency(report.ticketMedio)}
          isDark={isDark}
        />
      </div>
      <div
        className={clsx(
          "mt-6 rounded-2xl border px-5 py-4 text-center",
          isDark
            ? "border-[#FF0636]/30 bg-[#FF0636]/10"
            : "border-[#FF0636]/20 bg-[#FF0636]/5",
        )}
      >
        <p
          className={clsx(
            "text-sm md:text-base",
            isDark ? "text-zinc-200" : "text-zinc-700",
          )}
        >
          Cada <strong>R$ 1</strong> investido retornou{" "}
          <strong style={{ color: BRAND }}>
            {formatCurrency(report.retornoPorReal, 2)}
          </strong>{" "}
          em faturamento.
        </p>
      </div>
      <div
        className={clsx(
          "mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px]",
          isDark ? "text-zinc-500" : "text-zinc-400",
        )}
      >
        <span>
          Investimento em tráfego pago:{" "}
          <strong className={isDark ? "text-zinc-300" : "text-zinc-600"}>
            {formatCurrency(report.paidTraffic)}
          </strong>
          {report.investimento > 0 &&
            ` (${formatNumber((report.paidTraffic / report.investimento) * 100)}% do total)`}
        </span>
        <span>
          Lucro estimado com margens por segmento — 0km 5% · Seminovo 12% ·
          Venda Direta 3% · PcD 5%.
        </span>
      </div>
      <div
        className={clsx(
          "mt-3 flex flex-wrap gap-2 text-[10px] font-semibold uppercase tracking-wide",
          isDark ? "text-zinc-400" : "text-zinc-500",
        )}
      >
        <span className="rounded bg-emerald-500/10 px-2 py-1 text-emerald-500">
          Real: funil, vendas e receita
        </span>
        <span className="rounded bg-violet-500/10 px-2 py-1 text-violet-500">
          Atribuído: Meta e Rubinho
        </span>
        <span className="rounded bg-amber-500/10 px-2 py-1 text-amber-500">
          Estimado: lucro e score
        </span>
      </div>
    </div>
  );
}

function tableClasses(isDark: boolean) {
  return {
    wrap: "overflow-x-auto",
    table: "min-w-full text-sm",
    thead: clsx(
      "text-left text-[11px] font-bold uppercase tracking-[0.1em]",
      isDark ? "text-zinc-500" : "text-zinc-400",
    ),
    th: "px-3 py-2.5 whitespace-nowrap",
    row: clsx(
      "border-t",
      isDark
        ? "border-zinc-800 text-zinc-200"
        : "border-zinc-100 text-zinc-800",
    ),
    td: "px-3 py-3 whitespace-nowrap",
    totalRow: clsx(
      "border-t-2 font-black",
      isDark ? "border-zinc-700 text-zinc-50" : "border-zinc-200 text-zinc-950",
    ),
  };
}

function CampaignsMediaTable({
  report,
  isDark,
}: {
  report: ReportModel;
  isDark: boolean;
}) {
  const [campaignsOpen, setCampaignsOpen] = useState(false);
  const t = tableClasses(isDark);
  const rows = report.campaignRows.filter(
    (campaign) =>
      campaign.name !== "Campanha sem nome" ||
      campaign.investimento > 0 ||
      campaign.leads > 0 ||
      campaign.impressoes > 0 ||
      campaign.alcance > 0,
  );
  if (rows.length === 0) {
    return (
      <EmptyNote
        isDark={isDark}
        text="Nenhuma campanha do Meta Ads sincronizada para este cliente."
      />
    );
  }
  const cards = [
    {
      label: "Investimento",
      value: formatCurrency(report.metaSpend),
      icon: Banknote,
      color: "#10b981",
    },
    {
      label: "Leads",
      value: formatNumber(report.leadsMidia),
      icon: Users,
      color: "#3b82f6",
    },
    {
      label: "CPL",
      value: formatCurrency(report.cplMedio, 2),
      icon: Target,
      color: "#8b5cf6",
    },
    {
      label: "Impressões",
      value: formatNumber(report.impressoes),
      icon: Eye,
      color: "#f59e0b",
    },
    {
      label: "Alcance",
      value: formatNumber(report.alcance),
      icon: Radio,
      color: BRAND,
    },
  ];

  return (
    <div className="space-y-5">
      {report.attributionPeriod && (
        <div
          className={clsx(
            "rounded-xl border px-4 py-3 text-xs",
            isDark
              ? "border-zinc-800 bg-zinc-900/60 text-zinc-400"
              : "border-zinc-200 bg-zinc-50 text-zinc-500",
          )}
        >
          Janela considerada:{" "}
          {new Date(report.attributionPeriod.from).toLocaleDateString("pt-BR")}{" "}
          até{" "}
          {new Date(report.attributionPeriod.to).toLocaleDateString("pt-BR")} ·{" "}
          {report.attributionPeriod.source === "event_launch_date"
            ? "início definido pela data de lançamento do evento"
            : "janela padrão de 30 dias antes do evento"}
          {report.attributionPeriod.campaigns_started_before_window > 0 && (
            <span className="ml-1 text-amber-500">
              · {report.attributionPeriod.campaigns_started_before_window}{" "}
              campanha(s) começaram antes da janela
            </span>
          )}
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <div
              key={card.label}
              className={clsx(
                "rounded-2xl border p-4",
                isDark
                  ? "border-zinc-800 bg-zinc-900/70"
                  : "border-zinc-200 bg-zinc-50/80",
              )}
            >
              <div className="flex items-center justify-between gap-3">
                <span
                  className={clsx(
                    "text-[11px] font-bold uppercase tracking-[0.12em]",
                    isDark ? "text-zinc-500" : "text-zinc-400",
                  )}
                >
                  {card.label}
                </span>
                <span
                  className="grid h-9 w-9 place-items-center rounded-xl"
                  style={{
                    backgroundColor: `${card.color}18`,
                    color: card.color,
                  }}
                >
                  <Icon size={18} />
                </span>
              </div>
              <strong
                className={clsx(
                  "mt-5 block text-2xl font-black",
                  isDark ? "text-white" : "text-zinc-950",
                )}
              >
                {card.value}
              </strong>
            </div>
          );
        })}
      </div>
      <div className="flex items-center justify-between gap-4">
        <p
          className={clsx(
            "text-xs",
            isDark ? "text-zinc-500" : "text-zinc-400",
          )}
        >
          {formatNumber(rows.length)} campanha(s) vinculada(s) ao evento
        </p>
        <button
          type="button"
          onClick={() => setCampaignsOpen(true)}
          className="inline-flex items-center gap-2 rounded-full bg-[#FF0636] px-5 py-2.5 text-xs font-bold text-white shadow-lg shadow-[#FF0636]/20 transition-[transform,background-color] duration-200 hover:-translate-y-0.5 hover:bg-[#d90530]"
        >
          <Eye size={15} /> Ver campanhas
        </button>
      </div>
      {(report.dataQuality?.warnings.length ?? 0) > 0 && (
        <ul
          className={clsx(
            "space-y-1 text-[11px]",
            isDark ? "text-amber-300/80" : "text-amber-700",
          )}
        >
          {report.dataQuality?.warnings.map((warning) => (
            <li key={warning}>• {warning}</li>
          ))}
        </ul>
      )}
      <Modal
        open={campaignsOpen}
        onClose={() => setCampaignsOpen(false)}
        title={`Campanhas vinculadas (${formatNumber(rows.length)})`}
        size="3xl"
      >
        <div className={clsx("space-y-4", isDark && "text-zinc-100")}>
          <p
            className={clsx(
              "text-xs",
              isDark ? "text-zinc-400" : "text-zinc-500",
            )}
          >
            Dados restritos às campanhas vinculadas ao evento e à janela de
            atribuição selecionada.
          </p>
          <div className={t.wrap}>
            <table className={t.table}>
              <thead>
                <tr className={t.thead}>
                  <th className={t.th}>Campanha</th>
                  <th className={t.th}>Investimento</th>
                  <th className={t.th}>Leads</th>
                  <th className={t.th}>CPL</th>
                  <th className={t.th}>Conversas</th>
                  <th className={t.th}>Custo/Conversa</th>
                  <th className={t.th}>Impressões</th>
                  <th className={t.th}>Alcance</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => (
                  <tr key={c.id} className={t.row}>
                    <td className={clsx(t.td, "font-semibold")}>{c.name}</td>
                    <td className={t.td}>{formatCurrency(c.investimento)}</td>
                    <td className={t.td}>{formatNumber(c.leads)}</td>
                    <td className={t.td}>{formatCurrency(c.cpl, 2)}</td>
                    <td className={t.td}>{formatNumber(c.conversas)}</td>
                    <td className={t.td}>
                      {formatCurrency(c.custoConversa, 2)}
                    </td>
                    <td className={t.td}>{formatNumber(c.impressoes)}</td>
                    <td className={t.td}>{formatNumber(c.alcance)}</td>
                  </tr>
                ))}
                <tr className={t.totalRow}>
                  <td className={t.td}>TOTAL</td>
                  <td className={t.td}>{formatCurrency(report.metaSpend)}</td>
                  <td className={t.td}>{formatNumber(report.leadsMidia)}</td>
                  <td className={t.td}>{formatCurrency(report.cplMedio, 2)}</td>
                  <td className={t.td}>{formatNumber(report.conversas)}</td>
                  <td className={t.td}>—</td>
                  <td className={t.td}>{formatNumber(report.impressoes)}</td>
                  <td className={t.td}>{formatNumber(report.alcance)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function CampaignsToCrm({
  report,
  isDark,
}: {
  report: ReportModel;
  isDark: boolean;
}) {
  const t = tableClasses(isDark);
  const [level, setLevel] = useState<"campaigns" | "ad_sets" | "ads">(
    "campaigns",
  );
  const [showAllRows, setShowAllRows] = useState(false);
  const levelOptions = [
    { key: "campaigns" as const, label: "Campanhas" },
    { key: "ad_sets" as const, label: "Conjuntos" },
    { key: "ads" as const, label: "Anúncios" },
  ];
  const attributedRows = report.attributionByLevel[level];
  const campaignFallback: ExecutiveAttributionRow[] = report.campaignRows.map(
    (row) => ({
      level: "campaign",
      entity_id: row.id,
      name: row.name,
      meta_campaign_id: row.id,
      meta_ad_set_id: null,
      leads: row.leads,
      scheduled: row.agendados,
      checked_in: row.compareceram,
      sold: row.vendas,
      revenue: row.receita,
      spend: row.investimento,
      meta_leads: row.leads,
      impressions: row.impressoes,
      reach: row.alcance,
      conversations: row.conversas,
      cpl: row.cpl,
      cost_per_conversation: row.custoConversa,
      cost_per_scheduled:
        row.agendados > 0 ? row.investimento / row.agendados : 0,
      cost_per_sale: row.vendas > 0 ? row.investimento / row.vendas : 0,
      roas: row.roas,
      roi_percent: row.roiPercent,
    }),
  );
  const rows =
    attributedRows.length > 0
      ? attributedRows
      : level === "campaigns"
        ? campaignFallback
        : [];
  const rankedRows = [...rows].sort((a, b) => {
    const resultDifference =
      (b.sold ?? 0) - (a.sold ?? 0) ||
      (b.revenue ?? 0) - (a.revenue ?? 0) ||
      (b.scheduled ?? 0) - (a.scheduled ?? 0) ||
      (b.leads ?? 0) - (a.leads ?? 0) ||
      (b.spend ?? 0) - (a.spend ?? 0);

    return resultDifference || a.name.localeCompare(b.name, "pt-BR");
  });
  const visibleRows = showAllRows ? rankedRows : rankedRows.slice(0, 4);
  if (report.campaignRows.length === 0 && rows.length === 0) {
    return (
      <EmptyNote isDark={isDark} text="Sem campanhas para cruzar com o CRM." />
    );
  }
  return (
    <div className="space-y-3">
      <p
        className={clsx("text-xs", isDark ? "text-zinc-500" : "text-zinc-400")}
      >
        {report.attrReal ? (
          <>
            Atribuição real: cada lead é rastreado da campanha do Meta até a
            venda.
            {report.coverage && (
              <>
                {" "}
                {formatNumber(report.coverage.attributed_sold)} de{" "}
                {formatNumber(report.coverage.total_sold)} vendas do evento têm
                campanha de origem identificada.
              </>
            )}
          </>
        ) : (
          <>Atribuição indisponível para este evento.</>
        )}
      </p>
      <div className="flex flex-wrap gap-2">
        {levelOptions.map((option) => (
          <button
            key={option.key}
            type="button"
            onClick={() => {
              setLevel(option.key);
              setShowAllRows(false);
            }}
            className={clsx(
              "rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors",
              level === option.key
                ? "border-[#FF0636] bg-[#FF0636] text-white"
                : isDark
                  ? "border-zinc-700 bg-zinc-900 text-zinc-300 hover:border-zinc-500"
                  : "border-zinc-200 bg-white text-zinc-600 hover:border-zinc-400",
            )}
          >
            {option.label}
            <span className="ml-1.5 opacity-70">
              {formatNumber(
                option.key === "campaigns" &&
                  report.attributionByLevel.campaigns.length === 0
                  ? campaignFallback.length
                  : report.attributionByLevel[option.key].length,
              )}
            </span>
          </button>
        ))}
      </div>
      {rows.length === 0 ? (
        <EmptyNote
          isDark={isDark}
          text={`Nenhum ${level === "ad_sets" ? "conjunto" : "anúncio"} atribuído neste evento.`}
        />
      ) : (
        <div className={t.wrap}>
          <table className={t.table}>
            <thead>
              <tr className={t.thead}>
                <th className={t.th}>
                  {level === "campaigns"
                    ? "Campanha"
                    : level === "ad_sets"
                      ? "Conjunto"
                      : "Anúncio"}
                </th>
                <th className={t.th}>Investimento</th>
                <th className={t.th}>Leads</th>
                <th className={t.th}>CPL</th>
                <th className={t.th}>Agendados</th>
                <th className={t.th}>Custo/agend.</th>
                <th className={t.th}>Compareceram</th>
                <th className={t.th}>Vendas</th>
                <th className={t.th}>Custo/venda</th>
                <th className={t.th}>Receita</th>
                <th className={t.th}>ROAS</th>
                <th className={t.th}>ROI</th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((row) => (
                <tr key={row.entity_id} className={t.row}>
                  <td className={clsx(t.td, "min-w-56 font-semibold")}>
                    <div>{row.name}</div>
                    <div className="mt-0.5 font-mono text-[10px] font-normal opacity-50">
                      ID {row.entity_id}
                    </div>
                  </td>
                  <td className={t.td}>{formatCurrency(row.spend)}</td>
                  <td className={t.td}>{formatNumber(row.leads)}</td>
                  <td className={t.td}>{formatCurrency(row.cpl, 2)}</td>
                  <td className={t.td}>{formatNumber(row.scheduled)}</td>
                  <td className={t.td}>
                    {formatCurrency(row.cost_per_scheduled, 2)}
                  </td>
                  <td className={t.td}>{formatNumber(row.checked_in)}</td>
                  <td
                    className={clsx(t.td, "font-bold")}
                    style={{ color: BRAND }}
                  >
                    {formatNumber(row.sold)}
                  </td>
                  <td className={t.td}>
                    {formatCurrency(row.cost_per_sale, 2)}
                  </td>
                  <td
                    className={clsx(t.td, "font-bold")}
                    style={{ color: "#10b981" }}
                  >
                    {formatCurrencyCompact(row.revenue)}
                  </td>
                  <td className={t.td}>{row.roas.toFixed(2)}x</td>
                  <td className={t.td}>{row.roi_percent.toFixed(0)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
          {rankedRows.length > 4 && (
            <div
              className={clsx(
                "flex justify-center border-t px-4 py-4",
                isDark
                  ? "border-zinc-800 bg-zinc-950/70"
                  : "border-zinc-100 bg-zinc-50/70",
              )}
            >
              <button
                type="button"
                onClick={() => setShowAllRows((current) => !current)}
                className={clsx(
                  "inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-xs font-bold transition-all duration-200",
                  isDark
                    ? "border-zinc-700 bg-zinc-900 text-zinc-200 hover:border-[#FF0636] hover:text-white"
                    : "border-zinc-200 bg-white text-zinc-700 shadow-sm hover:border-[#FF0636] hover:text-[#FF0636]",
                )}
              >
                {showAllRows ? (
                  <>
                    Mostrar somente as 4 melhores
                    <ChevronUp size={15} />
                  </>
                ) : (
                  <>
                    Ver todas ({formatNumber(rankedRows.length)})
                    <ChevronDown size={15} />
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ExecutiveVersusCard({
  title,
  metricLabel,
  rubinhoValue,
  sellerValue,
  isDark,
}: {
  title: string;
  metricLabel: string;
  rubinhoValue: number;
  sellerValue: number;
  isDark: boolean;
}) {
  const total = rubinhoValue + sellerValue;
  const rubinhoPercent = total ? (rubinhoValue / total) * 100 : 50;
  const sellerPercent = total ? 100 - rubinhoPercent : 50;

  return (
    <div
      className={clsx(
        "relative overflow-hidden rounded-[28px] border p-6 transition-[background-color,border-color,box-shadow] duration-300",
        isDark
          ? "border-zinc-800 bg-[radial-gradient(circle_at_50%_0%,#3a111a_0%,#18181b_48%,#09090b_100%)] text-white shadow-[0_18px_55px_rgba(0,0,0,0.38)]"
          : "border-zinc-200 bg-[radial-gradient(circle_at_50%_0%,#fff1f3_0%,#ffffff_48%,#fafafa_100%)] text-zinc-950 shadow-[0_18px_55px_rgba(24,24,27,0.12)]",
      )}
    >
      <div className="absolute inset-x-0 top-0 flex h-1">
        <span className="w-1/2 bg-[#FF0636]" />
        <span
          className={clsx("w-1/2", isDark ? "bg-zinc-500" : "bg-zinc-800")}
        />
      </div>
      <div className="mb-5 flex items-center justify-between">
        <div>
          <p
            className={clsx(
              "text-[10px] font-black uppercase tracking-[0.22em]",
              isDark ? "text-zinc-400" : "text-zinc-500",
            )}
          >
            Rubinho vs vendedores
          </p>
          <h3 className="mt-1 text-lg font-black">{title}</h3>
        </div>
        <Swords size={20} className="text-[#FF0636]" />
      </div>

      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 text-center">
        <div className="flex flex-col items-center">
          <div
            className={clsx(
              "flex h-20 w-20 items-center justify-center rounded-3xl border-2 border-[#FF0636] shadow-[0_0_28px_rgba(255,6,54,0.2)]",
              isDark ? "bg-[#FF0636]/15" : "bg-red-50",
            )}
          >
            <Bot size={42} className="text-[#FF0636]" />
          </div>
          <strong className="mt-3 text-sm font-black uppercase tracking-wide">
            Rubinho
          </strong>
          <span className="mt-1 text-5xl font-black tabular-nums text-[#FF0636]">
            {formatNumber(rubinhoValue)}
          </span>
          <span
            className={clsx(
              "mt-1 text-[10px] font-bold uppercase tracking-[0.18em]",
              isDark ? "text-zinc-400" : "text-zinc-500",
            )}
          >
            {metricLabel}
          </span>
        </div>

        <div className="flex flex-col items-center">
          <div className="flex h-16 w-16 -rotate-6 items-center justify-center rounded-2xl border border-red-200/70 bg-gradient-to-br from-[#FF3158] to-[#C70029] text-2xl font-black italic text-white shadow-[0_0_30px_rgba(255,6,54,0.24)]">
            VS
          </div>
          <span
            className={clsx(
              "mt-3 text-[9px] font-bold uppercase tracking-[0.18em]",
              isDark ? "text-zinc-500" : "text-zinc-400",
            )}
          >
            Head to head
          </span>
        </div>

        <div className="flex flex-col items-center">
          <div
            className={clsx(
              "flex h-20 w-20 items-center justify-center rounded-3xl border-2 shadow-[0_0_28px_rgba(63,63,70,0.18)]",
              isDark
                ? "border-zinc-500 bg-zinc-700/30"
                : "border-zinc-800 bg-zinc-100",
            )}
          >
            <UserRound
              size={42}
              className={isDark ? "text-zinc-300" : "text-zinc-800"}
            />
          </div>
          <strong className="mt-3 text-sm font-black uppercase tracking-wide">
            Vendedores
          </strong>
          <span
            className={clsx(
              "mt-1 text-5xl font-black tabular-nums",
              isDark ? "text-zinc-200" : "text-zinc-800",
            )}
          >
            {formatNumber(sellerValue)}
          </span>
          <span
            className={clsx(
              "mt-1 text-[10px] font-bold uppercase tracking-[0.18em]",
              isDark ? "text-zinc-400" : "text-zinc-500",
            )}
          >
            {metricLabel}
          </span>
        </div>
      </div>

      <div className="mt-6">
        <div
          className={clsx(
            "mb-2 flex justify-between text-[11px] font-bold",
            isDark ? "text-zinc-300" : "text-zinc-600",
          )}
        >
          <span>{Math.round(rubinhoPercent)}%</span>
          <span>{Math.round(sellerPercent)}%</span>
        </div>
        <div
          className={clsx(
            "flex h-3 overflow-hidden rounded-full ring-1",
            isDark ? "bg-zinc-800 ring-white/10" : "bg-zinc-200 ring-black/5",
          )}
        >
          <div
            className="bg-gradient-to-r from-[#C70029] to-[#FF3158]"
            style={{ width: `${rubinhoPercent}%` }}
          />
          <div
            className={clsx(
              "bg-gradient-to-r",
              isDark
                ? "from-zinc-500 to-zinc-300"
                : "from-zinc-500 to-zinc-900",
            )}
            style={{ width: `${sellerPercent}%` }}
          />
        </div>
      </div>
    </div>
  );
}

function RubinhoPerformance({
  report,
  isDark,
}: {
  report: ReportModel;
  isDark: boolean;
}) {
  const r = report.rubinho;
  if (!r) {
    return (
      <EmptyNote
        isDark={isDark}
        text="Analytics do Rubinho indisponível para este evento."
      />
    );
  }
  const journey = r.attribution_breakdown;
  const ownership = r.appointment_ownership;
  const ownershipCards = ownership
    ? [
        {
          key: "rubinho",
          label: "Agendado pelo Rubinho",
          description: "Criado diretamente pelo agente de IA.",
          color: "#8b5cf6",
          value: ownership.rubinho,
        },
        {
          key: "seller",
          label: "Agendado pelo vendedor",
          description: "Criado pelo vendedor responsável pelo atendimento.",
          color: "#3b82f6",
          value: ownership.seller,
        },
        {
          key: "human_manual",
          label: "Gestor ou operação manual",
          description: "Criado por outro usuário ou processo manual.",
          color: "#71717a",
          value: ownership.human_manual,
        },
      ]
    : [];
  return (
    <div>
      <div className="mb-4 flex items-center gap-2">
        <Bot size={18} style={{ color: "#8b5cf6" }} />
        <span
          className={clsx(
            "text-sm font-black",
            isDark ? "text-zinc-200" : "text-zinc-700",
          )}
        >
          Rubinho IA
        </span>
      </div>
      <div className="grid grid-cols-2 gap-x-8 gap-y-4 md:grid-cols-4">
        <BigStat
          label="Mensagens"
          value={formatNumber(r.mensagens)}
          isDark={isDark}
        />
        <BigStat
          label="Conversas Iniciadas"
          value={formatNumber(r.conversas_iniciadas)}
          isDark={isDark}
        />
        <BigStat
          label="Credenciamentos"
          value={formatNumber(r.credenciamentos)}
          isDark={isDark}
        />
        <BigStat
          label="Agendamentos do Rubinho"
          value={formatNumber(r.agendamentos)}
          isDark={isDark}
        />
        <BigStat
          label="Comparecimentos"
          value={formatNumber(r.comparecimentos)}
          isDark={isDark}
        />
        <BigStat
          label="Taxa de Comparecimento"
          value={`${formatNumber(r.taxa_comparecimento)}%`}
          accent="#8b5cf6"
          isDark={isDark}
        />
        <BigStat
          label="Vendas Originadas"
          value={formatNumber(r.vendas_originadas)}
          isDark={isDark}
        />
        <BigStat
          label="Receita em Jornadas da IA"
          value={formatCurrencyCompact(r.receita_influenciada)}
          accent="#10b981"
          isDark={isDark}
        />
      </div>
      {ownership && (
        <div className="mt-7 grid gap-5 xl:grid-cols-2">
          <ExecutiveVersusCard
            title="Disputa de agendamentos"
            metricLabel="Agendamentos"
            rubinhoValue={ownership.rubinho.appointments}
            sellerValue={ownership.seller.appointments}
            isDark={isDark}
          />
          <ExecutiveVersusCard
            title="Disputa de vendas"
            metricLabel="Vendas"
            rubinhoValue={ownership.rubinho.sales}
            sellerValue={ownership.seller.sales}
            isDark={isDark}
          />
        </div>
      )}
      {ownershipCards.length > 0 && (
        <div className="mt-6 grid gap-3 md:grid-cols-3">
          {ownershipCards.map((item) => (
            <div
              key={item.key}
              className={clsx(
                "rounded-2xl border p-4",
                isDark
                  ? "border-zinc-800 bg-zinc-900/60"
                  : "border-zinc-200 bg-zinc-50/80",
              )}
            >
              <div className="mb-3 flex items-center gap-2">
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: item.color }}
                />
                <span
                  className={clsx(
                    "text-xs font-bold",
                    isDark ? "text-zinc-200" : "text-zinc-700",
                  )}
                >
                  {item.label}
                </span>
              </div>
              <p
                className={clsx(
                  "mb-4 min-h-8 text-[11px] leading-4",
                  isDark ? "text-zinc-500" : "text-zinc-400",
                )}
              >
                {item.description}
              </p>
              <div className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
                <span className={isDark ? "text-zinc-500" : "text-zinc-500"}>
                  Agendamentos
                </span>
                <strong className="text-right">
                  {item.value.appointments}
                </strong>
                <span className={isDark ? "text-zinc-500" : "text-zinc-500"}>
                  Comparecimentos
                </span>
                <strong className="text-right">{item.value.checked_in}</strong>
                <span className={isDark ? "text-zinc-500" : "text-zinc-500"}>
                  Vendas
                </span>
                <strong className="text-right">{item.value.sales}</strong>
                <span className={isDark ? "text-zinc-500" : "text-zinc-500"}>
                  Receita
                </span>
                <strong className="text-right" style={{ color: "#10b981" }}>
                  {formatCurrencyCompact(item.value.revenue)}
                </strong>
              </div>
            </div>
          ))}
        </div>
      )}
      <p
        className={clsx(
          "mt-4 text-xs",
          isDark ? "text-zinc-500" : "text-zinc-400",
        )}
      >
        O crédito do agendamento pertence exclusivamente a quem o criou.
        Interações anteriores do Rubinho não transferem para a IA um agendamento
        feito pelo vendedor.
        {journey && (
          <>
            {" "}
            Sinais secundários: {journey.recovered.appointments} recuperados por
            automação e {journey.influenced.appointments} agendamentos humanos
            com interação anterior do Rubinho.
          </>
        )}
      </p>
    </div>
  );
}

function GrandFunnel({
  report,
  isDark,
}: {
  report: ReportModel;
  isDark: boolean;
}) {
  const f = report.funnel;
  const stages = [
    { label: "Leads", value: f.leads, color: "#3b82f6" },
    { label: "Agendados", value: f.scheduled, color: "#8b5cf6" },
    { label: "Confirmados", value: f.confirmed, color: "#a855f7" },
    { label: "Compareceram", value: f.checked_in, color: "#f59e0b" },
    { label: "Vendas", value: f.sold, color: BRAND },
  ];
  const max = Math.max(...stages.map((s) => s.value), 1);
  return (
    <div className="space-y-3">
      {stages.map((s, i) => {
        const width = Math.max((s.value / max) * 100, s.value > 0 ? 4 : 0);
        const conv = i === 0 ? null : pct(s.value, stages[i - 1].value);
        return (
          <div
            key={s.label}
            className="grid grid-cols-[130px_minmax(0,1fr)_120px] items-center gap-3"
          >
            <span
              className={clsx(
                "text-right text-sm font-semibold",
                isDark ? "text-zinc-300" : "text-zinc-600",
              )}
            >
              {s.label}
            </span>
            <div
              className={clsx(
                "relative h-9 overflow-hidden rounded-lg",
                isDark ? "bg-zinc-800/50" : "bg-zinc-100",
              )}
            >
              <div
                className="flex h-full items-center rounded-lg px-3 text-sm font-black text-white transition-all"
                style={{ width: `${width}%`, background: s.color }}
              >
                {formatNumber(s.value)}
              </div>
            </div>
            <span
              className={clsx(
                "text-xs",
                isDark ? "text-zinc-500" : "text-zinc-400",
              )}
            >
              {conv === null
                ? "topo do funil"
                : `${conv.toFixed(1)}% do anterior`}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function EventStats({
  report,
  isDark,
}: {
  report: ReportModel;
  isDark: boolean;
}) {
  const f = report.funnel;
  const noShow = f.no_show ?? 0;
  const seminovos =
    report.bySegment.find((s) => s.type === "SEMINOVO")?.count ?? 0;
  return (
    <div className="grid grid-cols-2 gap-x-8 gap-y-4 md:grid-cols-4">
      <BigStat
        label="Clientes Esperados"
        value={formatNumber(f.scheduled)}
        isDark={isDark}
      />
      <BigStat
        label="Check-in"
        value={formatNumber(f.checked_in)}
        accent="#10b981"
        isDark={isDark}
      />
      <BigStat
        label="No-show"
        value={formatNumber(noShow)}
        accent={BRAND}
        isDark={isDark}
      />
      <BigStat
        label="Confirmados"
        value={formatNumber(f.confirmed)}
        isDark={isDark}
      />
      <BigStat
        label="Veículos Vendidos"
        value={formatNumber(f.sold)}
        isDark={isDark}
      />
      <BigStat
        label="Vendas de Seminovos"
        value={formatNumber(seminovos)}
        isDark={isDark}
      />
      <BigStat
        label="Faturamento"
        value={formatCurrencyCompact(report.faturamento)}
        accent="#10b981"
        isDark={isDark}
      />
      <BigStat
        label="Ticket Médio"
        value={formatCurrency(report.ticketMedio)}
        isDark={isDark}
      />
    </div>
  );
}

function SalesRanking({
  report,
  isDark,
}: {
  report: ReportModel;
  isDark: boolean;
}) {
  const t = tableClasses(isDark);
  if (report.vendors.length === 0) {
    return (
      <EmptyNote
        isDark={isDark}
        text="Sem vendas registradas para ranquear vendedores."
      />
    );
  }
  const medal = ["🥇", "🥈", "🥉"];
  return (
    <div className="space-y-6">
      {report.eventFeedback && (
        <div className="grid gap-3 sm:grid-cols-3">
          <div
            className={clsx(
              "rounded-2xl border p-4",
              isDark
                ? "border-zinc-800 bg-zinc-900/60"
                : "border-zinc-200 bg-zinc-50",
            )}
          >
            <p className="text-xs text-zinc-500">Avaliação do evento</p>
            <p className="mt-1 text-xl font-black">
              {report.eventFeedback.event_rating.responses > 0
                ? `${report.eventFeedback.event_rating.average.toFixed(2)} / 5`
                : "—"}
            </p>
            <p className="mt-1 text-[11px] text-zinc-500">
              {formatNumber(report.eventFeedback.event_rating.responses)}{" "}
              respostas
            </p>
          </div>
          <div
            className={clsx(
              "rounded-2xl border p-4",
              isDark
                ? "border-zinc-800 bg-zinc-900/60"
                : "border-zinc-200 bg-zinc-50",
            )}
          >
            <p className="text-xs text-zinc-500">NPS do evento</p>
            <p className="mt-1 text-xl font-black">
              {report.eventFeedback.nps.responses > 0
                ? report.eventFeedback.nps.score.toFixed(0)
                : "—"}
            </p>
            <p className="mt-1 text-[11px] text-zinc-500">
              {formatNumber(report.eventFeedback.nps.responses)} respostas
            </p>
          </div>
          <div
            className={clsx(
              "rounded-2xl border p-4",
              isDark
                ? "border-zinc-800 bg-zinc-900/60"
                : "border-zinc-200 bg-zinc-50",
            )}
          >
            <p className="text-xs text-zinc-500">Jornada Google</p>
            <p className="mt-1 text-sm font-bold">
              {formatNumber(report.eventFeedback.google.requested)} solicitados
              · {formatNumber(report.eventFeedback.google.clicked)} cliques
            </p>
            <p className="mt-1 text-[11px] text-zinc-500">
              {formatNumber(report.eventFeedback.google.verified_published)}{" "}
              publicados verificados
            </p>
          </div>
        </div>
      )}
      {report.ratingsTotal > 0 && (
        <div
          className={clsx(
            "flex flex-wrap items-center gap-x-6 gap-y-1 rounded-2xl border px-5 py-3",
            isDark
              ? "border-amber-500/25 bg-amber-500/10"
              : "border-amber-200 bg-amber-50",
          )}
        >
          <span
            className={clsx(
              "text-xs font-bold uppercase tracking-[0.14em]",
              isDark ? "text-zinc-400" : "text-zinc-500",
            )}
          >
            Satisfação dos clientes
          </span>
          <span className="text-lg font-black" style={{ color: "#f59e0b" }}>
            ★ {report.ratingsOverall.toFixed(2)}
            <span
              className={clsx(
                "ml-1 text-xs font-normal",
                isDark ? "text-zinc-400" : "text-zinc-500",
              )}
            >
              / 5 · {formatNumber(report.ratingsTotal)} avaliações
            </span>
          </span>
        </div>
      )}
      {report.commercialRevenueCoverage &&
        report.commercialRevenueCoverage.team_percent < 100 && (
          <div
            className={clsx(
              "rounded-2xl border px-5 py-3 text-xs",
              isDark
                ? "border-amber-500/25 bg-amber-500/10 text-amber-200"
                : "border-amber-200 bg-amber-50 text-amber-800",
            )}
          >
            Cobertura por equipe:{" "}
            {report.commercialRevenueCoverage.team_percent.toFixed(1)}%.{" "}
            {formatNumber(
              report.commercialRevenueCoverage.unassigned_team_sales,
            )}{" "}
            venda(s), somando{" "}
            {formatCurrencyCompact(
              report.commercialRevenueCoverage.unassigned_team_revenue,
            )}
            , ainda estão sem equipe registrada na própria venda.
          </div>
        )}
      <div className={t.wrap}>
        <table className={t.table}>
          <thead>
            <tr className={t.thead}>
              <th className={t.th}>#</th>
              <th className={t.th}>Vendedor</th>
              <th className={t.th}>Atendimentos</th>
              <th className={t.th}>Vendas</th>
              <th className={t.th}>Receita</th>
              <th className={t.th}>Ticket médio</th>
              <th className={t.th}>Avaliação</th>
            </tr>
          </thead>
          <tbody>
            {report.vendors.slice(0, 12).map((v, i) => (
              <tr key={v.id} className={t.row}>
                <td className={t.td}>{medal[i] ?? i + 1}</td>
                <td className={clsx(t.td, "font-semibold")}>
                  {v.name}
                  {v.team && (
                    <span
                      className={clsx(
                        "ml-2 text-xs font-normal",
                        isDark ? "text-zinc-500" : "text-zinc-400",
                      )}
                    >
                      · {v.team}
                    </span>
                  )}
                </td>
                <td className={t.td}>{formatNumber(v.atendimentos)}</td>
                <td
                  className={clsx(t.td, "font-bold")}
                  style={{ color: BRAND }}
                >
                  {formatNumber(v.vendas)}
                </td>
                <td
                  className={clsx(t.td, "font-bold")}
                  style={{ color: "#10b981" }}
                >
                  {formatCurrencyCompact(v.receita)}
                </td>
                <td className={t.td}>{formatCurrencyCompact(v.ticketMedio)}</td>
                <td className={t.td}>
                  {v.avaliacaoCount > 0 ? (
                    <span className="font-semibold">
                      <span style={{ color: "#f59e0b" }}>★</span>{" "}
                      {v.avaliacao.toFixed(1)}
                      <span
                        className={clsx(
                          "ml-1 text-xs font-normal",
                          isDark ? "text-zinc-500" : "text-zinc-400",
                        )}
                      >
                        ({formatNumber(v.avaliacaoCount)})
                      </span>
                    </span>
                  ) : (
                    <span
                      className={isDark ? "text-zinc-600" : "text-zinc-300"}
                    >
                      —
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {report.teams.length > 0 && (
        <div>
          <h3
            className={clsx(
              "mb-2 text-sm font-bold",
              isDark ? "text-zinc-300" : "text-zinc-600",
            )}
          >
            Ranking por Equipe
          </h3>
          <div className={t.wrap}>
            <table className={t.table}>
              <thead>
                <tr className={t.thead}>
                  <th className={t.th}>#</th>
                  <th className={t.th}>Equipe</th>
                  <th className={t.th}>Vendas</th>
                  <th className={t.th}>Pontos</th>
                  <th className={t.th}>Receita</th>
                  <th className={t.th}>Ticket médio</th>
                </tr>
              </thead>
              <tbody>
                {report.teams.map((tm, i) => (
                  <tr key={tm.id} className={t.row}>
                    <td className={t.td}>{medal[i] ?? i + 1}</td>
                    <td className={clsx(t.td, "font-semibold")}>{tm.name}</td>
                    <td className={t.td}>{formatNumber(tm.vendas)}</td>
                    <td className={t.td}>{formatNumber(tm.pontos)}</td>
                    <td
                      className={clsx(t.td, "font-bold")}
                      style={{ color: "#10b981" }}
                    >
                      {formatCurrencyCompact(tm.receita)}
                    </td>
                    <td className={t.td}>
                      {formatCurrencyCompact(tm.ticketMedio)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function BarList({
  data,
  color,
  isDark,
  format = formatNumber,
}: {
  data: Array<{ label: string; value: number }>;
  color: string;
  isDark: boolean;
  format?: (n: number) => string;
}) {
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <div className="space-y-2">
      {data.map((d) => (
        <div
          key={d.label}
          className="grid grid-cols-[120px_minmax(0,1fr)_60px] items-center gap-2"
        >
          <span
            className={clsx(
              "truncate text-right text-xs font-medium",
              isDark ? "text-zinc-400" : "text-zinc-500",
            )}
          >
            {d.label}
          </span>
          <div
            className={clsx(
              "h-6 overflow-hidden rounded-md",
              isDark ? "bg-zinc-800/50" : "bg-zinc-100",
            )}
          >
            <div
              className="h-full rounded-md transition-all"
              style={{
                width: `${Math.max((d.value / max) * 100, d.value > 0 ? 5 : 0)}%`,
                background: color,
              }}
            />
          </div>
          <span
            className={clsx(
              "text-xs font-bold",
              isDark ? "text-zinc-300" : "text-zinc-700",
            )}
          >
            {format(d.value)}
          </span>
        </div>
      ))}
    </div>
  );
}

function CommercialIntelligence({
  report,
  isDark,
}: {
  report: ReportModel;
  isDark: boolean;
}) {
  const heading = clsx(
    "mb-3 text-sm font-bold",
    isDark ? "text-zinc-300" : "text-zinc-600",
  );
  return (
    <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
      <div>
        <h3 className={heading}>Qual dia vendeu mais?</h3>
        {report.salesByWeekday.length ? (
          <BarList
            data={report.salesByWeekday.map((d) => ({
              label: d.label,
              value: d.sold,
            }))}
            color={BRAND}
            isDark={isDark}
          />
        ) : (
          <EmptyNote
            isDark={isDark}
            text="Sem vendas distribuídas por dia ainda."
          />
        )}
      </div>
      <div>
        <h3 className={clsx(heading, "flex items-center gap-1.5")}>
          <Clock size={14} /> Qual horário trouxe mais clientes?
        </h3>
        {report.arrivalsByHour.length ? (
          <>
            <BarList
              data={report.arrivalsByHour.map((h) => ({
                label: h.label,
                value: h.value,
              }))}
              color="#f59e0b"
              isDark={isDark}
            />
            {report.arrivalDataQuality && (
              <p
                className={clsx(
                  "mt-3 text-[11px]",
                  isDark ? "text-zinc-500" : "text-zinc-400",
                )}
              >
                Cobertura de horários reais:{" "}
                {report.arrivalDataQuality.coverage_percent.toFixed(1)}% (
                {report.arrivalDataQuality.with_real_timestamp} de{" "}
                {report.arrivalDataQuality.checked_in_leads} check-ins).
              </p>
            )}
          </>
        ) : (
          <EmptyNote
            isDark={isDark}
            text="Sem horários de chegada registrados."
          />
        )}
      </div>
      <div>
        <h3 className={heading}>Qual origem trouxe mais clientes?</h3>
        {report.bySource.length ? (
          <BarList
            data={report.bySource.map((s) => ({
              label: s.label,
              value: s.count,
            }))}
            color="#3b82f6"
            isDark={isDark}
          />
        ) : (
          <EmptyNote
            isDark={isDark}
            text="Sem origem de check-in registrada."
          />
        )}
      </div>
      <div>
        <h3 className={heading}>Quais veículos venderam mais?</h3>
        {report.topModels.length ? (
          <BarList
            data={report.topModels.map((m) => ({
              label: m.model,
              value: m.count,
            }))}
            color="#10b981"
            isDark={isDark}
          />
        ) : (
          <EmptyNote isDark={isDark} text="Sem modelos vendidos registrados." />
        )}
      </div>
      <div>
        <h3 className={heading}>Vendas por segmento</h3>
        {report.bySegment.length ? (
          <BarList
            data={report.bySegment.map((s) => ({
              label: s.label,
              value: s.count,
            }))}
            color="#8b5cf6"
            isDark={isDark}
          />
        ) : (
          <EmptyNote isDark={isDark} text="Sem segmentação de vendas." />
        )}
      </div>
      {report.vehicleIntelligence && (
        <div className="space-y-5 md:col-span-2">
          <div className="border-t border-zinc-200 pt-6 dark:border-zinc-800">
            <h3 className={heading}>Inteligência da frota de troca</h3>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <BigStat
                label="Veículos identificados"
                value={formatNumber(
                  report.vehicleIntelligence.coverage.identified_vehicles,
                )}
                isDark={isDark}
              />
              <BigStat
                label="Potencial FIPE"
                value={formatCurrencyCompact(
                  report.vehicleIntelligence.trade_in_fleet.total_fipe,
                )}
                accent="#10b981"
                isDark={isDark}
              />
              <BigStat
                label="FIPE médio"
                value={formatCurrencyCompact(
                  report.vehicleIntelligence.trade_in_fleet.average_fipe,
                )}
                isDark={isDark}
              />
              <BigStat
                label="Conversão com veículo"
                value={`${report.vehicleIntelligence.conversion.conversion_percent.toFixed(1)}%`}
                accent="#8b5cf6"
                isDark={isDark}
              />
            </div>
          </div>
          <div className="grid gap-8 md:grid-cols-2">
            <div>
              <h3 className={heading}>Modelos usados na troca</h3>
              {report.vehicleIntelligence.trade_in_fleet.by_model.length ? (
                <BarList
                  data={report.vehicleIntelligence.trade_in_fleet.by_model.map(
                    (row) => ({ label: row.name, value: row.count }),
                  )}
                  color="#0ea5e9"
                  isDark={isDark}
                />
              ) : (
                <EmptyNote
                  isDark={isDark}
                  text="Sem modelos de troca identificados."
                />
              )}
            </div>
            <div>
              <h3 className={heading}>Conversão por faixa FIPE</h3>
              <BarList
                data={report.vehicleIntelligence.trade_in_fleet.by_fipe_range.map(
                  (row) => ({
                    label: row.label,
                    value: row.conversion_percent,
                  }),
                )}
                color="#f59e0b"
                format={(value) => `${value.toFixed(1)}%`}
                isDark={isDark}
              />
            </div>
          </div>
          <p
            className={clsx(
              "text-[11px]",
              isDark ? "text-zinc-500" : "text-zinc-400",
            )}
          >
            Cobertura:{" "}
            {report.vehicleIntelligence.coverage.vehicle_percent.toFixed(1)}%
            dos leads possuem veículo identificado e{" "}
            {report.vehicleIntelligence.coverage.fipe_percent.toFixed(1)}%
            desses possuem valor FIPE. Modelo desejado não é inferido a partir
            do veículo de troca.
          </p>
        </div>
      )}
    </div>
  );
}

function HistoricalComparison({
  report,
  currentId,
  isDark,
}: {
  report: ReportModel;
  currentId: string;
  isDark: boolean;
}) {
  const t = tableClasses(isDark);
  const hist = report.history;
  if (hist.length < 2) {
    return (
      <EmptyNote
        isDark={isDark}
        text="É necessário ao menos 2 eventos do cliente para comparar a evolução."
      />
    );
  }
  const fmtMonth = (d: string) =>
    new Date(d).toLocaleDateString("pt-BR", {
      month: "short",
      year: "2-digit",
    });
  const cell = (id: string) =>
    clsx(t.td, id === currentId && "font-black text-[#FF0636]");
  return (
    <div className={t.wrap}>
      <table className={t.table}>
        <thead>
          <tr className={t.thead}>
            <th className={t.th}>Indicador</th>
            {hist.map((e) => (
              <th
                key={e.event_id}
                className={clsx(
                  t.th,
                  e.event_id === currentId && "text-[#FF0636]",
                )}
              >
                {fmtMonth(e.event_date)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr className={t.row}>
            <td className={clsx(t.td, "font-semibold")}>Leads</td>
            {hist.map((e) => (
              <td key={e.event_id} className={cell(e.event_id)}>
                {formatNumber(e.leads)}
              </td>
            ))}
          </tr>
          <tr className={t.row}>
            <td className={clsx(t.td, "font-semibold")}>Confirmados</td>
            {hist.map((e) => (
              <td key={e.event_id} className={cell(e.event_id)}>
                {formatNumber(e.confirmed)}
              </td>
            ))}
          </tr>
          <tr className={t.row}>
            <td className={clsx(t.td, "font-semibold")}>Compareceram</td>
            {hist.map((e) => (
              <td key={e.event_id} className={cell(e.event_id)}>
                {formatNumber(e.checked_in)}
              </td>
            ))}
          </tr>
          <tr className={t.row}>
            <td className={clsx(t.td, "font-semibold")}>Vendas</td>
            {hist.map((e) => (
              <td key={e.event_id} className={cell(e.event_id)}>
                {formatNumber(e.sold)}
              </td>
            ))}
          </tr>
          <tr className={t.row}>
            <td className={clsx(t.td, "font-semibold")}>Receita</td>
            {hist.map((e) => (
              <td key={e.event_id} className={cell(e.event_id)}>
                {formatCurrencyCompact(e.revenue)}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function PerformanceMatrix({
  report,
  isDark,
}: {
  report: ReportModel;
  isDark: boolean;
}) {
  const t = tableClasses(isDark);
  if (report.campaignRows.length === 0) {
    return (
      <EmptyNote isDark={isDark} text="Sem campanhas para montar a matriz." />
    );
  }
  return (
    <div className="space-y-2">
      <p
        className={clsx("text-xs", isDark ? "text-zinc-500" : "text-zinc-400")}
      >
        Cruzamento investimento → venda por campanha, com atribuição real de
        receita.
      </p>
      <div className={t.wrap}>
        <table className={t.table}>
          <thead>
            <tr className={t.thead}>
              <th className={t.th}>Campanha</th>
              <th className={t.th}>Investimento</th>
              <th className={t.th}>Leads</th>
              <th className={t.th}>Agendados</th>
              <th className={t.th}>Compareceram</th>
              <th className={t.th}>Vendas</th>
              <th className={t.th}>Receita</th>
              <th className={t.th}>ROAS</th>
              <th className={t.th}>ROI</th>
            </tr>
          </thead>
          <tbody>
            {report.campaignRows.map((c) => (
              <tr key={c.id} className={t.row}>
                <td className={clsx(t.td, "font-semibold")}>{c.name}</td>
                <td className={t.td}>{formatCurrency(c.investimento)}</td>
                <td className={t.td}>{formatNumber(c.leads)}</td>
                <td className={t.td}>{formatNumber(c.agendados)}</td>
                <td className={t.td}>{formatNumber(c.compareceram)}</td>
                <td
                  className={clsx(t.td, "font-bold")}
                  style={{ color: BRAND }}
                >
                  {formatNumber(c.vendas)}
                </td>
                <td
                  className={clsx(t.td, "font-bold")}
                  style={{ color: "#10b981" }}
                >
                  {formatCurrencyCompact(c.receita)}
                </td>
                <td className={clsx(t.td, "font-black")}>
                  {c.roas.toFixed(2)}x
                </td>
                <td className={clsx(t.td, "font-black")}>
                  {c.roiPercent.toFixed(0)}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function MoneyJourney({
  report,
  isDark,
}: {
  report: ReportModel;
  isDark: boolean;
}) {
  const f = report.funnel;
  const steps = [
    {
      label: "Investidos em mídia",
      value: formatCurrency(report.investimento),
      color: "#64748b",
    },
    { label: "Leads", value: formatNumber(f.leads), color: "#3b82f6" },
    {
      label: "Agendamentos",
      value: formatNumber(f.scheduled),
      color: "#8b5cf6",
    },
    {
      label: "Clientes (check-in)",
      value: formatNumber(f.checked_in),
      color: "#f59e0b",
    },
    { label: "Vendas", value: formatNumber(f.sold), color: BRAND },
    {
      label: "Faturamento",
      value: formatCurrencyCompact(report.faturamento),
      color: "#10b981",
    },
    { label: "ROI", value: `${formatNumber(report.roi)}%`, color: BRAND },
  ];
  return (
    <div>
      <div className="mb-4 flex items-center gap-2">
        <Sparkles size={18} style={{ color: BRAND }} />
        <span
          className={clsx(
            "text-sm font-black uppercase tracking-[0.15em]",
            isDark ? "text-zinc-300" : "text-zinc-600",
          )}
        >
          A Jornada do Dinheiro
        </span>
      </div>
      <div className="flex flex-wrap items-stretch gap-2">
        {steps.map((s, i) => (
          <div key={s.label} className="flex items-center gap-2">
            <div
              className="min-w-[120px] rounded-xl border-l-4 px-4 py-3"
              style={{
                borderColor: s.color,
                background: isDark
                  ? "rgba(255,255,255,0.03)"
                  : "rgba(0,0,0,0.02)",
              }}
            >
              <div
                className={clsx(
                  "text-[10px] font-semibold uppercase tracking-wide",
                  isDark ? "text-zinc-500" : "text-zinc-400",
                )}
              >
                {s.label}
              </div>
              <div className="text-lg font-black" style={{ color: s.color }}>
                {s.value}
              </div>
            </div>
            {i < steps.length - 1 && (
              <span
                className={clsx(
                  "text-lg",
                  isDark ? "text-zinc-700" : "text-zinc-300",
                )}
              >
                →
              </span>
            )}
          </div>
        ))}
      </div>
      <p
        className={clsx(
          "mt-4 text-sm",
          isDark ? "text-zinc-400" : "text-zinc-500",
        )}
      >
        Cada real investido rastreado até o faturamento — o cliente vê
        exatamente para onde foi o dinheiro.
      </p>
    </div>
  );
}

function GrandPrixScore({
  report,
  isDark,
}: {
  report: ReportModel;
  isDark: boolean;
}) {
  const s = report.scores;
  const rows = [
    { label: "Qualidade dos Leads", value: s.leads },
    { label: "Comparecimento", value: s.comparecimento },
    { label: "Conversão Comercial", value: s.conversao },
    { label: "Performance do Rubinho", value: s.rubinho },
    { label: "Performance da Equipe", value: s.equipe },
    { label: "ROI", value: s.roi },
  ];
  const scoreColor = (v: number) =>
    v >= 85 ? "#10b981" : v >= 70 ? "#f59e0b" : BRAND;
  return (
    <div className="grid grid-cols-1 gap-8 md:grid-cols-[1fr_auto]">
      <div className="space-y-3">
        {rows.map((r) => (
          <div
            key={r.label}
            className="grid grid-cols-[170px_minmax(0,1fr)_44px] items-center gap-3"
          >
            <span
              className={clsx(
                "text-right text-sm font-medium",
                isDark ? "text-zinc-300" : "text-zinc-600",
              )}
            >
              {r.label}
            </span>
            <div
              className={clsx(
                "h-6 overflow-hidden rounded-md",
                isDark ? "bg-zinc-800/50" : "bg-zinc-100",
              )}
            >
              <div
                className="h-full rounded-md transition-all"
                style={{
                  width: `${r.value}%`,
                  background: scoreColor(r.value),
                }}
              />
            </div>
            <span
              className="text-sm font-black"
              style={{ color: scoreColor(r.value) }}
            >
              {Math.round(r.value)}
            </span>
          </div>
        ))}
      </div>
      <div
        className={clsx(
          "flex flex-col items-center justify-center rounded-3xl border-2 px-8 py-6",
          isDark
            ? "border-[#FF0636]/40 bg-[#FF0636]/10"
            : "border-[#FF0636]/25 bg-[#FF0636]/5",
        )}
      >
        <span
          className={clsx(
            "text-xs font-bold uppercase tracking-[0.2em]",
            isDark ? "text-zinc-400" : "text-zinc-500",
          )}
        >
          Grand Prix Score
        </span>
        <span className="mt-1 text-5xl font-black" style={{ color: BRAND }}>
          {s.total.toFixed(1)}
        </span>
        <span
          className={clsx(
            "text-sm font-semibold",
            isDark ? "text-zinc-500" : "text-zinc-400",
          )}
        >
          de 100
        </span>
        <TrendingUp
          size={20}
          className="mt-2"
          style={{ color: scoreColor(s.total) }}
        />
      </div>
    </div>
  );
}

function EmptyNote({ text, isDark }: { text: string; isDark: boolean }) {
  return (
    <p
      className={clsx(
        "py-4 text-sm",
        isDark ? "text-zinc-500" : "text-zinc-400",
      )}
    >
      {text}
    </p>
  );
}
