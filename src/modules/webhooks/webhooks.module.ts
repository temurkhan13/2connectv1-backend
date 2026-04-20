import { Module } from '@nestjs/common';
import { WebhooksService } from 'src/modules/webhooks/webhooks.service';
import { WebhooksController } from 'src/modules/webhooks/webhooks.controller';
import { SequelizeModule } from '@nestjs/sequelize';
import { UserSummaries } from 'src/common/entities/user-summaries.entity';
import { MatchBatch } from 'src/common/entities/match-batch.entity';
import { AiConversation } from 'src/common/entities/ai-conversation.entity';
import { Message } from 'src/common/entities/message.entity';
import { Match } from 'src/common/entities/match.entity';
import { NotificationModule } from 'src/modules/notifications/notification.module';
import { UserActivityLogsModule } from 'src/modules/user-activity-logs/user-activity-logs.module';
import { UserFcmToken } from 'src/common/entities/user-fcm-token.entity';
import { DailyAnalyticsModule } from 'src/modules/daily-analytics/daily-analytics.module';
import { OnBoardingModule } from 'src/modules/onboarding/onboarding.module';
import { S3Module } from 'src/common/utils/s3.module';
import { User } from 'src/common/entities/user.entity';
import { RealtimeModule } from 'src/modules/realtime/realtime.module';

// Apr-20 F/u 47: full multi-provider cleanup. This module was the worst
// offender — re-providing 5 services from other modules
// (NotificationService, UserActivityLogsService, DailyAnalyticsService,
// S3Service, OnBoardingService). Each of those was a latent F/u 45-class
// timebomb: any dep added to any of them required updating 2+ modules,
// and missing even one crashed Nest DI at boot. Now all 5 come in via
// module imports (single owning module per service, exported).
//
// Entity forFeature also slimmed: DailyAnalytics, UserActivityLog,
// UserDocument, OnboardingSection, OnboardingQuestion, UserOnboardingAnswer
// were only here to feed the re-provided services. Now the respective
// modules own them.
//
// See [[NEVER-DO]] "Never change a service's constructor deps without
// grepping every module that provides it" and [[Topics/historical-bugs]]
// pattern #8.

@Module({
  imports: [
    // Entities actually used by WebhooksService itself
    SequelizeModule.forFeature([
      UserSummaries,
      UserFcmToken,
      MatchBatch,
      Match,
      AiConversation,
      Message,
      User,
    ]),
    // All previously-re-provided services now come via their owning modules
    RealtimeModule,
    NotificationModule,
    UserActivityLogsModule,
    DailyAnalyticsModule,
    OnBoardingModule,
    S3Module,
  ],
  controllers: [WebhooksController],
  providers: [WebhooksService],
})
export class WebhooksModule {}
