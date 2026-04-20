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
import { S3Module } from 'src/common/utils/s3.module';
import { NotificationModule } from 'src/modules/notifications/notification.module';
import { UserDocument } from 'src/common/entities/user-document.entity';
import { UserActivityLogsModule } from 'src/modules/user-activity-logs/user-activity-logs.module';
import { DailyAnalyticsModule } from 'src/modules/daily-analytics/daily-analytics.module';

// Apr-20 F/u 47: completed the multi-provider cleanup started in F/u 46.
// Now imports S3Module / NotificationModule / DailyAnalyticsModule (all
// owning the respective services + exporting them) rather than declaring
// `S3Service` / `NotificationService` / `DailyAnalyticsService` in providers.
// Plus historical F/u 46 cleanup: no dead UserService provider (removed
// because unused). Every consumer of these services now gets them via
// module import, so dep changes propagate via module resolution only.
//
// See [[NEVER-DO]] "Never change a service's constructor deps without
// grepping every module that provides it" and [[Topics/historical-bugs]]
// pattern #8 (Multi-provider service DI crash).

@Module({
  imports: [
    UserActivityLogsModule,
    S3Module,
    NotificationModule,
    DailyAnalyticsModule,
    SequelizeModule.forFeature([
      OnboardingQuestion,
      OnboardingSection,
      UserOnboardingAnswer,
      Role,
      User,
      UserFcmToken,
      UserSummaries,
      UserDocument,
    ]),
  ],
  controllers: [OnBoardingController],
  providers: [OnBoardingService],
  exports: [OnBoardingService], // Apr-20 F/u 47: exported so WebhooksModule can import
})
export class OnBoardingModule {}
