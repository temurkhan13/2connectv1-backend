import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Sequelize } from 'sequelize-typescript';
import { Op } from 'sequelize';
import { Cron, CronExpression } from '@nestjs/schedule';
import {
  AnalyticsEvent,
  EventType,
  EventCategory,
} from 'src/common/entities/analytics-event.entity';
import { FunnelMetric, FunnelStage } from 'src/common/entities/funnel-metric.entity';
import {
  UserEngagementScore,
  ActivityLevelEnum,
} from 'src/common/entities/user-engagement-score.entity';
import { User } from 'src/common/entities/user.entity';
import { Match } from 'src/common/entities/match.entity';
import { AiConversation } from 'src/common/entities/ai-conversation.entity';
import { Message } from 'src/common/entities/message.entity';
import { ConversationStatusEnum } from 'src/common/enums';
import {
  TrackEventDto,
  FunnelQueryDto,
  FunnelReportDto,
  FunnelStageDto,
  UserEngagementDto,
} from './dto/analytics.dto';

/**
 * Analytics Service
 * Phase 4.3: Success Metrics Pipeline
 */
@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);

  constructor(
    @InjectModel(AnalyticsEvent) private analyticsEventModel: typeof AnalyticsEvent,
    @InjectModel(FunnelMetric) private funnelMetricModel: typeof FunnelMetric,
    @InjectModel(UserEngagementScore) private engagementScoreModel: typeof UserEngagementScore,
    @InjectModel(User) private userModel: typeof User,
    @InjectModel(Match) private matchModel: typeof Match,
    @InjectModel(AiConversation) private aiConversationModel: typeof AiConversation,
    @InjectModel(Message) private messageModel: typeof Message,
    private sequelize: Sequelize,
  ) {}

  /**
   * Track an analytics event
   */
  async trackEvent(userId: string | null, dto: TrackEventDto): Promise<void> {
    await this.analyticsEventModel.create({
      user_id: userId,
      event_type: dto.event_type as EventType,
      event_category: dto.event_category as EventCategory,
      event_data: dto.event_data || {},
      event_value: dto.event_value,
      session_id: dto.session_id,
      source: dto.source,
    });
  }

  /**
   * Get funnel report for date range
   */
  async getFunnelReport(dto: FunnelQueryDto): Promise<FunnelReportDto> {
    const endDate = dto.end_date || new Date().toISOString().split('T')[0];
    const startDate = dto.start_date || this.getDateDaysAgo(30);

    const stages: FunnelStageDto[] = await this.funnelMetricModel.findAll({
      where: {
        date: {
          [Op.between]: [startDate, endDate],
        },
        ...(dto.cohort_week ? { cohort_week: dto.cohort_week } : {}),
      },
      attributes: [
        'stage',
        [Sequelize.fn('SUM', Sequelize.col('count')), 'count'],
        [Sequelize.fn('SUM', Sequelize.col('unique_users')), 'unique_users'],
        [Sequelize.fn('AVG', Sequelize.col('conversion_rate')), 'conversion_rate'],
        [
          Sequelize.fn('AVG', Sequelize.col('avg_time_from_previous_hours')),
          'avg_time_from_previous_hours',
        ],
      ],
      group: ['stage'],
      order: [
        [
          Sequelize.literal(
            "CASE stage WHEN 'signup' THEN 1 WHEN 'onboarding_started' THEN 2 WHEN 'onboarding_completed' THEN 3 WHEN 'first_match' THEN 4 WHEN 'first_approve' THEN 5 WHEN 'first_ai_chat' THEN 6 WHEN 'first_message' THEN 7 WHEN 'first_connection' THEN 8 END",
          ),
          'ASC',
        ],
      ],
      raw: true,
    });

    // Calculate overall conversion
    const signups = stages.find(s => s.stage === 'signup')?.unique_users || 0;
    const connections = stages.find(s => s.stage === 'first_connection')?.unique_users || 0;
    const overallConversion = signups > 0 ? connections / signups : 0;

    return {
      start_date: startDate,
      end_date: endDate,
      stages: stages.map(s => ({
        stage: s.stage,
        count: Number(s.count) || 0,
        unique_users: Number(s.unique_users) || 0,
        conversion_rate: s.conversion_rate ? Number(s.conversion_rate) : null,
        avg_time_from_previous_hours: s.avg_time_from_previous_hours
          ? Number(s.avg_time_from_previous_hours)
          : null,
      })),
      overall_conversion: overallConversion,
    };
  }

  /**
   * Get user engagement score
   */
  async getUserEngagement(userId: string): Promise<UserEngagementDto | null> {
    const score = await this.engagementScoreModel.findOne({
      where: { user_id: userId },
    });

    if (!score) return null;

    return {
      user_id: score.user_id,
      engagement_score: Number(score.engagement_score),
      activity_level: score.activity_level,
      days_since_last_activity: score.days_since_last_activity,
      total_matches_received: score.total_matches_received,
      total_matches_approved: score.total_matches_approved,
      approval_rate: score.approval_rate ? Number(score.approval_rate) : null,
      total_ai_chats_completed: score.total_ai_chats_completed,
      total_messages_sent: score.total_messages_sent,
      total_connections_made: score.total_connections_made,
    };
  }

  /**
   * Calculate and store funnel metrics (runs daily at 2 AM)
   */
  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async calculateDailyFunnelMetrics(): Promise<void> {
    this.logger.log('Calculating daily funnel metrics...');

    const yesterday = this.getDateDaysAgo(1);
    const cohortWeek = this.getWeekNumber(new Date(yesterday));

    try {
      // Calculate each funnel stage from analytics events
      const stages: FunnelStage[] = [
        'signup',
        'onboarding_started',
        'onboarding_completed',
        'first_match',
        'first_approve',
        'first_ai_chat',
        'first_message',
        'first_connection',
      ];

      for (let i = 0; i < stages.length; i++) {
        const stage = stages[i];
        const eventTypeMap: Record<FunnelStage, string> = {
          signup: 'signup',
          onboarding_started: 'onboarding_start',
          onboarding_completed: 'onboarding_complete',
          first_match: 'match_received',
          first_approve: 'match_approve',
          first_ai_chat: 'ai_chat_complete',
          first_message: 'message_sent',
          first_connection: 'connection_made',
        };

        const [countResult] = (await this.sequelize.query(
          `
          SELECT
            COUNT(*) as count,
            COUNT(DISTINCT user_id) as unique_users
          FROM analytics_events
          WHERE event_type = :eventType
          AND DATE(created_at) = :date
        `,
          {
            replacements: { eventType: eventTypeMap[stage], date: yesterday },
            type: 'SELECT',
          },
        )) as any[];

        // Calculate conversion rate from previous stage
        let conversionRate: number | null = null;
        if (i > 0) {
          const prevStage = stages[i - 1];
          const prevMetric = await this.funnelMetricModel.findOne({
            where: { date: yesterday, stage: prevStage },
          });
          if (prevMetric && prevMetric.unique_users > 0) {
            conversionRate = (countResult?.unique_users || 0) / prevMetric.unique_users;
          }
        }

        await this.funnelMetricModel.upsert({
          date: yesterday,
          stage,
          count: countResult?.count || 0,
          unique_users: countResult?.unique_users || 0,
          conversion_rate: conversionRate,
          cohort_week: cohortWeek,
        });
      }

      this.logger.log('Daily funnel metrics calculated successfully');
    } catch (error) {
      this.logger.error('Failed to calculate funnel metrics', error);
    }
  }

  /**
   * Update user engagement scores (runs every hour)
   */
  @Cron(CronExpression.EVERY_HOUR)
  async updateEngagementScores(): Promise<void> {
    this.logger.log('Updating user engagement scores...');

    try {
      // Get all active users
      const users = await this.userModel.findAll({
        where: { is_active: true },
        attributes: ['id'],
      });

      for (const user of users) {
        await this.calculateUserEngagement(user.id);
      }

      this.logger.log(`Updated engagement scores for ${users.length} users`);
    } catch (error) {
      this.logger.error('Failed to update engagement scores', error);
    }
  }

  /**
   * Calculate engagement score for a single user
   */
  private async calculateUserEngagement(userId: string): Promise<void> {
    // Get user metrics
    const [matchStats, aiChatStats, messageStats] = await Promise.all([
      this.matchModel.findAll({
        where: {
          [Op.or]: [{ user_a_id: userId }, { user_b_id: userId }],
        },
        attributes: ['status'],
        raw: true,
      }),
      // BUG-122 FIX: Use ConversationStatusEnum.COMPLETED instead of 'closed'
      this.aiConversationModel.count({
        where: {
          [Op.or]: [{ user_a_id: userId }, { user_b_id: userId }],
          status: ConversationStatusEnum.COMPLETED,
        },
      }),
      this.messageModel.count({
        where: { sender_id: userId },
      }),
    ]);

    const totalMatches = matchStats.length;
    const approvedMatches = matchStats.filter((m: any) => m.status === 'approved').length;
    const approvalRate = totalMatches > 0 ? approvedMatches / totalMatches : 0;

    // Calculate last activity
    const lastEvent = await this.analyticsEventModel.findOne({
      where: { user_id: userId },
      order: [['created_at', 'DESC']],
      attributes: ['created_at'],
    });

    const daysSinceLastActivity = lastEvent
      ? Math.floor((Date.now() - new Date(lastEvent.created_at).getTime()) / (1000 * 60 * 60 * 24))
      : null;

    // Calculate engagement score (0-100)
    let engagementScore = 0;
    engagementScore += Math.min(approvedMatches * 5, 25); // Max 25 points from approvals
    engagementScore += Math.min(aiChatStats * 10, 30); // Max 30 points from AI chats
    engagementScore += Math.min(messageStats * 2, 25); // Max 25 points from messages
    engagementScore += approvalRate * 20; // Max 20 points from approval rate

    // Decay for inactivity
    if (daysSinceLastActivity && daysSinceLastActivity > 7) {
      engagementScore *= Math.max(0.5, 1 - (daysSinceLastActivity - 7) * 0.05);
    }

    // Determine activity level
    let activityLevel: ActivityLevelEnum;
    if (daysSinceLastActivity && daysSinceLastActivity > 30) {
      activityLevel = ActivityLevelEnum.DORMANT;
    } else if (engagementScore >= 80) {
      activityLevel = ActivityLevelEnum.POWER_USER;
    } else if (engagementScore >= 60) {
      activityLevel = ActivityLevelEnum.HIGH;
    } else if (engagementScore >= 40) {
      activityLevel = ActivityLevelEnum.MEDIUM;
    } else {
      activityLevel = ActivityLevelEnum.LOW;
    }

    await this.engagementScoreModel.upsert({
      user_id: userId,
      engagement_score: engagementScore,
      activity_level: activityLevel,
      days_since_last_activity: daysSinceLastActivity,
      total_matches_received: totalMatches,
      total_matches_approved: approvedMatches,
      total_ai_chats_completed: aiChatStats,
      total_messages_sent: messageStats,
      approval_rate: approvalRate,
      last_calculated_at: new Date(),
    });
  }

  private getDateDaysAgo(days: number): string {
    const date = new Date();
    date.setDate(date.getDate() - days);
    return date.toISOString().split('T')[0];
  }

  private getWeekNumber(date: Date): string {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
    return `${d.getUTCFullYear()}-${String(weekNo).padStart(2, '0')}`;
  }
}
