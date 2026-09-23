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
From **Settings**, use **Register** with your official `@walkingtree.tech` email and password, then enter the OTP sent to that inbox. After the account is created, capture looking **straight**, **left**, and **right** on **Enroll**. Clock-in stays blocked until enrollment is complete.  
Health: http://localhost:3000/health

### 2a. HTTPS for phones (required for the camera)

Browsers only expose the camera and GPS on a *secure context*: HTTPS, or `localhost`.
A phone opening `http://<lan-ip>:3000` therefore shows "Camera needs a secure
connection" and cannot clock anyone in. Serve the kiosk over HTTPS instead:

```bash
cd attendance-api
npm run cert:dev                 # writes certs/dev-{key,cert}.pem for localhost + your LAN IPs
# set HTTPS_ENABLED=true in .env
npm run start:dev
```

The API then listens on both schemes and logs the phone URL on startup:

- `http://localhost:3000` — unchanged; still serves the API for the React Native app
- `https://<lan-ip>:3443` — kiosk with a working camera (`HTTPS_PORT` to change the port)

Browser page loads arriving over plain HTTP from a non-localhost address are redirected
to the HTTPS origin, so typing `http://<lan-ip>:3000` on a phone lands on HTTPS. API
requests over HTTP are never redirected, so the native app keeps working as before.

The dev certificate is self-signed, so a phone warns on first visit — choose **Advanced →
Proceed** (Chrome) or **Show Details → visit this website** (Safari). The camera works
normally once accepted. For a warning-free setup, use a certificate trusted by the device
(`mkcert` with its root CA installed, a real cert via `HTTPS_KEY_PATH`/`HTTPS_CERT_PATH`,
or an HTTPS tunnel such as `cloudflared`).

Seed employees / site / shift (admin user is also created on first boot):

```bash
npm run seed
```

Seeded users:

- `admin@attendance.local` / `Admin@123` (admin — full access, including enroll any face, device bind, and viewing every employee’s clock-in/out and Present/Absent status)
- `bu@attendance.local` / `Bu@123` (bu — same as admin for attendance, devices, and regularization review; enroll is employee-scoped and requires a linked `users.employee_id`)
- `user@attendance.local` / `User@123` (employee — not linked to an employee record; cannot clock in until an admin sets `users.employee_id`)
- `hrrole@gmail.com` / `vrSzijkmZf` (hr — Attendance roster/reports like admin; otherwise employee-scoped; linked to EMPHR)
- `managerrole@gmail.com` / `V9wbSaSeEt` (manager — Attendance roster/reports like admin; otherwise employee-scoped; linked to EMPMGR)
- `abhirash.garg@walkingtree.tech` / `faZWGpjhmB` (employee — EMP001 Abhirash; clock-in requires Abhirash’s enrolled face)
- `yatharth.kapoor@walkingtree.tech` / `nR8wKq2mX7pL` (employee — EMP002 Yatharth Kapoor; clock-in requires Yatharth’s enrolled face)

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

The native app talks to plain HTTP happily; the secure-context rule above applies only to
browsers, so there is no need to point the app at the HTTPS port.

Then **Login** (admin), **Register** with a `@walkingtree.tech` email and the emailed OTP, or **Register this device**. After self-register, open **Enroll** and capture looking straight, left, and right. Clock-in is blocked until enrollment is complete. Admins, BU, managers, and HR can open **Attendance** to see any user’s clock-in time, clock-out time, and Present/Absent status.

Camera: `react-native-vision-camera`. Active liveness prompts: blink, turn left/right, smile.

## 4. Recognition

`RECOGNITION_PROVIDER=internal` (default) uses `onnxruntime-node` when `attendance-api/models/arcface_mobile.onnx` is present. Without the model, a deterministic 512-d prototype descriptor is used (same crop matches; different photos of a person need the ONNX model or CompreFace).

CompreFace (optional):

```bash
docker compose --profile compreface up -d
```

Set `RECOGNITION_PROVIDER=compreface` and `COMPREFACE_API_KEY`.

Accept rule: `cosine_sim >= 0.90` and `liveness_score >= 0.6`.

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
