import { Module } from '@nestjs/common';
import { EmbeddingsService } from './embeddings.service';
import { LivenessService } from './liveness.service';
import { ComprefaceService } from './compreface.service';
import { RecognitionService } from './recognition.service';
import { FaceQualityService } from './face-quality.service';

@Module({
  providers: [EmbeddingsService, LivenessService, ComprefaceService, RecognitionService, FaceQualityService],
  exports: [RecognitionService, EmbeddingsService, LivenessService, FaceQualityService],
})
export class RecognitionModule {}
