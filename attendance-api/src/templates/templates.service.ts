import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FaceTemplate } from './face-template.entity';
import { EmployeesService } from '../employees/employees.service';
import { RecognitionService } from '../recognition/recognition.service';
import {
  EnrollPose,
  poseLabel,
  REQUIRED_ENROLL_POSES,
} from '../recognition/enrollment';

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

  minSamples() {
    return this.config.get<number>('recognition.minFaceSamples') || REQUIRED_ENROLL_POSES.length;
  }

  async status(employeeId: string) {
    const emp = await this.employees.get(employeeId);
    const snapshot = await this.recognition.enrollmentSnapshot(emp.id);
    return this.withEmployee(emp, snapshot);
  }

  async enroll(employeeId: string, images: Buffer[], pose: EnrollPose, liveness?: number) {
    const emp = await this.employees.get(employeeId);
    if (!emp) throw new NotFoundException('Employee not found');
    if (images.length !== 1) {
      throw new BadRequestException(
        `Capture one ${poseLabel(pose)} photo at a time until all 3 required poses are saved`,
      );
    }

    const result = await this.recognition.enrollInternal(emp.id, emp.code, images[0], {
      liveness,
      pose,
    });
    const snapshot = await this.recognition.enrollmentSnapshot(emp.id);
    return {
      ...this.withEmployee(emp, snapshot),
      samples_added: 1,
      pose: result.pose,
      features_coverage: result.features_coverage,
      features_complete: result.features_complete,
      features_present: result.features_present,
      liveness_score: result.liveness_score,
    };
  }

  async reset(employeeId: string) {
    const emp = await this.employees.get(employeeId);
    const removed = await this.repo.count({ where: { employee_id: emp.id } });
    await this.recognition.clearEnrollments(emp.id, emp.code);
    const snapshot = await this.recognition.enrollmentSnapshot(emp.id);
    return {
      ...this.withEmployee(emp, snapshot),
      templates_removed: removed,
    };
  }

  private withEmployee(
    emp: { id: string; code: string; display_name: string },
    snapshot: Awaited<ReturnType<RecognitionService['enrollmentSnapshot']>>,
  ) {
    return {
      employee_id: emp.id,
      employee_code: emp.code,
      display_name: emp.display_name,
      total_templates: snapshot.total_templates,
      max_templates: this.maxSamples(),
      min_templates: this.minSamples(),
      enrollment_status: snapshot.enrollment_status,
      enrollment_complete: snapshot.enrollment_complete,
      required_poses: snapshot.required_poses,
      captured_poses: snapshot.captured_poses,
      missing_poses: snapshot.missing_poses,
      required_samples: snapshot.required_samples,
      required_features: snapshot.required_features,
      features_complete: snapshot.features_complete,
      samples: snapshot.samples,
    };
  }
}
