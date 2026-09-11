# Environment configuration

Copy `attendance-api/.env.example` to `.env` per environment (`local` / `dev` / `stage` / `prod`).

| Variable | Default | Purpose |
|---|---|---|
| `NODE_ENV` | local | Environment name |
| `PORT` | 3000 | HTTP port |
| `DATABASE_*` | app/app@localhost:5432/attendance | PostgreSQL |
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` | change-me-* | JWT secrets (rotate in prod) |
| `JWT_ACCESS_TTL` | 15m | Short-lived access token |
| `JWT_REFRESH_TTL` | 7d | Refresh token |
| `REDIS_HOST` / `REDIS_PORT` | localhost:6379 | Cache, refresh tokens; in-memory fallback |
| `STORAGE_PROVIDER` | local | `local` or `minio` |
| `MINIO_*` | minio/minio123 | Object storage for face crops |
| `RECOGNITION_PROVIDER` | internal | `internal` (ONNX) or `compreface` |
| `ONNX_MODEL_PATH` | ./models/arcface_mobile.onnx | ArcFace model |
| `SIMILARITY_THRESHOLD` | 0.95 | Cosine accept threshold (minimum 95%) |
| `LIVENESS_THRESHOLD` | 0.6 | Liveness accept threshold |
| `GEOFENCE_ENABLED` | true | Enforce site radius when GPS present |
| `GEOFENCE_RADIUS_M` | 200 | Default radius |
| `RETENTION_DAYS` | 90 | Auto-delete proof images |
| `DEVICE_BOOTSTRAP_SECRET` | bind-device-once | One-time kiosk bind |
| `COMPREFACE_URL` / `COMPREFACE_API_KEY` | localhost:8000 | Option A engine |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | admin@attendance.local | Bootstrapped admin |

Feature flags: recognition provider, thresholds, retention, geofence radius.
