import { BadRequestException, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';
import sharp from 'sharp';

type Ort = typeof import('onnxruntime-node');

@Injectable()
export class EmbeddingsService implements OnModuleInit {
  private readonly logger = new Logger(EmbeddingsService.name);
  private session: import('onnxruntime-node').InferenceSession | null = null;
  private inputName = 'input';
  private outputName = 'embeddings';

  constructor(private readonly config: ConfigService) {}

  async onModuleInit() {
    const modelPath = path.resolve(
      this.config.get<string>('recognition.onnxModelPath') || './models/arcface_mobile.onnx',
    );
    if (!fs.existsSync(modelPath)) {
      this.logger.warn(
        `ONNX model not found at ${modelPath}. Using deterministic prototype embeddings.`,
      );
      return;
    }
    try {
      const ort: Ort = await import('onnxruntime-node');
      this.session = await ort.InferenceSession.create(modelPath, {
        executionProviders: ['cpu'],
      });
      this.inputName = this.session.inputNames[0] || 'input';
      this.outputName = this.session.outputNames[0] || 'embeddings';
      this.logger.log(`ONNX embeddings ready (${this.inputName} → ${this.outputName})`);
    } catch (err) {
      this.logger.warn(`ONNX load failed: ${(err as Error).message}. Using prototype embeddings.`);
      this.session = null;
    }
  }

  async embed(imageBuf: Buffer): Promise<number[]> {
    const { raw, info } = await this.toFaceTensor(imageBuf);
    const channels = info.channels || 3;
    this.assertNotBlank(raw, info.width, info.height, channels);
    if (this.session) {
      return this.embedOnnx(raw, info.width, info.height);
    }
    return this.embedFallback(raw, info.width, info.height, channels);
  }

  private async toFaceTensor(imageBuf: Buffer) {
    const img = sharp(imageBuf)
      .rotate()
      .resize(112, 112, { fit: 'cover' })
      .removeAlpha()
      .toColorspace('srgb');
    const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
    return { raw: data, info };
  }

  private assertNotBlank(raw: Buffer, width: number, height: number, channels: number) {
    let sum = 0;
    const n = width * height;
    for (let i = 0; i < n; i += 1) {
      const o = i * channels;
      sum += 0.299 * raw[o] + 0.587 * raw[o + 1] + 0.114 * raw[o + Math.min(2, channels - 1)];
    }
    if (n === 0 || sum / n < 12) {
      throw new BadRequestException(
        'Camera frame is too dark or empty. Stay on a tab that shows your live preview, then capture again.',
      );
    }
  }

  private async embedOnnx(raw: Buffer, width: number, height: number): Promise<number[]> {
    const ort: Ort = await import('onnxruntime-node');
    const float = this.hwcToChwNormalized(raw, width, height);
    const input = new ort.Tensor('float32', float, [1, 3, height, width]);
    const out = await this.session!.run({ [this.inputName]: input });
    const tensor = out[this.outputName] || out[this.session!.outputNames[0]];
    const emb = Array.from(tensor.data as Float32Array);
    return this.l2normalize(emb);
  }

  private hwcToChwNormalized(raw: Buffer, width: number, height: number): Float32Array {
    const chw = new Float32Array(3 * height * width);
    const plane = height * width;
    for (let i = 0; i < plane; i += 1) {
      const r = raw[i * 3];
      const g = raw[i * 3 + 1];
      const b = raw[i * 3 + 2];
      chw[i] = (r / 255 - 0.5) / 0.5;
      chw[plane + i] = (g / 255 - 0.5) / 0.5;
      chw[2 * plane + i] = (b / 255 - 0.5) / 0.5;
    }
    return chw;
  }

  private embedFallback(raw: Buffer, width: number, height: number, channels: number): number[] {
    const cells = 8;
    const cw = Math.floor(width / cells);
    const ch = Math.floor(height / cells);
    const vec: number[] = [];

    for (let cy = 0; cy < cells; cy += 1) {
      for (let cx = 0; cx < cells; cx += 1) {
        const sums = [0, 0, 0];
        const sq = [0, 0, 0];
        let n = 0;
        let grad = 0;
        for (let y = cy * ch; y < (cy + 1) * ch; y += 1) {
          for (let x = cx * cw; x < (cx + 1) * cw; x += 1) {
            const idx = (y * width + x) * channels;
            const r = raw[idx];
            const g = raw[idx + 1];
            const b = raw[idx + 2];
            sums[0] += r;
            sums[1] += g;
            sums[2] += b;
            sq[0] += r * r;
            sq[1] += g * g;
            sq[2] += b * b;
            n += 1;
            const lum = 0.299 * r + 0.587 * g + 0.114 * b;
            const xNext = Math.min(width - 1, x + 1);
            const yNext = Math.min(height - 1, y + 1);
            const lumX =
              0.299 * raw[(y * width + xNext) * channels] +
              0.587 * raw[(y * width + xNext) * channels + 1] +
              0.114 * raw[(y * width + xNext) * channels + 2];
            const lumY =
              0.299 * raw[(yNext * width + x) * channels] +
              0.587 * raw[(yNext * width + x) * channels + 1] +
              0.114 * raw[(yNext * width + x) * channels + 2];
            grad += Math.abs(lumX - lum) + Math.abs(lumY - lum);
          }
        }
        n = n || 1;
        vec.push(sums[0] / n / 255, sums[1] / n / 255, sums[2] / n / 255);
        vec.push(Math.sqrt(Math.max(0, sq[0] / n - (sums[0] / n) ** 2)) / 255);
        vec.push(Math.sqrt(Math.max(0, sq[1] / n - (sums[1] / n) ** 2)) / 255);
        vec.push(Math.sqrt(Math.max(0, sq[2] / n - (sums[2] / n) ** 2)) / 255);
        vec.push(Math.min(1, grad / (n * 255)));
      }
    }

    while (vec.length < 512) vec.push(0);
    return this.l2normalize(vec.slice(0, 512));
  }

  private l2normalize(emb: number[]): number[] {
    let sum = 0;
    for (const v of emb) sum += v * v;
    const norm = Math.sqrt(sum) || 1;
    return emb.map((v) => v / norm);
  }
}
