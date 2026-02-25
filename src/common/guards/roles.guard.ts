import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from 'src/common/decorators/roles.decorator';
import { RoleEnum } from 'src/common/enums';

@Injectable()
/**
 * RolesGuard
 * ----------
 * Purpose:
 * - Enforce role-based access using roles defined with @Roles(...).
 *
 * Summary:
 * - Reads required roles from route/class metadata.
 * - If no roles are required → allow.
 * - Ensures request.user.role.title exists.
 * - Allows only when user's role is in the required roles list; otherwise throws 403.
 */
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  /**
   * Run before the route handler to check roles.
   * 1) Get required roles from @Roles(...).
   * 2) If none, allow.
   * 3) Verify user and user.role.title.
   * 4) Allow only if user's role is included.
   */
  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<RoleEnum[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles) return true;

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user || !user.role?.title) {
      throw new ForbiddenException('User role not found.');
    }

    const hasRole = requiredRoles.includes(user.role.title);
    if (!hasRole) {
      throw new ForbiddenException(`Access denied. Required roles: ${requiredRoles.join(', ')}`);
    }

    return true;
  }
}
