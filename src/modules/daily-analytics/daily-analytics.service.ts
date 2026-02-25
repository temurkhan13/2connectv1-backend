import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Sequelize } from 'sequelize-typescript';
import { Transaction, UniqueConstraintError } from 'sequelize';
import { DailyAnalytics } from 'src/common/entities/daily-analytics.entity';

/**
 * DailyAnalyticsService
 * ---------------------
 * Purpose:
 * - Maintain simple daily counters (signups, logins, matches, etc.) in a DATEONLY table.
 *
 * Summary:
 * - Exposes a single helper `bumpToday(column, { by, transaction })` to atomically increment
 *   today's counter. Handles first-write wins and concurrent requests safely.
 * - Uses a unique constraint on (date) to avoid duplicate rows and handles races via retry.
 * - Works inside an existing Sequelize transaction if provided.
 */

/**
 * List of counters we allow incrementing.
 * Keep this in sync with DailyAnalytics numeric columns.
 */
const COUNTER_COLUMNS = [
  'signups', // done
  'logins', // done
  'onboarding_completed', // done
  'summaries_created', // done
  'personas_created', // done
  'matches_total', // done
  'matches_approved', // done
  'matches_declined', // done
  'matches_ai_rejected', // done
  'matches_ai_accepted', // done
  'conversations_ai_to_ai', // done
  'conversations_user_to_user', // done
  'perfect_matches',
] as const;
type CounterColumn = (typeof COUNTER_COLUMNS)[number];

@Injectable()
export class DailyAnalyticsService {
  constructor(
    @InjectModel(DailyAnalytics) private dailyModel: typeof DailyAnalytics,
    private readonly sequelize: Sequelize,
  ) {}

  /**
   * Summary: Return today's date string in UTC as 'YYYY-MM-DD' (matches DATEONLY).
   * Inputs: none.
   * Returns: string (UTC date).
   */
  private todayUTC(): string {
    return new Date().toISOString().slice(0, 10);
  }

  /**
   * Summary: Increment today's value of a given counter column.
   * Inputs:
   * - column: one of the allowed counter column names.
   * - opts?: { by?: number; transaction?: Transaction }
   * Returns: DailyAnalytics row for today (after increment).
   *
   * Flow:
   *  0) Validate inputs (column is allowed; `by` is a positive integer).
   *  1) Try to increment today's row (no-op if it doesn't exist yet).
   *  2) Read today's row; if found, return it.
   *  3) If not found, create it with the starting value.
   *  4) If a race created it first (UniqueConstraintError), increment and return.
   */
  async bumpToday(
    column: CounterColumn,
    opts?: { by?: number; transaction?: Transaction },
  ): Promise<DailyAnalytics> {
    const tx = opts?.transaction;
    const by = Number.isFinite(opts?.by) ? Number(opts!.by) : 1;
    const today = this.todayUTC();

    // 0) Validate column and amount
    if (!COUNTER_COLUMNS.includes(column)) {
      throw new Error(`Unsupported analytics column: ${column}`);
    }
    if (!Number.isInteger(by) || by <= 0) {
      throw new Error(`'by' must be a positive integer`);
    }

    // 1) Try to increment existing row (if exists)
    await this.dailyModel.increment(column, {
      by,
      where: { date: today },
      transaction: tx,
    });

    // 2) If the row exists, return it; if not, we'll create it
    let row = await this.dailyModel.findOne({ where: { date: today }, transaction: tx });
    if (row) return row;

    // 3) Create the row for today (first writer sets initial value)
    try {
      row = await this.dailyModel.create({ date: today, [column]: by } as any, { transaction: tx });
      return row;
    } catch (err) {
      // 4) Another request created it in between: increment again and return
      if (err instanceof UniqueConstraintError) {
        await this.dailyModel.increment(column, { by, where: { date: today }, transaction: tx });
        const existing = await this.dailyModel.findOne({ where: { date: today }, transaction: tx });
        return existing!;
      }
      throw err;
    }
  }
}
