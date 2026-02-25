import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectModel } from '@nestjs/sequelize';
import * as bcrypt from 'bcrypt';
import type { Response } from 'express';
import { User } from 'src/common/entities/user.entity';
import { RoleEnum } from 'src/common/enums';
import { AdminLoginDto } from 'src/modules/super-admin/auth/dto/login.dto';

/**
 * AdminAuthService
 * -----------------
 * Purpose:
 * - Handle admin-only authentication: login, logout, token generation.
 *
 * Summary:
 * - Validates admin credentials (email + password via bcrypt).
 * - Ensures user has the ADMIN role.
 * - Issues JWT access tokens (96h expiry) stored in HTTP-only cookies.
 * - Provides logout functionality (cookie clearing).
 * - Never leaks user existence in error messages (security best practice).
 *
 * Key responsibilities:
 * - Admin signin: validate role, verify password, issue JWT.
 * - Token generation and cookie management.
 * - Sanitized response payload (no sensitive fields).
 */
@Injectable()
export class AdminAuthService {
  private readonly logger = new Logger(AdminAuthService.name);

  constructor(
    @InjectModel(User) private readonly userModel: typeof User,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Admin login.
   * Summary:
   * - Finds user by email with role association.
   * - Verifies role is ADMIN (401 if not).
   * - Compares password using bcrypt (401 if mismatch).
   * - Issues JWT and returns user + token.
   *
   * Inputs: dto (email, password), res (Express response to set cookie).
   * Returns: { user, access_token }.
   * Throws: UnauthorizedException on invalid credentials or wrong role.
   */
  async login(dto: AdminLoginDto, res: Response) {
    // Fetch user with role association
    const user = await this.userModel.findOne({
      where: { email: dto.email },
      include: [{ all: true }],
    });

    // Validate user exists and has admin role
    // eslint-disable-next-line @typescript-eslint/no-unsafe-enum-comparison
    if (!user || user.role?.title !== RoleEnum.ADMIN) {
      this.logger.warn(`Unauthorized admin login attempt: ${dto.email}`);
      throw new UnauthorizedException('Invalid email or password');
    }

    // Validate password
    const isPasswordValid = await bcrypt.compare(dto.password, user.password);
    if (!isPasswordValid) {
      this.logger.warn(`Failed admin password attempt: ${dto.email}`);
      throw new UnauthorizedException('Invalid email or password');
    }

    // Generate JWT token
    const payload = { sub: user.id, email: user.email, role: user.role.title };
    const access_token = this.jwtService.sign(payload);

    // Set HTTP-only cookie
    res.cookie('access_token', access_token, {
      httpOnly: true,
      secure: this.configService.get('NODE_ENV') === 'production',
      sameSite: 'strict',
      maxAge: 96 * 60 * 60 * 1000, // 96 hours
    });

    this.logger.log(`Admin login successful: ${user.email}`);

    // Return sanitized user data + token
    return {
      user: {
        id: user.id,
        email: user.email,
        first_name: user.first_name,
        last_name: user.last_name,
        role: user.role,
      },
      access_token,
    };
  }

  /**
   * Admin logout.
   * Summary:
   * - Clears the access_token cookie.
   * - Logs logout event.
   * Returns: true on success.
   */
  logout(res: Response): boolean {
    res.clearCookie('access_token', {
      httpOnly: true,
      secure: this.configService.get('NODE_ENV') === 'production',
      sameSite: 'strict',
    });

    this.logger.log('Admin logout successful');
    return true;
  }
}
