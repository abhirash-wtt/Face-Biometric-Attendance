import { buildRoster, dayBoundsIst, localDateYmd, parseRosterDate } from './roster';

describe('attendance roster', () => {
  const emp = { id: 'e1', code: 'EMP001', display_name: 'Abhirash', email: 'abhirash@example.com' };

  it('marks employees with no punches as Absent', () => {
    expect(buildRoster([emp], [])).toEqual([
      {
        employee_id: 'e1',
        employee_code: 'EMP001',
        display_name: 'Abhirash',
        email: 'abhirash@example.com',
        clock_in: null,
        clock_out: null,
        status: 'Absent',
      },
    ]);
  });

  it('marks clock-in without clock-out as Present', () => {
    const [row] = buildRoster([emp], [{ employee_id: 'e1', type: 'IN', event_time: '2026-09-15T03:30:00.000Z' }]);
    expect(row.status).toBe('Present');
    expect(row.clock_in).toBe('2026-09-15T03:30:00.000Z');
    expect(row.clock_out).toBeNull();
  });

  it('shows clock-in and clock-out after leaving', () => {
    const [row] = buildRoster(
      [emp],
      [
        { employee_id: 'e1', type: 'IN', event_time: '2026-09-15T03:30:00.000Z' },
        { employee_id: 'e1', type: 'OUT', event_time: '2026-09-15T12:30:00.000Z' },
      ],
    );
    expect(row.status).toBe('Absent');
    expect(row.clock_in).toBe('2026-09-15T03:30:00.000Z');
    expect(row.clock_out).toBe('2026-09-15T12:30:00.000Z');
  });

  it('treats a return after clock-out as Present while still showing the latest clock-out time', () => {
    const [row] = buildRoster(
      [emp],
      [
        { employee_id: 'e1', type: 'IN', event_time: '2026-09-15T03:30:00.000Z' },
        { employee_id: 'e1', type: 'OUT', event_time: '2026-09-15T08:00:00.000Z' },
        { employee_id: 'e1', type: 'IN', event_time: '2026-09-15T09:00:00.000Z' },
      ],
    );
    expect(row.status).toBe('Present');
    expect(row.clock_in).toBe('2026-09-15T03:30:00.000Z');
    expect(row.clock_out).toBe('2026-09-15T08:00:00.000Z');
  });

  it('reflects the latest clock-out when a user accidentally clocks out early and clocks out again at shift end', () => {
    const [row] = buildRoster(
      [emp],
      [
        { employee_id: 'e1', type: 'IN', event_time: '2026-09-15T03:30:00.000Z' },
        { employee_id: 'e1', type: 'OUT', event_time: '2026-09-15T08:00:00.000Z' },
        { employee_id: 'e1', type: 'OUT', event_time: '2026-09-15T12:30:00.000Z' },
      ],
    );
    expect(row.status).toBe('Absent');
    expect(row.clock_in).toBe('2026-09-15T03:30:00.000Z');
    expect(row.clock_out).toBe('2026-09-15T12:30:00.000Z');
  });

  it('marks approved missed-punch regularization as Present with blank clock times', () => {
    const [row] = buildRoster(
      [emp],
      [
        { employee_id: 'e1', type: 'IN', event_time: '2026-09-15T03:30:00.000Z' },
        { employee_id: 'e1', type: 'OUT', event_time: '2026-09-15T12:30:00.000Z' },
      ],
      new Set(['e1']),
    );
    expect(row.status).toBe('Present');
    expect(row.clock_in).toBeNull();
    expect(row.clock_out).toBeNull();
  });

  it('keeps other employees punch-based when only one is regularized Present', () => {
    const other = { id: 'e2', code: 'EMP002', display_name: 'Priya', email: null };
    const rows = buildRoster(
      [emp, other],
      [{ employee_id: 'e2', type: 'IN', event_time: '2026-09-15T03:30:00.000Z' }],
      new Set(['e1']),
    );
    expect(rows[0]).toMatchObject({ status: 'Present', clock_in: null, clock_out: null });
    expect(rows[1].status).toBe('Present');
    expect(rows[1].clock_in).toBe('2026-09-15T03:30:00.000Z');
  });

  it('defaults an invalid date query to today in Asia/Kolkata', () => {
    const now = new Date('2026-09-15T20:00:00.000Z');
    expect(parseRosterDate(undefined, now)).toBe('2026-09-16');
    expect(parseRosterDate('not-a-date', now)).toBe('2026-09-16');
    expect(parseRosterDate('2026-09-01', now)).toBe('2026-09-01');
    expect(localDateYmd(now)).toBe('2026-09-16');
    expect(dayBoundsIst('2026-09-15')).toEqual({
      from: '2026-09-15T00:00:00.000+05:30',
      to: '2026-09-15T23:59:59.999+05:30',
    });
  });
});
