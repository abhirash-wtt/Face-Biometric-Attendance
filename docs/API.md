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

Clock-in is limited to the HQ office (Walking Tree Technologies, Plot 140A M.G. Plaza, Agra), covering basement through 2nd floor. Indoor GPS is often several metres off the roof outline, so the server accepts a reading if it is inside the building rectangle, if the reported accuracy circle still touches that rectangle, or if it is within 40 m of the office pin. `POST /attend/identify` and `POST /attendance` require GPS when `GEOFENCE_ENABLED=true`. Points far from the office return HTTP 422 `Outside office geofence`.

Similarity rule (defaults): accept if `cosine_sim >= 0.95` and `liveness_score >= 0.6`.
