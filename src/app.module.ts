import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BullModule } from '@nestjs/bull';
import { ThrottlerModule } from 'src/config/throttle.module';
import { TerminusModule } from '@nestjs/terminus';
import { LoggerModule } from 'src/common/logger/logger.module';
import databaseConfig from 'src/config/database.config';
import { AppController, HealthController } from 'src/app.controller';
import { UserModule } from 'src/modules/user/user.module';
import { AuthModule } from 'src/modules/auth/auth.module';
import { DatabaseModule } from 'src/config/database.module';
import { MatchesModule } from 'src/modules/matches/matches.module';
import { ChatModule } from 'src/modules/chat/chat.module';
import { AiConversationsModule } from 'src/modules/ai-conversations/ai-conversations.module';
import { OnBoardingModule } from 'src/modules/onboarding/onboarding.module';
import { DashboardModule } from 'src/modules/dashboard/dashboard.module';
import { ProfileModule } from 'src/modules/profile/profile.module';
import { NotificationModule } from 'src/modules/notifications/notification.module';
import { MessageTemplatesModule } from 'src/modules/message-templates/message-templates.module';
import { WebhooksModule } from 'src/modules/webhooks/webhooks.module';
import { DailyAnalyticsModule } from 'src/modules/daily-analytics/daily-analytics.module';
import { UserActivityLogsModule } from 'src/modules/user-activity-logs/user-activity-logs.module';
import { MailModule } from 'src/modules/mail/mail.module';
import { SuperAdminModule } from 'src/modules/super-admin/super-admin.module';
import { AIServiceModule } from 'src/integration/ai-service/ai-service.module';
import { SchedulerModule } from 'src/modules/scheduler/scheduler.module';
import { RealtimeModule } from './modules/realtime/realtime.module';
import { VoiceModule } from 'src/modules/voice/voice.module';
// Phase 3-4: Advanced Features
import { DiscoverModule } from 'src/modules/discover/discover.module';
import { AnalyticsModule } from 'src/modules/analytics/analytics.module';

@Module({
  controllers: [AppController, HealthController],
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [databaseConfig],
      envFilePath: ['.env'],
    }),
    BullModule.forRoot({
      redis: {
        host: process.env.REDIS_HOST || 'localhost',
        port: Number(process.env.REDIS_PORT) || 6379,
      },
    }),
    DatabaseModule,
    ThrottlerModule,
    TerminusModule,
    LoggerModule,
    AIServiceModule,
    UserModule,
    AuthModule,
    MatchesModule,
    ChatModule,
    AiConversationsModule,
    OnBoardingModule,
    DashboardModule,
    ProfileModule,
    NotificationModule,
    MessageTemplatesModule,
    WebhooksModule,
    DailyAnalyticsModule,
    UserActivityLogsModule,
    MailModule,
    SuperAdminModule,
    SchedulerModule,
    RealtimeModule,
    VoiceModule,
    // Phase 3-4: Advanced Features
    DiscoverModule,
    AnalyticsModule,
  ],
  providers: [],
})
export class AppModule {}
