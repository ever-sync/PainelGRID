import { Module } from "@nestjs/common";
import { CrmModule } from "../crm/crm.module";
import { EventsModule } from "../events/events.module";
import { LeadsModule } from "../leads/leads.module";
import { IntegrationController } from "./integration.controller";
import { IntegrationKeyGuard } from "./integration-key.guard";
import { RubinhoModule } from "../rubinho/rubinho.module";
import { IntegrationCredentialsController } from "./integration-credentials.controller";
import { IntegrationCredentialsService } from "./integration-credentials.service";
import { MetaLeadIngestionController } from "./meta-lead-ingestion.controller";
import { MetaLeadIngestionKeyGuard } from "./meta-lead-ingestion-key.guard";
import { ConversationsModule } from "../conversations/conversations.module";
import { AppointmentsModule } from "../appointments/appointments.module";
import { AutomationController } from "./automation.controller";
import { AutomationKeyGuard } from "./automation-key.guard";

@Module({
  imports: [
    LeadsModule,
    CrmModule,
    EventsModule,
    RubinhoModule,
    ConversationsModule,
    AppointmentsModule,
  ],
  controllers: [
    IntegrationController,
    IntegrationCredentialsController,
    MetaLeadIngestionController,
    AutomationController,
  ],
  providers: [
    IntegrationKeyGuard,
    IntegrationCredentialsService,
    MetaLeadIngestionKeyGuard,
    AutomationKeyGuard,
  ],
})
export class IntegrationModule {}
