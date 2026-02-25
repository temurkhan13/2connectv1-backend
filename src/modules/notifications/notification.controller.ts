/**
 * FcmController
 * --------------
 * Purpose: Handle notification-related endpoints for saving FCM tokens and sending push messages.
 * Summary:
 *  - POST /notification/save-fcm-token: Save the current user's FCM token.
 *  - POST /notification/send-token: Send a push notification to a specific FCM token (to be deleted after testing, not to be included in prod).
 */

import { Controller, Post, Body, UseGuards, Request, Res, HttpCode } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBody, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { NotificationService } from 'src/modules/notifications/notification.service';
import { saveFcmTokenDto } from 'src/modules/notifications/dto/notification.dto';
import { RESPONSES } from 'src/common/responses';

@Controller('notification')
export class FcmController {
  // Service used for saving tokens and sending notifications
  constructor(private readonly notificationService: NotificationService) {}

  @Post('save-fcm-token') // POST /notification/save-fcm-token
  @HttpCode(200) // Responds with HTTP 200 on success
  @UseGuards(AuthGuard('jwt')) // Requires a valid JWT
  @ApiBearerAuth() // Swagger: Bearer auth header
  @ApiBody({ type: saveFcmTokenDto }) // Swagger: request body schema
  @ApiResponse({
    status: RESPONSES.saveFcmTokenSucccess.code,
    description: RESPONSES.saveFcmTokenSucccess.message,
    example: RESPONSES.saveFcmTokenSucccess,
  })
  async saveFcmToken(@Request() req, @Body() dto: saveFcmTokenDto) {
    const userId = req.user.id;
    const response = this.notificationService.saveFcmToken(userId, dto.token);
    return response;
  }

  // @Post('send-token') // POST /notification/send-token
  // @HttpCode(200) // Responds with HTTP 200 on success
  // async sendToUser(
  //   @Body() body: { userId: string; title: string; body: string; data?: Record<string, string> }, // Target token and payload
  // ) {
  //   // Dispatch a notification to the provided token
  //   return this.notificationService.sendToUser(body.userId, body.title, body.body, body.data || {});
  // }
}
