import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { AiConversationsService } from 'src/modules/ai-conversations/ai-conversations.service';
import { MailModule } from 'src/modules/mail/mail.module';
import { AiConversationsController } from 'src/modules/ai-conversations/ai-conversations.controller';
import { AiConversation } from 'src/common/entities/ai-conversation.entity';
import { User } from 'src/common/entities/user.entity';
import { Message } from 'src/common/entities/message.entity';
import { Match } from 'src/common/entities/match.entity';
import { UseCaseTemplate } from 'src/common/entities/use-case-template.entity';
import { UserActivityLogsModule } from 'src/modules/user-activity-logs/user-activity-logs.module';
import { DailyAnalyticsModule } from 'src/modules/daily-analytics/daily-analytics.module';
import { ProfileModule } from 'src/modules/profile/profile.module';

@Module({
  imports: [
    SequelizeModule.forFeature([AiConversation, User, Message, Match, UseCaseTemplate]),
    UserActivityLogsModule,
    MailModule,
    DailyAnalyticsModule,
    ProfileModule,
  ],
  controllers: [AiConversationsController],
  providers: [AiConversationsService],
})
export class AiConversationsModule {}
