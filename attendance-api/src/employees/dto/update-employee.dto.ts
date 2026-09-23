import { IsIn, IsOptional, IsString, IsUUID, ValidateIf } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateEmployeeDto {
  @ApiPropertyOptional({ example: 'Rahul Saxena' })
  @IsOptional()
  @IsString()
  display_name?: string;

  @ApiPropertyOptional({ enum: ['active', 'inactive'] })
  @IsOptional()
  @IsIn(['active', 'inactive'])
  status?: 'active' | 'inactive';

  @ApiPropertyOptional({ enum: ['onsite', 'remote'] })
  @IsOptional()
  @IsIn(['onsite', 'remote'])
  working_mode?: 'onsite' | 'remote';

  @ApiPropertyOptional({ description: 'Linked employee UUID for Reporting Manager; null clears' })
  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined)
  @IsUUID()
  reporting_manager_id?: string | null;

  @ApiPropertyOptional({ description: 'Linked employee UUID for BU Owner; null clears' })
  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined)
  @IsUUID()
  bu_owner_id?: string | null;
}
