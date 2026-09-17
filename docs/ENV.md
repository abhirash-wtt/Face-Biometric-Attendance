# Environment configuration

Copy `attendance-api/.env.example` to `.env` per environment (`local` / `dev` / `stage` / `prod`).

| Variable | Default | Purpose |
|---|---|---|
| `NODE_ENV` | local | Environment name |
| `PORT` | 3000 | HTTP port |
| `HTTPS_ENABLED` | false | Also serve HTTPS, required for camera/GPS on phone browsers |
| `HTTPS_PORT` | 3443 | HTTPS port |
| `HTTPS_KEY_PATH` / `HTTPS_CERT_PATH` | ./certs/dev-{key,cert}.pem | TLS material; `npm run cert:dev` creates a local pair |
| `DATABASE_*` | app/app@localhost:5432/attendance | PostgreSQL |
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` | change-me-* | JWT secrets (rotate in prod) |
| `JWT_ACCESS_TTL` | 15m | Short-lived access token |
| `JWT_REFRESH_TTL` | 7d | Refresh token |
| `REDIS_HOST` / `REDIS_PORT` | localhost:6379 | Cache, refresh tokens; in-memory fallback |
| `STORAGE_PROVIDER` | local | `local` or `minio` |
| `MINIO_*` | minio/minio123 | Object storage for face crops |
| `RECOGNITION_PROVIDER` | internal | `internal` (ONNX) or `compreface` |
| `ONNX_MODEL_PATH` | ./models/arcface_mobile.onnx | ArcFace model |
| `SIMILARITY_THRESHOLD` | 0.90 | Cosine accept threshold (minimum 90%) |
| `LIVENESS_THRESHOLD` | 0.6 | Liveness accept threshold |
| `IDENTIFY_TOP_K` | 5 | Candidates returned for 1:N identify |
| `MAX_FACE_SAMPLES` | 10 | Max enrolled face photo samples per employee |
| `GEOFENCE_ENABLED` | true | Require GPS; clock-in must be at the office (all floors) |
| `GEOFENCE_RADIUS_M` | 45 | Indoor envelope around the office pin (basement–2nd floor) |
| `GEOFENCE_BUFFER_M` | 12 | Extra meters around the building rectangle |
| `GEOFENCE_INDOOR_RADIUS_M` | 40 | Accept indoor GPS drift within this many metres of HQ |
| `RETENTION_DAYS` | 90 | Auto-delete proof images |
| `DEVICE_BOOTSTRAP_SECRET` | bind-device-once | One-time kiosk bind |
| `COMPREFACE_URL` / `COMPREFACE_API_KEY` | localhost:8000 | Option A engine |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | admin@attendance.local | Bootstrapped admin |

Feature flags: recognition provider, thresholds, retention, geofence radius.
