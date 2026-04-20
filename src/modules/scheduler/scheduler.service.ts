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

  /**
   * Detect ignored matches — pending for 7+ days with no user action.
   * Appends match_ignored event to analytics_events for tracking.
   */
  @Cron('0 0 5 * * *', { timeZone: 'UTC' })
  async detectIgnoredMatches() {
    this.logger.log('=+=+=+=+=+ DETECT IGNORED MATCHES CRON =+=+=+=+=+');
    try {
      const [rows] = await this.sequelize.query(`
        INSERT INTO analytics_events (id, user_id, event_type, event_category, event_data, created_at)
        SELECT
          gen_random_uuid(),
          CASE WHEN m.user_a_decision IS NULL OR m.user_a_decision = 'pending' THEN m.user_a_id ELSE m.user_b_id END,
          'match_ignored',
          'matching',
          jsonb_build_object('match_id', m.id, 'days_pending', EXTRACT(DAY FROM NOW() - m.created_at)::int),
          NOW()
        FROM matches m
        WHERE m.status = 'pending'
        AND m.created_at < NOW() - INTERVAL '7 days'
        AND m.id NOT IN (
          SELECT (event_data->>'match_id')::uuid FROM analytics_events WHERE event_type = 'match_ignored'
        )
      `);
      this.logger.log(`Detected ignored matches`);
    } catch (error: any) {
      this.logger.warn(`Detect ignored matches failed: ${error.message}`);
    }
  }

  /**
   * Detect ghosted matches — approved for 7+ days but no conversation started.
   * Appends match_ghosted event to analytics_events for tracking.
   */
  @Cron('0 30 5 * * *', { timeZone: 'UTC' })
  async detectGhostedMatches() {
    this.logger.log('=+=+=+=+=+ DETECT GHOSTED MATCHES CRON =+=+=+=+=+');
    try {
      const [rows] = await this.sequelize.query(`
        INSERT INTO analytics_events (id, user_id, event_type, event_category, event_data, created_at)
        SELECT
          gen_random_uuid(),
          m.user_a_id,
          'match_ghosted',
          'matching',
          jsonb_build_object('match_id', m.id, 'days_since_approval', EXTRACT(DAY FROM NOW() - m.updated_at)::int),
          NOW()
        FROM matches m
        WHERE m.status = 'approved'
        AND m.user_to_user_conversation = false
        AND m.updated_at < NOW() - INTERVAL '7 days'
        AND m.id NOT IN (
          SELECT (event_data->>'match_id')::uuid FROM analytics_events WHERE event_type = 'match_ghosted'
        )
      `);
      this.logger.log(`Detected ghosted matches`);
    } catch (error: any) {
      this.logger.warn(`Detect ghosted matches failed: ${error.message}`);
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

  /**
   * hardDeleteAccountSweeper
   * ------------------------
   * Daily at 3:30 AM UTC — completes the account-deletion flow started
   * when a user taps "Delete my account" (UserService.initiateAccountDeletion).
   *
   * Flow:
   *  1. Find users soft-deleted more than 30 days ago
   *     (`users.deleted_at <= NOW() - INTERVAL '30 days'`)
   *  2. For each: discover all FK references to users.id dynamically
   *     (same pattern as Apr-20 F/u 40 `tools/_delete_test_users.py` —
   *     guarantees no table is missed as schema evolves), plus 2 known
   *     non-FK tables with `user_id` column (`onboarding_answers`,
   *     `user_embeddings`)
   *  3. Run transactional hard-delete — all related rows, then the
   *     user row itself with raw SQL (bypasses paranoid: true on User
   *     entity so the row is really gone, not just further soft-deleted)
   *  4. Log per-user outcome
   *
   * Apple Guideline 5.1.1(v) + Google Play account-deletion policy
   * require that user data is actually removed within a reasonable
   * timeframe. 30 days is industry standard and matches our in-app
   * messaging ("Full deletion will complete in 30 days").
   *
   * Safe to run daily: if no eligible users, no-op in ~200ms.
   * See Analyses/account-deletion-spec.md + [[Apr-20]] F/u 48.
   */
  @Cron('0 30 3 * * *', { timeZone: 'UTC' })
  async hardDeleteAccountSweeper() {
    this.logger.log('=+=+=+=+=+ HARD DELETE ACCOUNT SWEEPER CRON =+=+=+=+=+');

    const graceDays = Number(process.env.ACCOUNT_HARD_DELETE_GRACE_DAYS || '30');

    try {
      // 1) Find users whose soft-delete is older than grace window
      const [usersResult] = await this.sequelize.query(
        `SELECT id, email FROM users
         WHERE deleted_at IS NOT NULL
         AND deleted_at <= NOW() - INTERVAL '${graceDays} days'`,
      );
      const users = usersResult as Array<{ id: string; email: string }>;

      if (users.length === 0) {
        this.logger.log(`No accounts eligible for hard-delete (grace=${graceDays} days).`);
        return;
      }

      this.logger.log(
        `Found ${users.length} account(s) eligible for hard-delete (soft-deleted >=${graceDays}d ago).`,
      );

      // 2) Discover all FK references to users.id dynamically
      const [fkRefsResult] = await this.sequelize.query(
        `SELECT tc.table_name, kcu.column_name
         FROM information_schema.table_constraints tc
         JOIN information_schema.key_column_usage kcu
           ON tc.constraint_name = kcu.constraint_name
         JOIN information_schema.constraint_column_usage ccu
           ON ccu.constraint_name = tc.constraint_name
         WHERE tc.constraint_type = 'FOREIGN KEY'
           AND ccu.table_name = 'users'
           AND ccu.column_name = 'id'
         ORDER BY tc.table_name`,
      );
      const fkRefs = fkRefsResult as Array<{ table_name: string; column_name: string }>;

      // Non-FK tables that also have user_id (discovered in F/u 40)
      const nonFkTables: Array<{ table: string; column: string }> = [
        { table: 'onboarding_answers', column: 'user_id' },
        { table: 'user_embeddings', column: 'user_id' },
      ];

      let usersDeleted = 0;
      let usersFailed = 0;
      const failedIds: string[] = [];

      // 3) Per-user transactional hard-delete
      for (const user of users) {
        try {
          await this.sequelize.transaction(async (t) => {
            // Delete from all FK-referenced tables
            for (const fk of fkRefs) {
              await this.sequelize.query(
                `DELETE FROM "${fk.table_name}" WHERE "${fk.column_name}"::text = :userId`,
                { replacements: { userId: user.id }, transaction: t },
              );
            }

            // Delete from non-FK tables (tolerate missing tables across envs)
            for (const { table, column } of nonFkTables) {
              try {
                await this.sequelize.query(
                  `DELETE FROM "${table}" WHERE "${column}"::text = :userId`,
                  { replacements: { userId: user.id }, transaction: t },
                );
              } catch (e: any) {
                if (!String(e?.message || '').includes('does not exist')) throw e;
              }
            }

            // Finally hard-delete the user row itself (bypasses paranoid)
            await this.sequelize.query(
              `DELETE FROM users WHERE id = :userId`,
              { replacements: { userId: user.id }, transaction: t },
            );
          });
          usersDeleted++;
          this.logger.log(
            `Hard-deleted user ${user.id.slice(0, 8)} (email=${user.email}) + all related data.`,
          );
        } catch (err: any) {
          usersFailed++;
          failedIds.push(user.id);
          this.logger.warn(
            `Hard-delete FAILED for user ${user.id.slice(0, 8)} (email=${user.email}): ${err?.message}`,
          );
        }
      }

      this.logger.log(
        `Hard-delete sweeper complete: ${usersDeleted}/${users.length} deleted, ${usersFailed} failed${
          usersFailed > 0 ? ' (ids=' + failedIds.join(',') + ')' : ''
        }.`,
      );
    } catch (error: any) {
      this.logger.warn(`Hard-delete sweeper failed: ${error?.message}`);
    }
  }
}
