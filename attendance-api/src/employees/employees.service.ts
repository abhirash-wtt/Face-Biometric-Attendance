import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ILike, Repository } from 'typeorm';
import { Employee } from './employee.entity';
import { CreateEmployeeDto } from './dto/create-employee.dto';

@Injectable()
export class EmployeesService {
  constructor(@InjectRepository(Employee) private readonly repo: Repository<Employee>) {}

  create(dto: CreateEmployeeDto) {
    return this.repo.save(
      this.repo.create({
        code: dto.code.toUpperCase(),
        display_name: dto.display_name,
        status: dto.status || 'active',
      }),
    );
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
}
