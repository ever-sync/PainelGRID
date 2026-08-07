import { Module } from "@nestjs/common";
import { DispatchTrackingService } from "./dispatch-tracking.service";

@Module({
  providers: [DispatchTrackingService],
  exports: [DispatchTrackingService],
})
export class DispatchTrackingModule {}
