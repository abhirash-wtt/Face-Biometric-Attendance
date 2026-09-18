import { Transform } from 'class-transformer';
import { IsEmail, IsString, Length, Matches, MaxLength, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { IsCompanyEmail } from '../company-email';

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
  @IsCompanyEmail()
  email: string;

  @ApiProperty()
  @IsString()
  @MinLength(6)
  @MaxLength(128)
  password: string;
}

export class VerifyRegisterOtpDto {
  @ApiProperty({ example: 'priya.sharma@walkingtree.tech' })
  @Transform(({ value }) => String(value ?? '').trim().toLowerCase())
  @IsEmail()
  @IsCompanyEmail()
  email: string;

  @ApiProperty({ example: '123456' })
  @Transform(({ value }) => String(value ?? '').trim())
  @IsString()
  @Length(6, 6)
  @Matches(/^\d{6}$/, { message: 'Enter the 6-digit verification code sent to your email' })
  otp: string;
}

export class ResendRegisterOtpDto {
  @ApiProperty({ example: 'priya.sharma@walkingtree.tech' })
  @Transform(({ value }) => String(value ?? '').trim().toLowerCase())
  @IsEmail()
  @IsCompanyEmail()
  email: string;
}
