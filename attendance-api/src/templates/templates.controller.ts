import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
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
}

@ApiTags('enroll')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller()
export class TemplatesController {
  constructor(private readonly templates: TemplatesService) {}

  @Post('enroll')
  @Roles('admin', 'user')
  @UseInterceptors(FilesInterceptor('files', 8, { storage: memoryStorage() }))
  @ApiConsumes('multipart/form-data', 'application/json')
  @ApiOperation({ summary: 'Multipart image(s) → face_templates for employee_id (users: own face only)' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        employee_id: { type: 'string' },
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
    if (user.type !== 'user') {
      throw new ForbiddenException('Only signed-in users can enroll faces');
    }
    if (effectiveRole(user.role) !== 'admin') {
      if (!user.employee_id) {
        throw new ForbiddenException('This login is not linked to an employee');
      }
      if (dto.employee_id !== user.employee_id) {
        throw new ForbiddenException('You can only enroll your own face');
      }
    }
    const buffers = (files || []).map((f) => f.buffer);
    if (dto.image_b64) {
      buffers.push(Buffer.from(dto.image_b64.replace(/^data:image\/\w+;base64,/, ''), 'base64'));
    }
    if (!buffers.length) throw new BadRequestException('Provide files or image_b64');
    return this.templates.enroll(dto.employee_id, buffers, dto.liveness_score);
  }
}
