import { ForbiddenException } from '@nestjs/common';
import { isAdminLike } from '../common/guards/roles.guard';
import { JwtUser } from './jwt.strategy';

/**
 * Employee accounts may only clock in as themselves (1:1 face match).
 * Shared kiosk device tokens stay 1:N. Admins/BU with no linked employee
 * may still operate a kiosk (1:N).
 */
export function boundClockInEmployeeId(user: JwtUser): string | undefined {
  if (user.type === 'device') return undefined;
  if (user.employee_id) return user.employee_id;
  if (isAdminLike(user.role)) return undefined;
  throw new ForbiddenException('This login is not linked to an employee');
}
