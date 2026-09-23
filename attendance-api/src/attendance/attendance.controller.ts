import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Post,
  Query,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { AttendanceService } from './attendance.service';
import { CreateAttendanceDto, IdentifyDto, VerifyDto } from './dto/attendance.dto';
import { RecognitionService } from '../recognition/recognition.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtUser } from '../auth/jwt.strategy';
import { boundClockInEmployeeId } from '../auth/bound-employee';
import { ConfigService } from '@nestjs/config';
import { REQUIRED_ENROLL_POSES, REQUIRED_FACE_FEATURES } from '../recognition/enrollment';

function bufferFrom(file?: Express.Multer.File, imageB64?: string): Buffer {
  if (file?.buffer) return file.buffer;
  if (imageB64) return Buffer.from(imageB64.replace(/^data:image\/\w+;base64,/, ''), 'base64');
  throw new BadRequestException('Provide multipart file or image_b64');
}

@ApiTags('attendance')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller()
export class AttendanceController {
  constructor(
    private readonly attendance: AttendanceService,
    private readonly recognition: RecognitionService,
    private readonly config: ConfigService,
  ) {}

  @Post('attend/identify')
  @Roles('employee')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage() }))
  @ApiConsumes('multipart/form-data', 'application/json')
  @ApiOperation({
    summary: 'Identify from face crop or embedding (1:1 for employee logins, 1:N for kiosk devices)',
  })
  @ApiBody({ type: IdentifyDto })
  async identify(
    @Body() dto: IdentifyDto,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: JwtUser,
  ) {
    const hasEmbed = Array.isArray(dto.embedding) && dto.embedding.length > 0;
    const imageBuf =
      file?.buffer ||
      (dto.image_b64
        ? Buffer.from(dto.image_b64.replace(/^data:image\/\w+;base64,/, ''), 'base64')
        : Buffer.alloc(0));
    if (!imageBuf.length && !hasEmbed) {
      throw new BadRequestException('Provide multipart file, image_b64, or embedding');
    }
    const siteCode = dto.site_code || user.site_code;
    const boundEmployeeId = boundClockInEmployeeId(user);
    const result = await this.recognition.identify(imageBuf, {
      embedding: dto.embedding,
      clientLiveness: dto.liveness,
      boundEmployeeId,
    });
    const th = this.recognition.thresholds();
    if (!result.ok) {
      return {
        ok: false,
        reason: result.reason,
        similarity: result.similarity,
        liveness: result.liveness,
        thresholds: th,
        face_crop_url: undefined,
        top: result.top,
        device_id: dto.device_id || user.device_id,
        site_code: dto.site_code || user.site_code,
        wfh_bypass: false,
        remote_bypass: false,
      };
    }
    const geofenceEmployeeId = boundEmployeeId || result.match?.employee_id;
    const { wfh_bypass, remote_bypass } = await this.attendance.assertGeofenceUnlessApprovedWfh(
      geofenceEmployeeId,
      siteCode,
      dto.gps?.lat,
      dto.gps?.lng,
      dto.gps?.accuracy,
    );
    return {
      ok: result.ok,
      reason: result.reason,
      employee_id: result.ok ? result.match?.employee_id : undefined,
      employee_code: result.ok ? result.match?.code : undefined,
      name: result.ok ? result.match?.display_name : undefined,
      similarity: result.similarity,
      liveness: result.liveness,
      thresholds: th,
      face_crop_url: undefined,
      top: result.top,
      device_id: dto.device_id || user.device_id,
      site_code: dto.site_code || user.site_code,
      wfh_bypass,
      remote_bypass,
    };
  }

  @Post('attend/verify')
  @Roles('employee')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage() }))
  @ApiConsumes('multipart/form-data', 'application/json')
  @ApiOperation({ summary: '1:1 verify employee_id + face crop' })
  async verify(
    @Body() dto: VerifyDto,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: JwtUser,
  ) {
    const boundEmployeeId = boundClockInEmployeeId(user);
    if (boundEmployeeId && dto.employee_id !== boundEmployeeId) {
      throw new ForbiddenException('You can only clock in with the employee linked to this login');
    }
    const imageBuf = bufferFrom(file, dto.image_b64);
    return this.recognition.verify(boundEmployeeId || dto.employee_id, imageBuf, dto.liveness);
  }

  @Post('attendance')
  @Roles('employee')
  @ApiOperation({ summary: 'Create attendance log (usually after identify)' })
  create(@Body() dto: CreateAttendanceDto, @CurrentUser() user: JwtUser) {
    const boundEmployeeId = boundClockInEmployeeId(user);
    if (boundEmployeeId && dto.employee_id !== boundEmployeeId) {
      throw new ForbiddenException('You can only clock in with the employee linked to this login');
    }
    return this.attendance.create(
      {
        ...dto,
        employee_id: boundEmployeeId || dto.employee_id,
        device_id: dto.device_id || user.device_id,
        site_code: dto.site_code || user.site_code,
      },
      { requireFaceMatch: !!boundEmployeeId },
    );
  }

  @Get('attendance/status')
  @Roles('admin', 'manager', 'hr')
  @ApiOperation({
    summary:
      'Roster: clock-in, clock-out, and status from worked hours (Present ≥9h, Half Day 4–<9h, Absent <4h). Admin, BU, manager, HR.',
  })
  status(@Query('date') date?: string) {
    return this.attendance.roster(date);
  }

  @Get('attendance')
  @Roles('admin', 'manager', 'hr')
  @ApiOperation({ summary: 'Reports / export. format=json|csv|payroll. Admin, BU, manager, HR.' })
  async list(
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('employee_id') employeeId: string,
    @Query('format') format: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const rows = await this.attendance.query(from, to, employeeId);
    if (format === 'csv') {
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=attendance.csv');
      return this.attendance.toCsv(rows);
    }
    if (format === 'payroll') {
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=payroll-export.csv');
      return this.attendance.toPayrollCsv(rows);
    }
    return rows;
  }

  @Get('config')
  @Roles('employee')
  configPublic() {
    return {
      similarity_threshold: this.config.get<number>('recognition.similarityThreshold'),
      liveness_threshold: this.config.get<number>('recognition.livenessThreshold'),
      geofence_enabled: this.config.get<boolean>('geofence.enabled'),
      geofence_radius_m: this.config.get<number>('geofence.defaultRadiusM'),
      geofence_buffer_m: this.config.get<number>('geofence.bufferM'),
      geofence_indoor_radius_m: this.config.get<number>('geofence.indoorRadiusM'),
      geofence_mode: 'polygon',
      recognition_provider: this.config.get<string>('recognition.provider'),
      retention_days: this.config.get<number>('retentionDays'),
      liveness_prompts: ['blink', 'turn_left', 'turn_right', 'smile'],
      required_enroll_poses: [...REQUIRED_ENROLL_POSES],
      required_face_features: [...REQUIRED_FACE_FEATURES],
      min_face_samples: this.config.get<number>('recognition.minFaceSamples') || REQUIRED_ENROLL_POSES.length,
      max_face_samples: this.config.get<number>('recognition.maxFaceSamples') || 10,
    };
  }
}
