import { cosineSimilarity, isWithinGeofence } from './math';

describe('threshold and geo helpers', () => {
  it('accepts cosine_sim >= 0.95', () => {
    const a = [1, 0, 0];
    const b = [1, 0, 0];
    expect(cosineSimilarity(a, b)).toBeGreaterThanOrEqual(0.95);
  });

  it('rejects orthogonal vectors', () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBeLessThan(0.95);
  });

  it('geofence accepts a point inside radius', () => {
    expect(isWithinGeofence(12.9716, 77.5946, 12.9716, 77.5946, 200)).toBe(true);
  });

  it('geofence rejects a distant point', () => {
    expect(isWithinGeofence(13.08, 80.27, 12.9716, 77.5946, 200)).toBe(false);
  });
});
