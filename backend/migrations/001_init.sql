-- DOGFOOD Tier 1 schema.
-- Designed with extension points for Tier 2 (judging), Tier 3 (community),
-- Tier 4 (API/webhooks) so later migrations only ADD tables/columns.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Users & roles -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  name VARCHAR(120) NOT NULL,
  role VARCHAR(20) NOT NULL DEFAULT 'participant'
    CHECK (role IN ('participant','organizer','judge','admin')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_users_email ON users (email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users (role);

-- Sessions (opaque tokens; only sha256 stored) ------------------------------
CREATE TABLE IF NOT EXISTS sessions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash CHAR(64) NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions (user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions (expires_at);

-- Events --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS events (
  id SERIAL PRIMARY KEY,
  title VARCHAR(200) NOT NULL,
  slug VARCHAR(220) NOT NULL UNIQUE,
  description TEXT NOT NULL DEFAULT '',
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  submission_deadline TIMESTAMPTZ NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','published','archived')),
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_event_dates CHECK (starts_at < ends_at)
  -- NOTE Tier 2+: add judging_window_start/end, rubric_id, blind_review BOOLEAN, etc.
);
CREATE INDEX IF NOT EXISTS idx_events_status ON events (status);
CREATE INDEX IF NOT EXISTS idx_events_deadline ON events (submission_deadline);
CREATE INDEX IF NOT EXISTS idx_events_created_by ON events (created_by);

CREATE TABLE IF NOT EXISTS event_tracks (
  id SERIAL PRIMARY KEY,
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  name VARCHAR(120) NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_tracks_event ON event_tracks (event_id);

CREATE TABLE IF NOT EXISTS prizes (
  id SERIAL PRIMARY KEY,
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  title VARCHAR(200) NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  amount VARCHAR(100) NOT NULL DEFAULT '',
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_prizes_event ON prizes (event_id);

-- Teams ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS teams (
  id SERIAL PRIMARY KEY,
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  name VARCHAR(120) NOT NULL,
  invite_code VARCHAR(32) NOT NULL UNIQUE,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_teams_event ON teams (event_id);
CREATE INDEX IF NOT EXISTS idx_teams_invite ON teams (invite_code);

CREATE TABLE IF NOT EXISTS team_members (
  id SERIAL PRIMARY KEY,
  team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  member_role VARCHAR(20) NOT NULL DEFAULT 'member'
    CHECK (member_role IN ('owner','member')),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (team_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_members_team ON team_members (team_id);
CREATE INDEX IF NOT EXISTS idx_members_user ON team_members (user_id);

CREATE TABLE IF NOT EXISTS team_invitations (
  id SERIAL PRIMARY KEY,
  team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  code VARCHAR(32) NOT NULL,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','accepted','revoked','expired')),
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  accepted_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  accepted_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_invites_team ON team_invitations (team_id);
CREATE INDEX IF NOT EXISTS idx_invites_code ON team_invitations (code);

-- Projects & submissions ----------------------------------------------------
CREATE TABLE IF NOT EXISTS projects (
  id SERIAL PRIMARY KEY,
  team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  title VARCHAR(200) NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  track_id INTEGER REFERENCES event_tracks(id) ON DELETE SET NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','submitted','locked')),
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  -- NOTE Tier 2+: add judging fields via separate tables, not here.
);
CREATE INDEX IF NOT EXISTS idx_projects_event ON projects (event_id);
CREATE INDEX IF NOT EXISTS idx_projects_team ON projects (team_id);
CREATE INDEX IF NOT EXISTS idx_projects_status ON projects (status);
CREATE INDEX IF NOT EXISTS idx_projects_track ON projects (track_id);
CREATE INDEX IF NOT EXISTS idx_projects_title_trgm ON projects (title);

CREATE TABLE IF NOT EXISTS project_links (
  id SERIAL PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  label VARCHAR(120) NOT NULL,
  url TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_links_project ON project_links (project_id);

CREATE TABLE IF NOT EXISTS submissions (
  id SERIAL PRIMARY KEY,
  project_id INTEGER NOT NULL UNIQUE REFERENCES projects(id) ON DELETE CASCADE,
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  submitted_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  snapshot JSONB NOT NULL DEFAULT '{}'
  -- NOTE Tier 2 judging tables (rubrics, criteria, assignments, scores) FK to submissions/projects.
  -- NOTE Tier 3 (votes/comments/audit) reference projects/submissions similarly.
  -- NOTE Tier 4 (certificates/webhooks) reference submissions as source of truth.
);
CREATE INDEX IF NOT EXISTS idx_submissions_event ON submissions (event_id);
CREATE INDEX IF NOT EXISTS idx_submissions_team ON submissions (team_id);
CREATE INDEX IF NOT EXISTS idx_submissions_time ON submissions (submitted_at);
