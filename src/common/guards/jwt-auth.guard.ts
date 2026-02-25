import { Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Response } from 'express';

@Injectable()
/**
 * JwtAuthGuard
 * ------------
 * Purpose:
 * - Protect routes using the "jwt" passport strategy.
 * - Provide clear 401 errors for invalid or expired tokens.
 * - Clear the auth cookie when the token is expired.
 *
 * Summary:
 * - On success: returns the authenticated user.
 * - On failure (expired): clears "access_token" cookie and throws 401 with an explicit message.
 * - On failure (invalid/missing): throws 401 with a generic message.
 */
export class JwtAuthGuard extends AuthGuard('jwt') {
  /**
   * Called after Passport tries to authenticate the request.
   *
   * @param err   Error from the strategy (if any)
   * @param user  User object set by the strategy when auth succeeds
   * @param info  Extra details from the strategy (e.g., TokenExpiredError)
   * @param context Nest execution context (to access req/res)
   */
  handleRequest(err: any, user: any, info: any, context: any) {
    const res: Response = context.switchToHttp().getResponse();

    if (err || !user) {
      if (info?.name === 'TokenExpiredError') {
        // Expired token: clear cookie and ask client to log in again
        res.clearCookie('access_token');
        throw new UnauthorizedException('Access token expired. Please log in again.');
      }

      // Invalid or missing token
      throw new UnauthorizedException('Invalid or missing token');
    }

    // Authenticated: pass the user forward
    return user;
  }
}
