import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';
import { User } from './src/auth/user.entity';
import { Employee } from './src/employees/employee.entity';
import { FaceTemplate } from './src/templates/face-template.entity';
import { Site } from './src/sites/site.entity';
import { Device } from './src/devices/device.entity';
import { Shift } from './src/shifts/shift.entity';
import { AttendanceLog } from './src/attendance/attendance-log.entity';

dotenv.config();

export const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DATABASE_HOST || 'localhost',
  port: Number(process.env.DATABASE_PORT) || 5432,
  username: process.env.DATABASE_USER || 'app',
  password: process.env.DATABASE_PASSWORD || 'app',
  database: process.env.DATABASE_NAME || 'attendance',
  entities: [User, Employee, FaceTemplate, Site, Device, Shift, AttendanceLog],
  synchronize: false,
});

export default AppDataSource;
