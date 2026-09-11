import { Global, Module } from '@nestjs/common';
import { StorageService } from './storage.service';
import { EvidenceController } from './evidence.controller';

@Global()
@Module({
  providers: [StorageService],
  controllers: [EvidenceController],
  exports: [StorageService],
})
export class StorageModule {}
