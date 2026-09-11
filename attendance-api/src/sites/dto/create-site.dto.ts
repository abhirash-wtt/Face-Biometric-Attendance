import { IsNumber, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateSiteDto {
  @ApiProperty({ example: 'HQ' })
  @IsString()
  code: string;

  @ApiProperty({ example: 'Headquarters' })
  @IsString()
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  lat?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  lng?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  radius_m?: number;
}
