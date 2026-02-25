import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsUUID } from 'class-validator';

/**
 * UserDetailDto
 * ---------------
 * Purpose:
 * - Validate user detail API route parameter.
 *
 * Summary:
 * - User ID must be a valid UUID
 */
export class UserDetailDto {
  @ApiProperty({
    example: '9bee8425-8acb-4c12-8631-9e609ef4c4fb',
    description: 'User ID (UUID)',
  })
  @IsNotEmpty()
  @IsUUID()
  id: string;
}
