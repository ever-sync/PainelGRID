import { Controller, Get } from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { Public } from "../../common/decorators";
import { Throttle } from "@nestjs/throttler";
import { PrismaService } from "../../config/prisma.service";
import { RedisService } from "../../config/redis.service";

@ApiTags("health")
@Controller("health")
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  @Public()
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @Get()
  @ApiOperation({ summary: "Health check de Postgres e Redis" })
  @ApiResponse({ status: 200, description: "Infraestrutura saudável" })
  @ApiResponse({ status: 503, description: "Infraestrutura degradada" })
  async check() {
    const checks = {
      postgres: "ok" as "ok" | "error",
      redis: "ok" as "ok" | "error",
    };

    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      checks.postgres = "error";
    }

    const redisHealthKey = `health:${Date.now()}:${Math.random().toString(36).slice(2, 10)}`;
    try {
      await this.redis.client.set(redisHealthKey, "ok", "EX", 5);
      const echoed = await this.redis.client.get(redisHealthKey);
      await this.redis.client.del(redisHealthKey);
      if (echoed !== "ok") {
        checks.redis = "error";
      }
    } catch {
      checks.redis = "error";
    }

    const response = {
      status:
        checks.postgres === "ok" && checks.redis === "ok" ? "ok" : "degraded",
      timestamp: new Date().toISOString(),
      checks,
      /** Readiness para login/refresh: allowlist de refresh exige Redis (ou store em memoria no processo). */
      auth: {
        refresh_token_store:
          checks.redis === "ok" ? "operational" : "unavailable",
      },
    };

    return response;
  }
}
