import { DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';
import * as fs from 'fs';
import * as path from 'path';
import { User } from '../auth/user.entity';
import { Employee } from '../employees/employee.entity';
import { FaceTemplate } from '../templates/face-template.entity';
import { Site } from '../sites/site.entity';
import { HQ_OFFICE } from '../sites/hq-office';
import { Device } from '../devices/device.entity';
import { Shift } from '../shifts/shift.entity';
import { AttendanceLog } from '../attendance/attendance-log.entity';
import { secret } from '../config/configuration';

function loadEnv() {
  const p = path.join(process.cwd(), '.env');
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i < 0) continue;
    const k = t.slice(0, i).trim();
    const v = t.slice(i + 1).trim();
    if (!process.env[k]) process.env[k] = v;
  }
}

/** Seeded logins take their password from the named env var and are skipped when it is unset. */
function seedPassword(envKey: string, email: string): string | undefined {
  const value = secret(envKey);
  if (!value) console.log(`Skipping ${email}: ${envKey} is not set`);
  return value;
}

async function run() {
  loadEnv();
  const dbPassword = secret('DATABASE_PASSWORD');
  if (!dbPassword) {
    throw new Error('DATABASE_PASSWORD is not set. Configure attendance-api/.env (see .env.example).');
  }
  const ds = new DataSource({
    type: 'postgres',
    host: process.env.DATABASE_HOST || 'localhost',
    port: Number(process.env.DATABASE_PORT) || 5432,
    username: process.env.DATABASE_USER || 'app',
    password: dbPassword,
    database: process.env.DATABASE_NAME || 'attendance',
    entities: [User, Employee, FaceTemplate, Site, Device, Shift, AttendanceLog],
    synchronize: false,
  });
  await ds.initialize();

  const users = ds.getRepository(User);
  const employees = ds.getRepository(Employee);
  const sites = ds.getRepository(Site);
  const shifts = ds.getRepository(Shift);

  async function ensureUser(email: string, envKey: string, role: 'admin' | 'employee' | 'bu') {
    if (await users.findOne({ where: { email } })) return;
    const password = seedPassword(envKey, email);
    if (!password) return;
    await users.save(users.create({ email, password_hash: await bcrypt.hash(password, 10), role }));
  }

  await ensureUser(process.env.ADMIN_EMAIL || 'admin@attendance.local', 'ADMIN_PASSWORD', 'admin');
  await ensureUser('user@attendance.local', 'DEMO_EMPLOYEE_PASSWORD', 'employee');
  await ensureUser('bu@attendance.local', 'DEMO_BU_PASSWORD', 'bu');
  const legacy = await users.findOne({ where: { email: 'supervisor@attendance.local' } });
  if (legacy && legacy.role !== 'admin' && legacy.role !== 'bu') {
    legacy.role = 'employee';
    await users.save(legacy);
  }

  if (!(await sites.findOne({ where: { code: 'HQ' } }))) {
    await sites.save(
      sites.create({
        code: HQ_OFFICE.code,
        name: HQ_OFFICE.name,
        lat: HQ_OFFICE.lat,
        lng: HQ_OFFICE.lng,
        radius_m: HQ_OFFICE.radius_m,
        geofence_polygon: HQ_OFFICE.geofence_polygon,
      }),
    );
  } else {
    const hq = await sites.findOne({ where: { code: 'HQ' } });
    if (hq) {
      hq.name = HQ_OFFICE.name;
      hq.lat = HQ_OFFICE.lat;
      hq.lng = HQ_OFFICE.lng;
      hq.radius_m = HQ_OFFICE.radius_m;
      hq.geofence_polygon = HQ_OFFICE.geofence_polygon;
      await sites.save(hq);
    }
  }

  const yatharth004 = await employees.findOne({ where: { code: 'EMP004' } });
  if (yatharth004) {
    yatharth004.code = 'EMP002';
    yatharth004.display_name = 'Yatharth Kapoor';
    await employees.save(yatharth004);
  }

  const seedEmployees = [
    { code: 'EMP001', display_name: 'Abhirash' },
    { code: 'EMP002', display_name: 'Yatharth Kapoor' },
    { code: 'EMP007', display_name: 'Pratham Vij' },
    { code: 'EMPHR', display_name: 'HR Role' },
    { code: 'EMPMGR', display_name: 'Manager Role' },
    { code: 'EMPBU', display_name: 'BU Owner' },
  ];
  for (const row of seedEmployees) {
    if (!(await employees.findOne({ where: { code: row.code } }))) {
      await employees.save(employees.create(row));
    }
  }

  async function ensureRoleUser(
    email: string,
    envKey: string,
    role: 'hr' | 'manager' | 'employee' | 'bu',
    employeeId?: string,
  ) {
    const existing = await users.findOne({ where: { email } });
    if (!existing) {
      const password = seedPassword(envKey, email);
      if (!password) return;
      await users.save(
        users.create({
          email,
          password_hash: await bcrypt.hash(password, 10),
          role,
          employee_id: employeeId,
        }),
      );
      return;
    }
    let changed = false;
    if (existing.role !== role) {
      existing.role = role;
      changed = true;
    }
    if (employeeId && existing.employee_id !== employeeId) {
      existing.employee_id = employeeId;
      changed = true;
    }
    if (changed) await users.save(existing);
  }

  async function ensureEmployeeUser(email: string, envKey: string, employeeId?: string) {
    await ensureRoleUser(email, envKey, 'employee', employeeId);
  }

  const emp001 = await employees.findOne({ where: { code: 'EMP001' } });
  await ensureEmployeeUser('abhirash.garg@walkingtree.tech', 'SEED_EMP001_PASSWORD', emp001?.id);

  const emp002 = await employees.findOne({ where: { code: 'EMP002' } });
  await ensureEmployeeUser('yatharth.kapoor@walkingtree.tech', 'SEED_EMP002_PASSWORD', emp002?.id);

  const emp007 = await employees.findOne({ where: { code: 'EMP007' } });
  await ensureEmployeeUser('pratham.vij@walkingtree.tech', 'SEED_EMP007_PASSWORD', emp007?.id);

  const empHr = await employees.findOne({ where: { code: 'EMPHR' } });
  await ensureRoleUser('hrrole@gmail.com', 'DEMO_HR_PASSWORD', 'hr', empHr?.id);

  const empMgr = await employees.findOne({ where: { code: 'EMPMGR' } });
  await ensureRoleUser('managerrole@gmail.com', 'DEMO_MANAGER_PASSWORD', 'manager', empMgr?.id);

  const empBu = await employees.findOne({ where: { code: 'EMPBU' } });
  await ensureRoleUser('bu@attendance.local', 'DEMO_BU_PASSWORD', 'bu', empBu?.id);

  // Abhirash stays unassigned from the default reporting manager and BU.
  if (emp001 && (emp001.reporting_manager_id || emp001.bu_owner_id)) {
    emp001.reporting_manager_id = null;
    emp001.bu_owner_id = null;
    await employees.save(emp001);
  }

  // Sample org links so Attendance columns have values.
  for (const emp of [emp002, emp007, empHr].filter(Boolean)) {
    let changed = false;
    if (empMgr && emp!.reporting_manager_id !== empMgr.id) {
      emp!.reporting_manager_id = empMgr.id;
      changed = true;
    }
    if (empBu && emp!.bu_owner_id !== empBu.id) {
      emp!.bu_owner_id = empBu.id;
      changed = true;
    }
    if (changed) await employees.save(emp!);
  }

  if (!(await shifts.findOne({ where: { name: 'General' } }))) {
    await shifts.save(
      shifts.create({
        name: 'General',
        start_time: '09:00:00',
        end_time: '18:00:00',
        grace_minutes: 5,
      }),
    );
  }

  console.log('Seed complete: admin, employee, HQ site, EMP001-EMP002/EMP007, General shift');
  await ds.destroy();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
