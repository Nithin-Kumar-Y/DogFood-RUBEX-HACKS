-- DOGFOOD Tier 3 community / public-voting schema.
-- Additive only — does NOT modify Tier-1 or Tier-2 tables.
-- All community tables FK to Tier-1 rows (events/users/projects).

-- Voting rounds: one per event, configurable by organizer/admin --------
CREATE TABLE IF NOT EXISTS voting_rounds (
  id SERIAL PRIMARY KEY,
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  name VARCHAR(200) NOT NULL DEFAULT 'Community Choice',
  description TEXT NOT NULL DEFAULT '',
  status VARCHAR(30) NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','scheduled','open','paused','closed','results_revealed','archived')),
  voting_start TIMESTAMPTZ,
  voting_end TIMESTAMPTZ,
  max_votes_per_user INTEGER NOT NULL DEFAULT 5 CHECK (max_votes_per_user > 0),
  max_votes_per_project INTEGER NOT NULL DEFAULT 1 CHECK (max_votes_per_project > 0),
  allow_vote_change BOOLEAN NOT NULL DEFAULT FALSE,
  comments_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  comments_require_auth BOOLEAN NOT NULL DEFAULT TRUE,
  results_hidden_during_voting BOOLEAN NOT NULL DEFAULT TRUE,
  randomized_ordering BOOLEAN NOT NULL DEFAULT TRUE,
  -- Rate-limiting thresholds (per voter per hour)
  rate_limit_votes_per_hour INTEGER NOT NULL DEFAULT 20,
  rate_limit_comments_per_hour INTEGER NOT NULL DEFAULT 10,
  max_comment_length INTEGER NOT NULL DEFAULT 1000,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_vr_event ON voting_rounds (event_id);
CREATE INDEX IF NOT EXISTS idx_vr_status ON voting_rounds (status);

-- Projects eligible for a voting round (many-to-many) -------------------
CREATE TABLE IF NOT EXISTS voting_round_projects (
  id SERIAL PRIMARY KEY,
  voting_round_id INTEGER NOT NULL REFERENCES voting_rounds(id) ON DELETE CASCADE,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  added_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  added_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  UNIQUE (voting_round_id, project_id)
);
CREATE INDEX IF NOT EXISTS idx_vrp_round ON voting_round_projects (voting_round_id);
CREATE INDEX IF NOT EXISTS idx_vrp_project ON voting_round_projects (project_id);

-- Community votes: one per (user, project, round) ----------------------
CREATE TABLE IF NOT EXISTS community_votes (
  id SERIAL PRIMARY KEY,
  voting_round_id INTEGER NOT NULL REFERENCES voting_rounds(id) ON DELETE CASCADE,
  voter_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  status VARCHAR(20) NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','withdrawn','removed_by_admin')),
  cast_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- The critical duplicate-prevention constraint
  UNIQUE (voting_round_id, voter_id, project_id)
);
CREATE INDEX IF NOT EXISTS idx_cv_round ON community_votes (voting_round_id);
CREATE INDEX IF NOT EXISTS idx_cv_voter ON community_votes (voter_id);
CREATE INDEX IF NOT EXISTS idx_cv_project ON community_votes (project_id);
CREATE INDEX IF NOT EXISTS idx_cv_round_voter ON community_votes (voting_round_id, voter_id);
CREATE INDEX IF NOT EXISTS idx_cv_round_project ON community_votes (voting_round_id, project_id);
CREATE INDEX IF NOT EXISTS idx_cv_round_voter_project ON community_votes (voting_round_id, voter_id, project_id);

-- Vote history: tracks all changes (immutable audit log per vote) -------
CREATE TABLE IF NOT EXISTS vote_history (
  id SERIAL PRIMARY KEY,
  vote_id INTEGER NOT NULL REFERENCES community_votes(id) ON DELETE CASCADE,
  action VARCHAR(30) NOT NULL
    CHECK (action IN ('cast','withdrawn','restored','removed_by_admin')),
  actor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  reason TEXT NOT NULL DEFAULT '',
  meta JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_vh_vote ON vote_history (vote_id);
CREATE INDEX IF NOT EXISTS idx_vh_actor ON vote_history (actor_id);

-- Comments on projects within a voting round ----------------------------
CREATE TABLE IF NOT EXISTS comments (
  id SERIAL PRIMARY KEY,
  voting_round_id INTEGER NOT NULL REFERENCES voting_rounds(id) ON DELETE CASCADE,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  author_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  moderation_status VARCHAR(20) NOT NULL DEFAULT 'visible'
    CHECK (moderation_status IN ('visible','hidden','deleted','flagged')),
  edited_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_comments_project ON comments (project_id, created_at);
CREATE INDEX IF NOT EXISTS idx_comments_round ON comments (voting_round_id, created_at);
CREATE INDEX IF NOT EXISTS idx_comments_author ON comments (author_id);
CREATE INDEX IF NOT EXISTS idx_comments_status ON comments (moderation_status);

-- Comment moderation history (append-only) ----------------------------
CREATE TABLE IF NOT EXISTS comment_moderation (
  id SERIAL PRIMARY KEY,
  comment_id INTEGER NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
  moderator_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  action VARCHAR(30) NOT NULL
    CHECK (action IN ('hide','restore','delete','flag','unflag')),
  previous_status VARCHAR(20) NOT NULL DEFAULT 'visible',
  new_status VARCHAR(20) NOT NULL DEFAULT 'hidden',
  reason TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cm_comment ON comment_moderation (comment_id);
CREATE INDEX IF NOT EXISTS idx_cm_moderator ON comment_moderation (moderator_id);

-- Rate-limit tracking table (in-DB, no Redis required) -----------------
CREATE TABLE IF NOT EXISTS rate_limit_events (
  id SERIAL PRIMARY KEY,
  actor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  ip_hash VARCHAR(64),
  resource VARCHAR(80) NOT NULL,
  voting_round_id INTEGER REFERENCES voting_rounds(id) ON DELETE SET NULL,
  window_start TIMESTAMPTZ NOT NULL,
  request_count INTEGER NOT NULL DEFAULT 1,
  last_request_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (actor_id, resource, window_start)
);
CREATE INDEX IF NOT EXISTS idx_rle_actor ON rate_limit_events (actor_id, resource, window_start);
CREATE INDEX IF NOT EXISTS idx_rle_window ON rate_limit_events (window_start);

-- Abuse / suspicious activity flags ------------------------------------
CREATE TABLE IF NOT EXISTS abuse_flags (
  id SERIAL PRIMARY KEY,
  voting_round_id INTEGER REFERENCES voting_rounds(id) ON DELETE SET NULL,
  actor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  flag_type VARCHAR(60) NOT NULL
    CHECK (flag_type IN (
      'rapid_votes','duplicate_vote_attempt','rapid_comments',
      'excessive_requests','suspicious_session','quota_exceeded'
    )),
  severity VARCHAR(20) NOT NULL DEFAULT 'low'
    CHECK (severity IN ('low','medium','high')),
  details JSONB NOT NULL DEFAULT '{}',
  reviewed BOOLEAN NOT NULL DEFAULT FALSE,
  reviewed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_af_round ON abuse_flags (voting_round_id);
CREATE INDEX IF NOT EXISTS idx_af_actor ON abuse_flags (actor_id);
CREATE INDEX IF NOT EXISTS idx_af_reviewed ON abuse_flags (reviewed);

-- Voting-specific audit trail (extends Tier-2 audit_events) -----------
-- We reuse audit_events and extend entity/action vocabulary for Tier-3.
-- No new table required — audit_events already has:
--   actor_id, event_id, action, entity, entity_id, meta, created_at
-- We add an index for voting round queries.
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_events (created_at);
CREATE INDEX IF NOT EXISTS idx_audit_actor ON audit_events (actor_id, created_at);
