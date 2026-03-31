import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectModel } from '@nestjs/sequelize';
import { Op } from 'sequelize';
import { Sequelize } from 'sequelize-typescript';
import { MailService } from 'src/modules/mail/mail.service';
import { AIServiceFacade } from 'src/integration/ai-service/ai-service.facade';
import { UserSummaries } from 'src/common/entities/user-summaries.entity';
import { EMAIL_JOB_EXECUTION_TIME_IN_DAYS, EMAIL_JOB_CRON_EXPRESSION } from 'src/common/constants';

@Injectable()
export class SchedulerService {
  private readonly logger = new Logger(SchedulerService.name);
  constructor(
    private readonly mailService: MailService,
    private readonly aiService: AIServiceFacade,
    @InjectModel(UserSummaries)
    private readonly userSummariesModel: typeof UserSummaries,
    private readonly sequelize: Sequelize,
  ) {}

  /**
   * matchesFoundEmailCron
   * ---------------------
   * - Runs every N days at 00:00:00 UTC.
   * - N is defined by EMAIL_JOB_EXECUTION_TIME_IN_DAYS (1–7).
   * - Example:
   *   N = 1 -> "0 0 0 * * *"  (every day at midnight)
   *   N = 3 -> '0 0 0 *'/'3 * *" (every 3rd day at midnight)
   */
  //@Cron(EMAIL_JOB_CRON_EXPRESSION, {
  @Cron('0 0 1,5,9,13,17,21 * * *', {
    timeZone: 'UTC',
  })
  async matchesFoundEmilCron() {
    this.logger.log(`=+=+=+=+=+ MATCHES SUMMARY CRON =+=+=+=+=+`);
    // Optional: safety log so you can verify config at runtime
    // this.logger.debug(`interval_days = ${EMAIL_JOB_EXECUTION_TIME_IN_DAYS}`);
    this.logger.debug(`interval_hours = 1`); //${EMAIL_JOB_EXECUTION_TIME_IN_DAYS}`);

    try {
      await this.mailService.enqueueWeeklyMatchSummaryEmails(
        Number(EMAIL_JOB_EXECUTION_TIME_IN_DAYS),
      );
    } catch (error) {
      // Better message to match what this cron actually does
      this.logger.warn(`Failed to enqueue weekly match summary emails: ${error.message}`);
    }
  }

  /**
   * freshnessDecayCron
   * ------------------
   * Runs daily at 2:00 AM UTC.
   * Decays freshness_score for all user summaries based on last_active_at.
   * - Active today: 1.0
   * - Active 1-3 days ago: 0.8
   * - Active 4-7 days ago: 0.6
   * - Active 1-2 weeks ago: 0.4
   * - Active 2-4 weeks ago: 0.2
   * - Inactive 4+ weeks: 0.1
   */
  @Cron('0 0 2 * * *', { timeZone: 'UTC' })
  async freshnessDecayCron() {
    this.logger.log('=+=+=+=+=+ FRESHNESS DECAY CRON =+=+=+=+=+');
    try {
      const [, updated] = await this.sequelize.query(`
        UPDATE user_summaries SET freshness_score = CASE
          WHEN last_active_at >= NOW() - INTERVAL '1 day' THEN 1.0
          WHEN last_active_at >= NOW() - INTERVAL '3 days' THEN 0.8
          WHEN last_active_at >= NOW() - INTERVAL '7 days' THEN 0.6
          WHEN last_active_at >= NOW() - INTERVAL '14 days' THEN 0.4
          WHEN last_active_at >= NOW() - INTERVAL '28 days' THEN 0.2
          ELSE 0.1
        END
        WHERE freshness_score IS NOT NULL
      `);
      this.logger.log(`Freshness decay updated`);
    } catch (error: any) {
      this.logger.warn(`Freshness decay failed: ${error.message}`);
    }
  }

  @Cron('0 0 3 * * *', {
    // Once daily at 3:00 AM UTC (reduced from every 4 hours)
    // Inline matching handles new users immediately on onboarding.
    // This cron is a safety net for admin imports, embedding changes, etc.
    // It was blocking the AI service for minutes when processing 100+ users.
    timeZone: 'UTC',
  })
  async matchingCycleCron() {
    this.logger.log(`=+=+=+=+=+ TRIGGER MATCH CYCLE CRON (DAILY) =+=+=+=+=+`);
    try {
      await this.aiService.triggerMatchCycle();
      this.logger.debug(`Match cycle triggered`);
    } catch (error: any) {
      this.logger.warn(`Failed to run match cycle cron: ${error.message}`);
    }
  }
}
