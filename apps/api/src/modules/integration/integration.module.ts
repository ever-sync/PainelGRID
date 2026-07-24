import { Module } from '@nestjs/common';
import { CrmModule } from '../crm/crm.module';
import { EventsModule } from '../events/events.module';
import { LeadsModule } from '../leads/leads.module';
import { IntegrationController } from './integration.controller';
import { IntegrationKeyGuard } from './integration-key.guard';
import { RubinhoModule } from '../rubinho/rubinho.module';
import { IntegrationCredentialsController } from './integration-credentials.controller';
import { IntegrationCredentialsService } from './integration-credentials.service';

@Module({
  imports: [LeadsModule, CrmModule, EventsModule, RubinhoModule],
  controllers: [IntegrationController, IntegrationCredentialsController],
  providers: [IntegrationKeyGuard, IntegrationCredentialsService],
})
export class IntegrationModule {}
