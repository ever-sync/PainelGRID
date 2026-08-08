import { Module } from "@nestjs/common";
import { ClientsModule } from "../clients/clients.module";
import { CrmModule } from "../crm/crm.module";
import { LeadTimelineModule } from "../lead-timeline/lead-timeline.module";
import { MetaModule } from "../meta/meta.module";
import { RealtimeModule } from "../realtime/realtime.module";
import { ScoreEventsModule } from "../score-events/score-events.module";
import { LeadsController } from "./leads.controller";
import { LeadsService } from "./leads.service";
import { DispatchTrackingModule } from "../dispatch-tracking/dispatch-tracking.module";
import { AppointmentsModule } from "../appointments/appointments.module";

@Module({
  imports: [
    ClientsModule,
    ScoreEventsModule,
    RealtimeModule,
    CrmModule,
    MetaModule,
    LeadTimelineModule,
    DispatchTrackingModule,
    AppointmentsModule,
  ],
  controllers: [LeadsController],
  providers: [LeadsService],
  exports: [LeadsService],
})
export class LeadsModule {}
