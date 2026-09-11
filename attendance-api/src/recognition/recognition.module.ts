import { Module } from '@nestjs/common';
import { EmbeddingsService } from './embeddings.service';
import { LivenessService } from './liveness.service';
import { ComprefaceService } from './compreface.service';
import { RecognitionService } from './recognition.service';

@Module({
  providers: [EmbeddingsService, LivenessService, ComprefaceService, RecognitionService],
  exports: [RecognitionService, EmbeddingsService, LivenessService],
})
export class RecognitionModule {}
