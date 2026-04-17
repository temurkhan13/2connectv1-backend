import { Processor, Process } from '@nestjs/bull';
import type { Job } from 'bull';
import type { WeeklyMatchEmailJobPayload } from 'src/modules/mail/mail.service';
import { MailService } from 'src/modules/mail/mail.service';
import { Logger } from '@nestjs/common';

@Processor('weekly-match-email')
export class WeeklyMatchEmailProcessor {
  private readonly logger = new Logger(WeeklyMatchEmailProcessor.name);

  constructor(private readonly mailService: MailService) {}

  /**
   * Process each job in 'weekly_match_summary' queue.
   * This runs in background worker.
   */
  @Process('weekly_match_summary')
  async handleWeeklyMatchSummary(job: Job<WeeklyMatchEmailJobPayload>): Promise<void> {
    this.logger.log(`||||| HANDLE WEEKLY MATCH JOB PROCESSOR |||||`);
    const { email, firstName, count, primaryCount, adjacentCount, userId } = job.data;
    this.logger.log({ email, first_name: firstName, count, primaryCount, adjacentCount, userId });

    this.logger.log(
      `Sending weekly match summary to ${email} (count=${count} primary=${primaryCount ?? 'n/a'} adjacent=${adjacentCount ?? 'n/a'})`,
    );

    const ok = await this.mailService.sendWeeklyMatchSummaryEmail(
      email,
      firstName,
      count,
      primaryCount,
      adjacentCount,
      userId,
    );

    if (!ok) {
      this.logger.error(`Failed to send weekly summary to ${email}`);
    }
  }
}
