import {
  Injectable,
  ExecutionContext,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { Response } from 'express';
import { AuthGuard } from '@nestjs/passport';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from 'src/common/decorators/roles.decorator';
import { RoleEnum } from 'src/common/enums';

@Injectable()
/**
 * JwtRolesGuard
 * -------------
 * Purpose:
 * - Protect routes with JWT and check user roles added via @Roles().
 * - Return clear 401 errors for invalid/expired tokens and 403 for role mismatch.
 * - Clear the auth cookie when the token is expired.
 *
 * Summary:
 * - canActivate(): runs JWT auth first, then checks required roles from metadata.
 * - handleRequest(): standardizes errors, clears "access_token" on expiry, and enforces roles defensively.
 */
export class JwtRolesGuard extends AuthGuard('jwt') {
  constructor(private reflector: Reflector) {
    super();
  }

  /**
   * Run JWT auth, then enforce roles from @Roles().
   * Returns true to continue, false to block (if no user/role).
   */
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const canActivateJwt = await super.canActivate(context);
    if (!canActivateJwt) {
      return false;
    }

    const requiredRoles = this.reflector.getAllAndOverride<RoleEnum[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user || !user.role) {
      return false;
    }

    return requiredRoles.some(role => user.role.title === role);
  }

  /**
   * Standardize error handling and enforce roles again.
   * - Expired token: clear cookie and throw 401 with a clear message.
   * - Invalid/missing token: throw 401.
   * - Role mismatch: throw 403.
   */
  handleRequest(err: any, user: any, info: any, context: ExecutionContext) {
    const res: Response = context.switchToHttp().getResponse();

    if (err || !user) {
      if (info?.name === 'TokenExpiredError') {
        res.clearCookie('access_token');
        throw new UnauthorizedException('Access token expired. Please log in again.');
      }
      throw new UnauthorizedException('Invalid or missing token');
    }

    const requiredRoles = this.reflector.getAllAndOverride<RoleEnum[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (requiredRoles && (!user.role || !requiredRoles.includes(user.role.name))) {
      throw new ForbiddenException('Insufficient permissions');
    }

    return user;
  }
}
