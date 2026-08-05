import { Module } from "@nestjs/common";
import { LeadTimelineService } from "./lead-timeline.service";

@Module({
  providers: [LeadTimelineService],
  exports: [LeadTimelineService],
})
export class LeadTimelineModule {}
