import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { StorageService } from '../storage/storage.service';

@Injectable()
export class RetentionService {
  private readonly logger = new Logger(RetentionService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly storage: StorageService,
    private readonly ds: DataSource,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async purge() {
    const days = this.config.get<number>('retentionDays') || 90;
    const removed = await this.storage.deleteOlderThan(days);
    await this.ds.query(
      `UPDATE attendance_logs SET face_crop_url = NULL
       WHERE event_time < NOW() - ($1 || ' days')::interval
         AND face_crop_url IS NOT NULL`,
      [String(days)],
    );
    this.logger.log(JSON.stringify({ event: 'retention_purge', days, filesRemoved: removed }));
  }
}
