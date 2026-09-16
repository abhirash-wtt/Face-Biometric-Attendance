import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class CreateWfhRequestDto {
  @ApiProperty({
    example: '2026-09-18',
    description: 'WFH date (YYYY-MM-DD, Asia/Kolkata). Same-day requests are allowed; past dates are not.',
  })
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'work_date must be YYYY-MM-DD' })
  work_date: string;

  @ApiProperty({ example: 'Client workshop from home' })
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason: string;

  @ApiPropertyOptional({
    description: 'Ignored for employee logins (forced to linked employee). Admin may set.',
  })
  @IsOptional()
  @IsString()
  employee_id?: string;
}
