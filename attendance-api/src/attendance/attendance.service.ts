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
import { RecognitionService } from '../recognition/recognition.service';
import { RegularizationService } from '../regularization/regularization.service';
import { User } from '../auth/user.entity';
import {
  ATTENDANCE_TZ,
  buildRosterRange,
  dayBoundsIst,
  localDateYmd,
  parseRosterRange,
  rangeBoundsIst,
} from './roster';

@Injectable()
export class AttendanceService {
  private readonly logger = new Logger(AttendanceService.name);

  constructor(
    @InjectRepository(AttendanceLog) private readonly repo: Repository<AttendanceLog>,
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly sites: SitesService,
    private readonly shifts: ShiftsService,
    private readonly employees: EmployeesService,
    private readonly storage: StorageService,
    private readonly config: ConfigService,
    private readonly recognition: RecognitionService,
    private readonly regularization: RegularizationService,
  ) {}

  /**
   * Geofence gate for clock-in flows. Skipped for Remote working mode, or when
   * the employee has an approved WFH regularization for the current IST day.
   */
  async assertGeofenceUnlessApprovedWfh(
    employeeId: string | undefined,
    siteCode?: string,
    lat?: number,
    lng?: number,
    accuracyM?: number,
  ): Promise<{ wfh_bypass: boolean; remote_bypass: boolean }> {
    if (employeeId) {
      const emp = await this.employees.get(employeeId);
      if (emp.working_mode === 'remote') {
        return { wfh_bypass: false, remote_bypass: true };
      }
      if (await this.regularization.hasApprovedWfh(employeeId, localDateYmd())) {
        return { wfh_bypass: true, remote_bypass: false };
      }
    }
    await this.sites.assertGpsInside(siteCode, lat, lng, accuracyM);
    return { wfh_bypass: false, remote_bypass: false };
  }

  private formatPunchClock(eventTime: Date | string): string {
    const date = eventTime instanceof Date ? eventTime : new Date(eventTime);
    const safe = Number.isNaN(date.getTime()) ? new Date() : date;
    return safe.toLocaleTimeString('en-US', {
      timeZone: ATTENDANCE_TZ,
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
  }

  private duplicatePunchMessage(type: 'IN' | 'OUT', eventTime: Date | string): string {
    const timeLabel = this.formatPunchClock(eventTime);
    const action = type === 'IN' ? 'clocked in' : 'clocked out';
    return `Duplicate entry detected. You ${action} at ${timeLabel}.`;
  }

  async create(dto: CreateAttendanceDto, opts?: { requireFaceMatch?: boolean }) {
    if (dto.type !== 'IN' && dto.type !== 'OUT') {
      throw new BadRequestException('type must be IN or OUT');
    }
    await this.employees.get(dto.employee_id);

    let similarity = dto.similarity;
    let liveness_score = dto.liveness_score;
    if (opts?.requireFaceMatch) {
      if (!dto.image_b64) {
        throw new UnprocessableEntityException('Face verification required');
      }
      const imageBuf = Buffer.from(dto.image_b64.replace(/^data:image\/\w+;base64,/, ''), 'base64');
      const verified = await this.recognition.verify(dto.employee_id, imageBuf, dto.liveness_score);
      if (!verified.ok) {
        throw new UnprocessableEntityException(
          verified.reason === 'no_templates'
            ? 'No face enrolled for this login'
            : verified.reason === 'enrollment_incomplete'
              ? 'Face enrollment is incomplete. Capture looking straight, left, and right before clock-in'
              : 'Face does not match this login',
        );
      }
      similarity = verified.similarity;
      liveness_score = verified.liveness;
    }

    const lat = dto.gps_lat ?? dto.gps?.lat;
    const lng = dto.gps_lng ?? dto.gps?.lng;
    const siteCode = dto.site_code?.toUpperCase();
    const { wfh_bypass, remote_bypass } = await this.assertGeofenceUnlessApprovedWfh(
      dto.employee_id,
      siteCode,
      lat,
      lng,
      dto.gps?.accuracy,
    );

    const today = localDateYmd();
    const { from, to } = dayBoundsIst(today);

    if (dto.type === 'OUT') {
      const existingOut = await this.repo
        .createQueryBuilder('a')
        .where('a.employee_id = :empId AND a.type = :type AND a.event_time >= :from AND a.event_time <= :to', {
          empId: dto.employee_id,
          type: 'OUT',
          from,
          to,
        })
        .orderBy('a.event_time', 'ASC')
        .getOne();

      if (existingOut) {
        let face_crop_url = dto.face_crop_url;
        if (dto.image_b64 && !face_crop_url) {
          const buf = Buffer.from(dto.image_b64.replace(/^data:image\/\w+;base64,/, ''), 'base64');
          face_crop_url = await this.storage.put(buf);
        }

        const event_time = new Date();
        const modeNote = remote_bypass ? 'Remote working mode' : wfh_bypass ? 'Approved WFH' : undefined;
        const notes = [dto.notes, modeNote].filter(Boolean).join('; ') || undefined;

        existingOut.event_time = event_time;
        if (dto.device_id) existingOut.device_id = dto.device_id;
        if (siteCode) existingOut.site_code = siteCode;
        if (lat !== undefined) existingOut.gps_lat = lat;
        if (lng !== undefined) existingOut.gps_lng = lng;
        if (similarity !== undefined) existingOut.similarity = similarity;
        if (liveness_score !== undefined) existingOut.liveness_score = liveness_score;
        if (face_crop_url) existingOut.face_crop_url = face_crop_url;
        if (notes) existingOut.notes = notes;

        await this.repo.save(existingOut);

        this.logger.log(
          JSON.stringify({
            event: 'attendance_replaced_out',
            id: existingOut.id,
            employee_id: existingOut.employee_id,
            type: existingOut.type,
            device_id: existingOut.device_id,
            site_code: existingOut.site_code,
            wfh_bypass,
            remote_bypass,
          }),
        );

        throw new UnprocessableEntityException(this.duplicatePunchMessage('OUT', event_time));
      }
    }

    if (dto.type === 'IN') {
      // One clock-in per IST day — reject even after a later clock-out.
      const existingIn = await this.repo
        .createQueryBuilder('a')
        .where('a.employee_id = :empId AND a.type = :type AND a.event_time >= :from AND a.event_time <= :to', {
          empId: dto.employee_id,
          type: 'IN',
          from,
          to,
        })
        .orderBy('a.event_time', 'ASC')
        .getOne();

      if (existingIn) {
        throw new UnprocessableEntityException(this.duplicatePunchMessage('IN', existingIn.event_time));
      }
    }

    let face_crop_url = dto.face_crop_url;
    if (dto.image_b64 && !face_crop_url) {
      const buf = Buffer.from(dto.image_b64.replace(/^data:image\/\w+;base64,/, ''), 'base64');
      face_crop_url = await this.storage.put(buf);
    }

    const event_time = new Date();
    const shiftNote = dto.type === 'IN' ? await this.shifts.noteForEvent(event_time) : undefined;
    const modeNote = remote_bypass ? 'Remote working mode' : wfh_bypass ? 'Approved WFH' : undefined;
    const notes = [dto.notes, shiftNote, modeNote].filter(Boolean).join('; ') || undefined;

    const log = await this.repo.save(
      this.repo.create({
        employee_id: dto.employee_id,
        type: dto.type,
        event_time,
        device_id: dto.device_id,
        site_code: siteCode,
        gps_lat: lat,
        gps_lng: lng,
        similarity,
        liveness_score,
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
        wfh_bypass,
        remote_bypass,
      }),
    );
    return log;
  }

  async roster(opts?: { date?: string; start_date?: string; end_date?: string }) {
    let start: string;
    let end: string;
    let days: string[];
    try {
      ({ start, end, days } = parseRosterRange(opts || {}));
    } catch (err) {
      throw new BadRequestException(err instanceof Error ? err.message : 'Invalid date range');
    }
    const { from, to } = rangeBoundsIst(start, end);
    const [logs, employees, users, markedPresentRows] = await Promise.all([
      this.repo
        .createQueryBuilder('a')
        .select(['a.id', 'a.employee_id', 'a.type', 'a.event_time'])
        .where('a.event_time >= :from AND a.event_time <= :to', { from, to })
        .orderBy('a.event_time', 'ASC')
        .getMany(),
      this.employees.listForRoster(),
      this.users.find({ select: ['id', 'employee_id', 'email', 'role'] }),
      this.regularization.listApprovedPresentInRange(start, end),
    ]);
    const markedPresentByDay = new Map<string, Set<string>>();
    for (const row of markedPresentRows) {
      const set = markedPresentByDay.get(row.work_date) || new Set<string>();
      set.add(row.employee_id);
      markedPresentByDay.set(row.work_date, set);
    }
    const userByEmployee = new Map(
      users.filter((u) => u.employee_id).map((u) => [u.employee_id as string, u]),
    );
    const employeeById = new Map(employees.map((e) => [e.id, e]));
    const rosterEmployees = employees.map((e) => {
      const linked = userByEmployee.get(e.id);
      const manager = e.reporting_manager_id
        ? employeeById.get(e.reporting_manager_id)
        : undefined;
      const owner = e.bu_owner_id ? employeeById.get(e.bu_owner_id) : undefined;
      return {
        id: e.id,
        code: e.code,
        display_name: e.display_name,
        email: linked?.email || null,
        role: linked?.role || null,
        reporting_manager: manager?.display_name || null,
        bu_owner: owner?.display_name || null,
      };
    });
    return {
      date: start,
      start_date: start,
      end_date: end,
      timezone: ATTENDANCE_TZ,
      employees: buildRosterRange(rosterEmployees, logs, days, markedPresentByDay),
    };
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
