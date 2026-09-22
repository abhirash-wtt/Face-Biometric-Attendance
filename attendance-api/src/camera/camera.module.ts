import { Module } from '@nestjs/common';
import { CameraBrokerService } from './camera-broker.service';
import { CameraController } from './camera.controller';

@Module({
  controllers: [CameraController],
  providers: [CameraBrokerService],
})
export class CameraModule {}
