-- DOGFOOD Tier 2 judging schema (additive only — no Tier 1 restructuring).
-- All judging tables FK to Tier 1 rows (events/users/projects). Raw evaluation
-- data is immutable evidence; normalization outputs are versioned per run.

-- Per-event judge roster + lifecycle status ---------------------------------
CREATE TABLE IF NOT EXISTS event_judges (
  id SERIAL PRIMARY KEY,
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status VARCHAR(20) NOT NULL DEFAULT 'invited'
    CHECK (status IN ('invited','active','suspended','completed')),
  invited_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (event_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_event_judges_event ON event_judges (event_id);
CREATE INDEX IF NOT EXISTS idx_event_judges_user ON event_judges (user_id);

-- Configurable rubrics (one active per event; history kept via is_active) ----
CREATE TABLE IF NOT EXISTS rubrics (
  id SERIAL PRIMARY KEY,
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  title VARCHAR(200) NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  version INTEGER NOT NULL DEFAULT 1,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_rubrics_event ON rubrics (event_id);

CREATE TABLE IF NOT EXISTS rubric_criteria (
  id SERIAL PRIMARY KEY,
  rubric_id INTEGER NOT NULL REFERENCES rubrics(id) ON DELETE CASCADE,
  label VARCHAR(120) NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  max_score DOUBLE PRECISION NOT NULL DEFAULT 25 CHECK (max_score > 0),
  weight DOUBLE PRECISION NOT NULL DEFAULT 1 CHECK (weight >= 0),
  required BOOLEAN NOT NULL DEFAULT TRUE,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_criteria_rubric ON rubric_criteria (rubric_id);

-- Judge → project assignments (normal + calibration kinds) ------------------
CREATE TABLE IF NOT EXISTS judge_assignments (
  id SERIAL PRIMARY KEY,
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  judge_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  kind VARCHAR(20) NOT NULL DEFAULT 'normal'
    CHECK (kind IN ('normal','calibration')),
  round INTEGER NOT NULL DEFAULT 1,
  status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','submitted')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (judge_id, project_id, round)
);
CREATE INDEX IF NOT EXISTS idx_assign_event ON judge_assignments (event_id);
CREATE INDEX IF NOT EXISTS idx_assign_judge ON judge_assignments (judge_id, status);
CREATE INDEX IF NOT EXISTS idx_assign_project ON judge_assignments (project_id);

-- Evaluations: raw scores are immutable historical evidence -----------------
CREATE TABLE IF NOT EXISTS evaluations (
  id SERIAL PRIMARY KEY,
  assignment_id INTEGER NOT NULL UNIQUE REFERENCES judge_assignments(id) ON DELETE CASCADE,
  rubric_id INTEGER NOT NULL REFERENCES rubrics(id) ON DELETE RESTRICT,
  scores JSONB NOT NULL DEFAULT '{}',
  raw_total DOUBLE PRECISION NOT NULL DEFAULT 0,
  feedback TEXT NOT NULL DEFAULT '',
  status VARCHAR(20) NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','submitted','invalid','excluded')),
  submitted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_eval_assignment ON evaluations (assignment_id);
CREATE INDEX IF NOT EXISTS idx_eval_rubric ON evaluations (rubric_id);
CREATE INDEX IF NOT EXISTS idx_eval_status ON evaluations (status);

-- Calibration runs (one per calculation; versioned per event) ---------------
CREATE TABLE IF NOT EXISTS calibration_runs (
  id SERIAL PRIMARY KEY,
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  reference_judge_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  mode VARCHAR(30) NOT NULL DEFAULT 'ONE_LOW_ONE_HIGH'
    CHECK (mode IN ('ONE_LOW_ONE_HIGH','TWO_LOW_ONE_HIGH','ONE_LOW_TWO_HIGH','TWO_LOW_TWO_HIGH')),
  version INTEGER NOT NULL DEFAULT 1,
  status VARCHAR(30) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','complete','failed')),
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_calrun_event ON calibration_runs (event_id);

-- Per-pair two-point transformations (persisted slope + intercept) ----------
CREATE TABLE IF NOT EXISTS judge_calibrations (
  id SERIAL PRIMARY KEY,
  run_id INTEGER NOT NULL REFERENCES calibration_runs(id) ON DELETE CASCADE,
  source_judge_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_judge_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  low_anchor_project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL,
  high_anchor_project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL,
  source_low DOUBLE PRECISION,
  source_high DOUBLE PRECISION,
  target_low DOUBLE PRECISION,
  target_high DOUBLE PRECISION,
  slope DOUBLE PRECISION,
  intercept DOUBLE PRECISION,
  status VARCHAR(40) NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('VALID','INVALID','INSUFFICIENT_CALIBRATION_DATA','SUSPICIOUS_CALIBRATION','EXTRAPOLATED','PENDING')),
  reason VARCHAR(120) NOT NULL DEFAULT '',
  evidence JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (run_id, source_judge_id),
  CHECK (low_anchor_project_id IS NULL OR high_anchor_project_id IS NULL OR low_anchor_project_id <> high_anchor_project_id)
);
CREATE INDEX IF NOT EXISTS idx_calib_run ON judge_calibrations (run_id);

-- Normalized scores: derived values, never overwrite raw --------------------
CREATE TABLE IF NOT EXISTS normalized_scores (
  id SERIAL PRIMARY KEY,
  run_id INTEGER NOT NULL REFERENCES calibration_runs(id) ON DELETE CASCADE,
  evaluation_id INTEGER NOT NULL REFERENCES evaluations(id) ON DELETE CASCADE,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  judge_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  raw_score DOUBLE PRECISION NOT NULL,
  normalized_score DOUBLE PRECISION,
  extrapolated BOOLEAN NOT NULL DEFAULT FALSE,
  status VARCHAR(40) NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('VALID','INVALID','INSUFFICIENT_CALIBRATION_DATA','SUSPICIOUS_CALIBRATION','EXTRAPOLATED','PENDING')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (run_id, evaluation_id)
);
CREATE INDEX IF NOT EXISTS idx_norm_run ON normalized_scores (run_id);
CREATE INDEX IF NOT EXISTS idx_norm_project ON normalized_scores (project_id);
CREATE INDEX IF NOT EXISTS idx_norm_judge ON normalized_scores (judge_id);

-- Append-only audit trail for judging actions -------------------------------
CREATE TABLE IF NOT EXISTS audit_events (
  id SERIAL PRIMARY KEY,
  actor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  event_id INTEGER REFERENCES events(id) ON DELETE CASCADE,
  action VARCHAR(80) NOT NULL,
  entity VARCHAR(80) NOT NULL DEFAULT '',
  entity_id INTEGER,
  meta JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audit_event ON audit_events (event_id);
CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_events (action);
