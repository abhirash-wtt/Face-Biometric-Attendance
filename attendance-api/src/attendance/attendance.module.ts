import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AttendanceLog } from './attendance-log.entity';
import { AttendanceService } from './attendance.service';
import { AttendanceController } from './attendance.controller';
import { SitesModule } from '../sites/sites.module';
import { ShiftsModule } from '../shifts/shifts.module';
import { EmployeesModule } from '../employees/employees.module';
import { RecognitionModule } from '../recognition/recognition.module';
import { User } from '../auth/user.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([AttendanceLog, User]),
    SitesModule,
    ShiftsModule,
    EmployeesModule,
    RecognitionModule,
  ],
  controllers: [AttendanceController],
  providers: [AttendanceService],
})
export class AttendanceModule {}
