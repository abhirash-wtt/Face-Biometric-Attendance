import { IsIn, IsOptional, IsString, IsUUID, Matches, ValidateIf } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateEmployeeDto {
  @ApiProperty({ example: 'EMP001' })
  @IsString()
  @Matches(/^[A-Za-z0-9_-]+$/)
  code: string;

  @ApiProperty({ example: 'Rahul Saxena' })
  @IsString()
  display_name: string;

  @ApiPropertyOptional({ enum: ['active', 'inactive'] })
  @IsOptional()
  @IsString()
  status?: 'active' | 'inactive';

  @ApiPropertyOptional({ enum: ['onsite', 'remote'], default: 'onsite' })
  @IsOptional()
  @IsIn(['onsite', 'remote'])
  working_mode?: 'onsite' | 'remote';

  @ApiPropertyOptional({ description: 'Linked employee UUID for Reporting Manager' })
  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined)
  @IsUUID()
  reporting_manager_id?: string | null;

  @ApiPropertyOptional({ description: 'Linked employee UUID for BU Owner' })
  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined)
  @IsUUID()
  bu_owner_id?: string | null;
}
