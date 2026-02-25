import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsDefined, IsUUID } from 'class-validator';

export class SetUserActivationDto {
  @ApiProperty({
    description: 'UUID of the target user (optional, can be provided in URL param instead)',
    required: false,
  })
  @IsDefined()
  @IsUUID()
  user_id?: string;

  @ApiProperty({ description: 'Whether the user should be active (true) or deactivated (false)' })
  @IsDefined()
  @IsBoolean()
  is_active: boolean;
}
