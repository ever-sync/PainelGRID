import { Module } from "@nestjs/common";
import { OperationsController } from "./operations.controller";
import { OperationsIntegrationController } from "./operations-integration.controller";
import { OperationsService } from "./operations.service";

@Module({
  controllers: [OperationsController, OperationsIntegrationController],
  providers: [OperationsService],
  exports: [OperationsService],
})
export class OperationsModule {}
