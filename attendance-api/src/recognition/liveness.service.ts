import { Injectable } from '@nestjs/common';
import sharp from 'sharp';

@Injectable()
export class LivenessService {
  async score(imageBuf: Buffer, clientScore?: number): Promise<number> {
    const quality = await this.qualityScore(imageBuf);
    const active = clientScore == null ? 1 : Math.max(0, Math.min(1, clientScore));
    return Number((0.7 * active + 0.3 * quality).toFixed(4));
  }

  private async qualityScore(imageBuf: Buffer): Promise<number> {
    const { data, info } = await sharp(imageBuf)
      .rotate()
      .resize(160, 160, { fit: 'cover' })
      .grayscale()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const w = info.width;
    const h = info.height;
    let sum = 0;
    let lap = 0;
    for (let y = 1; y < h - 1; y += 1) {
      for (let x = 1; x < w - 1; x += 1) {
        const c = data[y * w + x];
        sum += c;
        const l =
          data[(y - 1) * w + x] +
          data[(y + 1) * w + x] +
          data[y * w + (x - 1)] +
          data[y * w + (x + 1)] -
          4 * c;
        lap += l * l;
      }
    }
    const n = (w - 2) * (h - 2) || 1;
    const mean = sum / (w * h);
    const sharpness = lap / n;
    const brightness = 1 - Math.min(1, Math.abs(mean - 120) / 120);
    const sharpScore = Math.min(1, sharpness / 1800);
    if (mean < 18 || mean > 245) return 0.1;
    return Number((0.55 * sharpScore + 0.45 * brightness).toFixed(4));
  }
}
