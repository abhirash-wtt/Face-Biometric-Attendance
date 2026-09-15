# API reference

Interactive OpenAPI UI is generated at runtime:

`GET http://localhost:3000/docs`  
JSON: `GET http://localhost:3000/docs-json`

Auth: `Authorization: Bearer <access_token>`  
Users: JWT from `POST /auth/login` (short-lived access + refresh).  
Kiosks: device token from `POST /devices/register`.

| Method | Path | Role | Description |
|---|---|---|---|
| POST | `/auth/login` | public | User login; returns tokens |
| POST | `/auth/refresh` | public | Rotate refresh token |
| GET | `/auth/me` | authenticated | Current principal; `role` is `admin` or `user` |
| POST | `/devices/register` | public + bind secret, or admin | One-time device bind; device token (users cannot bind) |
| POST | `/employees` | admin | Create employee |
| GET | `/employees` | admin | List/search |
| POST | `/enroll` | admin | Multipart images or `image_b64` → face templates |
| POST | `/attend/identify` | admin, user (incl. kiosk device) | 1:N match; similarity + liveness |
| POST | `/attend/verify` | admin, user (incl. kiosk device) | 1:1 verify |
| POST | `/attendance` | admin, user (incl. kiosk device) | Create IN/OUT log |
| GET | `/attendance` | admin | Reports; `format=csv\|payroll` |
| GET | `/sites` | admin | Sites |
| POST | `/sites` | admin | Create site |
| GET | `/shifts` | admin | Shifts |
| POST | `/shifts` | admin | Create shift |
| GET | `/devices` | admin | List devices |
| GET | `/config` | admin, user (incl. kiosk device) | Client thresholds |
| GET | `/health` | public | Liveness of API + DB |

Roles: **admin** has full access. **user** may only clock IN/OUT (`identify` / `verify` / `POST /attendance`) and read `/config`. Device JWTs use `role=kiosk` and are treated as **user**.

Identify accepts multipart `file` **or** JSON `{ image_b64, device_id, site_code, gps, embedding }`.

Similarity rule (defaults): accept if `cosine_sim >= 0.95` and `liveness_score >= 0.6`.
