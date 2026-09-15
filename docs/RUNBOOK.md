# Face Recognition Attendance System — Runbook

Local-first prototype: NestJS API + PostgreSQL/pgvector + React Native kiosk app.

## 1. Infrastructure

Preferred (Docker):

```bash
docker compose up -d db minio redis
```

This machine can also use a local PostgreSQL 16 install. Redis and MinIO are optional; the API falls back to in-memory cache and local disk storage (`STORAGE_PROVIDER=local`).

Create the database (psql as superuser), or from `attendance-api`:

```powershell
.\setup-db.ps1 -PostgresPassword "the-password-you-set-during-postgres-install"
```

Use the real PostgreSQL superuser password, not placeholder text. If you forgot it, open **Administrator PowerShell** in `attendance-api` and run:

```powershell
.\setup-db.ps1 -LocalTrustBootstrap
```

If `pgvector` is not installed, the API stores embeddings as text and searches in-process.

## 2. Backend

```bash
cd attendance-api
copy .env.example .env   # already present
npm install
npm run start:dev
```

API: http://localhost:3000  
OpenAPI: http://localhost:3000/docs  
Kiosk UI (Kiosk / Enroll / Attendance / Settings): http://localhost:3000/  
Health: http://localhost:3000/health

Seed employees / site / shift (admin user is also created on first boot):

```bash
npm run seed
```

Seeded users:

- `admin@attendance.local` / `Admin@123` (admin — full access, including enroll, device bind, and viewing every employee’s clock-in/out and Present/Absent status)
- `user@attendance.local` / `User@123` (user — not linked to an employee; cannot clock in until an admin sets `users.employee_id`)
- `abhirash.garg@walkingtree.tech` / `faZWGpjhmB` (user — EMP001 Abhirash; clock-in requires Abhirash’s enrolled face)
- `yatharth.kapoor@walkingtree.tech` / `nR8wKq2mX7pL` (user — EMP002 Yatharth Kapoor; clock-in requires Yatharth’s enrolled face)

Seeded employees: EMP001 Abhirash, EMP002 Yatharth Kapoor.  
Site: `HQ` — Walking Tree Technologies, Agra (rectangular building geofence). Device bind secret: `bind-device-once`.

## 3. Mobile app

```bash
cd attendance-app
npm install
npx react-native run-android
```

On a device/emulator, set **Settings → API URL**:

- Android emulator: `http://10.0.2.2:3000`
- Physical device: `http://<your-lan-ip>:3000`

Then **Login** (admin) or **Register this device**, enroll 3+ face samples, and use **Kiosk** to clock IN/OUT. Admins can open **Attendance** to see any user’s clock-in time, clock-out time, and Present/Absent status.

Camera: `react-native-vision-camera`. Active liveness prompts: blink, turn left/right, smile.

## 4. Recognition

`RECOGNITION_PROVIDER=internal` (default) uses `onnxruntime-node` when `attendance-api/models/arcface_mobile.onnx` is present. Without the model, a deterministic 512-d prototype descriptor is used (same crop matches; different photos of a person need the ONNX model or CompreFace).

CompreFace (optional):

```bash
docker compose --profile compreface up -d
```

Set `RECOGNITION_PROVIDER=compreface` and `COMPREFACE_API_KEY`.

Accept rule: `cosine_sim >= 0.97` and `liveness_score >= 0.6`.

## 5. Reports / payroll export

Authenticated GET:

- `/attendance?from=&to=&employee_id=` JSON
- `/attendance?from=&to=&format=csv`
- `/attendance?from=&to=&format=payroll`

## 6. Production notes

- TLS everywhere; rotate JWT secrets and MinIO keys.
- Use managed Postgres with pgvector, S3/Blob, Redis.
- Proof images: retention job deletes crops older than `RETENTION_DAYS` (default 90).
- Place ArcFace ONNX at `models/arcface_mobile.onnx` for production 1:N quality.
