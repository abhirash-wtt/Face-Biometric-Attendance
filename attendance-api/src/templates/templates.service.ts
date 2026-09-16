import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FaceTemplate } from './face-template.entity';
import { EmployeesService } from '../employees/employees.service';
import { RecognitionService } from '../recognition/recognition.service';

@Injectable()
export class TemplatesService {
  constructor(
    @InjectRepository(FaceTemplate) private readonly repo: Repository<FaceTemplate>,
    private readonly employees: EmployeesService,
    private readonly recognition: RecognitionService,
    private readonly config: ConfigService,
  ) {}

  maxSamples() {
    return this.config.get<number>('recognition.maxFaceSamples') || 10;
  }

  async enroll(employeeId: string, images: Buffer[], liveness?: number) {
    const emp = await this.employees.get(employeeId);
    if (!emp) throw new NotFoundException('Employee not found');
    const max = this.maxSamples();
    const existing = await this.repo.count({ where: { employee_id: emp.id } });
    if (existing >= max) {
      throw new BadRequestException(`Maximum of ${max} face samples reached for this user`);
    }
    if (existing + images.length > max) {
      throw new BadRequestException(
        `Can add at most ${max - existing} more sample(s); limit is ${max} per user`,
      );
    }
    const created: Array<{ employee_id: string; liveness_score: number }> = [];
    for (const image of images) {
      const result = await this.recognition.enrollInternal(emp.id, emp.code, image, liveness);
      created.push({ employee_id: emp.id, liveness_score: result.liveness_score });
    }
    const count = await this.repo.count({ where: { employee_id: emp.id } });
    return {
      employee_id: emp.id,
      employee_code: emp.code,
      samples_added: created.length,
      total_templates: count,
      max_templates: max,
    };
  }

  async reset(employeeId: string) {
    const emp = await this.employees.get(employeeId);
    const removed = await this.repo.count({ where: { employee_id: emp.id } });
    await this.recognition.clearEnrollments(emp.id, emp.code);
    return {
      employee_id: emp.id,
      employee_code: emp.code,
      templates_removed: removed,
      total_templates: 0,
      max_templates: this.maxSamples(),
    };
  }
}
