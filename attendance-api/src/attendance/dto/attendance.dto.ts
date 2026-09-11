import { IsArray, IsNumber, IsObject, IsOptional, IsString, IsUUID } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class GpsDto {
  @IsNumber()
  lat: number;

  @IsNumber()
  lng: number;
}

export class IdentifyDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  device_id?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  site_code?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  gps?: { lat: number; lng: number };

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  image_b64?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  @IsNumber({}, { each: true })
  embedding?: number[];

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  liveness?: number;
}

export class VerifyDto {
  @IsUUID()
  employee_id: string;

  @IsOptional()
  @IsString()
  image_b64?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  liveness?: number;
}

export class CreateAttendanceDto {
  @IsUUID()
  employee_id: string;

  @IsString()
  type: 'IN' | 'OUT';

  @IsOptional()
  @IsString()
  device_id?: string;

  @IsOptional()
  @IsString()
  site_code?: string;

  @IsOptional()
  @IsNumber()
  gps_lat?: number;

  @IsOptional()
  @IsNumber()
  gps_lng?: number;

  @IsOptional()
  gps?: { lat: number; lng: number };

  @IsOptional()
  @IsNumber()
  similarity?: number;

  @IsOptional()
  @IsNumber()
  liveness_score?: number;

  @IsOptional()
  @IsString()
  face_crop_url?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  image_b64?: string;
}
