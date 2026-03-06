-- ============================================================
-- CareTrack Database Schema
-- Migration: 001_initial_schema.sql
--
-- Run via: node migrations/run.js
-- Or manually against your Azure PostgreSQL instance.
-- ============================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── Users ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username        VARCHAR(80)  NOT NULL UNIQUE,
  password_hash   TEXT         NOT NULL,
  full_name       VARCHAR(120),
  role            VARCHAR(20)  NOT NULL CHECK (role IN ('physician', 'admin')),
  is_active       BOOLEAN      NOT NULL DEFAULT TRUE,
  last_login_at   TIMESTAMPTZ,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_role     ON users(role);

-- ── Patients ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS patients (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  first_name          VARCHAR(80)  NOT NULL,
  last_name           VARCHAR(80)  NOT NULL,
  dob                 DATE         NOT NULL,
  room                VARCHAR(20),
  arrival_at          TIMESTAMPTZ,
  diagnosis           TEXT,
  notes               TEXT,
  status              VARCHAR(20)  NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending', 'inhouse', 'discharged')),
  admit_ts            TIMESTAMPTZ,           -- Set when status → inhouse
  discharged_at       TIMESTAMPTZ,           -- Soft delete: set on discharge
  physician_username  VARCHAR(80),           -- FK-like reference to users.username
  location            VARCHAR(120),          -- Facility name
  created_by          UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_patients_status           ON patients(status);
CREATE INDEX IF NOT EXISTS idx_patients_physician        ON patients(physician_username);
CREATE INDEX IF NOT EXISTS idx_patients_location         ON patients(location);
CREATE INDEX IF NOT EXISTS idx_patients_discharged_at    ON patients(discharged_at);

-- ── Tasks ─────────────────────────────────────────────────────
-- task_key values: 'hp', '30day', '60day'
-- cycle: 0 for hp/30day, 1..N for recurring 60-day cycles
CREATE TABLE IF NOT EXISTS tasks (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id    UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  task_key      VARCHAR(20)  NOT NULL,   -- 'hp' | '30day' | '60day'
  task_label    VARCHAR(40)  NOT NULL,   -- Display label, e.g. '60-Day #2'
  cycle         INTEGER      NOT NULL DEFAULT 0,
  due_at        TIMESTAMPTZ  NOT NULL,
  appears_at    TIMESTAMPTZ,
  status        VARCHAR(20)  NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'completed', 'cancelled')),
  assigned_at   TIMESTAMPTZ,
  assigned_by   VARCHAR(80),
  completed_at  TIMESTAMPTZ,
  completed_by  VARCHAR(80),
  note          TEXT,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

  -- Prevent duplicate task instances
  UNIQUE (patient_id, task_key, cycle)
);

CREATE INDEX IF NOT EXISTS idx_tasks_patient_id  ON tasks(patient_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status       ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_due_at       ON tasks(due_at);

-- ── Audit Log (local DB backup — primary audit trail is Azure Blob) ──
-- Stores a rolling 90-day local copy for quick queries.
CREATE TABLE IF NOT EXISTS audit_log (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action      VARCHAR(80)  NOT NULL,
  user_id     UUID,
  username    VARCHAR(80),
  role        VARCHAR(20),
  patient_id  UUID,
  ip_address  VARCHAR(45),
  outcome     VARCHAR(20)  NOT NULL DEFAULT 'SUCCESS',
  details     JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_action      ON audit_log(action);
CREATE INDEX IF NOT EXISTS idx_audit_user_id     ON audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_patient_id  ON audit_log(patient_id);
CREATE INDEX IF NOT EXISTS idx_audit_created_at  ON audit_log(created_at);

-- Auto-purge audit_log rows older than 90 days (primary retention is Azure Blob)
-- Run this as a scheduled job or pg_cron task in Azure PostgreSQL
-- DELETE FROM audit_log WHERE created_at < NOW() - INTERVAL '90 days';

-- ── updated_at trigger ──────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trg_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE OR REPLACE TRIGGER trg_patients_updated_at
  BEFORE UPDATE ON patients
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE OR REPLACE TRIGGER trg_tasks_updated_at
  BEFORE UPDATE ON tasks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
