import sharp from 'sharp';
import { FaceQualityService } from './face-quality.service';

async function paintFaceLikeImage(blank = false): Promise<Buffer> {
  const width = 160;
  const height = 160;
  const raw = Buffer.alloc(width * height * 3, blank ? 4 : 18);
  if (!blank) {
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const nx = (x - 80) / 46;
        const ny = (y - 84) / 58;
        if (nx * nx + ny * ny > 1) continue;
        const stripe = ((x + y) % 6 < 3 ? 22 : -18) + (((x * 13 + y * 7) % 23) - 11);
        const r = 176 + stripe;
        const g = 132 + Math.round(stripe * 0.6);
        const b = 108 + Math.round(stripe * 0.4);
        const o = (y * width + x) * 3;
        raw[o] = Math.max(0, Math.min(255, r));
        raw[o + 1] = Math.max(0, Math.min(255, g));
        raw[o + 2] = Math.max(0, Math.min(255, b));
      }
    }
  }
  return sharp(raw, { raw: { width, height, channels: 3 } })
    .jpeg({ quality: 90 })
    .toBuffer();
}

describe('FaceQualityService', () => {
  const service = new FaceQualityService();

  it('accepts a face-like frame with all required regions', async () => {
    const result = await service.assess(await paintFaceLikeImage(false));
    expect(result.ok).toBe(true);
    expect(result.coverage).toBe(1);
    expect(result.missing).toEqual([]);
    expect(result.present).toEqual(['forehead', 'left_eye', 'right_eye', 'nose', 'mouth']);
  });

  it('rejects a blank frame as incomplete facial data', async () => {
    const result = await service.assess(await paintFaceLikeImage(true));
    expect(result.ok).toBe(false);
    expect(result.coverage).toBeLessThan(1);
    expect(result.missing.length).toBeGreaterThan(0);
  });
});
