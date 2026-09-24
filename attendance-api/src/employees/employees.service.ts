import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, ILike, Repository } from 'typeorm';
import { Employee } from './employee.entity';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';
import { buildEnrollmentStatus } from '../recognition/enrollment';

@Injectable()
export class EmployeesService {
  constructor(
    @InjectRepository(Employee) private readonly repo: Repository<Employee>,
    private readonly ds: DataSource,
  ) {}

  async create(dto: CreateEmployeeDto) {
    if (dto.reporting_manager_id) await this.get(dto.reporting_manager_id);
    if (dto.bu_owner_id) await this.get(dto.bu_owner_id);
    return this.repo.save(
      this.repo.create({
        code: dto.code.toUpperCase(),
        display_name: dto.display_name,
        status: dto.status || 'active',
        working_mode: dto.working_mode || 'onsite',
        reporting_manager_id: dto.reporting_manager_id ?? null,
        bu_owner_id: dto.bu_owner_id ?? null,
      }),
    );
  }

  async update(id: string, dto: UpdateEmployeeDto) {
    const emp = await this.get(id);
    if (dto.display_name !== undefined) emp.display_name = dto.display_name;
    if (dto.status !== undefined) emp.status = dto.status;
    if (dto.working_mode !== undefined) emp.working_mode = dto.working_mode;
    if (dto.reporting_manager_id !== undefined) {
      if (dto.reporting_manager_id) await this.get(dto.reporting_manager_id);
      emp.reporting_manager_id = dto.reporting_manager_id;
    }
    if (dto.bu_owner_id !== undefined) {
      if (dto.bu_owner_id) await this.get(dto.bu_owner_id);
      emp.bu_owner_id = dto.bu_owner_id;
    }
    return this.repo.save(emp);
  }

  async findAll(q?: string, status?: string) {
    const where: Record<string, unknown>[] = [];
    if (q) {
      where.push({ code: ILike(`%${q}%`) });
      where.push({ display_name: ILike(`%${q}%`) });
    }
    const list = await this.repo.find({
      where: where.length ? where : status ? { status: status as 'active' | 'inactive' } : undefined,
      order: { code: 'ASC' },
    });
    const filtered = status && q ? list.filter((e) => e.status === status) : list;
    return this.withEnrollment(filtered);
  }

  /** Lightweight employee list for attendance roster — no face enrollment join. */
  async listForRoster() {
    return this.repo.find({
      select: ['id', 'code', 'display_name', 'reporting_manager_id', 'bu_owner_id'],
      order: { code: 'ASC' },
    });
  }

  async get(id: string) {
    const emp = await this.repo.findOne({ where: { id } });
    if (!emp) throw new NotFoundException('Employee not found');
    return emp;
  }

  async getWithEnrollment(id: string) {
    const [withStatus] = await this.withEnrollment([await this.get(id)]);
    return withStatus;
  }

  async getByCode(code: string) {
    const emp = await this.repo.findOne({ where: { code: code.toUpperCase() } });
    if (!emp) throw new NotFoundException('Employee not found');
    return emp;
  }

  async remove(id: string) {
    const emp = await this.get(id);
    await this.ds.query('DELETE FROM attendance_logs WHERE employee_id = $1', [emp.id]);
    await this.ds.query('DELETE FROM face_templates WHERE employee_id = $1', [emp.id]);
    await this.repo.remove(emp);
    return { ok: true, code: emp.code, display_name: emp.display_name };
  }

  private async withEnrollment(list: Employee[]) {
    if (!list.length) return list;
    const rows = await this.ds.query(
      `SELECT employee_id, pose, features_complete
         FROM face_templates
        WHERE employee_id = ANY($1::uuid[])`,
      [list.map((e) => e.id)],
    );
    const byEmployee = new Map<string, Array<{ pose: string | null; features_complete: boolean }>>();
    for (const row of rows as Array<{
      employee_id: string;
      pose: string | null;
      features_complete: boolean | null;
    }>) {
      const current = byEmployee.get(row.employee_id) || [];
      current.push({ pose: row.pose, features_complete: !!row.features_complete });
      byEmployee.set(row.employee_id, current);
    }
    return list.map((emp) => {
      const status = buildEnrollmentStatus(byEmployee.get(emp.id) || []);
      return Object.assign(emp, {
        enrollment_status: status.enrollment_status,
        enrollment_complete: status.enrollment_complete,
        captured_poses: status.captured_poses,
        missing_poses: status.missing_poses,
      });
    });
  }
}
