import { Controller, Post, Body, Res, UseGuards, Request, HttpCode } from '@nestjs/common';
import { ApiTags, ApiResponse, ApiBody, ApiBearerAuth } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { AuthService } from 'src/modules/auth/auth.service';
import { RESPONSES } from 'src/common/responses';

/**
 * Tight rate limit for code-issuing auth endpoints.
 * 5 requests per 60-second window per client IP (requires `trust proxy`
 * so req.ip reflects the real client, not CloudFront's edge IP).
 * Blocks OTP enumeration / brute-force reset-code attacks while staying
 * well under what a legitimate user would ever need.
 */
const AUTH_SENSITIVE_THROTTLE = { default: { limit: 5, ttl: 60_000 } } as const;
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
  @Throttle(AUTH_SENSITIVE_THROTTLE)
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
    const { user } = response;
    // OTP is never returned in the HTTP response body regardless of env.
    // Local dev can read the code from backend logs or the DB if inbox
    // access isn't available. This closes the response-body side channel
    // entirely instead of relying on NODE_ENV being set correctly.
    return {
      user: {
        id: user.id,
        first_name: user.first_name,
        last_name: user.last_name,
        email: user.email,
        is_email_verified: user.is_email_verified,
        role: user.role,
      },
      email_verification_code: null,
      expires_at: null,
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
  @Throttle(AUTH_SENSITIVE_THROTTLE)
  async resendVerification(
    @Body() body: ResendVerificationDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const response = await this.authService.resendVerificationCode(body.email);
    // OTP never returned in the HTTP response regardless of env — email is
    // the only channel. See signup() for rationale.
    return {
      ...response,
      email_verification_code: null,
      expires_at: null,
    };
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
  @Throttle(AUTH_SENSITIVE_THROTTLE)
  async signIn(@Body() signinDto: SigninDto, @Request() req, @Res({ passthrough: true }) res: Response) {
    const response = await this.authService.signin(signinDto, req.clientMetadata);

    if (response.access_token)
      res.cookie('access_token', response.access_token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 96 * 60 * 60 * 1000,
      });

    // Signin for an unverified user returns a fresh email_verification_code
    // alongside user data. Never echo the OTP in the HTTP response — email
    // is the only legitimate channel for delivery.
    if ((response as any).email_verification_code) {
      return {
        ...response,
        email_verification_code: null,
        expires_at: null,
      };
    }

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
    @Request() req,
    @Res({ passthrough: true }) res: Response,
  ) {
    const response = await this.authService.googleSignIn(googleSigninDto, req.clientMetadata);
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
  @Throttle(AUTH_SENSITIVE_THROTTLE)
  async forgotPassword(@Body() dto: ForgotPasswordDto, @Res({ passthrough: true }) res: Response) {
    const response = await this.authService.forgotPassword(dto.email);
    // Reset code never echoed in the HTTP response — the only way to learn
    // it is by receiving the email. This, combined with the per-IP rate
    // limit above, closes the enumeration + code-harvest attack surface.
    return {
      ...response,
      password_reset_code: null,
      expires_at: null,
    };
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
