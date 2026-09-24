import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { RegisterDto, ResendRegisterOtpDto, VerifyRegisterOtpDto } from './dto/register.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtUser } from './jwt.strategy';
import { IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

class RefreshDto {
  @ApiProperty()
  @IsString()
  refresh_token: string;
}

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('register')
  @ApiOperation({
    summary:
      'Start self-registration with an official @walkingtree.tech email; sends a verification OTP',
  })
  register(@Body() dto: RegisterDto) {
    return this.auth.startRegistration(dto.email, dto.password, dto.display_name);
  }

  @Post('register/verify')
  @ApiOperation({
    summary: 'Verify the OTP sent to the company email and create the employee account',
  })
  verifyRegister(@Body() dto: VerifyRegisterOtpDto) {
    return this.auth.verifyRegistration(dto.email, dto.otp);
  }

  @Post('register/resend')
  @ApiOperation({ summary: 'Resend the registration OTP to the company email' })
  resendRegisterOtp(@Body() dto: ResendRegisterOtpDto) {
    return this.auth.resendRegistrationOtp(dto.email);
  }

  @Post('login')
  @ApiOperation({ summary: 'User login; returns access + refresh tokens' })
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto.email, dto.password);
  }

  @Post('refresh')
  @ApiOperation({ summary: 'Rotate refresh token' })
  refresh(@Body() dto: RefreshDto) {
    return this.auth.refresh(dto.refresh_token);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  me(@CurrentUser() user: JwtUser) {
    return this.auth.me(user);
  }

  @Post('change-password')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Change password after verifying the current password' })
  changePassword(@CurrentUser() user: JwtUser, @Body() dto: ChangePasswordDto) {
    return this.auth.changePassword(user, dto.current_password, dto.new_password);
  }
}
