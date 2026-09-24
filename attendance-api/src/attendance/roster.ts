export const ATTENDANCE_TZ = 'Asia/Kolkata';

export type RosterLog = {
  employee_id?: string;
  type: 'IN' | 'OUT';
  event_time: Date | string;
};

export type RosterEmployee = {
  id: string;
  code: string;
  display_name: string;
  email?: string | null;
  role?: string | null;
  reporting_manager?: string | null;
  bu_owner?: string | null;
};

export type AttendanceDayStatus = 'Present' | 'Half Day' | 'Absent';

export type RosterRow = {
  employee_id: string;
  employee_code: string;
  display_name: string;
  email: string | null;
  role: string | null;
  reporting_manager: string | null;
  bu_owner: string | null;
  /** Work day in Asia/Kolkata (YYYY-MM-DD). Present on range and single-day responses. */
  date?: string;
  clock_in: string | null;
  clock_out: string | null;
  status: AttendanceDayStatus;
};

export const ROSTER_MAX_RANGE_DAYS = 31;

export function localDateYmd(now = new Date(), timeZone = ATTENDANCE_TZ): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

export function parseRosterDate(date?: string, now = new Date()): string {
  if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) return date;
  return localDateYmd(now);
}

/** Inclusive list of YYYY-MM-DD days from start through end (UTC calendar math on the date parts). */
export function enumerateDays(start: string, end: string): string[] {
  const days: string[] = [];
  const [sy, sm, sd] = start.split('-').map(Number);
  const [ey, em, ed] = end.split('-').map(Number);
  const cursor = new Date(Date.UTC(sy, sm - 1, sd));
  const last = new Date(Date.UTC(ey, em - 1, ed));
  while (cursor <= last) {
    days.push(
      `${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth() + 1).padStart(2, '0')}-${String(cursor.getUTCDate()).padStart(2, '0')}`,
    );
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return days;
}

export type RosterRangeQuery = {
  date?: string;
  start_date?: string;
  end_date?: string;
};

/**
 * Resolve start/end for roster queries.
 * Prefer start_date/end_date; fall back to date (or today) for a single day.
 */
export function parseRosterRange(
  query: RosterRangeQuery,
  now = new Date(),
): { start: string; end: string; days: string[] } {
  const hasStart = !!(query.start_date && /^\d{4}-\d{2}-\d{2}$/.test(query.start_date));
  const hasEnd = !!(query.end_date && /^\d{4}-\d{2}-\d{2}$/.test(query.end_date));
  let start = hasStart ? query.start_date! : parseRosterDate(query.date, now);
  let end = hasEnd ? query.end_date! : hasStart ? query.start_date! : parseRosterDate(query.date, now);
  if (!hasStart && hasEnd) start = end;
  if (start > end) {
    const tmp = start;
    start = end;
    end = tmp;
  }
  const days = enumerateDays(start, end);
  if (days.length > ROSTER_MAX_RANGE_DAYS) {
    throw new Error(`Date range cannot exceed ${ROSTER_MAX_RANGE_DAYS} days`);
  }
  return { start, end, days };
}

/** Inclusive IST day bounds as ISO timestamps (Asia/Kolkata has no DST). */
export function dayBoundsIst(day: string): { from: string; to: string } {
  return {
    from: `${day}T00:00:00.000+05:30`,
    to: `${day}T23:59:59.999+05:30`,
  };
}

export function rangeBoundsIst(start: string, end: string): { from: string; to: string } {
  return {
    from: `${start}T00:00:00.000+05:30`,
    to: `${end}T23:59:59.999+05:30`,
  };
}

function iso(value: Date | string): string {
  return new Date(value).toISOString();
}

/** Hours between first clock-in and last clock-out; null if either punch is missing. */
export function workedHours(
  clockIn: Date | string | null | undefined,
  clockOut: Date | string | null | undefined,
): number | null {
  if (!clockIn || !clockOut) return null;
  const ms = new Date(clockOut).getTime() - new Date(clockIn).getTime();
  if (!Number.isFinite(ms) || ms < 0) return null;
  return ms / 3600000;
}

/**
 * Status from completed punches (clock-out − clock-in):
 * Present when both clock-in and clock-out exist (any duration); Absent otherwise.
 */
export function statusFromWorkedHours(hours: number | null): AttendanceDayStatus {
  if (hours == null) return 'Absent';
  return 'Present';
}

/**
 * Status from first IN / last OUT (Present when both exist, any duration),
 * or Present when admin approved mark-present. No fixed office time-range is used.
 */
export function buildRoster(
  employees: RosterEmployee[],
  logs: RosterLog[],
  markedPresentIds?: Set<string>,
  workDate?: string,
): RosterRow[] {
  const byEmp = new Map<string, RosterLog[]>();
  for (const log of logs) {
    if (!log.employee_id) continue;
    const list = byEmp.get(log.employee_id) || [];
    list.push(log);
    byEmp.set(log.employee_id, list);
  }
  for (const list of byEmp.values()) {
    list.sort((a, b) => new Date(a.event_time).getTime() - new Date(b.event_time).getTime());
  }

  return employees.map((emp) => {
    const empLogs = byEmp.get(emp.id) || [];
    const firstIn = empLogs.find((l) => l.type === 'IN');
    const lastOut = [...empLogs].reverse().find((l) => l.type === 'OUT');
    const markedPresent = markedPresentIds?.has(emp.id) === true;
    const clock_in = markedPresent ? null : firstIn ? iso(firstIn.event_time) : null;
    const clock_out = markedPresent ? null : lastOut ? iso(lastOut.event_time) : null;
    const status: AttendanceDayStatus = markedPresent
      ? 'Present'
      : statusFromWorkedHours(workedHours(clock_in, clock_out));
    return {
      employee_id: emp.id,
      employee_code: emp.code,
      display_name: emp.display_name,
      email: emp.email || null,
      role: emp.role || null,
      reporting_manager: emp.reporting_manager || null,
      bu_owner: emp.bu_owner || null,
      ...(workDate ? { date: workDate } : {}),
      clock_in,
      clock_out,
      status,
    };
  });
}

/**
 * One roster row per employee per day across `days`.
 * `markedPresentByDay` maps YYYY-MM-DD → employee ids with approved mark-present.
 */
export function buildRosterRange(
  employees: RosterEmployee[],
  logs: RosterLog[],
  days: string[],
  markedPresentByDay?: Map<string, Set<string>>,
): RosterRow[] {
  const logsByDay = new Map<string, RosterLog[]>();
  for (const day of days) logsByDay.set(day, []);
  for (const log of logs) {
    const day = localDateYmd(new Date(log.event_time));
    const bucket = logsByDay.get(day);
    if (bucket) bucket.push(log);
  }
  const rows: RosterRow[] = [];
  for (const day of days) {
    rows.push(
      ...buildRoster(employees, logsByDay.get(day) || [], markedPresentByDay?.get(day), day),
    );
  }
  return rows;
}
