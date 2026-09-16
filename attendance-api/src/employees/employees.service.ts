import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, ILike, Repository } from 'typeorm';
import { Employee } from './employee.entity';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';

@Injectable()
export class EmployeesService {
  constructor(
    @InjectRepository(Employee) private readonly repo: Repository<Employee>,
    private readonly ds: DataSource,
  ) {}

  create(dto: CreateEmployeeDto) {
    return this.repo.save(
      this.repo.create({
        code: dto.code.toUpperCase(),
        display_name: dto.display_name,
        status: dto.status || 'active',
        working_mode: dto.working_mode || 'onsite',
      }),
    );
  }

  async update(id: string, dto: UpdateEmployeeDto) {
    const emp = await this.get(id);
    if (dto.display_name !== undefined) emp.display_name = dto.display_name;
    if (dto.status !== undefined) emp.status = dto.status;
    if (dto.working_mode !== undefined) emp.working_mode = dto.working_mode;
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
    return status && q ? list.filter((e) => e.status === status) : list;
  }

  async get(id: string) {
    const emp = await this.repo.findOne({ where: { id } });
    if (!emp) throw new NotFoundException('Employee not found');
    return emp;
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
}
