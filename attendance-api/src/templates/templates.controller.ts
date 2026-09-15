import {
  BadRequestException,
  Body,
  Controller,
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
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';

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
  @Roles('admin')
  @UseInterceptors(FilesInterceptor('files', 8, { storage: memoryStorage() }))
  @ApiConsumes('multipart/form-data', 'application/json')
  @ApiOperation({ summary: 'Multipart image(s) → face_templates for employee_id' })
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
  ) {
    const buffers = (files || []).map((f) => f.buffer);
    if (dto.image_b64) {
      buffers.push(Buffer.from(dto.image_b64.replace(/^data:image\/\w+;base64,/, ''), 'base64'));
    }
    if (!buffers.length) throw new BadRequestException('Provide files or image_b64');
    return this.templates.enroll(dto.employee_id, buffers, dto.liveness_score);
  }
}
