import { Global, Module } from "@nestjs/common";
import { PerformanceController } from "./performance.controller";
import { PerformanceService } from "./performance.service";
import { RequestPerformanceMiddleware } from "./request-performance.middleware";

@Global()
@Module({
  controllers: [PerformanceController],
  providers: [PerformanceService, RequestPerformanceMiddleware],
  exports: [PerformanceService],
})
export class PerformanceModule {}
