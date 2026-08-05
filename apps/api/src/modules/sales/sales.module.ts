import { Module } from "@nestjs/common";
import { RealtimeModule } from "../realtime/realtime.module";
import { ScoreEventsModule } from "../score-events/score-events.module";
import { SalesController } from "./sales.controller";
import { SalesService } from "./sales.service";

@Module({
  imports: [ScoreEventsModule, RealtimeModule],
  controllers: [SalesController],
  providers: [SalesService],
})
export class SalesModule {}
