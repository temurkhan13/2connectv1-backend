import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Sequelize } from 'sequelize-typescript';
import { Transaction } from 'sequelize';
import { UserActivityLog } from 'src/common/entities/user-activity-log.entity';
import { UserActivityEventsEnum } from 'src/common/enums';

/**
 * UserActivityLogsService
 * -----------------------
 * Purpose:
 * - Provide a single place to write user activity events into the USER_ACTIVITY_LOGS table.
 * - Keep activity logging consistent and transaction-aware.
 *
 * How it works:
 * - The service receives an event type and a user id.
 * - It writes a row with event type, event time, and timestamps.
 * - It uses the passed Sequelize transaction to keep the log write in the same unit of work.
 */
@Injectable()
export class UserActivityLogsService {
  /**
   * Dependencies:
   * - userActivityLogsModel: Sequelize model for USER_ACTIVITY_LOGS table.
   * - sequelize: Sequelize instance (available for advanced needs; not used directly here).
   */
  constructor(
    @InjectModel(UserActivityLog) private userActivityLogsModel: typeof UserActivityLog,
    private readonly sequelize: Sequelize,
  ) {}

  /**
   * insertActivityLog
   * -----------------
   * Summary:
   * - Inserts a single activity log row for the given user and event.
   *
   * Parameters:
   * - event: UserActivityEventsEnum — the kind of activity (e.g., signup, login).
   * - userId: string — the user who performed the activity.
   * - transaction: Transaction — transaction context to ensure atomicity with the caller flow.
   *
   * Flow:
   * 1) Capture current timestamp.
   * 2) Create a new log record with user_id, event_type, event_time, created_at.
   * 3) Persist using the provided transaction.
   */
  async insertActivityLog(event: UserActivityEventsEnum, userId: string, transaction: Transaction) {
    const tx = transaction; // use caller-provided transaction so this write commits/rolls back with the caller
    const now = new Date(); // single timestamp for consistent fields

    await this.userActivityLogsModel.create(
      {
        user_id: userId, // who performed the activity
        event_type: event, // what happened
        event_time: now, // when the event happened (business time)
        created_at: now, // insert timestamp
      },
      { transaction: tx }, // participate in the same transaction
    );
  }
}
