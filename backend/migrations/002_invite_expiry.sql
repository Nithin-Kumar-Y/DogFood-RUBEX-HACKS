-- DOGFOOD Tier 1 follow-up: invitation expiry (additive only — no Tier 1 restructuring).
-- Invite codes now carry an expiry timestamp so "expired invitation" is a real state.
ALTER TABLE teams ADD COLUMN IF NOT EXISTS invite_expires_at TIMESTAMPTZ;
-- Backfill pre-existing teams (incl. seed data) with a generous window.
UPDATE teams SET invite_expires_at = now() + interval '30 days' WHERE invite_expires_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_teams_invite_exp ON teams (invite_expires_at);
