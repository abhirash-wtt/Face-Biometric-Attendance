export const ATTENDANCE_TZ = 'Asia/Kolkata';

/** Full-day threshold: clock-out − clock-in. */
export const PRESENT_MIN_HOURS = 9;
/** Half-day lower bound (inclusive). Upper bound is exclusive of PRESENT_MIN_HOURS. */
export const HALF_DAY_MIN_HOURS = 4;

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
};

export type AttendanceDayStatus = 'Present' | 'Half Day' | 'Absent';

export type RosterRow = {
  employee_id: string;
  employee_code: string;
  display_name: string;
  email: string | null;
  clock_in: string | null;
  clock_out: string | null;
  status: AttendanceDayStatus;
};

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

/** Inclusive IST day bounds as ISO timestamps (Asia/Kolkata has no DST). */
export function dayBoundsIst(day: string): { from: string; to: string } {
  return {
    from: `${day}T00:00:00.000+05:30`,
    to: `${day}T23:59:59.999+05:30`,
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
 * Status from worked hours (clock-out − clock-in):
 * Present ≥ 9h; Half Day 4–&lt;9h; Absent &lt; 4h or incomplete punches.
 */
export function statusFromWorkedHours(hours: number | null): AttendanceDayStatus {
  if (hours == null || hours < HALF_DAY_MIN_HOURS) return 'Absent';
  if (hours >= PRESENT_MIN_HOURS) return 'Present';
  return 'Half Day';
}

/**
 * Status from first IN / last OUT duration, or Present when admin approved mark-present.
 * No fixed office time-range is used.
 */
export function buildRoster(
  employees: RosterEmployee[],
  logs: RosterLog[],
  markedPresentIds?: Set<string>,
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
      clock_in,
      clock_out,
      status,
    };
  });
}
