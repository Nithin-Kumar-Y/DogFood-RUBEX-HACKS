# DOGFOOD Data Model

Tier 1 tables are **implemented** (`backend/migrations/001_init.sql`).
Tier 2–4 tables are **planned** — names/shapes below are the contract future
migrations must follow so Tier 1 is never restructured.

## Tier 1 entity map (implemented)

```
users 1───* sessions
users 1───* events (created_by)
events 1──* event_tracks        events 1──* prizes
events 1──* teams               events 1──* projects   events 1──* submissions
teams 1───* team_members (→ users)
teams 1───* team_invitations
teams 1───* projects            teams 1──* submissions
projects 1─* project_links      projects 1──1 submissions (UNIQUE project_id)
event_tracks 1──* projects (nullable track_id, SET NULL on delete)
```

### users
| col | type | notes |
|---|---|---|
| id | SERIAL PK | |
| email | VARCHAR(255) UNIQUE | lowercased on write; `idx_users_email` |
| password_hash | TEXT | bcrypt |
| name | VARCHAR(120) | |
| role | VARCHAR(20) | `participant\|organizer\|judge\|admin`, `idx_users_role` |
| created_at / updated_at | TIMESTAMPTZ | |

### sessions
| col | notes |
|---|---|
| id SERIAL PK; user_id FK→users CASCADE; token_hash CHAR(64) UNIQUE (sha256 of opaque token); expires_at; created_at | indexes on `user_id`, `expires_at` |

### events
`id, title, slug UNIQUE, description, starts_at, ends_at, submission_deadline, status(draft|published|archived), created_by FK→users SET NULL, created_at, updated_at`,
`CHECK (starts_at < ends_at)`, indexes on `status`, `submission_deadline`, `created_by`.
🔌 Tier 2 may ADD: `judging_starts_at, judging_ends_at, rubric_id, blind_review BOOLEAN`. Tier 3 may ADD: `reveal_at`.

### event_tracks
`id, event_id FK CASCADE, name, description, position`, `idx_tracks_event`.

### prizes
`id, event_id FK CASCADE, title, description, amount (free text e.g. "$500"), position`.

### teams
`id, event_id FK CASCADE, name, invite_code VARCHAR(32) UNIQUE, created_by SET NULL, created_at, updated_at`,
indexes on `event_id`, `invite_code`. Business rule (app-level): one team per user per event.

### team_members
`id, team_id FK CASCADE, user_id FK CASCADE, member_role(owner|member), joined_at`,
`UNIQUE(team_id, user_id)`, indexes on both FKs.

### team_invitations
`id, team_id FK CASCADE, code, created_by SET NULL, status(pending|accepted|revoked|expired), expires_at NULL, created_at, accepted_by SET NULL, accepted_at NULL` — append-only audit trail of invite lifecycle.

### projects
`id, team_id FK CASCADE, event_id FK CASCADE, title, description, track_id FK→event_tracks SET NULL, status(draft|submitted|locked), created_by SET NULL, created_at, updated_at`,
indexes on `event_id, team_id, status, track_id`.
`status='locked'` is set by future tiers; Tier 1 derives "locked display" from deadline.

### project_links
`id, project_id FK CASCADE, label, url, position`.

### submissions
`id, project_id UNIQUE FK CASCADE, event_id FK CASCADE, team_id FK CASCADE, submitted_by SET NULL, submitted_at DEFAULT now(), snapshot JSONB` (frozen title/description/links at submit time).
Indexes on `event_id, team_id, submitted_at`.

Plus `schema_migrations(filename PK)` for idempotent boot migrations.

### Migration history
- `001_init.sql` — all Tier 1 tables above.
- `002_invite_expiry.sql` — **additive only**: `teams.invite_expires_at
  TIMESTAMPTZ` (+ backfill `now()+30d`, + index). Existing invitations keep
  working; new/regenerated codes expire after 30 days and are rejected with
  `410 Gone` on preview/accept.

## Tier 2 tables (IMPLEMENTED — migration `003_judging.sql`, additive only)

| Table | Key columns / constraints |
|---|---|
| `event_judges` | `event_id FK CASCADE, user_id FK CASCADE, status(invited\|active\|suspended\|completed)`, `UNIQUE(event_id,user_id)` |
| `rubrics` | `event_id FK CASCADE, title, is_active, version`, one active per event (code-enforced) |
| `rubric_criteria` | `rubric_id FK CASCADE, label, max_score>0, weight≥0, required, position` |
| `judge_assignments` | `event_id/judge_id/project_id FKs, kind(normal\|calibration), round, status(pending\|submitted)`, `UNIQUE(judge_id,project_id,round)` |
| `evaluations` | `assignment_id UNIQUE FK CASCADE, rubric_id FK RESTRICT, scores JSONB, raw_total, status(draft\|submitted\|invalid\|excluded)` |
| `calibration_runs` | `event_id FK, reference_judge_id FK, mode, version (per event), status(pending\|complete\|failed)` |
| `judge_calibrations` | `run_id FK CASCADE, source/target judges, low/high anchor project FKs, 4 scores, slope, intercept, status(6), reason, evidence JSONB`, `UNIQUE(run_id,source_judge_id)`, `CHECK(anchors differ)` |
| `normalized_scores` | `run_id/evaluation/project/judge FKs, raw_score, normalized_score NULL-able, extrapolated, status`, `UNIQUE(run_id,evaluation_id)` |
| `audit_events` | `actor_id SET NULL, event_id FK CASCADE, action, entity, entity_id, meta JSONB` |

Raw evaluations are immutable evidence; normalization outputs are versioned
per `calibration_runs` version and never overwrite raw data.

## Planned extension points (NOT implemented — do not query these yet)

- **Tier 3:** `votes` (`UNIQUE(project_id, voter_id)`), `comments`
  (moderation `status`), `audit_log` (append-only). Gallery randomization is
  application-level (seeded shuffle), no schema change.
- **Tier 4:** `api_keys`, `webhook_endpoints`, `webhook_deliveries`,
  `certificates` (`UNIQUE(submission_id)`, `UNIQUE(code)`).
- **Bonus:** `pairwise_prefs (judge_id, winner_id, loser_id, round)` for
  Bradley-Terry aggregation experiments.

Referential-integrity policy: Tier 1 rows are never hard-rewritten by later
tiers — judging/votes reference them; deleting an event cascades (organizers
blocked when submissions exist unless admin).
