import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WfhRequest } from './wfh-request.entity';
import { RegularizationService } from './regularization.service';
import { RegularizationController } from './regularization.controller';
import { EmployeesModule } from '../employees/employees.module';

@Module({
  imports: [TypeOrmModule.forFeature([WfhRequest]), EmployeesModule],
  controllers: [RegularizationController],
  providers: [RegularizationService],
  exports: [RegularizationService],
})
export class RegularizationModule {}
