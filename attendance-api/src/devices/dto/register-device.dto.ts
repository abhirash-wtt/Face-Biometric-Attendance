import { IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class RegisterDeviceDto {
  @ApiProperty({ example: 'KIOSK-01' })
  @IsString()
  device_id: string;

  @ApiPropertyOptional({ example: 'HQ' })
  @IsOptional()
  @IsString()
  site_code?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: 'One-time bind secret when not using an admin token' })
  @IsOptional()
  @IsString()
  bootstrap_secret?: string;
}
