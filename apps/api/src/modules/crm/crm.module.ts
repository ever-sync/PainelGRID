import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { LeadTimelineModule } from '../lead-timeline/lead-timeline.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { ScoreEventsModule } from '../score-events/score-events.module';
import { ClientWebhookService } from './client-webhook.service';
import { CrmController } from './crm.controller';
import { CrmService } from './crm.service';
import { WebhookDispatchProcessor } from './webhook-dispatch.processor';
import { WebhookDispatchService } from './webhook-dispatch.service';

@Module({
  imports: [
    BullModule.registerQueue({ name: 'webhook-dispatch' }),
    RealtimeModule,
    ScoreEventsModule,
    LeadTimelineModule,
  ],
  controllers: [CrmController],
  providers: [CrmService, WebhookDispatchService, WebhookDispatchProcessor, ClientWebhookService],
  exports: [CrmService, ClientWebhookService],
})
export class CrmModule {}
