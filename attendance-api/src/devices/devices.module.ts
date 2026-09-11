import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Device } from './device.entity';
import { DevicesService } from './devices.service';
import { DevicesController } from './devices.controller';
import { SitesModule } from '../sites/sites.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [TypeOrmModule.forFeature([Device]), SitesModule, AuthModule],
  controllers: [DevicesController],
  providers: [DevicesService],
  exports: [DevicesService],
})
export class DevicesModule {}
