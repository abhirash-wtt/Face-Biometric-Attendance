import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { DevicesService } from './devices.service';
import { RegisterDeviceDto } from './dto/register-device.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../common/guards/optional-jwt.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtUser } from '../auth/jwt.strategy';

@ApiTags('devices')
@Controller('devices')
export class DevicesController {
  constructor(private readonly devices: DevicesService) {}

  @Post('register')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({ summary: 'One-time device bind; returns device token' })
  register(@Body() dto: RegisterDeviceDto, @CurrentUser() user?: JwtUser) {
    return this.devices.register(dto, user);
  }

  @Get()
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'supervisor')
  list() {
    return this.devices.findAll();
  }
}
