import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString, MinLength, Matches, Length } from 'class-validator';

export class SigninDto {
  @ApiProperty({ example: 'john.doe@example.com' })
  @IsNotEmpty()
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'Password123!' })
  @IsNotEmpty()
  password: string;
}

export class SignupDto {
  @ApiProperty({ example: 'John' })
  @IsNotEmpty()
  @IsString()
  @Matches(/^[a-zA-Z]+$/, { message: 'First name must contain only letters' })
  first_name: string;

  @ApiProperty({ example: 'Doe' })
  @IsNotEmpty()
  @IsString()
  @Matches(/^[a-zA-Z]+$/, { message: 'Last name must contain only letters' })
  last_name: string;

  @ApiProperty({ example: 'john.doe@example.com' })
  @IsNotEmpty()
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'Password123!' })
  @IsNotEmpty()
  @MinLength(8)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/, {
    message:
      'Password must contain at least one uppercase letter, one lowercase letter, one number and one special character',
  })
  password: string;
}

export class GoogleSigninDto {
  @ApiProperty({ description: 'Google OAuth2 token' })
  @IsNotEmpty()
  @IsString()
  token: string;
}

export class ForgotPasswordDto {
  @ApiProperty({ example: 'john.doe@example.com', description: 'User email address' })
  @IsEmail()
  email: string;
}

export class ResetPasswordDto {
  @ApiProperty({ example: 'newStrongPassword123', description: 'New password for the account' })
  @IsNotEmpty()
  @MinLength(8)
  password: string;
}

export class ResendVerificationDto {
  @ApiProperty({ example: 'john.doe@example.com' })
  @IsEmail()
  @IsNotEmpty()
  email: string;
}

export class UpdatePasswordDto {
  @ApiProperty({
    example: 'Password123!',
    description: 'The current password of the user',
  })
  @IsString()
  current_password: string;

  @ApiProperty({
    example: 'NewStrongPassword456!',
    description: 'The new password (must be at least 8 characters long)',
    minLength: 8,
  })
  @IsString()
  @MinLength(8)
  new_password: string;
}

export class VerifyEmailDto {
  @ApiProperty({ example: 'test@example.com', description: 'Email of the user' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: '1234', description: '4-digit OTP code received by email' })
  @IsNotEmpty()
  @Length(4, 4)
  code: string;
}

export class VerifyResetPasswordCodeDto {
  @ApiProperty({ example: 'test@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: '1234', description: '4 digit code' })
  @IsString()
  @Length(4, 4)
  code: string;
}
