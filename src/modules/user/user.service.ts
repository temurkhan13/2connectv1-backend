/**
 * User Service
 * Handles push token and notification settings management
 */

import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { PushToken } from 'src/common/entities/push-token.entity';
import { NotificationSettings } from 'src/common/entities/notification-settings.entity';
import {
  RegisterPushTokenDto,
  RegisterPushTokenResponseDto,
  UnregisterPushTokenResponseDto,
} from './dto/push-token.dto';
import { NotificationSettingsDto, UpdateNotificationSettingsDto } from './dto/notification-settings.dto';

@Injectable()
export class UserService {
  private readonly logger = new Logger(UserService.name);

  constructor(
    @InjectModel(PushToken) private pushTokenModel: typeof PushToken,
    @InjectModel(NotificationSettings) private notificationSettingsModel: typeof NotificationSettings,
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
}
