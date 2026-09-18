import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { RegularizationRequestType } from '../wfh-request.entity';

export class CreateWfhRequestDto {
  @ApiProperty({
    example: '2026-09-18',
    description:
      'Request date (YYYY-MM-DD, Asia/Kolkata). WFH: today or future. On Duty: today or past.',
  })
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'work_date must be YYYY-MM-DD' })
  work_date: string;

  @ApiPropertyOptional({
    example: 'mark_present',
    enum: ['wfh', 'mark_present'],
    description:
      'wfh = skip geofence on that date. mark_present = ask admin to mark attendance Present without clock times.',
  })
  @IsOptional()
  @IsString()
  @IsIn(['wfh', 'mark_present'])
  request_type?: RegularizationRequestType;

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
