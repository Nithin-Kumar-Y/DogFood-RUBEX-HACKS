# Tier 3 — Public / Community (IMPLEMENTED)

Tier-3 community voting and discussion is implemented as an incremental extension of the DOGFOOD platform. No Tier-1 or Tier-2 architecture was modified or replaced; additive migration `004_community.sql` and routers in `backend/src/routes/voting.js` and `backend/src/routes/comments.js` provide complete community engagement capabilities.

## What Shipped

- **Database** (`backend/migrations/004_community.sql`):
  - `voting_rounds`: Configurable voting rounds with status lifecycle (`draft`, `scheduled`, `open`, `paused`, `closed`, `results_revealed`, `archived`), vote limits, hidden results toggle, and rate limits.
  - `voting_round_projects`: Association of eligible submitted projects with voting rounds.
  - `community_votes`: One active vote per user per project per round (`UNIQUE(voting_round_id, voter_id, project_id)`).
  - `vote_history`: Append-only audit log of all vote state changes (`cast`, `withdrawn`, `restored`, `removed_by_admin`).
  - `comments`: Community feedback on projects within voting rounds with moderation statuses (`visible`, `hidden`, `deleted`, `flagged`).
  - `comment_moderation`: Append-only moderation action log.
  - `rate_limit_events`: Database-backed sliding rate limiting (no external Redis dependency).
  - `abuse_flags`: Automated detection of suspicious voting patterns and quotas.
- **API**:
  - `backend/src/routes/voting.js`: Mounted at `/api/voting/*` for round lifecycle, project listings with randomized ordering per user session, vote casting/withdrawal, results reveal, and live organizer analytics.
  - `backend/src/routes/comments.js`: Mounted at `/api/comments/*` for commenting, editing, moderation queue, hiding/restoring comments, and spam prevention.
- **UI**:
  - Community Voting round list (`#/voting`) and project detail voting view (`#/voting/:id`).
  - Project comment thread (`#/voting/:roundId/comments/:projectId`).
  - Organizer voting management (`#/organizer/voting`), round creation (`#/organizer/voting/new`), and live analytics (`#/organizer/voting/:id/analytics`).
- **Tests**:
  - `backend/tests/voting.test.js`: 54 assertions covering round lifecycle, vote casting, duplicate vote rejection, hidden results during voting, randomized ordering, vote withdrawal, results reveal, comment creation/editing/moderation, authorization boundaries, rate limiting, and concurrency.
- **Security & Integrity**:
  - Hidden results during voting prevent bandwagoning.
  - Per-user randomized ordering eliminates presentation position bias.
  - Strict DB-level unique constraints and atomic queries prevent duplicate and concurrent voting exploits.
  - Organizer analytics accessible only to authorized event organizers and admins.
