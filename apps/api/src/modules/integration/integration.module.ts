import { Module } from '@nestjs/common';
import { CrmModule } from '../crm/crm.module';
import { EventsModule } from '../events/events.module';
import { LeadsModule } from '../leads/leads.module';
import { IntegrationController } from './integration.controller';
import { IntegrationKeyGuard } from './integration-key.guard';
import { RubinhoModule } from '../rubinho/rubinho.module';
import { IntegrationCredentialsController } from './integration-credentials.controller';
import { IntegrationCredentialsService } from './integration-credentials.service';
import { MetaLeadIngestionController } from './meta-lead-ingestion.controller';
import { MetaLeadIngestionKeyGuard } from './meta-lead-ingestion-key.guard';

@Module({
  imports: [LeadsModule, CrmModule, EventsModule, RubinhoModule],
  controllers: [
    IntegrationController,
    IntegrationCredentialsController,
    MetaLeadIngestionController,
  ],
  providers: [
    IntegrationKeyGuard,
    IntegrationCredentialsService,
    MetaLeadIngestionKeyGuard,
  ],
})
export class IntegrationModule {}
