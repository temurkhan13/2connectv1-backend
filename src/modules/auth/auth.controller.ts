import { Controller, Post, Body, Res, UseGuards, Request, HttpCode } from '@nestjs/common';
import { ApiTags, ApiResponse, ApiBody, ApiBearerAuth } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import type { Response } from 'express';
import { AuthService } from 'src/modules/auth/auth.service';
import { RESPONSES } from 'src/common/responses';
import {
  SigninDto,
  SignupDto,
  GoogleSigninDto,
  AppleSigninDto,
  ForgotPasswordDto,
  ResetPasswordDto,
  UpdatePasswordDto,
  VerifyEmailDto,
  ResendVerificationDto,
  VerifyResetPasswordCodeDto,
} from 'src/modules/auth/dto/auth.dto';

/**
 * AuthController
 * --------------
 * Purpose:
 * - Expose public authentication endpoints for signup, signin, Google signin,
 *   email verification, password reset, password update, and logout.
 *
 * Summary:
 * - Uses DTOs for validation and Swagger decorators for docs.
 * - Sets/clears an HTTP-only "access_token" cookie where needed.
 * - Uses `@Res({ passthrough: true })` so cookies can be set while returning JSON.
 * - Delegates business logic to AuthService; controller stays thin.
 */
@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /**
   * Email/password signup.
   * Returns safe user fields and email verification metadata.
   */
  @Post('signup')
  @ApiBody({ type: SignupDto })
  @ApiResponse({
    status: RESPONSES.signupSuccessResponse.code,
    description: RESPONSES.signupSuccessResponse.message,
    example: RESPONSES.signupSuccessResponse,
  })
  @ApiResponse({
    status: RESPONSES.signupAccountALreadyExistsResponse.code,
    description: RESPONSES.signupAccountALreadyExistsResponse.message,
    example: RESPONSES.signupAccountALreadyExistsResponse,
  })
  async register(@Body() signupDto: SignupDto, @Res({ passthrough: true }) res: Response) {
    const response = await this.authService.register(signupDto);
    const { user, email_verification_code, expires_at } = response;

    return {
      user: {
        id: user.id,
        first_name: user.first_name,
        last_name: user.last_name,
        email: user.email,
        is_email_verified: user.is_email_verified,
        role: user.role,
      },
      email_verification_code:
        process.env.NODE_ENV === 'production' ? null : email_verification_code,
      expires_at: process.env.NODE_ENV === 'production' ? null : expires_at,
    };
  }

  /**
   * Verify email using the received code.
   */
  @Post('verify-email')
  @HttpCode(200)
  @ApiBody({ type: VerifyEmailDto })
  @ApiResponse({
    status: RESPONSES.verifyEmailSuccessResponse.code,
    description: RESPONSES.verifyEmailSuccessResponse.message,
    example: RESPONSES.verifyEmailSuccessResponse,
  })
  @ApiResponse({
    status: RESPONSES.verifyEmailCodeExpiredResponse.code,
    description: RESPONSES.verifyEmailCodeExpiredResponse.message,
    example: RESPONSES.verifyEmailCodeExpiredResponse,
  })
  async verifyEmail(@Body() dto: VerifyEmailDto, @Res({ passthrough: true }) res: Response) {
    const response = await this.authService.verifyEmail(dto.email, dto.code);
    return response;
  }

  /**
   * Resend email verification code.
   */
  @Post('resend-email-verification-code')
  @HttpCode(200)
  @ApiBody({ type: ResendVerificationDto })
  @ApiResponse({
    status: RESPONSES.resendVerificationCodeSuccess.code,
    description: RESPONSES.resendVerificationCodeSuccess.message,
    example: RESPONSES.resendVerificationCodeSuccess,
  })
  @ApiResponse({
    status: RESPONSES.resendVerificationCodeEmailAlreadyVerified.code,
    description: RESPONSES.resendVerificationCodeEmailAlreadyVerified.message,
    example: RESPONSES.resendVerificationCodeEmailAlreadyVerified,
  })
  async resendVerification(
    @Body() body: ResendVerificationDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const response = await this.authService.resendVerificationCode(body.email);
    return response;
  }

  /**
   * Email/password signin.
   * Sets an HTTP-only cookie and returns the service response.
   */
  @Post('signin')
  @HttpCode(200)
  @ApiBody({ type: SigninDto })
  @ApiResponse({
    status: RESPONSES.signinSuccess.code,
    description: RESPONSES.signinSuccess.message,
    example: RESPONSES.signinSuccess,
  })
  @ApiResponse({
    status: RESPONSES.signinIncorrectCredentials.code,
    description: RESPONSES.signinIncorrectCredentials.message,
    example: RESPONSES.signinIncorrectCredentials,
  })
  async signIn(@Body() signinDto: SigninDto, @Res({ passthrough: true }) res: Response) {
    const response = await this.authService.signin(signinDto);

    if (response.access_token)
      res.cookie('access_token', response.access_token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 96 * 60 * 60 * 1000,
      });

    return response;
  }

  /**
   * Google sign-in/up.
   * Sets an HTTP-only cookie and returns a minimal user payload.
   */
  @Post('google-signin')
  @HttpCode(200)
  @ApiBody({ type: GoogleSigninDto })
  @ApiResponse({
    status: RESPONSES.googleSigninSuccess.code,
    description: RESPONSES.googleSigninSuccess.message,
    example: RESPONSES.googleSigninSuccess,
  })
  async googleSignin(
    @Body() googleSigninDto: GoogleSigninDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const response = await this.authService.googleSignIn(googleSigninDto);
    const {
      user,
      access_token,
      // googleData
    } = response;

    res.cookie('access_token', access_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 96 * 60 * 60 * 1000,
    });

    return {
      user: {
        id: user.id,
        first_name: user.first_name,
        last_name: user.last_name,
        email: user.email,
        role: {
          id: user.role?.id,
          title: user.role?.title,
        },
      },
      access_token,
      // googleData,
    };
  }

  /**
   * Apple sign-in/up.
   * Sets an HTTP-only cookie and returns a minimal user payload.
   */
  @Post('apple-signin')
  @HttpCode(200)
  @ApiBody({ type: AppleSigninDto })
  @ApiResponse({
    status: 200,
    description: 'Apple sign-in successful',
  })
  async appleSignin(
    @Body() appleSigninDto: AppleSigninDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const response = await this.authService.appleSignIn(appleSigninDto);
    const { user, access_token } = response;

    res.cookie('access_token', access_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 96 * 60 * 60 * 1000,
    });

    return {
      user: {
        id: user.id,
        first_name: user.first_name,
        last_name: user.last_name,
        email: user.email,
        role: user.role,
      },
      access_token,
    };
  }

  /**
   * Forgot password: send code or link to email.
   */
  @Post('forgot-password')
  @HttpCode(200)
  @ApiBody({ type: ForgotPasswordDto })
  @ApiResponse({
    status: RESPONSES.forgotPassworduccess.code,
    description: RESPONSES.forgotPassworduccess.message,
    example: RESPONSES.forgotPassworduccess,
  })
  async forgotPassword(@Body() dto: ForgotPasswordDto, @Res({ passthrough: true }) res: Response) {
    const response = await this.authService.forgotPassword(dto.email);
    return response;
  }

  /**
   * Verify the code sent for resetting password.
   */
  @Post('verify-reset-password-code')
  @HttpCode(200)
  @ApiBody({ type: VerifyResetPasswordCodeDto })
  @ApiResponse({
    status: RESPONSES.verifyResetPasswordCodeSuccess.code,
    description: RESPONSES.verifyResetPasswordCodeSuccess.message,
    example: RESPONSES.verifyResetPasswordCodeSuccess,
  })
  @ApiResponse({
    status: RESPONSES.verifyResetPasswordCodeFailure.code,
    description: RESPONSES.verifyResetPasswordCodeFailure.message,
    example: RESPONSES.verifyResetPasswordCodeFailure,
  })
  async verifyResetPasswordCode(
    @Body() dto: VerifyResetPasswordCodeDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const response = await this.authService.verifyResetPasswordCode(dto.email, dto.code);
    return response;
  }

  /**
   * Reset password using a short-lived token (guard = 'temp-jwt').
   */
  @Post('reset-password')
  @HttpCode(200)
  @UseGuards(AuthGuard('temp-jwt'))
  @ApiBearerAuth()
  @ApiBody({ type: ResetPasswordDto })
  @ApiResponse({
    status: RESPONSES.resetPasswordSuccess.code,
    description: RESPONSES.resetPasswordSuccess.message,
    example: RESPONSES.resetPasswordSuccess,
  })
  async resetPassword(
    @Request() req,
    @Body() dto: ResetPasswordDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const userId = req.user.id;
    const response = await this.authService.resetPassword(userId, dto.password);
    return response;
  }

  /**
   * Update password for authenticated users (guard = 'jwt').
   */
  @Post('update-password')
  @HttpCode(200)
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiBody({ type: UpdatePasswordDto })
  @ApiResponse({
    status: RESPONSES.updatePasswordSuccess.code,
    description: RESPONSES.updatePasswordSuccess.message,
    example: RESPONSES.updatePasswordSuccess,
  })
  @ApiResponse({
    status: RESPONSES.updatePasswordIncorrectCreds.code,
    description: RESPONSES.updatePasswordIncorrectCreds.message,
    example: RESPONSES.updatePasswordIncorrectCreds,
  })
  async updatePassword(
    @Request() req,
    @Body() dto: UpdatePasswordDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const userId = req.user.id;
    const response = await this.authService.updatePassword(
      userId,
      dto.current_password,
      dto.new_password,
    );
    return response;
  }

  /**
   * Logout current session by clearing the access token cookie.
   */
  @Post('logout')
  @HttpCode(200)
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiResponse({
    status: RESPONSES.logoutSuccess.code,
    description: RESPONSES.logoutSuccess.message,
    example: RESPONSES.logoutSuccess,
  })
  async logout(@Request() req, @Res({ passthrough: true }) res: Response) {
    const userId = req.user.id;
    res.clearCookie('access_token', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
    });
    await this.authService.logout(userId);
    return true;
  }
}
