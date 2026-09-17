import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import {
  RegularizationRequestType,
  WfhRequest,
  WfhRequestStatus,
} from './wfh-request.entity';
import { CreateWfhRequestDto } from './dto/create-wfh-request.dto';
import { EmployeesService } from '../employees/employees.service';
import { localDateYmd } from '../attendance/roster';
import { JwtUser } from '../auth/jwt.strategy';

@Injectable()
export class RegularizationService {
  constructor(
    @InjectRepository(WfhRequest) private readonly repo: Repository<WfhRequest>,
    private readonly employees: EmployeesService,
  ) {}

  async hasApprovedWfh(employeeId: string, date = localDateYmd()): Promise<boolean> {
    if (!employeeId) return false;
    const found = await this.repo.findOne({
      where: {
        employee_id: employeeId,
        work_date: date,
        status: 'approved',
        request_type: 'wfh',
      },
    });
    return !!found;
  }

  async listApprovedPresentEmployeeIds(date: string): Promise<string[]> {
    const rows = await this.repo.find({
      where: { work_date: date, status: 'approved', request_type: 'mark_present' },
      select: ['employee_id'],
    });
    return rows.map((r) => r.employee_id);
  }

  async create(dto: CreateWfhRequestDto, user: JwtUser) {
    const employeeId = this.resolveRequesterEmployeeId(user, dto.employee_id);
    await this.employees.get(employeeId);

    const requestType: RegularizationRequestType = dto.request_type || 'wfh';
    const today = localDateYmd();
    if (requestType === 'wfh' && dto.work_date < today) {
      throw new BadRequestException(`WFH date cannot be in the past (earliest: ${today})`);
    }
    if (requestType === 'mark_present' && dto.work_date > today) {
      throw new BadRequestException(`Present date cannot be in the future (latest: ${today})`);
    }

    const existing = await this.repo.findOne({
      where: {
        employee_id: employeeId,
        work_date: dto.work_date,
        request_type: requestType,
        status: In(['pending', 'approved']),
      },
    });
    if (existing) {
      throw new ConflictException(
        `A ${existing.status} ${this.typeLabel(requestType)} request already exists for ${dto.work_date}`,
      );
    }

    return this.repo.save(
      this.repo.create({
        employee_id: employeeId,
        work_date: dto.work_date,
        request_type: requestType,
        reason: dto.reason.trim(),
        status: 'pending',
        requested_by_user_id: user.sub,
      }),
    );
  }

  listMine(user: JwtUser) {
    const employeeId = user.employee_id;
    if (!employeeId) {
      throw new ForbiddenException('This login is not linked to an employee');
    }
    return this.repo.find({
      where: { employee_id: employeeId },
      order: { work_date: 'DESC', created_at: 'DESC' },
      relations: ['employee'],
    });
  }

  listAdmin(status?: WfhRequestStatus) {
    const where = status ? { status } : {};
    return this.repo.find({
      where,
      order: { created_at: 'DESC' },
      relations: ['employee'],
    });
  }

  async approve(id: string, reviewer: JwtUser, reviewNote?: string) {
    return this.review(id, reviewer, 'approved', reviewNote);
  }

  async reject(id: string, reviewer: JwtUser, reviewNote?: string) {
    return this.review(id, reviewer, 'rejected', reviewNote);
  }

  async cancel(id: string, user: JwtUser) {
    const req = await this.get(id);
    if (user.role !== 'admin') {
      if (!user.employee_id || req.employee_id !== user.employee_id) {
        throw new ForbiddenException('You can only cancel your own regularization requests');
      }
    }
    if (req.status !== 'pending') {
      throw new BadRequestException('Only pending requests can be cancelled');
    }
    req.status = 'cancelled';
    return this.repo.save(req);
  }

  private async review(
    id: string,
    reviewer: JwtUser,
    status: 'approved' | 'rejected',
    reviewNote?: string,
  ) {
    const req = await this.get(id);
    if (req.status !== 'pending') {
      throw new BadRequestException(`Request is already ${req.status}`);
    }
    req.status = status;
    req.reviewed_by_user_id = reviewer.sub;
    req.reviewed_at = new Date();
    req.review_note = reviewNote?.trim() || null;
    return this.repo.save(req);
  }

  private async get(id: string) {
    const req = await this.repo.findOne({ where: { id }, relations: ['employee'] });
    if (!req) throw new NotFoundException('Regularization request not found');
    return req;
  }

  private typeLabel(type: RegularizationRequestType) {
    return type === 'mark_present' ? 'present' : 'WFH';
  }

  private resolveRequesterEmployeeId(user: JwtUser, requestedEmployeeId?: string): string {
    if (user.type === 'device') {
      throw new ForbiddenException('Device tokens cannot submit regularization requests');
    }
    if (user.employee_id) {
      if (requestedEmployeeId && requestedEmployeeId !== user.employee_id) {
        throw new ForbiddenException('You can only submit regularization requests for yourself');
      }
      return user.employee_id;
    }
    if (user.role === 'admin' && requestedEmployeeId) {
      return requestedEmployeeId;
    }
    throw new ForbiddenException('This login is not linked to an employee');
  }
}
