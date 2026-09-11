export function toPgVector(values: number[]): string {
  return `[${values.map((v) => Number(v).toFixed(8)).join(',')}]`;
}

export function parsePgVector(raw: string | number[]): number[] {
  if (Array.isArray(raw)) return raw.map(Number);
  const inner = String(raw).trim().replace(/^\[/, '').replace(/\]$/, '');
  if (!inner) return [];
  return inner.split(',').map((v) => Number(v.trim()));
}

export function cosineSimilarity(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < n; i += 1) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb) || 1;
  return dot / denom;
}

export function haversineMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

export function isWithinGeofence(
  lat: number,
  lng: number,
  siteLat?: number | null,
  siteLng?: number | null,
  radiusM = 200,
): boolean {
  if (siteLat == null || siteLng == null) return true;
  return haversineMeters(lat, lng, siteLat, siteLng) <= radiusM;
}
