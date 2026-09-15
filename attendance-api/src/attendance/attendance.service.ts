import {
  BadRequestException,
  Injectable,
  Logger,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { AttendanceLog } from './attendance-log.entity';
import { CreateAttendanceDto } from './dto/attendance.dto';
import { SitesService } from '../sites/sites.service';
import { ShiftsService } from '../shifts/shifts.service';
import { EmployeesService } from '../employees/employees.service';
import { StorageService } from '../storage/storage.service';

@Injectable()
export class AttendanceService {
  private readonly logger = new Logger(AttendanceService.name);

  constructor(
    @InjectRepository(AttendanceLog) private readonly repo: Repository<AttendanceLog>,
    private readonly sites: SitesService,
    private readonly shifts: ShiftsService,
    private readonly employees: EmployeesService,
    private readonly storage: StorageService,
    private readonly config: ConfigService,
  ) {}

  assertIdentifyGeofence(siteCode?: string, lat?: number, lng?: number) {
    return this.sites.assertGpsInside(siteCode, lat, lng);
  }

  async create(dto: CreateAttendanceDto) {
    if (dto.type !== 'IN' && dto.type !== 'OUT') {
      throw new BadRequestException('type must be IN or OUT');
    }
    await this.employees.get(dto.employee_id);
    const lat = dto.gps_lat ?? dto.gps?.lat;
    const lng = dto.gps_lng ?? dto.gps?.lng;
    const siteCode = dto.site_code?.toUpperCase();
    await this.sites.assertGpsInside(siteCode, lat, lng);

    const cooldown = this.config.get<number>('attendanceCooldownSec') || 60;
    const last = await this.repo.findOne({
      where: { employee_id: dto.employee_id },
      order: { event_time: 'DESC' },
    });
    if (last && last.type === dto.type) {
      const delta = (Date.now() - new Date(last.event_time).getTime()) / 1000;
      if (delta < cooldown) {
        throw new UnprocessableEntityException(
          `Duplicate ${dto.type} within cooldown (${cooldown}s)`,
        );
      }
    }

    let face_crop_url = dto.face_crop_url;
    if (dto.image_b64 && !face_crop_url) {
      const buf = Buffer.from(dto.image_b64.replace(/^data:image\/\w+;base64,/, ''), 'base64');
      face_crop_url = await this.storage.put(buf);
    }

    const event_time = new Date();
    const shiftNote = dto.type === 'IN' ? await this.shifts.noteForEvent(event_time) : undefined;
    const notes = [dto.notes, shiftNote].filter(Boolean).join('; ') || undefined;

    const log = await this.repo.save(
      this.repo.create({
        employee_id: dto.employee_id,
        type: dto.type,
        event_time,
        device_id: dto.device_id,
        site_code: siteCode,
        gps_lat: lat,
        gps_lng: lng,
        similarity: dto.similarity,
        liveness_score: dto.liveness_score,
        face_crop_url,
        notes,
      }),
    );

    this.logger.log(
      JSON.stringify({
        event: 'attendance',
        id: log.id,
        employee_id: log.employee_id,
        type: log.type,
        device_id: log.device_id,
        site_code: log.site_code,
      }),
    );
    return log;
  }

  async query(from?: string, to?: string, employeeId?: string) {
    const qb = this.repo
      .createQueryBuilder('a')
      .leftJoinAndSelect('a.employee', 'e')
      .orderBy('a.event_time', 'DESC');
    if (from) qb.andWhere('a.event_time >= :from', { from });
    if (to) qb.andWhere('a.event_time <= :to', { to });
    if (employeeId) qb.andWhere('a.employee_id = :employeeId', { employeeId });
    return qb.getMany();
  }

  toCsv(rows: AttendanceLog[]): string {
    const header = [
      'id',
      'employee_code',
      'display_name',
      'type',
      'event_time',
      'device_id',
      'site_code',
      'gps_lat',
      'gps_lng',
      'similarity',
      'liveness_score',
      'notes',
    ];
    const lines = [header.join(',')];
    for (const r of rows) {
      const vals = [
        r.id,
        r.employee?.code || '',
        r.employee?.display_name || '',
        r.type,
        new Date(r.event_time).toISOString(),
        r.device_id || '',
        r.site_code || '',
        r.gps_lat ?? '',
        r.gps_lng ?? '',
        r.similarity ?? '',
        r.liveness_score ?? '',
        (r.notes || '').replace(/,/g, ';'),
      ];
      lines.push(vals.join(','));
    }
    return lines.join('\n');
  }

  toPayrollCsv(rows: AttendanceLog[]): string {
    type Pair = { code: string; name: string; date: string; in?: string; out?: string };
    const map = new Map<string, Pair>();
    const sorted = [...rows].sort(
      (a, b) => new Date(a.event_time).getTime() - new Date(b.event_time).getTime(),
    );
    for (const r of sorted) {
      const date = new Date(r.event_time).toISOString().slice(0, 10);
      const key = `${r.employee_id}:${date}`;
      if (!map.has(key)) {
        map.set(key, {
          code: r.employee?.code || '',
          name: r.employee?.display_name || '',
          date,
        });
      }
      const row = map.get(key)!;
      const t = new Date(r.event_time).toISOString();
      if (r.type === 'IN' && !row.in) row.in = t;
      if (r.type === 'OUT') row.out = t;
    }
    const header = 'employee_code,display_name,date,clock_in,clock_out,hours';
    const lines = [header];
    for (const row of map.values()) {
      let hours = '';
      if (row.in && row.out) {
        hours = ((new Date(row.out).getTime() - new Date(row.in).getTime()) / 3600000).toFixed(2);
      }
      lines.push([row.code, row.name, row.date, row.in || '', row.out || '', hours].join(','));
    }
    return lines.join('\n');
  }
}
