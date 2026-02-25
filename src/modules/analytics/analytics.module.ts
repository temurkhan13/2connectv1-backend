import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';
import { AnalyticsEvent } from 'src/common/entities/analytics-event.entity';
import { FunnelMetric } from 'src/common/entities/funnel-metric.entity';
import { UserEngagementScore } from 'src/common/entities/user-engagement-score.entity';
import { User } from 'src/common/entities/user.entity';
import { Match } from 'src/common/entities/match.entity';
import { AiConversation } from 'src/common/entities/ai-conversation.entity';
import { Message } from 'src/common/entities/message.entity';

/**
 * Analytics Module
 * Phase 4.3: Success Metrics Pipeline
 */
@Module({
  imports: [
    SequelizeModule.forFeature([
      AnalyticsEvent,
      FunnelMetric,
      UserEngagementScore,
      User,
      Match,
      AiConversation,
      Message,
    ]),
  ],
  controllers: [AnalyticsController],
  providers: [AnalyticsService],
  exports: [AnalyticsService],
})
export class AnalyticsModule {}
