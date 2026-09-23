import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';

/** Admin and BU share management privileges (roster, devices, regularization review, etc.). */
export function isAdminLike(role?: string): boolean {
  return role === 'admin' || role === 'bu';
}

/** Only true admins may enroll any employee; BU is limited to their own face like employees. */
export function canEnrollAnyEmployee(role?: string): boolean {
  return role === 'admin';
}

/** Maps JWT/DB roles onto the two privilege tiers used by @Roles().
 * manager and hr map to the employee tier (same permissions as employee). */
export function effectiveRole(role?: string): 'admin' | 'employee' {
  if (isAdminLike(role)) return 'admin';
  return 'employee';
}

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!roles || roles.length === 0) return true;
    const user = context.switchToHttp().getRequest().user;
    if (!user) throw new ForbiddenException('Insufficient role');
    const role = effectiveRole(user.role);
    if (role === 'admin') return true;
    if (roles.includes(role)) return true;
    throw new ForbiddenException('Insufficient role');
  }
}
