import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { RecognitionService } from '../recognition/recognition.service';
import { DatabaseInitService } from '../database/database-init.service';

@ApiTags('health')
@Controller()
export class HealthController {
  constructor(
    private readonly ds: DataSource,
    private readonly recognition: RecognitionService,
    private readonly dbInit: DatabaseInitService,
    private readonly config: ConfigService,
  ) {}

  @Get('health')
  async health() {
    await this.ds.query('SELECT 1');
    const httpsEnabled = this.config.get<boolean>('https.enabled') === true;
    return {
      status: 'ok',
      pgvector: this.dbInit.pgvectorEnabled,
      identify: this.recognition.metrics,
      // Lets the kiosk page point a phone at the secure origin when the camera is blocked.
      https_port: httpsEnabled ? this.config.get<number>('https.port') : null,
    };
  }
}
