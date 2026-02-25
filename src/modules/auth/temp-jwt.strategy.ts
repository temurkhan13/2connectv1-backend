import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * TempJwtStrategy
 * ---------------
 * Purpose:
 * - Verify short-lived tokens used only for password reset.
 *
 * Summary:
 * - Reads token from the `Authorization: Bearer <token>` header (no cookies).
 * - Uses a separate secret/config from normal auth tokens.
 * - Rejects expired tokens and any token not marked as `kind = 'reset_password'`.
 * - Returns a tiny user object for downstream handlers.
 */

type TempJwtPayload = {
  sub: string; // user id
  kind: 'reset_password'; // enforce this strategy is for reset only
  iat?: number; // issued at
  exp?: number; // expiration
};

@Injectable()
export class TempJwtStrategy extends PassportStrategy(Strategy, 'temp-jwt') {
  /**
   * Summary: Configure how to extract and verify temporary JWTs.
   * Inputs: ConfigService (TEMP_* vars).
   * Returns: n/a (calls super with strategy options).
   */
  constructor(private readonly config: ConfigService) {
    super({
      // 1) Token source: Authorization header only (Bearer <token>)
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),

      // 2) Verification settings: must be valid and unexpired
      ignoreExpiration: false,
      secretOrKey: config.get<string>('TEMP_JWT_SECRET'),

      // 3) Optional hardening (enable only if you set these when signing)
      issuer: config.get<string>('TEMP_JWT_ISS'),
      audience: config.get<string>('TEMP_JWT_AUD'),
    });
  }

  /**
   * Summary: After JWT is verified, accept only reset tokens and return minimal data.
   * Inputs: TempJwtPayload (already signature/exp checked).
   * Returns: { id } or throws UnauthorizedException.
   */
  async validate(payload: TempJwtPayload) {
    // 1) Ensure this token was minted for password reset flows only
    if (payload?.kind !== 'reset_password') {
      throw new UnauthorizedException('Invalid token kind');
    }

    // 3) Return minimal identity used by the reset handler
    return { id: payload.sub };
  }
}
