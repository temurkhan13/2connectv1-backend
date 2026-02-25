/**
 * NotificationService
 * -------------------
 * Purpose: Manage user FCM tokens and send push notifications via Firebase Admin.
 * Summary:
 *  - saveFcmToken(userId, token): Store or append an FCM token for a user.
 *  - getFcmTokens(userId): Fetch all saved FCM tokens for a user.
 *  - removeFcmTokens(userId, tokensToRemove): Remove invalid or outdated tokens for a user.
 *  - sendToUser(token, title, body, data): Send a single push notification to one token.
 *  - sendToUser(userId, tokens, title, body, data): Send push notifications to multiple tokens and clean invalid ones.
 */

import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { UserFcmToken } from 'src/common/entities/user-fcm-token.entity';

import * as admin from 'firebase-admin';

// Permanent failure error codes that indicate the token must be removed
const PERMANENT_ERROR_CODES = new Set<string>([
  'messaging/invalid-registration-token',
  'messaging/registration-token-not-registered',
]);

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(@InjectModel(UserFcmToken) private readonly userFcmTokenModel: typeof UserFcmToken) {}

  /**
   * saveFcmToken
   * ------------
   * Summary: Insert a new row if none exists for the user; otherwise append the token if not present.
   * Returns: true on success.
   */
  async saveFcmToken(userId: string, token: string) {
    this.logger.log(`----- SAVE FCM TOKEN -----`);
    this.logger.log({ user_id: userId });
    // Look up the user's existing token record
    const row = await this.userFcmTokenModel.findOne({
      where: {
        user_id: userId,
      },
      rejectOnEmpty: false,
      raw: true,
      nest: true,
    });

    // Log existing row for traceability
    this.logger.log({ existing_fcm_token: row });

    // If no record exists, create one with the provided token
    if (!row) {
      await this.userFcmTokenModel.create({
        user_id: userId,
        tokens: [token],
      });
      return true;
    }

    // If record exists and token is new, add it and persist
    if (!row.tokens?.includes(token)) {
      const updated = Array.from(new Set([...(row.tokens ?? []), token]));
      await this.userFcmTokenModel.update(
        {
          tokens: updated,
        },
        {
          where: {
            id: row.id,
          },
        },
      );
    }

    // Always return true to indicate the operation completed
    return true;
  }

  /**
   * getFcmTokens
   * ------------
   * Summary: Fetch the list of FCM tokens saved for a user.
   * Returns: string[] of tokens (empty array if none).
   */
  async getFcmTokens(userId: string) {
    // Read only the tokens attribute for the user
    const row = await this.userFcmTokenModel.findOne({
      where: {
        user_id: userId,
      },
      attributes: ['tokens'],
      order: [['created_at', 'DESC']],
      raw: true,
      nest: true,
    });

    // Return tokens or an empty array if not found
    return row?.tokens ?? [];
  }

  /**
   * removeFcmTokens
   * ---------------
   * Summary: Remove specific tokens from a user's record, usually after permanent send failures.
   * Returns: number of tokens removed.
   */
  async removeFcmTokens(userId: string, tokensToRemove: string[]) {
    // If nothing to remove, exit early
    if (!tokensToRemove?.length) return 0;

    // Fetch the user's token row as an instance so we can call instance.update()
    const row: any = await this.userFcmTokenModel.findOne({
      where: { user_id: userId },
      rejectOnEmpty: false,
      raw: false, // use instance for instance.update()
      nest: true,
    });

    // If no row or no tokens, nothing to remove
    if (!row || !Array.isArray(row.tokens) || row.tokens.length === 0) return 0;

    // Build the kept token list by excluding tokensToRemove
    const before = row.tokens.length;
    const removeSet = new Set(tokensToRemove);
    const kept = row.tokens.filter((t: string) => !removeSet.has(t));

    // If nothing changed, return zero removed
    if (kept.length === before) return 0;

    // Persist the filtered token list
    await row.update({ tokens: kept });

    // Return how many tokens were removed
    return before - kept.length;
  }

  /**
   * sendToToken
   * -----------
   * Summary: Send a push notification to a single device token.
   * Returns: { messageId } on success; throws on failure.
   */
  // async sendToToken(
  //   userId: string,
  //   title: string,
  //   body: string,
  //   data: Record<string, string> = {},
  // ) {
  //   try {
  //     // Send a single message with notification and optional data payload
  //     const tokens = await this.getFcmTokens(userId);
  //     if (!Array.isArray(tokens) || tokens.length === 0) {
  //       return true;
  //     }
  //     const res = await this.sendToUser(userId, tokens, title, body, data);

  //     // const res = await admin.messaging().send({
  //     //   token,
  //     //   notification: { title, body },
  //     //   data,
  //     //   android: { priority: 'high' },
  //     //   apns: { payload: { aps: { sound: 'default' } } },
  //     // });

  //     // Return the Firebase message id
  //     return { messageId: res };
  //   } catch (e: any) {
  //     // Propagate the error to the caller
  //     throw e;
  //   }
  // }

  /**
   * sendToUser
   * ----------
   * Summary: Send a push notification to multiple tokens, then remove any invalid ones from storage.
   * Returns: { success, sent, failed, removed } counts.
   */
  async sendToUser(userId: string, title: string, body: string, data: Record<string, string> = {}) {
    this.logger.log(`--- SEND TO USER ---`);
    this.logger.log({ user_id: userId });
    this.logger.log({ data });
    const tokens = await this.getFcmTokens(userId);
    if (!Array.isArray(tokens) || tokens.length === 0) {
      return true;
    }
    this.logger.log({ tokens });
    // Send to many tokens in one call
    const res = await admin.messaging().sendEachForMulticast({
      tokens,
      notification: { title, body },
      data,
    });
    this.logger.log({ res_from_fcm: res });

    // Identify tokens that failed with permanent error codes
    const toRemove: string[] = [];
    res.responses.forEach((r, idx) => {
      if (!r.success && r.error && PERMANENT_ERROR_CODES.has(r.error.code)) {
        toRemove.push(tokens[idx]);
      }
    });

    // Remove invalid tokens from storage and record how many were removed
    let removed = 0;
    if (toRemove.length) {
      removed = await this.removeFcmTokens(userId, toRemove);
    }

    // Return aggregated send results
    return {
      success: true,
      sent: res.successCount,
      failed: res.failureCount,
      removed,
    };
  }
}
