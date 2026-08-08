import { Module } from "@nestjs/common";
import { CrmModule } from "../crm/crm.module";
import { AppointmentsModule } from "../appointments/appointments.module";
import { IntegrationKeyGuard } from "../integration/integration-key.guard";
import { AgentActionLogService } from "./agent-action-log.service";
import { AgentController } from "./agent.controller";
import { AgentService } from "./agent.service";
import { ConversationStateService } from "./conversation-state.service";

@Module({
  imports: [CrmModule, AppointmentsModule],
  controllers: [AgentController],
  providers: [
    AgentService,
    ConversationStateService,
    AgentActionLogService,
    IntegrationKeyGuard,
  ],
  exports: [AgentService, ConversationStateService, AgentActionLogService],
})
export class AgentModule {}
