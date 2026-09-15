import {
  BadRequestException,
  Body,
  Controller,
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
import { StorageService } from '../storage/storage.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtUser } from '../auth/jwt.strategy';
import { ConfigService } from '@nestjs/config';

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
    private readonly storage: StorageService,
    private readonly config: ConfigService,
  ) {}

  @Post('attend/identify')
  @Roles('user')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage() }))
  @ApiConsumes('multipart/form-data', 'application/json')
  @ApiOperation({ summary: '1:N identify from face crop or embedding' })
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
    await this.attendance.assertIdentifyGeofence(siteCode, dto.gps?.lat, dto.gps?.lng);
    const result = await this.recognition.identify(imageBuf, {
      embedding: dto.embedding,
      clientLiveness: dto.liveness,
    });
    let face_crop_url: string | undefined;
    if (imageBuf.length) {
      face_crop_url = await this.storage.put(imageBuf);
    }
    const th = this.recognition.thresholds();
    return {
      ok: result.ok,
      reason: result.reason,
      employee_id: result.match?.employee_id,
      employee_code: result.match?.code,
      name: result.match?.display_name,
      similarity: result.similarity,
      liveness: result.liveness,
      thresholds: th,
      face_crop_url,
      top: result.top,
      device_id: dto.device_id || user.device_id,
      site_code: dto.site_code || user.site_code,
    };
  }

  @Post('attend/verify')
  @Roles('user')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage() }))
  @ApiConsumes('multipart/form-data', 'application/json')
  @ApiOperation({ summary: '1:1 verify employee_id + face crop' })
  async verify(@Body() dto: VerifyDto, @UploadedFile() file: Express.Multer.File) {
    const imageBuf = bufferFrom(file, dto.image_b64);
    return this.recognition.verify(dto.employee_id, imageBuf, dto.liveness);
  }

  @Post('attendance')
  @Roles('user')
  @ApiOperation({ summary: 'Create attendance log (usually after identify)' })
  create(@Body() dto: CreateAttendanceDto, @CurrentUser() user: JwtUser) {
    return this.attendance.create({
      ...dto,
      device_id: dto.device_id || user.device_id,
      site_code: dto.site_code || user.site_code,
    });
  }

  @Get('attendance')
  @Roles('admin')
  @ApiOperation({ summary: 'Reports / export. format=json|csv|payroll' })
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
  @Roles('user')
  configPublic() {
    return {
      similarity_threshold: this.config.get<number>('recognition.similarityThreshold'),
      liveness_threshold: this.config.get<number>('recognition.livenessThreshold'),
      geofence_enabled: this.config.get<boolean>('geofence.enabled'),
      geofence_radius_m: this.config.get<number>('geofence.defaultRadiusM'),
      geofence_buffer_m: this.config.get<number>('geofence.bufferM'),
      geofence_mode: 'polygon',
      recognition_provider: this.config.get<string>('recognition.provider'),
      retention_days: this.config.get<number>('retentionDays'),
      liveness_prompts: ['blink', 'turn_left', 'turn_right', 'smile'],
    };
  }
}
