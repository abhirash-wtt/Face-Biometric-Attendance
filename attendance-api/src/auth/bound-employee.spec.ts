import { ForbiddenException } from '@nestjs/common';
import { boundClockInEmployeeId } from './bound-employee';
import { JwtUser } from './jwt.strategy';

describe('boundClockInEmployeeId', () => {
  const device: JwtUser = { sub: 'd1', role: 'kiosk', type: 'device' };
  const admin: JwtUser = { sub: 'a1', role: 'admin', type: 'user' };
  const linked: JwtUser = {
    sub: 'u1',
    role: 'user',
    type: 'user',
    employee_id: '11111111-1111-1111-1111-111111111111',
  };
  const unlinked: JwtUser = { sub: 'u2', role: 'user', type: 'user' };

  it('leaves shared kiosk devices unbound (1:N)', () => {
    expect(boundClockInEmployeeId(device)).toBeUndefined();
  });

  it('leaves admins without an employee link unbound', () => {
    expect(boundClockInEmployeeId(admin)).toBeUndefined();
  });

  it('binds employee logins to their employee_id', () => {
    expect(boundClockInEmployeeId(linked)).toBe(linked.employee_id);
  });

  it('rejects user logins that are not linked to an employee', () => {
    expect(() => boundClockInEmployeeId(unlinked)).toThrow(ForbiddenException);
  });
});
