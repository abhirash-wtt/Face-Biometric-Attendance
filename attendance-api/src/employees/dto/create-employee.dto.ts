import { IsOptional, IsString, Matches } from 'class-validator';
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
}
