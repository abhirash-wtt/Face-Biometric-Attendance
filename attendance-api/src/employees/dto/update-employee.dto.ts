import { IsIn, IsOptional, IsString } from 'class-validator';
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
}
