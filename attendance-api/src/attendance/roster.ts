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
};

export type RosterRow = {
  employee_id: string;
  employee_code: string;
  display_name: string;
  email: string | null;
  clock_in: string | null;
  clock_out: string | null;
  status: 'Present' | 'Absent';
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

/** Present when the last punch of the day is IN; otherwise Absent. */
export function buildRoster(employees: RosterEmployee[], logs: RosterLog[]): RosterRow[] {
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
    const last = empLogs[empLogs.length - 1];
    const present = last?.type === 'IN';
    const lastOut = [...empLogs].reverse().find((l) => l.type === 'OUT');
    return {
      employee_id: emp.id,
      employee_code: emp.code,
      display_name: emp.display_name,
      email: emp.email || null,
      clock_in: firstIn ? iso(firstIn.event_time) : null,
      clock_out: !present && lastOut ? iso(lastOut.event_time) : null,
      status: present ? 'Present' : 'Absent',
    };
  });
}
