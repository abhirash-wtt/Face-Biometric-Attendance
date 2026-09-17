import { cosineSimilarity, isPointInPolygon, isWithinGeofence, isWithinSiteGeofence } from './math';
import { HQ_OFFICE } from '../sites/hq-office';

describe('threshold and geo helpers', () => {
  it('accepts cosine_sim >= 0.9', () => {
    const a = [1, 0, 0];
    const b = [1, 0, 0];
    expect(cosineSimilarity(a, b)).toBeGreaterThanOrEqual(0.9);
  });

  it('rejects orthogonal vectors', () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBeLessThan(0.9);
  });

  it('geofence accepts a point inside radius', () => {
    expect(isWithinGeofence(12.9716, 77.5946, 12.9716, 77.5946, 200)).toBe(true);
  });

  it('geofence rejects a distant point', () => {
    expect(isWithinGeofence(13.08, 80.27, 12.9716, 77.5946, 200)).toBe(false);
  });

  it('office polygon contains the Maps pin', () => {
    expect(isPointInPolygon(HQ_OFFICE.lat, HQ_OFFICE.lng, HQ_OFFICE.geofence_polygon)).toBe(true);
    expect(isWithinSiteGeofence(HQ_OFFICE.lat, HQ_OFFICE.lng, HQ_OFFICE, 0)).toBe(true);
  });

  it('office polygon rejects a point far from the office', () => {
    expect(isPointInPolygon(27.15313, 78.0503, HQ_OFFICE.geofence_polygon)).toBe(false);
    expect(isWithinSiteGeofence(27.16, 78.06, HQ_OFFICE, 12, 30, 40)).toBe(false);
  });

  it('indoor GPS near the building is accepted on every floor', () => {
    const eastOfPin = 27.1531296;
    const slightlyEast = 78.05072;
    expect(isWithinSiteGeofence(eastOfPin, slightlyEast, HQ_OFFICE, 12, 25, 40)).toBe(true);
  });
});
