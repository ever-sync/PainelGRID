import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Query,
  Req,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import { Request } from "express";
import { Public, Roles } from "../../common/decorators";
import { Role } from "../../common/types";
import { PerformanceSummaryQueryDto } from "./dto/performance-summary-query.dto";
import { RecordWebVitalDto } from "./dto/record-web-vital.dto";
import { PerformanceService } from "./performance.service";

@ApiTags("performance")
@Controller("performance")
export class PerformanceController {
  constructor(private readonly performanceService: PerformanceService) {}

  @Public()
  @Throttle({ default: { limit: 300, ttl: 60_000 } })
  @Post("web-vitals")
  @HttpCode(202)
  @ApiOperation({ summary: "Recebe uma medição anônima de Core Web Vitals" })
  @ApiResponse({ status: 202, description: "Métrica aceita" })
  async recordWebVital(
    @Body() dto: RecordWebVitalDto,
    @Req() request: Request,
  ) {
    await this.performanceService.recordWebVital(dto, request);
    return { accepted: true };
  }

  @Get("web-vitals/summary")
  @ApiBearerAuth()
  @Roles(Role.GESTOR)
  @ApiOperation({ summary: "Resumo p75/p95 dos Core Web Vitals" })
  getWebVitalsSummary(@Query() query: PerformanceSummaryQueryDto) {
    return this.performanceService.getWebVitalsSummary(query);
  }

  @Get("database/connections")
  @ApiBearerAuth()
  @Roles(Role.GESTOR)
  @ApiOperation({ summary: "Uso do pool de conexões do Postgres" })
  getDatabaseConnections() {
    return this.performanceService.getDatabaseConnections();
  }

  @Get("api/summary")
  @ApiBearerAuth()
  @Roles(Role.GESTOR)
  @ApiOperation({ summary: "Resumo p75/p95 de latência HTTP e banco por rota" })
  getApiSummary(@Query() query: PerformanceSummaryQueryDto) {
    return this.performanceService.getApiSummary(query);
  }
}
