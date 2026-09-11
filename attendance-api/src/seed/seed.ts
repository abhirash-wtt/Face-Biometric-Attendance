import { DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';
import * as fs from 'fs';
import * as path from 'path';
import { User } from '../auth/user.entity';
import { Employee } from '../employees/employee.entity';
import { FaceTemplate } from '../templates/face-template.entity';
import { Site } from '../sites/site.entity';
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
  if (!(await users.findOne({ where: { email: 'supervisor@attendance.local' } }))) {
    await users.save(
      users.create({
        email: 'supervisor@attendance.local',
        password_hash: await bcrypt.hash('Supervisor@123', 10),
        role: 'supervisor',
      }),
    );
  }

  if (!(await sites.findOne({ where: { code: 'HQ' } }))) {
    await sites.save(
      sites.create({
        code: 'HQ',
        name: 'Headquarters',
        lat: 12.9716,
        lng: 77.5946,
        radius_m: 200,
      }),
    );
  }

  const seedEmployees = [
    { code: 'EMP001', display_name: 'Abhirash' },
    { code: 'EMP002', display_name: 'Pavan Kumar' },
    { code: 'EMP003', display_name: 'Sushmita Singh' },
  ];
  for (const row of seedEmployees) {
    if (!(await employees.findOne({ where: { code: row.code } }))) {
      await employees.save(employees.create(row));
    }
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

  console.log('Seed complete: admin, supervisor, HQ site, EMP001-EMP003, General shift');
  await ds.destroy();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
