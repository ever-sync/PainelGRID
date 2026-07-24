import { Module } from '@nestjs/common';
import { ClientsModule } from '../clients/clients.module';
import { EventDashboardService } from './event-dashboard.service';
import { EventsController } from './events.controller';
import { EventsService } from './events.service';

@Module({
  imports: [ClientsModule],
  controllers: [EventsController],
  providers: [EventsService, EventDashboardService],
  exports: [EventsService],
})
export class EventsModule {}
