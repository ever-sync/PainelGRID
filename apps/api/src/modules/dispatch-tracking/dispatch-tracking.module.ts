import { Module } from "@nestjs/common";
import { DispatchTrackingService } from "./dispatch-tracking.service";
import { ClientsModule } from "../clients/clients.module";
import { DispatchTrackingController } from "./dispatch-tracking.controller";

@Module({
  imports: [ClientsModule],
  controllers: [DispatchTrackingController],
  providers: [DispatchTrackingService],
  exports: [DispatchTrackingService],
})
export class DispatchTrackingModule {}
