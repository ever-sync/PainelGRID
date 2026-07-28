import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Request } from 'express';
import { PrismaService } from '../../config/prisma.service';
import { PerformanceSummaryQueryDto } from './dto/performance-summary-query.dto';
import { RecordWebVitalDto } from './dto/record-web-vital.dto';

interface ApiRequestSample {
  request_id: string;
  method: string;
  path: string;
  status_code: number;
  duration_ms: number;
  database_duration_ms: number;
  database_query_count: number;
  slowest_query_ms: number;
  response_size_bytes?: number;
  is_slow: boolean;
}

export interface WebVitalAggregate {
  name: string;
  samples: number;
  p75: number;
  p95: number;
  good: number;
  needs_improvement: number;
  poor: number;
}

export interface ApiAggregate {
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

export interface WebVitalSegment {
  path: string;
  viewport: string | null;
  connection_type: string | null;
  name: string;
  samples: number;
  p75: number;
}

const WEB_VITAL_GOOD_LIMITS: Record<string, number> = {
  CLS: 0.1,
  FCP: 1_800,
  INP: 200,
  LCP: 2_500,
  TTFB: 800,
};

@Injectable()
export class PerformanceService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PerformanceService.name);
  private readonly apiBuffer: ApiRequestSample[] = [];
  private flushTimer?: NodeJS.Timeout;
  private retentionTimer?: NodeJS.Timeout;
  private flushing = false;

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit(): void {
    this.flushTimer = setInterval(() => void this.flushApiMetrics(), 5_000);
    this.flushTimer.unref();

    this.retentionTimer = setInterval(
      () => void this.deleteExpiredMetrics(),
      24 * 60 * 60 * 1_000,
    );
    this.retentionTimer.unref();
  }

  async onModuleDestroy(): Promise<void> {
    if (this.flushTimer) clearInterval(this.flushTimer);
    if (this.retentionTimer) clearInterval(this.retentionTimer);
    await this.flushApiMetrics();
  }

  async recordWebVital(
    dto: RecordWebVitalDto,
    request: Request,
  ): Promise<void> {
    const recordedAt = new Date(dto.recordedAt);
    const now = Date.now();
    if (
      !Number.isFinite(recordedAt.getTime()) ||
      recordedAt.getTime() < now - 24 * 60 * 60 * 1_000 ||
      recordedAt.getTime() > now + 5 * 60 * 1_000
    ) {
      recordedAt.setTime(now);
    }

    await this.prisma.webVitalMetric.upsert({
      where: {
        metric_id_metric_name_path: {
          metric_id: dto.id,
          metric_name: dto.name,
          path: this.normalizeBrowserPath(dto.path),
        },
      },
      update: {
        value: dto.value,
        rating: dto.rating,
        delta: dto.delta,
        recorded_at: recordedAt,
      },
      create: {
        metric_name: dto.name,
        value: dto.value,
        rating: dto.rating,
        delta: dto.delta,
        metric_id: dto.id,
        navigation_type: dto.navigationType,
        path: this.normalizeBrowserPath(dto.path),
        session_id: dto.sessionId,
        connection_type: dto.connectionType,
        viewport: dto.viewport,
        device_memory_gb: dto.deviceMemoryGb,
        user_agent: request.get('user-agent')?.slice(0, 500),
        recorded_at: recordedAt,
      },
    });
  }

  enqueueApiRequest(sample: ApiRequestSample): void {
    const sampleRate = this.readSampleRate();
    if (
      !sample.is_slow &&
      sample.status_code < 500 &&
      Math.random() > sampleRate
    ) {
      return;
    }

    if (this.apiBuffer.length >= 5_000) {
      this.apiBuffer.shift();
      this.logger.warn(
        'Buffer de métricas da API cheio; a amostra mais antiga foi descartada',
      );
    }
    this.apiBuffer.push(sample);
  }

  async getWebVitalsSummary(query: PerformanceSummaryQueryDto) {
    const cutoff = new Date(Date.now() - query.hours * 60 * 60 * 1_000);
    const pathFilter = query.path
      ? Prisma.sql`AND "path" = ${this.normalizeBrowserPath(query.path)}`
      : Prisma.empty;

    const rows = await this.prisma.$queryRaw<WebVitalAggregate[]>(Prisma.sql`
      SELECT
        "metric_name" AS "name",
        COUNT(*)::int AS "samples",
        percentile_cont(0.75) WITHIN GROUP (ORDER BY "value")::float8 AS "p75",
        percentile_cont(0.95) WITHIN GROUP (ORDER BY "value")::float8 AS "p95",
        COUNT(*) FILTER (WHERE "rating" = 'good')::int AS "good",
        COUNT(*) FILTER (WHERE "rating" = 'needs-improvement')::int AS "needs_improvement",
        COUNT(*) FILTER (WHERE "rating" = 'poor')::int AS "poor"
      FROM "web_vital_metrics"
      WHERE "received_at" >= ${cutoff}
      ${pathFilter}
      GROUP BY "metric_name"
      ORDER BY "metric_name"
    `);
    const segments = await this.prisma.$queryRaw<WebVitalSegment[]>(Prisma.sql`
      SELECT
        "path",
        "viewport",
        "connection_type",
        "metric_name" AS "name",
        COUNT(*)::int AS "samples",
        percentile_cont(0.75) WITHIN GROUP (ORDER BY "value")::float8 AS "p75"
      FROM "web_vital_metrics"
      WHERE "received_at" >= ${cutoff}
      ${pathFilter}
      GROUP BY "path", "viewport", "connection_type", "metric_name"
      ORDER BY "samples" DESC, "path"
      LIMIT 100
    `);

    return {
      periodHours: query.hours,
      path: query.path ?? null,
      generatedAt: new Date().toISOString(),
      metrics: rows.map((row) => ({
        ...row,
        target: WEB_VITAL_GOOD_LIMITS[row.name] ?? null,
        status:
          row.p75 <=
          (WEB_VITAL_GOOD_LIMITS[row.name] ?? Number.POSITIVE_INFINITY)
            ? 'good'
            : 'needs-attention',
      })),
      segments: segments.map((segment) => ({
        ...segment,
        target: WEB_VITAL_GOOD_LIMITS[segment.name] ?? null,
        status:
          segment.p75 <=
          (WEB_VITAL_GOOD_LIMITS[segment.name] ?? Number.POSITIVE_INFINITY)
            ? 'good'
            : 'needs-attention',
      })),
    };
  }

  async getApiSummary(query: PerformanceSummaryQueryDto) {
    await this.flushApiMetrics();
    const cutoff = new Date(Date.now() - query.hours * 60 * 60 * 1_000);
    const pathFilter = query.path
      ? Prisma.sql`AND "path" = ${this.normalizeApiPath(query.path)}`
      : Prisma.empty;

    const rows = await this.prisma.$queryRaw<ApiAggregate[]>(Prisma.sql`
      SELECT
        "path",
        "method",
        COUNT(*)::int AS "samples",
        COUNT(*) FILTER (WHERE "status_code" >= 500)::int AS "errors",
        COUNT(*) FILTER (WHERE "is_slow")::int AS "slow",
        ROUND(AVG("duration_ms")::numeric, 1)::float8 AS "average_ms",
        percentile_cont(0.75) WITHIN GROUP (ORDER BY "duration_ms")::float8 AS "p75_ms",
        percentile_cont(0.95) WITHIN GROUP (ORDER BY "duration_ms")::float8 AS "p95_ms",
        ROUND(AVG("database_duration_ms")::numeric, 1)::float8 AS "average_database_ms",
        ROUND(AVG("database_query_count")::numeric, 1)::float8 AS "average_query_count"
      FROM "api_request_metrics"
      WHERE "sampled_at" >= ${cutoff}
      ${pathFilter}
      GROUP BY "path", "method"
      ORDER BY "p95_ms" DESC
      LIMIT 50
    `);

    return {
      periodHours: query.hours,
      path: query.path ?? null,
      slowRequestThresholdMs: this.readSlowRequestThreshold(),
      generatedAt: new Date().toISOString(),
      routes: rows,
    };
  }

  normalizeApiPath(path: string): string {
    return path
      .split('?')[0]
      .replace(
        /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/gi,
        ':id',
      )
      .replace(/\/\d+(?=\/|$)/g, '/:id')
      .slice(0, 500);
  }

  readSlowRequestThreshold(): number {
    const configured = Number(process.env.API_SLOW_REQUEST_MS);
    return Number.isFinite(configured) && configured >= 100 ? configured : 750;
  }

  private normalizeBrowserPath(path: string): string {
    const normalized = path.trim().split('?')[0].split('#')[0];
    return (normalized.startsWith('/') ? normalized : `/${normalized}`).slice(
      0,
      500,
    );
  }

  private readSampleRate(): number {
    const configured = Number(process.env.API_PERFORMANCE_SAMPLE_RATE);
    return Number.isFinite(configured) && configured >= 0 && configured <= 1
      ? configured
      : 0.1;
  }

  private async flushApiMetrics(): Promise<void> {
    if (this.flushing || this.apiBuffer.length === 0) return;
    this.flushing = true;
    const batch = this.apiBuffer.splice(0, 500);

    try {
      await this.prisma.apiRequestMetric.createMany({ data: batch });
    } catch (error) {
      this.apiBuffer.unshift(...batch);
      this.logger.warn(
        `Falha ao persistir métricas da API: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    } finally {
      this.flushing = false;
    }
  }

  private async deleteExpiredMetrics(): Promise<void> {
    const retentionDays = Math.max(
      7,
      Math.min(365, Number(process.env.PERFORMANCE_RETENTION_DAYS) || 30),
    );
    const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1_000);

    try {
      const [webVitals, apiMetrics] = await this.prisma.$transaction([
        this.prisma.webVitalMetric.deleteMany({
          where: { received_at: { lt: cutoff } },
        }),
        this.prisma.apiRequestMetric.deleteMany({
          where: { sampled_at: { lt: cutoff } },
        }),
      ]);
      if (webVitals.count > 0 || apiMetrics.count > 0) {
        this.logger.log(
          `Retenção de performance removeu ${webVitals.count} Web Vitals e ${apiMetrics.count} amostras da API`,
        );
      }
    } catch (error) {
      this.logger.warn(
        `Falha na retenção de métricas: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}
