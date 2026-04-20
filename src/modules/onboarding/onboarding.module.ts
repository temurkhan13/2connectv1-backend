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
import { NotificationService } from 'src/modules/notifications/notification.service';
import { UserDocument } from 'src/common/entities/user-document.entity';
import { UserActivityLogsModule } from 'src/modules/user-activity-logs/user-activity-logs.module';
import { DailyAnalyticsService } from 'src/modules/daily-analytics/daily-analytics.service';
import { DailyAnalytics } from 'src/common/entities/daily-analytics.entity';

// Apr-20 F/u 46: removed UserService provider + MailModule import + PushToken
// + NotificationSettings entity registrations from this module. Audit (F/u 46)
// showed UserService was a DEAD reference here — not injected anywhere in
// OnBoardingService, OnBoardingController, or any related file. Its presence
// in providers caused the F/u 45 production outage (8m 21s) when a MailService
// dep was added to UserService: Nest instantiates all declared providers even
// if unused, so OnBoardingModule crashed trying to resolve MailService it
// didn't import. Cleanest fix is to not provide the service we don't use.
//
// If a future change DOES need UserService in this module, import UserModule
// (which `exports: [UserService]`) instead of re-declaring the provider.
// That way adding a dep to UserService only requires updating UserModule.

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
    ]),
  ],
  controllers: [OnBoardingController],
  providers: [
    OnBoardingService,
    S3Service,
    NotificationService,
    DailyAnalyticsService,
  ],
})
export class OnBoardingModule {}
