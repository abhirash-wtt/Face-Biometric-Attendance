import { Transform } from 'class-transformer';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RegisterDto {
  @ApiProperty({ example: 'Priya Sharma' })
  @Transform(({ value }) => String(value ?? '').trim())
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  display_name: string;

  @ApiProperty({ example: 'priya.sharma@walkingtree.tech' })
  @Transform(({ value }) => String(value ?? '').trim().toLowerCase())
  @IsEmail()
  email: string;

  @ApiProperty()
  @IsString()
  @MinLength(6)
  @MaxLength(128)
  password: string;
}
