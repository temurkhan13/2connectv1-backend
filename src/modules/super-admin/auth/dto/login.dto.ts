import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString } from 'class-validator';

/**
 * AdminLoginDto
 * -------------
 * Purpose:
 * - Validate admin login credentials (email + password).
 *
 * Summary:
 * - Email must be a valid email format.
 * - Password is required as a string (bcrypt comparison done server-side).
 */
export class AdminLoginDto {
  @ApiProperty({ example: 'admin@2connect.ai', description: 'Admin email address' })
  @IsNotEmpty()
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'Password1@', description: 'Admin password' })
  @IsNotEmpty()
  @IsString()
  password: string;
}
