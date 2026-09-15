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

function toLocalMeters(lat0: number, lng0: number, lat: number, lng: number) {
  const cos = Math.cos((lat0 * Math.PI) / 180) || 1e-6;
  return {
    x: (lng - lng0) * 111320 * cos,
    y: (lat - lat0) * 111320,
  };
}

function distancePointToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  const abx = bx - ax;
  const aby = by - ay;
  const ab2 = abx * abx + aby * aby;
  if (ab2 === 0) return Math.hypot(px - ax, py - ay);
  const t = Math.max(0, Math.min(1, ((px - ax) * abx + (py - ay) * aby) / ab2));
  return Math.hypot(px - (ax + t * abx), py - (ay + t * aby));
}

export function distanceToPolygonMeters(lat: number, lng: number, ring: LatLng[]): number {
  if (!ring || ring.length < 3) return Number.POSITIVE_INFINITY;
  if (isPointInPolygon(lat, lng, ring)) return 0;
  let min = Number.POSITIVE_INFINITY;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const a = toLocalMeters(lat, lng, ring[j][0], ring[j][1]);
    const b = toLocalMeters(lat, lng, ring[i][0], ring[i][1]);
    min = Math.min(min, distancePointToSegment(0, 0, a.x, a.y, b.x, b.y));
  }
  return min;
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
  accuracyM?: number,
  indoorRadiusM = 40,
): boolean {
  const ring = site.geofence_polygon;
  const reported = Number.isFinite(accuracyM) ? Math.max(0, Number(accuracyM)) : 30;
  const acc = Math.min(reported, 45);

  if (Array.isArray(ring) && ring.length >= 3) {
    const poly = bufferM > 0 ? expandPolygonMeters(ring, bufferM) : ring;
    if (isPointInPolygon(lat, lng, poly)) return true;
    if (distanceToPolygonMeters(lat, lng, poly) <= acc) return true;
  }

  if (site.lat != null && site.lng != null) {
    const envelope = Math.max(indoorRadiusM, 40);
    if (haversineMeters(lat, lng, site.lat, site.lng) <= envelope) return true;
  }

  return isWithinGeofence(lat, lng, site.lat, site.lng, (site.radius_m ?? 200) + bufferM);
}

