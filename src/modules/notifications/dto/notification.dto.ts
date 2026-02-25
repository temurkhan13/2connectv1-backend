export class CreateMeDto {}
import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty } from 'class-validator';

export class saveFcmTokenDto {
  @ApiProperty({ example: 'fcm_token' })
  @IsNotEmpty()
  token: string;
}
