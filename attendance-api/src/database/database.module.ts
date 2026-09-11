import { Global, Module } from '@nestjs/common';
import { DatabaseInitService } from './database-init.service';

@Global()
@Module({
  providers: [DatabaseInitService],
  exports: [DatabaseInitService],
})
export class DatabaseModule {}
