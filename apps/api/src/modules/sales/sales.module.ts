import { Module } from "@nestjs/common";
import { RealtimeModule } from "../realtime/realtime.module";
import { ScoreEventsModule } from "../score-events/score-events.module";
import { SalesController } from "./sales.controller";
import { SalesService } from "./sales.service";
import { DispatchTrackingModule } from "../dispatch-tracking/dispatch-tracking.module";

@Module({
  imports: [ScoreEventsModule, RealtimeModule, DispatchTrackingModule],
  controllers: [SalesController],
  providers: [SalesService],
})
export class SalesModule {}
