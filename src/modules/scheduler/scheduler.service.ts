import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { MailService } from 'src/modules/mail/mail.service';
import { AIServiceFacade } from 'src/integration/ai-service/ai-service.facade';
import { EMAIL_JOB_EXECUTION_TIME_IN_DAYS, EMAIL_JOB_CRON_EXPRESSION } from 'src/common/constants';

@Injectable()
export class SchedulerService {
  private readonly logger = new Logger(SchedulerService.name);
  constructor(
    private readonly mailService: MailService,
    private readonly aiService: AIServiceFacade,
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

  @Cron('0 0 */4 * * *', {
    // every 4 hours
    timeZone: 'UTC',
  })
  async matchingCycleCron() {
    this.logger.log(`=+=+=+=+=+ TRIGGER MATCH CYCLE CRON =+=+=+=+=+`);
    try {
      await this.aiService.triggerMatchCycle();
      this.logger.debug(`Match cycle triggered`);
    } catch (error: any) {
      this.logger.warn(`Failed to run match cycle cron: ${error.message}`);
    }
  }
}
