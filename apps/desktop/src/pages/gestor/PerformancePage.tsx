import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Database,
  RefreshCw,
} from "lucide-react";
import { Button } from "../../components/ui/Button";
import { readStoredSession } from "../../services/auth";
import {
  fetchDatabaseConnections,
  fetchPerformanceOverview,
  type ApiPerformanceSummary,
  type DatabaseConnections,
  type WebVitalsSummary,
} from "../../services/performance";

const PERIODS = [
  { label: "24 horas", value: 24 },
  { label: "7 dias", value: 168 },
  { label: "30 dias", value: 720 },
];

function formatMetric(name: string, value: number) {
  return name === "CLS" ? value.toFixed(3) : `${Math.round(value)} ms`;
}

export function PerformancePage() {
  const [hours, setHours] = useState(24);
  const [webVitals, setWebVitals] = useState<WebVitalsSummary | null>(null);
  const [api, setApi] = useState<ApiPerformanceSummary | null>(null);
  const [conns, setConns] = useState<DatabaseConnections | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (signal?: AbortSignal) => {
      const token = readStoredSession()?.accessToken;
      if (!token) {
        setError("Sessão expirada. Entre novamente.");
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);
      try {
        const overview = await fetchPerformanceOverview(token, hours, signal);
        setWebVitals(overview.webVitals);
        setApi(overview.api);
        // Falha aqui nao pode derrubar o resto da pagina.
        void fetchDatabaseConnections(token)
          .then(setConns)
          .catch(() => setConns(null));
      } catch (loadError) {
        if (loadError instanceof Error && loadError.name === "AbortError")
          return;
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Não foi possível carregar as métricas.",
        );
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [hours],
  );

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const alerts = useMemo(
    () =>
      webVitals?.metrics.filter(
        (metric) => metric.status === "needs-attention",
      ) ?? [],
    [webVitals],
  );

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-[#3D56A2]">Observabilidade</p>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-white">
            Performance real
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            Core Web Vitals dos usuários e latência da API em produção.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            aria-label="Período das métricas"
            value={hours}
            onChange={(event) => setHours(Number(event.target.value))}
            className="h-10 rounded-xl border border-zinc-200 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          >
            {PERIODS.map((period) => (
              <option key={period.value} value={period.value}>
                {period.label}
              </option>
            ))}
          </select>
          <Button
            variant="outline"
            onClick={() => void load()}
            disabled={loading}
            icon={
              <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
            }
          >
            Atualizar
          </Button>
        </div>
      </div>

      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      {conns ? (
        <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="flex items-center gap-2 font-semibold text-zinc-800 dark:text-zinc-100">
                <Database size={16} /> Conexões do banco
              </h2>
              <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                O n8n fala direto com o Postgres, fora do pool da API. Se
                estourar o limite, API e integração caem juntas.
              </p>
            </div>
            <div className="text-right">
              <p
                className={`text-2xl font-bold ${
                  conns.status === "critical"
                    ? "text-red-600"
                    : conns.status === "warning"
                      ? "text-amber-600"
                      : "text-emerald-600"
                }`}
              >
                {conns.used}
                <span className="text-base font-medium text-zinc-400">
                  {" "}
                  / {conns.maxConnections}
                </span>
              </p>
              <p className="text-xs text-zinc-500">
                {conns.usedPercent}% em uso
              </p>
            </div>
          </div>

          <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
            <div
              className={`h-full rounded-full transition-all ${
                conns.status === "critical"
                  ? "bg-red-500"
                  : conns.status === "warning"
                    ? "bg-amber-500"
                    : "bg-emerald-500"
              }`}
              style={{ width: `${Math.min(conns.usedPercent, 100)}%` }}
            />
          </div>

          {conns.status !== "good" ? (
            <p
              className={`mt-3 rounded-xl px-3 py-2 text-xs font-medium ${
                conns.status === "critical"
                  ? "bg-red-50 text-red-700"
                  : "bg-amber-50 text-amber-700"
              }`}
            >
              {conns.status === "critical"
                ? "Risco de recusa de conexão. Reduza o pool do n8n ou aumente a instância do Supabase."
                : "Atenção: acima de 75%. Verifique quantas conexões o n8n está abrindo."}
            </p>
          ) : null}

          <div className="mt-4 space-y-1.5">
            {conns.byClient.map((row) => (
              <div
                key={`${row.user}-${row.application}`}
                className="flex items-center justify-between gap-3 text-xs"
              >
                <span className="truncate text-zinc-600 dark:text-zinc-300">
                  <strong className="font-semibold">{row.user}</strong>
                  <span className="text-zinc-400"> · {row.application}</span>
                </span>
                <span className="shrink-0 font-mono font-semibold text-zinc-700 dark:text-zinc-200">
                  {row.connections}
                </span>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {(webVitals?.metrics ?? []).map((metric) => (
          <article
            key={metric.name}
            className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
          >
            <div className="flex items-center justify-between">
              <span className="font-semibold text-zinc-700 dark:text-zinc-200">
                {metric.name}
              </span>
              {metric.status === "good" ? (
                <CheckCircle2 size={18} className="text-emerald-500" />
              ) : (
                <AlertTriangle size={18} className="text-amber-500" />
              )}
            </div>
            <p className="mt-3 text-2xl font-bold text-zinc-950 dark:text-white">
              {formatMetric(metric.name, metric.p75)}
            </p>
            <p className="mt-1 text-xs text-zinc-500">
              p75 · {metric.samples} amostras · meta{" "}
              {formatMetric(metric.name, metric.target)}
            </p>
          </article>
        ))}
        {!loading && webVitals?.metrics.length === 0 ? (
          <div className="col-span-full rounded-2xl border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-500">
            A coleta está ativa. As métricas aparecerão após novas visitas.
          </div>
        ) : null}
      </section>

      {alerts.length > 0 ? (
        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-900">
          <div className="flex items-center gap-2 font-semibold">
            <AlertTriangle size={18} />
            {alerts.length} indicador(es) acima da meta no p75
          </div>
          <p className="mt-1 text-sm">
            {alerts.map((metric) => metric.name).join(", ")} precisam de
            atenção.
          </p>
        </section>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[1.1fr_1.9fr]">
        <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex items-center gap-2">
            <Activity size={19} className="text-[#3D56A2]" />
            <h2 className="font-semibold text-zinc-900 dark:text-white">
              Segmentos mais medidos
            </h2>
          </div>
          <div className="mt-4 space-y-3">
            {(webVitals?.segments ?? []).slice(0, 12).map((segment, index) => (
              <div
                key={`${segment.path}-${segment.name}-${segment.viewport}-${index}`}
                className="flex items-center justify-between gap-3 border-b border-zinc-100 pb-3 text-sm last:border-0 dark:border-zinc-800"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium text-zinc-800 dark:text-zinc-200">
                    {segment.path}
                  </p>
                  <p className="text-xs text-zinc-500">
                    {segment.viewport ?? "indefinido"} ·{" "}
                    {segment.connection_type ?? "rede desconhecida"} ·{" "}
                    {segment.samples} amostras
                  </p>
                </div>
                <span
                  className={
                    segment.status === "good"
                      ? "text-emerald-600"
                      : "text-amber-600"
                  }
                >
                  {segment.name} {formatMetric(segment.name, segment.p75)}
                </span>
              </div>
            ))}
          </div>
        </section>

        <section className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex items-center justify-between border-b border-zinc-100 p-5 dark:border-zinc-800">
            <div className="flex items-center gap-2">
              <Clock3 size={19} className="text-[#3D56A2]" />
              <h2 className="font-semibold text-zinc-900 dark:text-white">
                Rotas mais lentas da API
              </h2>
            </div>
            <span className="text-xs text-zinc-500">
              alerta ≥ {api?.slowRequestThresholdMs ?? 750} ms
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="bg-zinc-50 text-xs uppercase text-zinc-500 dark:bg-zinc-950">
                <tr>
                  <th className="px-5 py-3">Rota</th>
                  <th className="px-4 py-3">p75</th>
                  <th className="px-4 py-3">p95</th>
                  <th className="px-4 py-3">Banco</th>
                  <th className="px-4 py-3">Queries</th>
                  <th className="px-4 py-3">Erros</th>
                </tr>
              </thead>
              <tbody>
                {(api?.routes ?? []).slice(0, 20).map((route) => (
                  <tr
                    key={`${route.method}-${route.path}`}
                    className="border-t border-zinc-100 dark:border-zinc-800"
                  >
                    <td className="px-5 py-3">
                      <span className="mr-2 rounded bg-zinc-100 px-1.5 py-0.5 text-xs font-semibold dark:bg-zinc-800">
                        {route.method}
                      </span>
                      <span className="font-medium text-zinc-800 dark:text-zinc-200">
                        {route.path}
                      </span>
                    </td>
                    <td className="px-4 py-3">{Math.round(route.p75_ms)} ms</td>
                    <td className="px-4 py-3">{Math.round(route.p95_ms)} ms</td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1">
                        <Database size={13} />
                        {Math.round(route.average_database_ms)} ms
                      </span>
                    </td>
                    <td className="px-4 py-3">{route.average_query_count}</td>
                    <td className="px-4 py-3">
                      <span
                        className={
                          route.errors ? "text-red-600" : "text-zinc-500"
                        }
                      >
                        {route.errors}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!loading && api?.routes.length === 0 ? (
            <p className="p-8 text-center text-sm text-zinc-500">
              A amostragem da API está ativa; aguarde novas requisições.
            </p>
          ) : null}
        </section>
      </div>
    </div>
  );
}
