import { Module } from '@nestjs/common';
import { CrmModule } from '../crm/crm.module';
import { EventsModule } from '../events/events.module';
import { LeadsModule } from '../leads/leads.module';
import { IntegrationController } from './integration.controller';
import { IntegrationKeyGuard } from './integration-key.guard';
import { RubinhoModule } from '../rubinho/rubinho.module';

@Module({
  imports: [LeadsModule, CrmModule, EventsModule, RubinhoModule],
  controllers: [IntegrationController],
  providers: [IntegrationKeyGuard],
})
export class IntegrationModule {}
