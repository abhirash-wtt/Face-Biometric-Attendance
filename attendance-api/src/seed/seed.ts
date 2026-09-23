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

async function run() {
  loadEnv();
  const ds = new DataSource({
    type: 'postgres',
    host: process.env.DATABASE_HOST || 'localhost',
    port: Number(process.env.DATABASE_PORT) || 5432,
    username: process.env.DATABASE_USER || 'app',
    password: process.env.DATABASE_PASSWORD || 'app',
    database: process.env.DATABASE_NAME || 'attendance',
    entities: [User, Employee, FaceTemplate, Site, Device, Shift, AttendanceLog],
    synchronize: false,
  });
  await ds.initialize();

  const users = ds.getRepository(User);
  const employees = ds.getRepository(Employee);
  const sites = ds.getRepository(Site);
  const shifts = ds.getRepository(Shift);

  const adminEmail = process.env.ADMIN_EMAIL || 'admin@attendance.local';
  if (!(await users.findOne({ where: { email: adminEmail } }))) {
    await users.save(
      users.create({
        email: adminEmail,
        password_hash: await bcrypt.hash(process.env.ADMIN_PASSWORD || 'Admin@123', 10),
        role: 'admin',
      }),
    );
  }
  if (!(await users.findOne({ where: { email: 'user@attendance.local' } }))) {
    await users.save(
      users.create({
        email: 'user@attendance.local',
        password_hash: await bcrypt.hash('User@123', 10),
        role: 'employee',
      }),
    );
  }
  const legacy = await users.findOne({ where: { email: 'supervisor@attendance.local' } });
  if (legacy && legacy.role !== 'admin') {
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
  ];
  for (const row of seedEmployees) {
    if (!(await employees.findOne({ where: { code: row.code } }))) {
      await employees.save(employees.create(row));
    }
  }

  async function ensureEmployeeUser(email: string, password: string, employeeId?: string) {
    const existing = await users.findOne({ where: { email } });
    if (!existing) {
      await users.save(
        users.create({
          email,
          password_hash: await bcrypt.hash(password, 10),
          role: 'employee',
          employee_id: employeeId,
        }),
      );
      return;
    }
    if (employeeId && existing.employee_id !== employeeId) {
      existing.employee_id = employeeId;
      await users.save(existing);
    }
  }

  const emp001 = await employees.findOne({ where: { code: 'EMP001' } });
  await ensureEmployeeUser('abhirash.garg@walkingtree.tech', 'faZWGpjhmB', emp001?.id);

  const emp002 = await employees.findOne({ where: { code: 'EMP002' } });
  await ensureEmployeeUser('yatharth.kapoor@walkingtree.tech', 'nR8wKq2mX7pL', emp002?.id);

  const emp007 = await employees.findOne({ where: { code: 'EMP007' } });
  await ensureEmployeeUser('pratham.vij@walkingtree.tech', 'pratham_', emp007?.id);

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
