import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { getApiEnvFilePaths } from './config/env-paths';
import { validateEnvironment } from './config/env.validation';
import { PrismaModule } from './config/prisma.module';
import { RedisModule } from './config/redis.module';
import { StorageModule } from './config/storage.module';
import { AgentModule } from './modules/agent/agent.module';
import { AuthModule } from './modules/auth/auth.module';
import { AppointmentsModule } from './modules/appointments/appointments.module';
import { JwtAuthGuard } from './modules/auth/guards/jwt-auth.guard';
import { RolesGuard } from './modules/auth/guards/roles.guard';
import { CampaignsModule } from './modules/campaigns/campaigns.module';
import { ClientsModule } from './modules/clients/clients.module';
import { ConversationsModule } from './modules/conversations/conversations.module';
import { CoursesModule } from './modules/courses/courses.module';
import { CrmModule } from './modules/crm/crm.module';
import { EventsModule } from './modules/events/events.module';
import { HealthModule } from './modules/health/health.module';
import { IntegrationModule } from './modules/integration/integration.module';
import { LeadsModule } from './modules/leads/leads.module';
import { MetaModule } from './modules/meta/meta.module';
import { PublicModule } from './modules/public/public.module';
import { UsersModule } from './modules/users/users.module';
import { SalesTeamsModule } from './modules/sales-teams/sales-teams.module';
import { SalesModule } from './modules/sales/sales.module';
import { ScoreEventsModule } from './modules/score-events/score-events.module';
import { ServiceRatingsModule } from './modules/service-ratings/service-ratings.module';
import { RealtimeModule } from './modules/realtime/realtime.module';
import { MailModule } from './mail/mail.module';
import { RubinhoModule } from './modules/rubinho/rubinho.module';
import { VehiclesModule } from './modules/vehicles/vehicles.module';

const envFilePaths = getApiEnvFilePaths();

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: envFilePaths,
      validate: validateEnvironment,
    }),
    ThrottlerModule.forRoot([
      {
        name: 'default',
        ttl: 60000, // 1 minute
        limit: 120, // max 120 requests per minute
      },
    ]),
    BullModule.forRootAsync({
      useFactory: () => {
        let redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
        const isRailwayInternalUnreachable =
          redisUrl.includes('.railway.internal') &&
          !process.env.RAILWAY_ENVIRONMENT &&
          !process.env.RAILWAY_STATIC_URL;
        if (isRailwayInternalUnreachable) {
          redisUrl = 'redis://localhost:6379';
        }

        return {
          // BullMQ nao e compativel com as estruturas Redis do Bull. O prefixo
          // separado impede que workers novos consumam jobs antigos.
          prefix: process.env.BULLMQ_PREFIX || 'bullmq',
          connection: {
            url: redisUrl,
            enableReadyCheck: false,
            maxRetriesPerRequest: null,
            enableOfflineQueue: false,
            lazyConnect: true,
            retryStrategy: () => null,
          },
        };
      },
    }),
    PrismaModule,
    RedisModule,
    StorageModule,
    AgentModule,
    AuthModule,
    AppointmentsModule,
    UsersModule,
    ClientsModule,
    LeadsModule,
    CrmModule,
    MetaModule,
    EventsModule,
    HealthModule,
    CampaignsModule,
    ConversationsModule,
    CoursesModule,
    IntegrationModule,
    PublicModule,
    SalesTeamsModule,
    ScoreEventsModule,
    ServiceRatingsModule,
    SalesModule,
    RealtimeModule,
    MailModule,
    RubinhoModule,
    VehiclesModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
  ],
})
export class AppModule {}
