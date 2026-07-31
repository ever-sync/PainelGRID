import { httpRequest } from "./http";

export interface WebVitalSummaryMetric {
  name: "CLS" | "FCP" | "INP" | "LCP" | "TTFB";
  samples: number;
  p75: number;
  p95: number;
  good: number;
  needs_improvement: number;
  poor: number;
  target: number;
  status: "good" | "needs-attention";
}

export interface WebVitalSegment {
  path: string;
  viewport: "mobile" | "tablet" | "desktop" | null;
  connection_type: string | null;
  name: WebVitalSummaryMetric["name"];
  samples: number;
  p75: number;
  target: number;
  status: "good" | "needs-attention";
}

export interface WebVitalsSummary {
  periodHours: number;
  generatedAt: string;
  metrics: WebVitalSummaryMetric[];
  segments: WebVitalSegment[];
}

export interface ApiRouteMetric {
  path: string;
  method: string;
  samples: number;
  errors: number;
  slow: number;
  average_ms: number;
  p75_ms: number;
  p95_ms: number;
  average_database_ms: number;
  average_query_count: number;
}

export interface ApiPerformanceSummary {
  periodHours: number;
  slowRequestThresholdMs: number;
  generatedAt: string;
  routes: ApiRouteMetric[];
}

export async function fetchPerformanceOverview(
  token: string,
  hours = 24,
  signal?: AbortSignal,
) {
  const query = `?hours=${hours}`;
  const [webVitals, api] = await Promise.all([
    httpRequest<WebVitalsSummary>(`/performance/web-vitals/summary${query}`, {
      token,
      signal,
    }),
    httpRequest<ApiPerformanceSummary>(`/performance/api/summary${query}`, {
      token,
      signal,
    }),
  ]);
  return { webVitals, api };
}

export interface DatabaseConnections {
  generatedAt: string;
  used: number;
  maxConnections: number;
  usedPercent: number;
  status: "good" | "warning" | "critical";
  byClient: Array<{
    user: string;
    application: string;
    connections: number;
  }>;
}

export function fetchDatabaseConnections(token: string) {
  return httpRequest<DatabaseConnections>("/performance/database/connections", {
    method: "GET",
    token,
  });
}
