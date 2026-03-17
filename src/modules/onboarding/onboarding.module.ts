import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { OnBoardingService } from 'src/modules/onboarding/onboarding.service';
import { OnBoardingController } from 'src/modules/onboarding/onboarding.controller';
import { OnboardingQuestion } from 'src/common/entities/onboarding-question.entity';
import { OnboardingSection } from 'src/common/entities/onboarding-section.entity';
import { UserOnboardingAnswer } from 'src/common/entities/user-onboarding-answer.entity';
import { User } from 'src/common/entities/user.entity';
import { Role } from 'src/common/entities/role.entity';
import { UserSummaries } from 'src/common/entities/user-summaries.entity';
import { UserFcmToken } from 'src/common/entities/user-fcm-token.entity';
import { S3Service } from 'src/common/utils/s3.service';
import { UserService } from 'src/modules/user/user.service';
import { NotificationService } from 'src/modules/notifications/notification.service';
import { UserDocument } from 'src/common/entities/user-document.entity';
import { UserActivityLogsModule } from 'src/modules/user-activity-logs/user-activity-logs.module';
import { DailyAnalyticsService } from 'src/modules/daily-analytics/daily-analytics.service';
import { DailyAnalytics } from 'src/common/entities/daily-analytics.entity';
import { PushToken } from 'src/common/entities/push-token.entity';
import { NotificationSettings } from 'src/common/entities/notification-settings.entity';

@Module({
  imports: [
    UserActivityLogsModule,
    SequelizeModule.forFeature([
      OnboardingQuestion,
      OnboardingSection,
      UserOnboardingAnswer,
      Role,
      User,
      UserFcmToken,
      UserSummaries,
      UserDocument,
      DailyAnalytics,
      PushToken,
      NotificationSettings,
    ]),
  ],
  controllers: [OnBoardingController],
  providers: [
    OnBoardingService,
    S3Service,
    UserService,
    NotificationService,
    DailyAnalyticsService,
  ],
})
export class OnBoardingModule {}
