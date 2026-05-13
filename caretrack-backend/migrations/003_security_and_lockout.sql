-- ============================================================
-- Security hardening: account lockout, forced password reset.
-- Migration: 003_security_and_lockout.sql
-- ============================================================

-- Users gain a "must change password" flag so admin-reset passwords expire on
-- first use, and a lockout window so brute force can be stopped per-account.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS failed_login_attempts INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS locked_until TIMESTAMPTZ;

-- Track every login attempt (success and failure) for the lockout window and
-- for auditors. This is separate from audit_log so it can be inspected with a
-- simple aggregate query.
CREATE TABLE IF NOT EXISTS login_attempts (
  id           BIGSERIAL PRIMARY KEY,
  username     VARCHAR(80) NOT NULL,
  ip_address   VARCHAR(45),
  outcome      VARCHAR(20) NOT NULL CHECK (outcome IN ('SUCCESS', 'FAILURE')),
  reason       VARCHAR(60),
  attempted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_login_attempts_username_time
  ON login_attempts (username, attempted_at DESC);

CREATE INDEX IF NOT EXISTS idx_login_attempts_attempted_at
  ON login_attempts (attempted_at);
