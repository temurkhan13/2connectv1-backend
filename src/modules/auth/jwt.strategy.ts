import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AccountNotActiveException } from 'src/modules/auth/exceptions/auth.exceptions';
import { User } from 'src/common/entities/user.entity';
import { Role } from 'src/common/entities/role.entity';

/**
 * JwtStrategy
 * -----------
 * Purpose:
 * - Verify incoming JWTs and attach a minimal user snapshot to `req.user`.
 *
 * Summary:
 * - Reads token from `Authorization: Bearer ...` or an httpOnly `access_token` cookie.
 * - Uses HMAC secret from env and rejects expired tokens.
 * - After token verification, loads user+role and blocks inactive/unknown users.
 * - Keeps the attached user object small and safe (no sensitive fields).
 */

type JwtPayload = {
  sub: string; // user id (required)
  email?: string;
  iat?: number; // issued at (seconds)
  exp?: number; // expiration (seconds)
};

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  /**
   * Summary: Configure how to extract and verify JWTs.
   * Inputs: ConfigService (for secrets and optional iss/aud).
   * Returns: n/a (calls super with strategy options).
   */
  constructor(private configService: ConfigService) {
    super({
      // 1) Where to read the token from (Bearer header → cookie fallback)
      jwtFromRequest: ExtractJwt.fromExtractors([
        (req: any) => {
          // a) Try Authorization header
          const authHeader = req?.headers?.authorization;
          if (authHeader && authHeader.startsWith('Bearer ')) {
            // SECURITY: never log raw tokens
            return authHeader.slice(7);
          }
          // b) Try httpOnly cookie (for browser flows)
          const cookieToken = req?.cookies?.access_token;
          if (cookieToken) return cookieToken;

          // c) No token found → let Passport handle as unauthorized
          return null;
        },
      ]),

      // 2) Token verification settings
      ignoreExpiration: false, // reject expired tokens
      secretOrKey: configService.get<string>('JWT_SECRET'), // HMAC secret
    });
  }

  /**
   * Summary: After a JWT is verified, load and return a minimal user object.
   * Inputs: JwtPayload (already verified by Passport).
   * Returns: user snapshot (becomes `req.user`) or throws UnauthorizedException.
   */
  async validate(payload: JwtPayload) {
    // 1) Fetch user with role; keep selected columns only (performance/safety)
    const user = await User.findByPk(payload.sub, {
      include: [Role],
      attributes: [
        'id',
        'email',
        'first_name',
        'last_name',
        'is_email_verified',
        'is_active',
        'deleted_at',
      ],
      raw: true, // return plain object
      nest: true, // keep included models nested (e.g., role.*)
    });

    // 2) Block unknown users
    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    // 3) Block disabled/deactivated users
    if (!user.is_active) {
      throw new AccountNotActiveException();
    }

    // 4) Block soft-deleted users
    if (user.deleted_at) throw new UnauthorizedException('Account removed');

    // 5) Return minimal snapshot (this becomes req.user)
    return user;
  }
}
