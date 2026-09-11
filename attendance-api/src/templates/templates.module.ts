import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FaceTemplate } from './face-template.entity';
import { TemplatesService } from './templates.service';
import { TemplatesController } from './templates.controller';
import { EmployeesModule } from '../employees/employees.module';
import { RecognitionModule } from '../recognition/recognition.module';

@Module({
  imports: [TypeOrmModule.forFeature([FaceTemplate]), EmployeesModule, RecognitionModule],
  controllers: [TemplatesController],
  providers: [TemplatesService],
  exports: [TemplatesService],
})
export class TemplatesModule {}
