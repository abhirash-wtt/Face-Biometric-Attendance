import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Post,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNumber, IsOptional, IsString, IsUUID } from 'class-validator';
import { TemplatesService } from './templates.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard, effectiveRole } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtUser } from '../auth/jwt.strategy';
import { parseEnrollPose } from '../recognition/enrollment';

class EnrollDto {
  @IsUUID()
  employee_id: string;

  @IsOptional()
  @Transform(({ value }) => {
    if (value === '' || value === null || value === undefined) return undefined;
    const n = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(n) ? n : value;
  })
  @IsNumber()
  liveness_score?: number;

  @IsOptional()
  @IsString()
  image_b64?: string;

  @IsOptional()
  @IsString()
  pose?: string;
}

@ApiTags('enroll')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller()
export class TemplatesController {
  constructor(private readonly templates: TemplatesService) {}

  private assertEnrollAccess(user: JwtUser, employeeId: string) {
    if (user.type !== 'user') {
      throw new ForbiddenException('Only signed-in users can manage face enrollment');
    }
    if (effectiveRole(user.role) !== 'admin') {
      if (!user.employee_id) {
        throw new ForbiddenException('This login is not linked to an employee');
      }
      if (employeeId !== user.employee_id) {
        throw new ForbiddenException('You can only manage your own face enrollment');
      }
    }
  }

  @Get('enroll/:employeeId')
  @Roles('admin', 'user')
  @ApiOperation({ summary: 'Face enrollment status: complete only after straight, left, and right samples' })
  status(@Param('employeeId') employeeId: string, @CurrentUser() user: JwtUser) {
    this.assertEnrollAccess(user, employeeId);
    return this.templates.status(employeeId);
  }

  @Post('enroll')
  @Roles('admin', 'user')
  @UseInterceptors(FilesInterceptor('files', 10, { storage: memoryStorage() }))
  @ApiConsumes('multipart/form-data', 'application/json')
  @ApiOperation({
    summary: 'Save one required pose sample (straight | left | right). Enrollment completes after all 3.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        employee_id: { type: 'string' },
        pose: { type: 'string', enum: ['straight', 'left', 'right'] },
        files: { type: 'array', items: { type: 'string', format: 'binary' } },
        image_b64: { type: 'string' },
      },
    },
  })
  enroll(
    @Body() dto: EnrollDto,
    @UploadedFiles() files: Express.Multer.File[],
    @CurrentUser() user: JwtUser,
  ) {
    this.assertEnrollAccess(user, dto.employee_id);
    const pose = parseEnrollPose(dto.pose);
    if (!pose) {
      throw new BadRequestException('pose is required and must be straight, left, or right');
    }
    const buffers = (files || []).map((f) => f.buffer);
    if (dto.image_b64) {
      buffers.push(Buffer.from(dto.image_b64.replace(/^data:image\/\w+;base64,/, ''), 'base64'));
    }
    if (!buffers.length) throw new BadRequestException('Provide files or image_b64');
    return this.templates.enroll(dto.employee_id, buffers, pose, dto.liveness_score);
  }

  @Delete('enroll/:employeeId')
  @Roles('admin', 'user')
  @ApiOperation({ summary: 'Delete all face templates for employee_id (users: own face only)' })
  reset(@Param('employeeId') employeeId: string, @CurrentUser() user: JwtUser) {
    this.assertEnrollAccess(user, employeeId);
    return this.templates.reset(employeeId);
  }
}
