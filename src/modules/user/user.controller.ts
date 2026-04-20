/**
 * User Controller
 * Handles push tokens and notification settings for mobile app
 *
 * Endpoints:
 * - POST /users/me/push-token - Register push notification token
 * - DELETE /users/me/push-token - Unregister push token (logout)
 * - GET /users/me/notification-settings - Get notification preferences
 * - PATCH /users/me/notification-settings - Update notification preferences
 * - DELETE /users/me - Initiate account deletion (Apr-20 F/u 45;
 *   satisfies Apple Guideline 5.1.1(v) + Google Play account-deletion policy).
 *   Soft-deletes immediately; hard-delete after 30-day grace via scheduler sweeper.
 */

import {
  Controller,
  Post,
  Delete,
  Get,
  Patch,
  Body,
  UseInterceptors,
  ClassSerializerInterceptor,
  UseGuards,
  Request,
  HttpCode,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { UserService } from 'src/modules/user/user.service';
import {
  RegisterPushTokenDto,
  RegisterPushTokenResponseDto,
  UnregisterPushTokenResponseDto,
} from './dto/push-token.dto';
import {
  NotificationSettingsDto,
  UpdateNotificationSettingsDto,
} from './dto/notification-settings.dto';

@ApiTags('Users')
@Controller('users')
@UseInterceptors(ClassSerializerInterceptor)
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
export class UserController {
  constructor(private readonly userService: UserService) {}

  // ============================================================
  // PUSH NOTIFICATIONS
  // ============================================================

  /**
   * Register a push notification token for the authenticated user
   * Called from mobile app on startup after getting Expo push token
   */
  @Post('me/push-token')
  @HttpCode(200)
  @ApiOperation({ summary: 'Register push notification token' })
  @ApiResponse({
    status: 200,
    description: 'Token registered successfully',
    type: RegisterPushTokenResponseDto,
  })
  async registerPushToken(
    @Request() req,
    @Body() dto: RegisterPushTokenDto,
  ): Promise<RegisterPushTokenResponseDto> {
    const userId = req.user.id;
    return this.userService.registerPushToken(userId, dto);
  }

  /**
   * Unregister push token(s) for the authenticated user
   * Called from mobile app on logout
   */
  @Delete('me/push-token')
  @HttpCode(200)
  @ApiOperation({ summary: 'Unregister push notification token' })
  @ApiResponse({
    status: 200,
    description: 'Token unregistered successfully',
    type: UnregisterPushTokenResponseDto,
  })
  async unregisterPushToken(@Request() req): Promise<UnregisterPushTokenResponseDto> {
    const userId = req.user.id;
    return this.userService.unregisterPushToken(userId);
  }

  // ============================================================
  // NOTIFICATION SETTINGS
  // ============================================================

  /**
   * Get notification settings for the authenticated user
   */
  @Get('me/notification-settings')
  @ApiOperation({ summary: 'Get notification preferences' })
  @ApiResponse({
    status: 200,
    description: 'Notification settings retrieved',
    type: NotificationSettingsDto,
  })
  async getNotificationSettings(@Request() req): Promise<NotificationSettingsDto> {
    const userId = req.user.id;
    return this.userService.getNotificationSettings(userId);
  }

  /**
   * Update notification settings for the authenticated user
   */
  @Patch('me/notification-settings')
  @HttpCode(200)
  @ApiOperation({ summary: 'Update notification preferences' })
  @ApiResponse({
    status: 200,
    description: 'Notification settings updated',
    type: NotificationSettingsDto,
  })
  async updateNotificationSettings(
    @Request() req,
    @Body() dto: UpdateNotificationSettingsDto,
  ): Promise<NotificationSettingsDto> {
    const userId = req.user.id;
    return this.userService.updateNotificationSettings(userId, dto);
  }

  // ============================================================
  // ACCOUNT DELETION
  // ============================================================

  /**
   * Initiate user-requested account deletion.
   *
   * Soft-deletes the user immediately (sets `deleted_at`); JWT strategy
   * blocks soft-deleted users at next request so existing tokens become
   * invalid. Full hard-delete of the user row + all related data happens
   * after a 30-day grace window via SchedulerService sweeper. User can
   * reactivate within that window by replying to the confirmation email.
   *
   * Idempotent: calling on an already-soft-deleted user returns the
   * existing `scheduled_hard_delete` timestamp.
   *
   * Required by Apple Guideline 5.1.1(v) + Google Play account-deletion
   * policy. See Analyses/account-deletion-spec.md (Apr-20 F/u 43).
   */
  @Delete('me')
  @HttpCode(200)
  @ApiOperation({ summary: 'Delete current user account (30-day soft-delete window)' })
  @ApiResponse({
    status: 200,
    description: 'Deletion initiated',
  })
  async deleteMyAccount(@Request() req): Promise<{
    success: true;
    message: string;
    scheduled_hard_delete: string;
    already_initiated: boolean;
  }> {
    const userId = req.user.id;
    const { scheduledHardDelete, alreadyInitiated } =
      await this.userService.initiateAccountDeletion(userId);

    return {
      success: true,
      message: alreadyInitiated
        ? 'Account deletion already in progress. Full deletion will complete on the scheduled date.'
        : 'Your account has been deactivated. Full deletion will complete in 30 days. Check your email for reactivation instructions.',
      scheduled_hard_delete: scheduledHardDelete.toISOString(),
      already_initiated: alreadyInitiated,
    };
  }
}
