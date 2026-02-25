import { Body, Controller, Get, HttpCode, Post, Request, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { Roles } from 'src/common/decorators/roles.decorator';
import { RoleEnum } from 'src/common/enums';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { RESPONSES } from 'src/common/responses';
import { AdminAuthService } from 'src/modules/super-admin/auth/auth.service';
import { AdminLoginDto } from 'src/modules/super-admin/auth/dto/login.dto';

/**
 * AdminAuthController
 * -------------------
 * Purpose:
 * - Expose admin-only authentication endpoints.
 *
 * Summary:
 * - All endpoints require ADMIN role verification.
 * - Uses DTOs for validation and Swagger decorators for API documentation.
 * - Sets/clears an HTTP-only "access_token" cookie.
 * - Uses `@Res({ passthrough: true })` for cookie handling while returning JSON.
 * - Delegates business logic to AdminAuthService (controller stays thin).
 */
@ApiTags('Admin Authentication')
@Controller('admin/auth')
export class AdminAuthController {
  constructor(private readonly adminAuthService: AdminAuthService) {}

  /**
   * Admin login endpoint.
   * Sets an HTTP-only cookie and returns user + access_token.
   */
  @Post('login')
  @HttpCode(200)
  @ApiBody({ type: AdminLoginDto })
  @ApiResponse({
    status: RESPONSES.adminLoginSuccess.code,
    description: RESPONSES.adminLoginSuccess.message,
    example: RESPONSES.adminLoginSuccess,
  })
  @ApiResponse({
    status: RESPONSES.adminLoginInvalidCredentials.code,
    description: RESPONSES.adminLoginInvalidCredentials.message,
    example: RESPONSES.adminLoginInvalidCredentials,
  })
  async login(@Body() dto: AdminLoginDto, @Res({ passthrough: true }) res: Response) {
    const response = await this.adminAuthService.login(dto, res);
    return response;
  }

  /**
   * Admin logout endpoint.
   * Clears the access_token cookie.
   */
  @Post('logout')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RoleEnum.ADMIN)
  @ApiBearerAuth()
  @ApiResponse({
    status: RESPONSES.adminLogoutSuccess.code,
    description: RESPONSES.adminLogoutSuccess.message,
    example: RESPONSES.adminLogoutSuccess,
  })
  @ApiResponse({
    status: RESPONSES.adminAccessDenied.code,
    description: RESPONSES.adminAccessDenied.message,
    example: RESPONSES.adminAccessDenied,
  })
  logout(@Request() req, @Res({ passthrough: true }) res: Response) {
    return this.adminAuthService.logout(res);
  }

  /**
   * Check Token validity
   * - Protected by JwtAuthGuard and RolesGuard. If the token is invalid/expired/malformed the guard
   *   will throw a 401 error automatically.
   * - On success returns HTTP 200 with result: true (wrapped by ResponseInterceptor).
   */
  @Get('check-token')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiBearerAuth()
  @ApiResponse({
    status: 200,
    description: 'Token is valid',
    example: { code: 200, message: 'success', result: true },
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - invalid or expired token',
  })
  checkToken() {
    return { result: true };
  }
}
