import { Injectable, NotFoundException } from '@nestjs/common';
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
  ) {}

  async enroll(employeeId: string, images: Buffer[], liveness?: number) {
    const emp = await this.employees.get(employeeId);
    if (!emp) throw new NotFoundException('Employee not found');
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
    };
  }
}
