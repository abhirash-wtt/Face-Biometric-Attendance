import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Shift } from './shift.entity';
import { CreateShiftDto } from './dto/create-shift.dto';

@Injectable()
export class ShiftsService {
  constructor(@InjectRepository(Shift) private readonly repo: Repository<Shift>) {}

  create(dto: CreateShiftDto) {
    return this.repo.save(this.repo.create({ ...dto, grace_minutes: dto.grace_minutes ?? 5 }));
  }

  findAll() {
    return this.repo.find({ order: { start_time: 'ASC' } });
  }

  async noteForEvent(eventTime: Date): Promise<string | undefined> {
    const shifts = await this.findAll();
    if (!shifts.length) return undefined;
    const shift = shifts[0];
    const start = this.toMinutes(shift.start_time);
    const event = eventTime.getHours() * 60 + eventTime.getMinutes();
    if (event > start + shift.grace_minutes) return `Late vs ${shift.name}`;
    return undefined;
  }

  private toMinutes(t: string) {
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
  }
}
