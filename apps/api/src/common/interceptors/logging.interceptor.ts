import {
  CallHandler,
  ExecutionContext,
  HttpException,
  Injectable,
  Logger,
  NestInterceptor,
} from "@nestjs/common";
import { Request, Response } from "express";
import { randomUUID } from "node:crypto";
import { Observable, catchError, finalize, throwError } from "rxjs";
import { PerformanceService } from "../../modules/performance/performance.service";
import { RequestPerformanceContext } from "../../modules/performance/request-performance.context";

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger("HTTP");

  constructor(private readonly performanceService: PerformanceService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();
    const requestId = request.get("x-request-id")?.slice(0, 64) || randomUUID();
    const method = request.method;
    const path = this.performanceService.normalizeApiPath(
      request.path || request.url.split("?")[0],
    );
    const startedAt = performance.now();
    let errorStatus: number | undefined;

    response.setHeader("x-request-id", requestId);

    return next.handle().pipe(
      catchError((error: unknown) => {
        errorStatus = error instanceof HttpException ? error.getStatus() : 500;
        return throwError(() => error);
      }),
      finalize(() => {
        const durationMs = Number((performance.now() - startedAt).toFixed(1));
        const database = RequestPerformanceContext.current();
        const statusCode = errorStatus ?? response.statusCode;
        const responseSizeHeader = response.getHeader("content-length");
        const responseSize =
          typeof responseSizeHeader === "string"
            ? Number.parseInt(responseSizeHeader, 10)
            : typeof responseSizeHeader === "number"
              ? responseSizeHeader
              : undefined;
        const isSlow =
          durationMs >= this.performanceService.readSlowRequestThreshold();

        if (!response.headersSent) {
          response.setHeader(
            "Server-Timing",
            [
              `app;dur=${durationMs}`,
              `db;dur=${database.databaseDurationMs.toFixed(1)};desc="Prisma (${database.databaseQueryCount} queries)"`,
            ].join(", "),
          );
        }

        const logEntry = {
          type: isSlow ? "slow_http_request" : "http_request",
          requestId,
          method,
          path,
          statusCode,
          durationMs,
          databaseDurationMs: Number(database.databaseDurationMs.toFixed(1)),
          databaseQueryCount: database.databaseQueryCount,
          slowestQueryMs: Number(database.slowestQueryMs.toFixed(1)),
          responseSizeBytes: Number.isFinite(responseSize)
            ? responseSize
            : undefined,
        };
        const message = JSON.stringify(logEntry);
        if (isSlow || statusCode >= 500) {
          this.logger.warn(message);
        } else {
          this.logger.log(message);
        }

        if (!path.startsWith("/api/performance")) {
          this.performanceService.enqueueApiRequest({
            request_id: requestId,
            method,
            path,
            status_code: statusCode,
            duration_ms: durationMs,
            database_duration_ms: database.databaseDurationMs,
            database_query_count: database.databaseQueryCount,
            slowest_query_ms: database.slowestQueryMs,
            response_size_bytes: Number.isFinite(responseSize)
              ? responseSize
              : undefined,
            is_slow: isSlow,
          });
        }
      }),
    );
  }
}
