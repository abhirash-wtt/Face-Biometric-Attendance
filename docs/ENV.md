# Environment configuration

Copy `attendance-api/.env.example` to `.env` per environment (`local` / `dev` / `stage`) and replace every `<...>` placeholder. For production use `attendance-api/.env.production.example`.

Secrets live only in environment variables; the code has no built-in fallback passwords or keys. Real `.env` files are git-ignored (only `*.example` templates are committed), and Docker Compose reads the same file via `--env-file attendance-api/.env`.

- In every environment the API refuses to start when `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `DATABASE_PASSWORD`, `DEVICE_BOOTSTRAP_SECRET`, or (with `STORAGE_PROVIDER=minio`) the MinIO keys are empty or still a `<...>` placeholder.
- With `NODE_ENV=production` it additionally requires `ADMIN_PASSWORD` and `SMTP_HOST`, rejects values that were once committed to the repository, and requires distinct JWT secrets.
- Optional secrets (`COMPREFACE_API_KEY`, `SMTP_USER`, `SMTP_PASS`, demo passwords) left as a `<...>` placeholder are treated as unset.

| Variable | Default | Purpose |
|---|---|---|
| `NODE_ENV` | local | Environment name |
| `PORT` | 3000 | HTTP port |
| `HTTPS_ENABLED` | false | Also serve HTTPS, required for camera/GPS on phone browsers |
| `HTTPS_PORT` | 3443 | HTTPS port |
| `TRUST_PROXY` | empty | Express `trust proxy` value so rate limits see the real client IP behind Nginx. Set only when all traffic comes through your proxy (prod compose uses `loopback, uniquelocal`) |
| `RATE_LIMIT_PER_MIN` | 600 | Requests per client IP per minute, all endpoints |
| `AUTH_RATE_LIMIT_PER_MIN` | 20 | Per client IP per minute for login, registration/OTP, change-password and device bind |
| `LOGIN_MAX_FAILURES` / `LOGIN_LOCKOUT_SEC` | 5 / 900 | Lock an account after this many wrong passwords; the lock lasts this long after the last failure |
| `HTTPS_KEY_PATH` / `HTTPS_CERT_PATH` | ./certs/dev-{key,cert}.pem | TLS material; `npm run cert:dev` creates a local pair |
| `DATABASE_HOST` / `DATABASE_PORT` / `DATABASE_USER` / `DATABASE_NAME` | localhost / 5432 / app / attendance | PostgreSQL |
| `DATABASE_PASSWORD` | **required** | PostgreSQL password |
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` | **required** | JWT secrets; two different random values |
| `JWT_ACCESS_TTL` | 15m | Short-lived access token |
| `JWT_REFRESH_TTL` | 7d | Refresh token |
| `REDIS_HOST` / `REDIS_PORT` | localhost:6379 | Cache, refresh tokens; in-memory fallback |
| `STORAGE_PROVIDER` | local | `local` or `minio` |
| `MINIO_ENDPOINT` / `MINIO_PORT` / `MINIO_BUCKET` | localhost / 9000 / attendance-evidence | Object storage for face crops |
| `MINIO_ACCESS_KEY` / `MINIO_SECRET_KEY` | required when `STORAGE_PROVIDER=minio` | MinIO credentials (also the MinIO root login in Docker Compose) |
| `RECOGNITION_PROVIDER` | internal | `internal` (ONNX) or `compreface` |
| `ONNX_MODEL_PATH` | ./models/arcface_mobile.onnx | ArcFace model (stored with Git LFS) |
| `REQUIRE_FACE_MODEL` | true in production | Refuse to start when the ONNX model is missing instead of using prototype embeddings |
| `SIMILARITY_THRESHOLD` | 0.90 | Cosine accept threshold (minimum 90%) |
| `LIVENESS_THRESHOLD` | 0.6 | Liveness accept threshold |
| `IDENTIFY_TOP_K` | 5 | Candidates returned for 1:N identify |
| `MAX_FACE_SAMPLES` | 10 | Max enrolled face photo samples per employee |
| `GEOFENCE_ENABLED` | true | Require GPS; clock-in must be at the office (all floors) |
| `GEOFENCE_RADIUS_M` | 45 | Indoor envelope around the office pin (basement–2nd floor) |
| `GEOFENCE_BUFFER_M` | 12 | Extra meters around the building rectangle |
| `GEOFENCE_INDOOR_RADIUS_M` | 40 | Accept indoor GPS drift within this many metres of HQ |
| `RETENTION_DAYS` | 90 | Auto-delete proof images |
| `DEVICE_BOOTSTRAP_SECRET` | **required** | One-time kiosk bind; operators enter it in the kiosk Settings (not bundled in the apps) |
| `COMPREFACE_URL` / `COMPREFACE_API_KEY` | localhost:8000 / empty | Option A engine |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | admin@attendance.local / empty | Bootstrapped admin; not created while `ADMIN_PASSWORD` is unset (required in production) |
| `DEMO_EMPLOYEE_PASSWORD` / `DEMO_BU_PASSWORD` / `DEMO_HR_PASSWORD` / `DEMO_MANAGER_PASSWORD` | empty | Optional demo logins created on boot; each is skipped while unset. Leave unset in production |
| `SEED_EMP001_PASSWORD` / `SEED_EMP002_PASSWORD` / `SEED_EMP007_PASSWORD` | empty | Optional passwords for the named employee logins created by `npm run seed` |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_SECURE` | empty / 587 / false | SMTP server for registration OTPs; empty host logs the code in local/dev |
| `SMTP_USER` / `SMTP_PASS` | empty | SMTP credentials |
| `MAIL_FROM` | noreply@walkingtree.tech | From address for verification emails |

Self-registration accepts only `@walkingtree.tech` addresses. `POST /auth/register` emails a 6-digit OTP; `POST /auth/register/verify` creates the account after the code is entered.

Feature flags: recognition provider, thresholds, retention, geofence radius.
