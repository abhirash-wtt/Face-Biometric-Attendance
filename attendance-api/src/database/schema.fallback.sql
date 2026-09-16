-- Fallback schema when pgvector is not installed.
-- Embeddings are stored as TEXT in pgvector format: '[0.1,0.2,...]'

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT CHECK (role IN ('admin', 'user')) DEFAULT 'user',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS employees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  status TEXT CHECK (status IN ('active','inactive')) DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE users ADD COLUMN IF NOT EXISTS employee_id UUID REFERENCES employees(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS face_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID REFERENCES employees(id) ON DELETE CASCADE,
  embedding TEXT NOT NULL,
  liveness_score REAL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  radius_m INTEGER DEFAULT 200,
  geofence_polygon JSONB
);

CREATE TABLE IF NOT EXISTS devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id TEXT UNIQUE NOT NULL,
  site_id UUID REFERENCES sites(id) ON DELETE SET NULL,
  description TEXT,
  active BOOLEAN DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS shifts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  grace_minutes INTEGER DEFAULT 5
);

CREATE TABLE IF NOT EXISTS attendance_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID REFERENCES employees(id),
  type TEXT CHECK (type IN ('IN','OUT')) NOT NULL,
  event_time TIMESTAMPTZ NOT NULL DEFAULT now(),
  device_id TEXT,
  site_code TEXT,
  gps_lat DOUBLE PRECISION,
  gps_lng DOUBLE PRECISION,
  similarity REAL,
  liveness_score REAL,
  face_crop_url TEXT,
  notes TEXT
);

CREATE INDEX IF NOT EXISTS attendance_logs_employee_time_idx
  ON attendance_logs (employee_id, event_time DESC);
CREATE INDEX IF NOT EXISTS attendance_logs_event_time_idx
  ON attendance_logs (event_time DESC);

-- WFH REGULARIZATION (same-day allowed; approved days skip geofence on clock IN/OUT)
CREATE TABLE IF NOT EXISTS wfh_regularization_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  work_date DATE NOT NULL,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
  requested_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reviewed_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  review_note TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS wfh_requests_employee_date_idx
  ON wfh_regularization_requests (employee_id, work_date);
CREATE INDEX IF NOT EXISTS wfh_requests_status_idx
  ON wfh_regularization_requests (status, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS wfh_requests_active_uniq
  ON wfh_regularization_requests (employee_id, work_date)
  WHERE status IN ('pending', 'approved');
