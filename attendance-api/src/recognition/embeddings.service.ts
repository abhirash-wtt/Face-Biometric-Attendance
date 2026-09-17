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
  private outputName = 'embedding';
  private inputDim = 160;
  private isNchw = true;

  constructor(private readonly config: ConfigService) {}

  isModelActive(): boolean {
    return this.session !== null;
  }

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
      this.outputName = this.session.outputNames[0] || 'embedding';

      // Auto-detect whether model expects 160 or 112, NCHW or NHWC
      let detected = false;
      for (const dim of [160, 112, 224]) {
        try {
          const testChw = new ort.Tensor('float32', new Float32Array(1 * 3 * dim * dim), [1, 3, dim, dim]);
          await this.session.run({ [this.inputName]: testChw });
          this.inputDim = dim;
          this.isNchw = true;
          detected = true;
          break;
        } catch {}
        try {
          const testHwc = new ort.Tensor('float32', new Float32Array(1 * dim * dim * 3), [1, dim, dim, 3]);
          await this.session.run({ [this.inputName]: testHwc });
          this.inputDim = dim;
          this.isNchw = false;
          detected = true;
          break;
        } catch {}
      }

      if (!detected) {
        this.inputDim = 160;
        this.isNchw = true;
      }

      this.logger.log(
        `ONNX embeddings ready (${this.inputName} [${this.isNchw ? 'NCHW' : 'NHWC'} ${this.inputDim}x${this.inputDim}] → ${this.outputName})`,
      );
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
      .resize(this.inputDim, this.inputDim, { fit: 'cover' })
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
    const input = this.isNchw
      ? new ort.Tensor('float32', this.hwcToChwNormalized(raw, width, height), [1, 3, height, width])
      : new ort.Tensor('float32', this.hwcNormalized(raw, width, height), [1, height, width, 3]);
    const out = await this.session!.run({ [this.inputName]: input });
    const tensor = out[this.outputName] || out[this.session!.outputNames[0]];
    const emb = Array.from(tensor.data as Float32Array);
    return this.l2normalize(emb);
  }

  private hwcNormalized(raw: Buffer, width: number, height: number): Float32Array {
    const hwc = new Float32Array(width * height * 3);
    for (let i = 0; i < width * height * 3; i += 1) {
      hwc[i] = (raw[i] - 127.5) / 128.0;
    }
    return hwc;
  }

  private hwcToChwNormalized(raw: Buffer, width: number, height: number): Float32Array {
    const chw = new Float32Array(3 * height * width);
    const plane = height * width;
    for (let i = 0; i < plane; i += 1) {
      const r = raw[i * 3];
      const g = raw[i * 3 + 1];
      const b = raw[i * 3 + 2];
      chw[i] = (r - 127.5) / 128.0;
      chw[plane + i] = (g - 127.5) / 128.0;
      chw[2 * plane + i] = (b - 127.5) / 128.0;
    }
    return chw;
  }

  private embedFallback(raw: Buffer, width: number, height: number, channels: number): number[] {
    const cells = 8;
    const cw = Math.floor(width / cells);
    const ch = Math.floor(height / cells);
    const vec: number[] = [];

    // Global color mean to prevent positive DC bias across different people
    let globalR = 0;
    let globalG = 0;
    let globalB = 0;
    const totalPixels = width * height;
    for (let i = 0; i < totalPixels; i += 1) {
      globalR += raw[i * channels];
      globalG += raw[i * channels + 1];
      globalB += raw[i * channels + 2];
    }
    globalR /= (totalPixels * 255);
    globalG /= (totalPixels * 255);
    globalB /= (totalPixels * 255);

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
        vec.push((sums[0] / n / 255) - globalR);
        vec.push((sums[1] / n / 255) - globalG);
        vec.push((sums[2] / n / 255) - globalB);
        vec.push(Math.sqrt(Math.max(0, sq[0] / n - (sums[0] / n) ** 2)) / 255);
        vec.push(Math.sqrt(Math.max(0, sq[1] / n - (sums[1] / n) ** 2)) / 255);
        vec.push(Math.sqrt(Math.max(0, sq[2] / n - (sums[2] / n) ** 2)) / 255);
        vec.push(Math.min(1, grad / (n * 255)));
      }
    }

    const mean = vec.reduce((a, b) => a + b, 0) / vec.length;
    const centered = vec.map((v) => v - mean);
    while (centered.length < 512) centered.push(0);
    return this.l2normalize(centered.slice(0, 512));
  }

  private l2normalize(emb: number[]): number[] {
    let sum = 0;
    for (const v of emb) sum += v * v;
    const norm = Math.sqrt(sum) || 1;
    return emb.map((v) => v / norm);
  }
}
