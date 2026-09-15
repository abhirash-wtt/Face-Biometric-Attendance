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

export type LatLng = [number, number];

export function isPointInPolygon(lat: number, lng: number, ring: LatLng[]): boolean {
  if (!ring || ring.length < 3) return false;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const yi = ring[i][0];
    const xi = ring[i][1];
    const yj = ring[j][0];
    const xj = ring[j][1];
    const intersect = xi > lng !== xj > lng && lat < yi + ((lng - xi) / (xj - xi)) * (yj - yi);
    if (intersect) inside = !inside;
  }
  return inside;
}

export function expandPolygonMeters(ring: LatLng[], meters: number): LatLng[] {
  if (!ring.length || !meters) return ring;
  const cLat = ring.reduce((s, p) => s + p[0], 0) / ring.length;
  const cLng = ring.reduce((s, p) => s + p[1], 0) / ring.length;
  const cos = Math.cos((cLat * Math.PI) / 180) || 1e-6;
  return ring.map(([lat, lng]) => {
    const north = (lat - cLat) * 111320;
    const east = (lng - cLng) * 111320 * cos;
    const dist = Math.hypot(north, east) || 1;
    const f = (dist + meters) / dist;
    return [cLat + (north * f) / 111320, cLng + (east * f) / (111320 * cos)];
  });
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

export function isWithinSiteGeofence(
  lat: number,
  lng: number,
  site: {
    lat?: number | null;
    lng?: number | null;
    radius_m?: number | null;
    geofence_polygon?: LatLng[] | null;
  },
  bufferM = 0,
): boolean {
  const ring = site.geofence_polygon;
  if (Array.isArray(ring) && ring.length >= 3) {
    const poly = bufferM > 0 ? expandPolygonMeters(ring, bufferM) : ring;
    return isPointInPolygon(lat, lng, poly);
  }
  return isWithinGeofence(lat, lng, site.lat, site.lng, site.radius_m ?? 200);
}

