import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { DashboardService } from 'src/modules/dashboard/dashboard.service';
import { DashboardController } from 'src/modules/dashboard/dashboard.controller';
import { DailyAnalytics } from 'src/common/entities/daily-analytics.entity';
import { Match } from 'src/common/entities/match.entity';
import { User } from 'src/common/entities/user.entity';
import { UserActivityLog } from 'src/common/entities/user-activity-log.entity';
import { AiConversation } from 'src/common/entities/ai-conversation.entity';
import { IceBreaker } from 'src/common/entities/ice-breaker.entity';
import { MatchFeedback } from 'src/common/entities/match-feedback.entity';
import { UserPreferencesLearned } from 'src/common/entities/user-preferences-learned.entity';
import { UserEngagementScore } from 'src/common/entities/user-engagement-score.entity';
import { MailModule } from 'src/modules/mail/mail.module';
import { NotificationModule } from 'src/modules/notifications/notification.module';
import { DailyAnalyticsService } from 'src/modules/daily-analytics/daily-analytics.service';
import { ChatModule } from 'src/modules/chat/chat.module';

@Module({
  imports: [
    SequelizeModule.forFeature([
      DailyAnalytics,
      UserActivityLog,
      Match,
      User,
      AiConversation,
      IceBreaker,
      MatchFeedback,
      UserPreferencesLearned,
      UserEngagementScore,
    ]),
    MailModule,
    NotificationModule,
    ChatModule,
  ],
  controllers: [DashboardController],
  providers: [DashboardService, DailyAnalyticsService],
})
export class DashboardModule {}
