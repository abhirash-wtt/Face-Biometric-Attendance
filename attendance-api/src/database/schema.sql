-- Enable pgvector
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- USERS (for admin/supervisor access)
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT CHECK (role IN ('admin', 'supervisor', 'viewer')) DEFAULT 'viewer',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- EMPLOYEES
CREATE TABLE IF NOT EXISTS employees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  status TEXT CHECK (status IN ('active','inactive')) DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- FACE TEMPLATES (multiple samples per employee)
CREATE TABLE IF NOT EXISTS face_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID REFERENCES employees(id) ON DELETE CASCADE,
  embedding vector(512) NOT NULL,
  liveness_score REAL,
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
  radius_m INTEGER DEFAULT 200
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
