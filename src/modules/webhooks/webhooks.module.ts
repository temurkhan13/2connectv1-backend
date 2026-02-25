import { Module } from '@nestjs/common';
import { WebhooksService } from 'src/modules/webhooks/webhooks.service';
import { WebhooksController } from 'src/modules/webhooks/webhooks.controller';
import { SequelizeModule } from '@nestjs/sequelize';
import { UserSummaries } from 'src/common/entities/user-summaries.entity';
import { MatchBatch } from 'src/common/entities/match-batch.entity';
import { AiConversation } from 'src/common/entities/ai-conversation.entity';
import { Message } from 'src/common/entities/message.entity';
import { Match } from 'src/common/entities/match.entity';
import { NotificationService } from 'src/modules/notifications/notification.service';
import { UserActivityLogsService } from 'src/modules/user-activity-logs/user-activity-logs.service';
import { UserFcmToken } from 'src/common/entities/user-fcm-token.entity';
import { UserActivityLog } from 'src/common/entities/user-activity-log.entity';
import { DailyAnalyticsService } from 'src/modules/daily-analytics/daily-analytics.service';
import { OnBoardingService } from 'src/modules/onboarding/onboarding.service';
import { DailyAnalytics } from 'src/common/entities/daily-analytics.entity';
import { S3Service } from 'src/common/utils/s3.service';
import { User } from 'src/common/entities/user.entity';
import { UserDocument } from 'src/common/entities/user-document.entity';
import { OnboardingSection } from 'src/common/entities/onboarding-section.entity';
import { OnboardingQuestion } from 'src/common/entities/onboarding-question.entity';
import { UserOnboardingAnswer } from 'src/common/entities/user-onboarding-answer.entity';
import { RealtimeModule } from 'src/modules/realtime/realtime.module';

@Module({
  imports: [
    SequelizeModule.forFeature([
      UserSummaries,
      UserFcmToken,
      MatchBatch,
      Match,
      AiConversation,
      Message,
      UserActivityLog,
      DailyAnalytics,
      User,
      UserDocument,
      OnboardingSection,
      OnboardingQuestion,
      UserOnboardingAnswer,
    ]),
    RealtimeModule,
  ],
  controllers: [WebhooksController],
  providers: [
    WebhooksService,
    NotificationService,
    UserActivityLogsService,
    DailyAnalyticsService,
    S3Service,
    OnBoardingService,
  ],
})
export class WebhooksModule {}
