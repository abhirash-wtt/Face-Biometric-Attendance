-- Enable pgvector
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- USERS (admin has full access; user is limited to kiosk clock-in)
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT CHECK (role IN ('admin', 'employee', 'bu')) DEFAULT 'employee',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- EMPLOYEES
CREATE TABLE IF NOT EXISTS employees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  status TEXT CHECK (status IN ('active','inactive')) DEFAULT 'active',
  working_mode TEXT CHECK (working_mode IN ('onsite','remote')) DEFAULT 'onsite',
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE users ADD COLUMN IF NOT EXISTS employee_id UUID REFERENCES employees(id) ON DELETE SET NULL;

-- FACE TEMPLATES (required poses: straight, left, right)
CREATE TABLE IF NOT EXISTS face_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID REFERENCES employees(id) ON DELETE CASCADE,
  embedding vector(512) NOT NULL,
  liveness_score REAL,
  pose TEXT CHECK (pose IS NULL OR pose IN ('straight', 'left', 'right')),
  features_coverage REAL,
  features_complete BOOLEAN DEFAULT FALSE,
  image_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS face_templates_vec_idx ON face_templates
USING ivfflat (embedding vector_cosine_ops) WITH (lists = 200);

-- SITES & DEVICES
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

-- SHIFTS (optional)
CREATE TABLE IF NOT EXISTS shifts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  grace_minutes INTEGER DEFAULT 5
);

-- ATTENDANCE LOGS
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

-- REGULARIZATION (WFH skips geofence; mark_present sets roster Present with blank clock times; late_in / early_out notify admin)
CREATE TABLE IF NOT EXISTS wfh_regularization_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  work_date DATE NOT NULL,
  request_type TEXT NOT NULL DEFAULT 'wfh'
    CHECK (request_type IN ('wfh', 'mark_present', 'late_in', 'early_out')),
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
  ON wfh_regularization_requests (employee_id, work_date, request_type)
  WHERE status IN ('pending', 'approved');
