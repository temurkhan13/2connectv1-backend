/**
 * Push Token DTOs
 * For registering and managing Expo push notification tokens
 */

import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsEnum, IsOptional, IsUUID } from 'class-validator';

export class RegisterPushTokenDto {
  @ApiProperty({
    example: 'ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]',
    description: 'Expo push notification token from the mobile app',
  })
  @IsNotEmpty()
  @IsString()
  token: string;

  @ApiProperty({
    example: 'ios',
    enum: ['ios', 'android'],
    description: 'Mobile platform',
  })
  @IsNotEmpty()
  @IsEnum(['ios', 'android'])
  platform: 'ios' | 'android';

  @ApiProperty({
    example: 'ios-tablet-abc123def456',
    description: 'Unique device identifier for token management',
  })
  @IsNotEmpty()
  @IsString()
  deviceId: string;
}

export class RegisterPushTokenResponseDto {
  @ApiProperty({ example: true })
  success: boolean;

  @ApiProperty({ example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' })
  tokenId: string;
}

export class UnregisterPushTokenResponseDto {
  @ApiProperty({ example: true })
  success: boolean;
}
