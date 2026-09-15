# Biometric / Face Recognition Attendance System

Production-ready attendance system as specified in `Attendance_Face_Biometric_Dev_Document.docx`.

- **API:** NestJS (`attendance-api`) — auth, enroll, identify/verify, attendance, reports
- **App:** React Native (`attendance-app`) — Kiosk, Enroll, Attendance (admin), Settings
- **Local kiosk:** browser UI at `http://localhost:3000` (same flows)
- **Data:** PostgreSQL + pgvector, MinIO/local disk, Redis (optional)

Start here: [docs/RUNBOOK.md](docs/RUNBOOK.md) · [docs/ENV.md](docs/ENV.md) · [docs/API.md](docs/API.md)
