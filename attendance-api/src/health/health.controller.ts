import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
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
  ) {}

  @Get('health')
  async health() {
    await this.ds.query('SELECT 1');
    return {
      status: 'ok',
      pgvector: this.dbInit.pgvectorEnabled,
      identify: this.recognition.metrics,
    };
  }
}
