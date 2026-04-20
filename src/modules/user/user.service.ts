/**
 * User Service
 * Handles push token and notification settings management
 */

import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { PushToken } from 'src/common/entities/push-token.entity';
import { NotificationSettings } from 'src/common/entities/notification-settings.entity';
import { User } from 'src/common/entities/user.entity';
import { MailService } from 'src/modules/mail/mail.service';
import {
  RegisterPushTokenDto,
  RegisterPushTokenResponseDto,
  UnregisterPushTokenResponseDto,
} from './dto/push-token.dto';
import { NotificationSettingsDto, UpdateNotificationSettingsDto } from './dto/notification-settings.dto';

/**
 * Grace period (days) between user-initiated soft-delete and permanent
 * hard-delete by the SchedulerService sweeper. Both Apple (5.1.1(v)) and
 * Google Play policy accept a 30-day window; industry standard.
 */
const ACCOUNT_HARD_DELETE_GRACE_DAYS = Number(
  process.env.ACCOUNT_HARD_DELETE_GRACE_DAYS || '30',
);

@Injectable()
export class UserService {
  private readonly logger = new Logger(UserService.name);

  constructor(
    @InjectModel(PushToken) private pushTokenModel: typeof PushToken,
    @InjectModel(NotificationSettings) private notificationSettingsModel: typeof NotificationSettings,
    @InjectModel(User) private userModel: typeof User,
    private readonly mailService: MailService,
  ) {}

  /**
   * Register a push notification token for the user
   * Replaces existing token for the same device_id (user may reinstall app)
   */
  async registerPushToken(
    userId: string,
    dto: RegisterPushTokenDto,
  ): Promise<RegisterPushTokenResponseDto> {
    this.logger.log(`Registering push token for user ${userId}, device: ${dto.deviceId}`);

    // Upsert: update if exists, insert if not
    const [pushToken, created] = await this.pushTokenModel.upsert(
      {
        user_id: userId,
        device_id: dto.deviceId,
        token: dto.token,
        platform: dto.platform,
        updated_at: new Date(),
      },
      {
        returning: true,
      },
    );

    this.logger.log(
      `Push token ${created ? 'created' : 'updated'} for user ${userId}: ${dto.token.substring(0, 30)}...`,
    );

    return {
      success: true,
      tokenId: pushToken.id,
    };
  }

  /**
   * Unregister all push tokens for the user (called on logout)
   */
  async unregisterPushToken(userId: string): Promise<UnregisterPushTokenResponseDto> {
    this.logger.log(`Unregistering push tokens for user ${userId}`);

    const count = await this.pushTokenModel.destroy({
      where: { user_id: userId },
    });

    this.logger.log(`Deleted ${count} push token(s) for user ${userId}`);

    return { success: true };
  }

  /**
   * Get notification settings for the user
   * Creates default settings if they don't exist
   */
  async getNotificationSettings(userId: string): Promise<NotificationSettingsDto> {
    let settings = await this.notificationSettingsModel.findByPk(userId);

    // Create default settings if not exist
    if (!settings) {
      settings = await this.notificationSettingsModel.create({
        user_id: userId,
        push_enabled: true,
        email_enabled: true,
        match_notifications: true,
        message_notifications: true,
        weekly_digest: true,
      });
      this.logger.log(`Created default notification settings for user ${userId}`);
    }

    return this.mapSettingsToDto(settings);
  }

  /**
   * Update notification settings for the user
   */
  async updateNotificationSettings(
    userId: string,
    dto: UpdateNotificationSettingsDto,
  ): Promise<NotificationSettingsDto> {
    let settings = await this.notificationSettingsModel.findByPk(userId);

    // Create if not exists
    if (!settings) {
      settings = await this.notificationSettingsModel.create({
        user_id: userId,
        push_enabled: dto.pushEnabled ?? true,
        email_enabled: dto.emailEnabled ?? true,
        match_notifications: dto.matchNotifications ?? true,
        message_notifications: dto.messageNotifications ?? true,
        weekly_digest: dto.weeklyDigest ?? true,
      });
    } else {
      // Update only provided fields
      const updateData: any = {};
      if (dto.pushEnabled !== undefined) updateData.push_enabled = dto.pushEnabled;
      if (dto.emailEnabled !== undefined) updateData.email_enabled = dto.emailEnabled;
      if (dto.matchNotifications !== undefined) updateData.match_notifications = dto.matchNotifications;
      if (dto.messageNotifications !== undefined) updateData.message_notifications = dto.messageNotifications;
      if (dto.weeklyDigest !== undefined) updateData.weekly_digest = dto.weeklyDigest;

      await settings.update(updateData);
      await settings.reload();
    }

    this.logger.log(`Updated notification settings for user ${userId}`);
    return this.mapSettingsToDto(settings);
  }

  /**
   * Get all push tokens for a user (for sending notifications)
   */
  async getPushTokensForUser(userId: string): Promise<PushToken[]> {
    return this.pushTokenModel.findAll({
      where: { user_id: userId },
    });
  }

  /**
   * Map database entity to DTO (snake_case to camelCase)
   */
  private mapSettingsToDto(settings: NotificationSettings): NotificationSettingsDto {
    return {
      pushEnabled: settings.push_enabled,
      emailEnabled: settings.email_enabled,
      matchNotifications: settings.match_notifications,
      messageNotifications: settings.message_notifications,
      weeklyDigest: settings.weekly_digest,
    };
  }

  // ============================================================
  // ACCOUNT DELETION (Apple 5.1.1(v) + Google Play policy)
  // ============================================================

  /**
   * Initiate user-requested account deletion.
   *
   * Flow:
   *  1. Soft-delete the user row via paranoid: true (sets deleted_at).
   *     JWT strategy already blocks soft-deleted users at next request
   *     (auth/jwt.strategy.ts:94), so tokens become invalid naturally.
   *  2. Unregister push tokens so no more notifications go to the device.
   *  3. Send confirmation email via SES with reactivation instructions.
   *  4. Return the scheduled hard-delete timestamp for caller to show user.
   *
   * Hard-delete of all related data happens via a SchedulerService sweeper
   * (~ACCOUNT_HARD_DELETE_GRACE_DAYS later). Until then user may reactivate
   * by replying to the confirmation email (support-team-only restoration).
   *
   * Idempotent: deleting an already-soft-deleted user returns the existing
   * scheduled_hard_delete instead of restarting the window.
   *
   * See Analyses/account-deletion-spec.md (Apr-20 F/u 43).
   */
  async initiateAccountDeletion(userId: string): Promise<{
    scheduledHardDelete: Date;
    alreadyInitiated: boolean;
  }> {
    // Find user — INCLUDE soft-deleted rows so we handle the idempotent case
    const user = await this.userModel.findByPk(userId, { paranoid: false });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const deletedAt = (user as any).deleted_at as Date | null;
    if (deletedAt) {
      // Already soft-deleted — return existing scheduled window
      const scheduledHardDelete = new Date(
        deletedAt.getTime() + ACCOUNT_HARD_DELETE_GRACE_DAYS * 24 * 60 * 60 * 1000,
      );
      this.logger.log(
        `Account deletion already initiated for user ${userId} at ${deletedAt.toISOString()} — returning existing schedule`,
      );
      return { scheduledHardDelete, alreadyInitiated: true };
    }

    const email = user.email;
    const firstName = (user as any).first_name as string | undefined;

    // 1) Soft-delete (paranoid: true handles this — just sets deleted_at)
    await user.destroy();
    this.logger.log(`Soft-deleted user ${userId} (email=${email})`);

    // 2) Unregister push tokens
    try {
      await this.unregisterPushToken(userId);
    } catch (e) {
      const err = e as Error;
      this.logger.warn(
        `Push token unregister failed for ${userId}: ${err.message} — deletion proceeds`,
      );
    }

    // 3) Schedule + send confirmation email (fire-and-forget — mail failure
    //    must not reverse the soft-delete)
    const scheduledHardDelete = new Date(
      Date.now() + ACCOUNT_HARD_DELETE_GRACE_DAYS * 24 * 60 * 60 * 1000,
    );

    (async () => {
      try {
        await this.mailService.sendAccountDeletionConfirmation(email, {
          firstName,
          scheduledHardDelete,
        });
      } catch (mailErr) {
        const e = mailErr as Error;
        this.logger.warn(
          `Account deletion confirmation email failed for ${email}: ${e.message} — deletion remains in effect`,
        );
      }
    })();

    this.logger.log(
      `Account deletion initiated: user=${userId}, scheduled_hard_delete=${scheduledHardDelete.toISOString()}`,
    );

    return { scheduledHardDelete, alreadyInitiated: false };
  }

  /**
   * Reactivate a soft-deleted user account (support-team action).
   * No public endpoint — triggered manually from an admin context after
   * the user replies to the deletion confirmation email.
   */
  async reactivateAccount(userId: string): Promise<void> {
    await this.userModel.restore({ where: { id: userId } });
    this.logger.log(`Reactivated user ${userId} — clearing deleted_at`);
  }
}
