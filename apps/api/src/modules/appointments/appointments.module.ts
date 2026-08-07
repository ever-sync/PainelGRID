import { Module } from "@nestjs/common";
import { CrmModule } from "../crm/crm.module";
import { IntegrationKeyGuard } from "../integration/integration-key.guard";
import { RealtimeModule } from "../realtime/realtime.module";
import { ScoreEventsModule } from "../score-events/score-events.module";
import { MetaModule } from "../meta/meta.module";
import { AppointmentsController } from "./appointments.controller";
import { AppointmentsService } from "./appointments.service";
import { PanelAppointmentsController } from "./panel-appointments.controller";
import { DispatchTrackingModule } from "../dispatch-tracking/dispatch-tracking.module";

@Module({
  imports: [
    ScoreEventsModule,
    CrmModule,
    RealtimeModule,
    MetaModule,
    DispatchTrackingModule,
  ],
  controllers: [AppointmentsController, PanelAppointmentsController],
  providers: [AppointmentsService, IntegrationKeyGuard],
  exports: [AppointmentsService],
})
export class AppointmentsModule {}
