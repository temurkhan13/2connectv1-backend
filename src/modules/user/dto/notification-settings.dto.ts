/**
 * Notification Settings DTOs
 * For managing user notification preferences
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';

export class NotificationSettingsDto {
  @ApiProperty({ example: true, description: 'Master switch for push notifications' })
  pushEnabled: boolean;

  @ApiProperty({ example: true, description: 'Master switch for email notifications' })
  emailEnabled: boolean;

  @ApiProperty({ example: true, description: 'Receive notifications for new matches' })
  matchNotifications: boolean;

  @ApiProperty({ example: true, description: 'Receive notifications for new messages' })
  messageNotifications: boolean;

  @ApiProperty({ example: true, description: 'Receive weekly digest email' })
  weeklyDigest: boolean;
}

export class UpdateNotificationSettingsDto {
  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  pushEnabled?: boolean;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  emailEnabled?: boolean;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  matchNotifications?: boolean;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  messageNotifications?: boolean;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  weeklyDigest?: boolean;
}
