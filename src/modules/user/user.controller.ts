/**
 * User Controller
 * Handles notification settings, tours, and account deletion for mobile app
 *
 * Endpoints:
 * - GET /users/me/notification-settings - Get notification preferences
 * - PATCH /users/me/notification-settings - Update notification preferences
 * - GET /users/me/tours - Read per-user product-tour completion map
 * - POST /users/me/tours/:name/complete - Mark a tour as seen (idempotent)
 * - DELETE /users/me - Initiate account deletion (Apr-20 F/u 45;
 *   satisfies Apple Guideline 5.1.1(v) + Google Play account-deletion policy).
 *   Soft-deletes immediately; hard-delete after 30-day grace via scheduler sweeper.
 *
 * FCM token register + unregister live on FcmController at /notification/*.
 */

import {
  Controller,
  Delete,
  Get,
  Post,
  Patch,
  Param,
  Body,
  UseInterceptors,
  ClassSerializerInterceptor,
  UseGuards,
  Request,
  HttpCode,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { UserService } from 'src/modules/user/user.service';
import {
  NotificationSettingsDto,
  UpdateNotificationSettingsDto,
} from './dto/notification-settings.dto';
import {
  TourNameParamDto,
  TOUR_NAMES,
  ToursSeenResponseDto,
  MarkTourCompleteResponseDto,
} from './dto/tours.dto';

@ApiTags('Users')
@Controller('users')
@UseInterceptors(ClassSerializerInterceptor)
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
export class UserController {
  constructor(private readonly userService: UserService) {}

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
  // PRODUCT TOURS
  // ============================================================

  /**
   * Read the per-user tour-completion map for the authenticated user.
   * Empty `{}` for users who've never completed any tour.
   */
  @Get('me/tours')
  @HttpCode(200)
  @ApiOperation({ summary: 'Get product-tour completion map' })
  @ApiResponse({
    status: 200,
    description: 'Tour completion map',
    type: ToursSeenResponseDto,
  })
  async getTours(@Request() req): Promise<ToursSeenResponseDto> {
    const userId = req.user.id;
    const toursSeen = await this.userService.getToursSeen(userId);
    return { tours_seen: toursSeen };
  }

  /**
   * Mark a product tour as completed for the authenticated user.
   * Idempotent: repeat calls preserve the first completion timestamp.
   * `:name` must be one of the closed TOUR_NAMES set.
   */
  @Post('me/tours/:name/complete')
  @HttpCode(200)
  @ApiOperation({ summary: 'Mark a product tour as seen (idempotent)' })
  @ApiParam({ name: 'name', enum: TOUR_NAMES })
  @ApiResponse({
    status: 200,
    description: 'Tour completion recorded',
    type: MarkTourCompleteResponseDto,
  })
  async markTourComplete(
    @Request() req,
    @Param() params: TourNameParamDto,
  ): Promise<MarkTourCompleteResponseDto> {
    const userId = req.user.id;
    const completedAt = await this.userService.markTourComplete(userId, params.name);
    return { success: true, completed_at: completedAt };
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
