import {
  buildRoster,
  dayBoundsIst,
  localDateYmd,
  parseRosterDate,
  statusFromWorkedHours,
  workedHours,
} from './roster';

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

  it('marks clock-in without clock-out as Absent (hours cannot be computed)', () => {
    const [row] = buildRoster([emp], [{ employee_id: 'e1', type: 'IN', event_time: '2026-09-15T03:30:00.000Z' }]);
    expect(row.status).toBe('Absent');
    expect(row.clock_in).toBe('2026-09-15T03:30:00.000Z');
    expect(row.clock_out).toBeNull();
  });

  it('marks 9+ hours as Present', () => {
    const [row] = buildRoster(
      [emp],
      [
        { employee_id: 'e1', type: 'IN', event_time: '2026-09-15T03:30:00.000Z' },
        { employee_id: 'e1', type: 'OUT', event_time: '2026-09-15T12:30:00.000Z' },
      ],
    );
    expect(workedHours(row.clock_in, row.clock_out)).toBe(9);
    expect(row.status).toBe('Present');
    expect(row.clock_in).toBe('2026-09-15T03:30:00.000Z');
    expect(row.clock_out).toBe('2026-09-15T12:30:00.000Z');
  });

  it('marks 4–4.5 hours as Half Day', () => {
    const [row] = buildRoster(
      [emp],
      [
        { employee_id: 'e1', type: 'IN', event_time: '2026-09-15T03:30:00.000Z' },
        { employee_id: 'e1', type: 'OUT', event_time: '2026-09-15T07:45:00.000Z' },
      ],
    );
    expect(workedHours(row.clock_in, row.clock_out)).toBe(4.25);
    expect(row.status).toBe('Half Day');
  });

  it('marks under 4 hours as Absent', () => {
    const [row] = buildRoster(
      [emp],
      [
        { employee_id: 'e1', type: 'IN', event_time: '2026-09-15T03:30:00.000Z' },
        { employee_id: 'e1', type: 'OUT', event_time: '2026-09-15T06:30:00.000Z' },
      ],
    );
    expect(workedHours(row.clock_in, row.clock_out)).toBe(3);
    expect(row.status).toBe('Absent');
  });

  it('uses first clock-in and latest clock-out for duration', () => {
    const [row] = buildRoster(
      [emp],
      [
        { employee_id: 'e1', type: 'IN', event_time: '2026-09-15T03:30:00.000Z' },
        { employee_id: 'e1', type: 'OUT', event_time: '2026-09-15T08:00:00.000Z' },
        { employee_id: 'e1', type: 'OUT', event_time: '2026-09-15T12:30:00.000Z' },
      ],
    );
    expect(row.clock_in).toBe('2026-09-15T03:30:00.000Z');
    expect(row.clock_out).toBe('2026-09-15T12:30:00.000Z');
    expect(row.status).toBe('Present');
  });

  it('treats return after clock-out using completed IN/OUT span only', () => {
    const [row] = buildRoster(
      [emp],
      [
        { employee_id: 'e1', type: 'IN', event_time: '2026-09-15T03:30:00.000Z' },
        { employee_id: 'e1', type: 'OUT', event_time: '2026-09-15T08:00:00.000Z' },
        { employee_id: 'e1', type: 'IN', event_time: '2026-09-15T09:00:00.000Z' },
      ],
    );
    // 4.5h between first IN and last OUT → Half Day; open second IN does not extend hours
    expect(workedHours(row.clock_in, row.clock_out)).toBe(4.5);
    expect(row.status).toBe('Half Day');
    expect(row.clock_in).toBe('2026-09-15T03:30:00.000Z');
    expect(row.clock_out).toBe('2026-09-15T08:00:00.000Z');
  });

  it('marks approved missed-punch regularization as Present with blank clock times', () => {
    const [row] = buildRoster(
      [emp],
      [
        { employee_id: 'e1', type: 'IN', event_time: '2026-09-15T03:30:00.000Z' },
        { employee_id: 'e1', type: 'OUT', event_time: '2026-09-15T06:00:00.000Z' },
      ],
      new Set(['e1']),
    );
    expect(row.status).toBe('Present');
    expect(row.clock_in).toBeNull();
    expect(row.clock_out).toBeNull();
  });

  it('keeps other employees hours-based when only one is regularized Present', () => {
    const other = { id: 'e2', code: 'EMP002', display_name: 'Priya', email: null };
    const rows = buildRoster(
      [emp, other],
      [
        { employee_id: 'e2', type: 'IN', event_time: '2026-09-15T03:30:00.000Z' },
        { employee_id: 'e2', type: 'OUT', event_time: '2026-09-15T12:30:00.000Z' },
      ],
      new Set(['e1']),
    );
    expect(rows[0]).toMatchObject({ status: 'Present', clock_in: null, clock_out: null });
    expect(rows[1].status).toBe('Present');
    expect(rows[1].clock_in).toBe('2026-09-15T03:30:00.000Z');
  });

  it('maps hour thresholds correctly', () => {
    expect(statusFromWorkedHours(null)).toBe('Absent');
    expect(statusFromWorkedHours(3.99)).toBe('Absent');
    expect(statusFromWorkedHours(4)).toBe('Half Day');
    expect(statusFromWorkedHours(4.5)).toBe('Half Day');
    expect(statusFromWorkedHours(8.99)).toBe('Half Day');
    expect(statusFromWorkedHours(9)).toBe('Present');
    expect(statusFromWorkedHours(10)).toBe('Present');
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
