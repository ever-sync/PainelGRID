import { Module } from "@nestjs/common";
import { ClientsModule } from "../clients/clients.module";
import { CrmModule } from "../crm/crm.module";
import { MetaModule } from "../meta/meta.module";
import { RealtimeModule } from "../realtime/realtime.module";
import { ConversationsController } from "./conversations.controller";
import { ConversationsService } from "./conversations.service";
import { DispatchTrackingModule } from "../dispatch-tracking/dispatch-tracking.module";

@Module({
  imports: [
    ClientsModule,
    RealtimeModule,
    MetaModule,
    CrmModule,
    DispatchTrackingModule,
  ],
  controllers: [ConversationsController],
  providers: [ConversationsService],
  exports: [ConversationsService],
})
export class ConversationsModule {}
