import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
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
  @ApiOperation({ summary: 'Self-register as an employee user; returns access + refresh tokens' })
  register(@Body() dto: RegisterDto) {
    return this.auth.register(dto.email, dto.password, dto.display_name);
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
}
