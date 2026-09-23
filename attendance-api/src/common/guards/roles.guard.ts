import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';

export function effectiveRole(role?: string): 'admin' | 'employee' {
  if (role === 'admin') return 'admin';
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
