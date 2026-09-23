import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';

/** Admin and BU share management privileges (devices, sites, regularization review, etc.). */
export function isAdminLike(role?: string): boolean {
  return role === 'admin' || role === 'bu';
}

/** Roster / attendance reports: admin, BU, manager, and HR. */
export function canAccessAttendance(role?: string): boolean {
  return role === 'admin' || role === 'bu' || role === 'manager' || role === 'hr';
}

/** Only true admins may enroll any employee; BU is limited to their own face like employees. */
export function canEnrollAnyEmployee(role?: string): boolean {
  return role === 'admin';
}

/** Maps JWT/DB roles onto the two privilege tiers used by @Roles().
 * manager and hr map to the employee tier except where listed explicitly (e.g. attendance). */
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
    const rawRole = user.role as string | undefined;
    const tier = effectiveRole(rawRole);
    if (tier === 'admin') return true;
    if (rawRole && roles.includes(rawRole)) return true;
    if (roles.includes(tier)) return true;
    throw new ForbiddenException('Insufficient role');
  }
}
