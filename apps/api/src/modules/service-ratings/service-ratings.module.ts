import { Module } from '@nestjs/common';
import { ClientsModule } from '../clients/clients.module';
import { ScoreEventsModule } from '../score-events/score-events.module';
import { ServiceRatingsController } from './service-ratings.controller';
import { ServiceRatingsService } from './service-ratings.service';

@Module({
  imports: [ClientsModule, ScoreEventsModule],
  controllers: [ServiceRatingsController],
  providers: [ServiceRatingsService],
})
export class ServiceRatingsModule {}
