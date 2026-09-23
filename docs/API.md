# API reference

Interactive OpenAPI UI is generated at runtime:

`GET http://localhost:3000/docs`  
JSON: `GET http://localhost:3000/docs-json`

Auth: `Authorization: Bearer <access_token>`  
Users: JWT from `POST /auth/register/verify` or `POST /auth/login` (short-lived access + refresh). Self-register is limited to `@walkingtree.tech` and requires the OTP emailed to that address. After verification it creates a linked employee so the new user can enroll their own face and clock in.  
Kiosks: device token from `POST /devices/register`.

| Method | Path | Role | Description |
|---|---|---|---|
| POST | `/auth/register` | public | Start self-register with an official `@walkingtree.tech` email; emails a 6-digit OTP (`status: otp_sent`) |
| POST | `/auth/register/verify` | public | Confirm the OTP; creates an `employee` role account + linked employee (`EMP###`); returns tokens |
| POST | `/auth/register/resend` | public | Resend the registration OTP (cooldown applies) |
| POST | `/auth/login` | public | User login; returns tokens |
| POST | `/auth/refresh` | public | Rotate refresh token |
| GET | `/auth/me` | authenticated | Current principal; `role` is `admin` or `employee`; includes `employee_id` / `employee_code` / `display_name` when linked |
| POST | `/devices/register` | public + bind secret, or admin | One-time device bind; device token (employees cannot bind) |
| POST | `/employees` | admin | Create employee |
| GET | `/employees` | admin | List/search |
| POST | `/enroll` | admin, or employee (own `employee_id` only) | Multipart images or `image_b64` → face templates |
| DELETE | `/enroll/:employeeId` | admin, or employee (own `employee_id` only) | Delete all face templates for an employee (reset enrollment) |
| POST | `/attend/identify` | admin, employee (incl. kiosk device) | Match face; employee logins are 1:1 against that employee only |
| POST | `/attend/verify` | admin, employee (incl. kiosk device) | 1:1 verify (must be the linked employee for employee logins) |
| POST | `/attendance` | admin, employee (incl. kiosk device) | Create IN/OUT log (employee logins cannot clock in as someone else) |
| GET | `/attendance` | admin | Reports; `format=csv\|payroll` |
| GET | `/attendance/status` | admin | Roster for any employee: clock-in, clock-out, Present/Absent (`date=YYYY-MM-DD`, default today in Asia/Kolkata) |
| GET | `/sites` | admin | Sites |
| POST | `/sites` | admin | Create site |
| GET | `/shifts` | admin | Shifts |
| POST | `/shifts` | admin | Create shift |
| GET | `/devices` | admin | List devices |
| GET | `/config` | admin, employee (incl. kiosk device) | Client thresholds |
| GET | `/health` | public | Liveness of API + DB |

Roles: **admin** has full access, including viewing any employee’s clock-in time, clock-out time, and Present/Absent status. **employee** may only clock IN/OUT (`identify` / `verify` / `POST /attendance`) and read `/config`. Device JWTs use `role=kiosk` and are treated as **employee**.

Employee accounts (`users.employee_id` set) can only clock in as that employee. `POST /attend/identify` then does **1:1** verification against that employee’s enrolled templates (it does not search other faces). An employee login with no linked employee is rejected with HTTP 403. Shared kiosk device tokens remain **1:N**. `POST /attendance` for a linked login must send that employee’s `employee_id` plus `image_b64`; a spoofed id or a face that does not match returns 403 / 422. Re-login after this change so the access token includes `employee_id`.

Identify accepts multipart `file` **or** JSON `{ image_b64, device_id, site_code, gps, embedding }`.

Clock-in is limited to the HQ office (Walking Tree Technologies, Plot 140A M.G. Plaza, Agra), covering basement through 2nd floor. Indoor GPS is often several metres off the roof outline, so the server accepts a reading if it is inside the building rectangle, if the reported accuracy circle still touches that rectangle, or if it is within 40 m of the office pin. `POST /attend/identify` and `POST /attendance` require GPS when `GEOFENCE_ENABLED=true`. Points far from the office return HTTP 422 `Outside office geofence`.

Similarity rule (defaults): accept if `cosine_sim >= 0.90` and `liveness_score >= 0.6`.
