import { BullModule } from "@nestjs/bullmq";
import { Module } from "@nestjs/common";
import { CrmModule } from "../crm/crm.module";
import { RealtimeModule } from "../realtime/realtime.module";
import { MetaSyncProcessor } from "./meta-sync.processor";
import { MetaController } from "./meta.controller";
import { MetaService } from "./meta.service";
import { DispatchTrackingModule } from "../dispatch-tracking/dispatch-tracking.module";

@Module({
  imports: [
    BullModule.registerQueue({ name: "meta-sync" }),
    RealtimeModule,
    CrmModule,
    DispatchTrackingModule,
  ],
  controllers: [MetaController],
  providers: [MetaService, MetaSyncProcessor],
  exports: [MetaService],
})
export class MetaModule {}
