-- ============================================================
-- Invitations: admin-only account creation via secure link
-- Migration: 002_invitations.sql
-- ============================================================

CREATE TABLE IF NOT EXISTS invitations (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username      VARCHAR(80)  NOT NULL,
  role          VARCHAR(20)  NOT NULL CHECK (role IN ('physician', 'admin')),
  token_hash    VARCHAR(64)  NOT NULL UNIQUE,
  invited_by    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  email         VARCHAR(200),
  expires_at    TIMESTAMPTZ NOT NULL,
  used_at       TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_invitations_invited_by ON invitations(invited_by);
CREATE INDEX IF NOT EXISTS idx_invitations_expires_at ON invitations(expires_at);

-- At most one unused invitation per username at a time
CREATE UNIQUE INDEX IF NOT EXISTS idx_invitations_unique_pending_username
  ON invitations (lower(username))
  WHERE used_at IS NULL;
