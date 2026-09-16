import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

@Injectable()
export class ComprefaceService {
  private readonly logger = new Logger(ComprefaceService.name);

  constructor(private readonly config: ConfigService) {}

  enabled(): boolean {
    return this.config.get<string>('recognition.provider') === 'compreface';
  }

  private headers() {
    return {
      'x-api-key': this.config.get<string>('recognition.comprefaceApiKey') || '',
    };
  }

  private base() {
    return (this.config.get<string>('recognition.comprefaceUrl') || 'http://localhost:8000').replace(
      /\/$/,
      '',
    );
  }

  async enroll(subject: string, imageBuf: Buffer): Promise<void> {
    const form = new FormData();
    form.append('file', new Blob([new Uint8Array(imageBuf)], { type: 'image/jpeg' }), 'face.jpg');
    await axios.post(
      `${this.base()}/api/v1/recognition/faces?subject=${encodeURIComponent(subject)}`,
      form,
      { headers: this.headers(), timeout: 15000 },
    );
  }

  async deleteSubject(subject: string): Promise<void> {
    try {
      await axios.delete(
        `${this.base()}/api/v1/recognition/subjects/${encodeURIComponent(subject)}`,
        { headers: this.headers(), timeout: 15000 },
      );
    } catch (err) {
      this.logger.warn(`CompreFace delete subject failed: ${(err as Error).message}`);
    }
  }

  async recognize(imageBuf: Buffer): Promise<{ subject: string; similarity: number } | null> {
    const form = new FormData();
    form.append('file', new Blob([new Uint8Array(imageBuf)], { type: 'image/jpeg' }), 'live.jpg');
    try {
      const res = await axios.post(`${this.base()}/api/v1/recognition/recognize`, form, {
        headers: this.headers(),
        timeout: 15000,
      });
      const result = res.data?.result?.[0]?.subjects?.[0];
      if (!result) return null;
      return { subject: result.subject, similarity: Number(result.similarity) };
    } catch (err) {
      this.logger.warn(`CompreFace recognize failed: ${(err as Error).message}`);
      return null;
    }
  }
}
