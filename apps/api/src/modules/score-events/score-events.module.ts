import { Module } from "@nestjs/common";
import { ClientsModule } from "../clients/clients.module";
import { ScoreEventsService } from "./score-events.service";
import { VendorScoreController } from "./vendor-score.controller";

@Module({
  imports: [ClientsModule],
  controllers: [VendorScoreController],
  providers: [ScoreEventsService],
  exports: [ScoreEventsService],
})
export class ScoreEventsModule {}
