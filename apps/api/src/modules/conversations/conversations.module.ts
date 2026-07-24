import { Module } from '@nestjs/common';
import { ClientsModule } from '../clients/clients.module';
import { CrmModule } from '../crm/crm.module';
import { MetaModule } from '../meta/meta.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { ConversationsController } from './conversations.controller';
import { ConversationsService } from './conversations.service';

@Module({
  imports: [ClientsModule, RealtimeModule, MetaModule, CrmModule],
  controllers: [ConversationsController],
  providers: [ConversationsService],
})
export class ConversationsModule {}
