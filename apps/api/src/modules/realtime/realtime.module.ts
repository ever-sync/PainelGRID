import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { RealtimeEventsService } from './realtime-events.service';
import { RealtimeGateway } from './realtime.gateway';

@Module({
  imports: [ConfigModule, JwtModule],
  providers: [RealtimeGateway, RealtimeEventsService],
  exports: [RealtimeEventsService],
})
export class RealtimeModule {}
