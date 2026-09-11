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
| POST | `/devices/register` | public + bind secret, or admin | One-time device bind; device token |
| POST | `/employees` | admin | Create employee |
| GET | `/employees` | admin, supervisor, viewer, kiosk | List/search |
| POST | `/enroll` | admin, supervisor, kiosk | Multipart images or `image_b64` → face templates |
| POST | `/attend/identify` | admin, supervisor, kiosk | 1:N match; similarity + liveness |
| POST | `/attend/verify` | admin, supervisor, kiosk | 1:1 verify |
| POST | `/attendance` | admin, supervisor, kiosk | Create IN/OUT log |
| GET | `/attendance` | admin, supervisor, viewer | Reports; `format=csv\|payroll` |
| GET | `/sites` | authenticated | Sites |
| POST | `/sites` | admin | Create site |
| GET | `/shifts` | authenticated | Shifts |
| POST | `/shifts` | admin | Create shift |
| GET | `/health` | public | Liveness of API + DB |

Identify accepts multipart `file` **or** JSON `{ image_b64, device_id, site_code, gps, embedding }`.

Similarity rule (defaults): accept if `cosine_sim >= 0.98` and `liveness_score >= 0.6`.
