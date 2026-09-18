import { Injectable } from '@nestjs/common';
import sharp from 'sharp';
import { FaceFeature, REQUIRED_FACE_FEATURES } from './enrollment';

type Region = { id: FaceFeature; x0: number; y0: number; x1: number; y1: number };

const FACE_REGIONS: Region[] = [
  { id: 'forehead', x0: 0.28, y0: 0.14, x1: 0.72, y1: 0.34 },
  { id: 'left_eye', x0: 0.22, y0: 0.30, x1: 0.48, y1: 0.48 },
  { id: 'right_eye', x0: 0.52, y0: 0.30, x1: 0.78, y1: 0.48 },
  { id: 'nose', x0: 0.38, y0: 0.42, x1: 0.62, y1: 0.64 },
  { id: 'mouth', x0: 0.32, y0: 0.60, x1: 0.68, y1: 0.80 },
];

export type FaceQualityResult = {
  ok: boolean;
  coverage: number;
  present: FaceFeature[];
  missing: FaceFeature[];
  reason?: string;
};

@Injectable()
export class FaceQualityService {
  async assess(imageBuf: Buffer): Promise<FaceQualityResult> {
    const { data, info } = await sharp(imageBuf)
      .rotate()
      .resize(160, 160, { fit: 'cover' })
      .removeAlpha()
      .toColorspace('srgb')
      .raw()
      .toBuffer({ resolveWithObject: true });

    const width = info.width;
    const height = info.height;
    const channels = info.channels || 3;
    const gray = this.toGray(data, width, height, channels);
    const present: FaceFeature[] = [];
    const missing: FaceFeature[] = [];

    for (const region of FACE_REGIONS) {
      if (this.regionHasFeatures(gray, width, height, region)) present.push(region.id);
      else missing.push(region.id);
    }

    const coverage = Number((present.length / REQUIRED_FACE_FEATURES.length).toFixed(4));
    if (present.length === REQUIRED_FACE_FEATURES.length) {
      return { ok: true, coverage: 1, present, missing: [] };
    }

    return {
      ok: false,
      coverage,
      present,
      missing,
      reason: this.failReason(missing, gray, width, height),
    };
  }

  private failReason(missing: FaceFeature[], gray: Uint8Array, width: number, height: number): string {
    let sum = 0;
    for (let i = 0; i < gray.length; i += 1) sum += gray[i];
    const mean = sum / (width * height);
    if (mean < 22) {
      return 'Face is too dark. Improve lighting and keep your face inside the guide.';
    }
    if (mean > 240) {
      return 'Face is overexposed. Reduce glare and keep your face inside the guide.';
    }
    const labels = missing.map((id) => id.replace('_', ' ')).join(', ');
    return `Could not capture 100% of required facial features (${labels}). Center your face in the guide and try again.`;
  }

  private toGray(raw: Buffer, width: number, height: number, channels: number): Uint8Array {
    const gray = new Uint8Array(width * height);
    for (let i = 0; i < width * height; i += 1) {
      const o = i * channels;
      gray[i] = Math.round(
        0.299 * raw[o] + 0.587 * raw[o + 1] + 0.114 * raw[o + Math.min(2, channels - 1)],
      );
    }
    return gray;
  }

  private regionHasFeatures(gray: Uint8Array, width: number, height: number, region: Region): boolean {
    const x0 = Math.max(0, Math.floor(region.x0 * width));
    const y0 = Math.max(0, Math.floor(region.y0 * height));
    const x1 = Math.min(width, Math.ceil(region.x1 * width));
    const y1 = Math.min(height, Math.ceil(region.y1 * height));
    let sum = 0;
    let sumSq = 0;
    let lap = 0;
    let n = 0;

    for (let y = y0; y < y1; y += 1) {
      for (let x = x0; x < x1; x += 1) {
        const c = gray[y * width + x];
        sum += c;
        sumSq += c * c;
        n += 1;
        if (y > y0 && y < y1 - 1 && x > x0 && x < x1 - 1) {
          const l =
            gray[(y - 1) * width + x] +
            gray[(y + 1) * width + x] +
            gray[y * width + (x - 1)] +
            gray[y * width + (x + 1)] -
            4 * c;
          lap += l * l;
        }
      }
    }

    if (n < 20) return false;
    const mean = sum / n;
    const variance = Math.max(0, sumSq / n - mean * mean);
    const sharpness = lap / Math.max(1, n);
    return mean >= 22 && mean <= 238 && variance >= 40 && sharpness >= 18;
  }
}
