import { IsInt, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateShiftDto {
  @ApiProperty({ example: 'General' })
  @IsString()
  name: string;

  @ApiProperty({ example: '09:00:00' })
  @IsString()
  start_time: string;

  @ApiProperty({ example: '18:00:00' })
  @IsString()
  end_time: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  grace_minutes?: number;
}
