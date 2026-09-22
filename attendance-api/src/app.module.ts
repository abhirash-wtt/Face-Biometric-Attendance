import { ConfigModule, ConfigService } from '@nestjs/config';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerModule } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';
import { configuration } from './config/configuration';
import { DatabaseModule } from './database/database.module';
import { RedisModule } from './redis/redis.module';
import { StorageModule } from './storage/storage.module';
import { RecognitionModule } from './recognition/recognition.module';
import { AuthModule } from './auth/auth.module';
import { EmployeesModule } from './employees/employees.module';
import { TemplatesModule } from './templates/templates.module';
import { AttendanceModule } from './attendance/attendance.module';
import { DevicesModule } from './devices/devices.module';
import { SitesModule } from './sites/sites.module';
import { ShiftsModule } from './shifts/shifts.module';
import { HealthController } from './health/health.controller';
import { RetentionService } from './common/retention.service';
import { User } from './auth/user.entity';
import { Employee } from './employees/employee.entity';
import { FaceTemplate } from './templates/face-template.entity';
import { Site } from './sites/site.entity';
import { Device } from './devices/device.entity';
import { Shift } from './shifts/shift.entity';
import { AttendanceLog } from './attendance/attendance-log.entity';
import { RegularizationModule } from './regularization/regularization.module';
import { CameraModule } from './camera/camera.module';
import { WfhRequest } from './regularization/wfh-request.entity';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [configuration] }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        host: config.get<string>('database.host'),
        port: config.get<number>('database.port'),
        username: config.get<string>('database.user'),
        password: config.get<string>('database.password'),
        database: config.get<string>('database.name'),
        entities: [User, Employee, FaceTemplate, Site, Device, Shift, AttendanceLog, WfhRequest],
        synchronize: false,
        logging: config.get<string>('nodeEnv') === 'local',
      }),
    }),
    ThrottlerModule.forRoot({
      throttlers: [{ ttl: 60000, limit: 120 }],
    }),
    ScheduleModule.forRoot(),
    DatabaseModule,
    RedisModule,
    StorageModule,
    RecognitionModule,
    AuthModule,
    EmployeesModule,
    TemplatesModule,
    AttendanceModule,
    DevicesModule,
    SitesModule,
    ShiftsModule,
    RegularizationModule,
    CameraModule,
  ],
  controllers: [HealthController],
  providers: [RetentionService],
})
export class AppModule {}
