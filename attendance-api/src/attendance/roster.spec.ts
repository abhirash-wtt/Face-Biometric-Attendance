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
        role: null,
        reporting_manager: null,
        bu_owner: null,
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

  it('marks completed punches as Present regardless of duration', () => {
    const [fullDay] = buildRoster(
      [emp],
      [
        { employee_id: 'e1', type: 'IN', event_time: '2026-09-15T03:30:00.000Z' },
        { employee_id: 'e1', type: 'OUT', event_time: '2026-09-15T12:30:00.000Z' },
      ],
    );
    expect(workedHours(fullDay.clock_in, fullDay.clock_out)).toBe(9);
    expect(fullDay.status).toBe('Present');
    expect(fullDay.clock_in).toBe('2026-09-15T03:30:00.000Z');
    expect(fullDay.clock_out).toBe('2026-09-15T12:30:00.000Z');

    const [shortDay] = buildRoster(
      [emp],
      [
        { employee_id: 'e1', type: 'IN', event_time: '2026-09-15T03:30:00.000Z' },
        { employee_id: 'e1', type: 'OUT', event_time: '2026-09-15T06:30:00.000Z' },
      ],
    );
    expect(workedHours(shortDay.clock_in, shortDay.clock_out)).toBe(3);
    expect(shortDay.status).toBe('Present');
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
    // Open second IN does not extend hours; completed span still marks Present
    expect(workedHours(row.clock_in, row.clock_out)).toBe(4.5);
    expect(row.status).toBe('Present');
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

  it('maps completed punches to Present regardless of hours', () => {
    expect(statusFromWorkedHours(null)).toBe('Absent');
    expect(statusFromWorkedHours(0)).toBe('Present');
    expect(statusFromWorkedHours(3)).toBe('Present');
    expect(statusFromWorkedHours(4.5)).toBe('Present');
    expect(statusFromWorkedHours(9)).toBe('Present');
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
