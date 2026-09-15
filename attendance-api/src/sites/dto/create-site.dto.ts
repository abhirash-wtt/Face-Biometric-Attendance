import { IsArray, IsNumber, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateSiteDto {
  @ApiProperty({ example: 'HQ' })
  @IsString()
  code: string;

  @ApiProperty({ example: 'Walking Tree Technologies — Agra' })
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

  @ApiPropertyOptional({ description: 'Rectangular building ring as [lat, lng] vertices' })
  @IsOptional()
  @IsArray()
  geofence_polygon?: Array<[number, number]>;
}
