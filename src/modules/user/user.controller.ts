/**
 * User Controller
 * Handles push tokens and notification settings for mobile app
 *
 * Endpoints:
 * - POST /users/me/push-token - Register push notification token
 * - DELETE /users/me/push-token - Unregister push token (logout)
 * - GET /users/me/notification-settings - Get notification preferences
 * - PATCH /users/me/notification-settings - Update notification preferences
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
}
