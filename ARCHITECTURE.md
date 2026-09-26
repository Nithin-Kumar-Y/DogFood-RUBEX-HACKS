# DOGFOOD Architecture (Tier 1 → Tier 4 + Bonus)

> **IMPLEMENTED: Tier 1** (§2–§4, §9–§10 of this doc) and **Tier 2 judging**
> (§5, plus `backend/src/judging/`, `003_judging.sql`, organizer/judge judging
> UI) — 73/73 backend tests green.
>
> **PLANNED, NOT BUILT: Tier 3** (§6), **Tier 4** (§7), **Bonus** (§8).
> Pairwise/Bradley-Terry is explicitly excluded from Tier 2 and remains future
> work. The running app exposes explicit `501` placeholders only for Tier 3/4.

## 1. Principles

- **Self-hostable & offline-first:** `docker compose up` is the whole install.
  No cloud accounts, hosted DBs, external APIs, or proprietary services.
  Runtime needs zero internet (frontend ships no CDN assets; fonts are system).
- **Modular monolith:** `frontend → backend/API → service logic → database`.
  One deployable backend today; modules split cleanly later (e.g. judging
  worker) without rewrites.
- **Relational source of truth:** PostgreSQL 16. Judging/votes/webhooks all
  FK to Tier 1 rows (`projects`, `submissions`, `teams`, `events`).
- **Backend-enforced security:** RBAC + ownership + deadline checks run in
  Express middleware/handlers. The SPA is a convenience layer, never a guard.
- **Pagination & indexing by default:** every list endpoint is
  `page/limit/total/totalPages` with indexed `WHERE`/`ORDER BY`; no unbounded
  `SELECT *` reaches the browser.
- **Stateless API:** auth state lives in the `sessions` table (opaque token →
  `sha256` lookup); any backend replica + connection pool works.

## 2. Runtime topology (docker compose)

```
internet (build-time only: npm, apt/apk, base images)
   │
   ▼  docker compose up
┌─────────────┐   :8080    ┌──────────┐  /api/*   ┌──────────┐
│   frontend  │ ────────── │  nginx   │ ───────── │ backend  │──┐
│ nginx:alpine│  static SPA│ (same    │ proxy     │ node:20  │  │
│  html/css/js│            │ origin)  │           │ express  │  │
└─────────────┘            └──────────┘           └──────────┘  │
                                                        │ pg    │
                                                   ┌──────────┐ │
                                                   │ postgres │◄┘
                                                   │ 16-alpine│  pooled (max 20)
                                                   └──────────┘  volume: dogfood_pgdata
```

Boot sequence (backend `src/server.js`): wait-for-DB → `migrate()` (idempotent
`schema_migrations`) → `seed()` (idempotent) → `listen(:3000)`.
Health: `GET /api/health` (DB ping) for compose healthchecks + admin UI.

## 3. Backend modules (Tier 1 — built)

```
backend/src/
  server.js        boot: wait → migrate → seed → listen
  app.js           Express factory (also used by tests); mounts routes,
                   /stats/* dashboards, 501 placeholders for future tiers
  db.js            pooled pg; setPool() injection for tests
  auth.js          session loader, requireAuth, requireRole (admin bypass)
  util.js          slugs, invite codes, tokens, validators, deadline logic
  migrate.js / seed.js
  routes/
    auth.js        register/login/logout/me/profile
    events.js      event CRUD + tracks + prizes + organizer submissions/teams
    teams.js       teams CRUD, leave/delete rules, invites (create/list/preview/accept, 30-day expiry → 410)
    projects.js    draft CRUD, submit/unsubmit (deadline-guarded)
    gallery.js     public paginated gallery + details (submitted only)
    submissions.js /submissions/mine
    organizer.js   cross-event aggregates: /organizer/teams|projects|submissions (own events only)
    admin.js       user list/role mgmt, system overview
```

Key invariants (all server-side):
- Registration is participant-only; elevation requires an admin (`PUT /admin/users/:id/role`).
- One team per user per event (checked on create + join).
- One project per team per event; drafts private to members + event staff.
- Submit requires: title ≥ 3, description ≥ 20, ≥ 1 valid http(s) link,
  track selected when the event defines tracks, status `draft`, **now ≤ deadline**.
- After deadline: create/edit/submit/unsubmit all `400/403`; project shows LOCKED.
- Gallery only returns `projects.status='submitted'` in `published` events.

## 4. Frontend (Tier 1 — built)

Zero-dependency SPA (`frontend/app.js`, hash router, `fetch` + `credentials:include`,
Bearer fallback from `localStorage`). Role-specific sidebars:

- Participant: Dashboard, Events, My Teams, My Projects, Submissions (+ Profile)
- Organizer: Dashboard, My Events, New Event (+ Teams/Submissions per event)
- Judge: placeholder dashboard → Tier 2
- Admin: Dashboard, Users, Events, System
- Public: Home, Events, Gallery (+ Login/Register/Join)

Shared UX kit: toasts, confirm modals, skeletons, empty/error/loading states,
live deadline countdowns, client+server form validation, CSV export (basic).

## 5. Tier 2 — Judging (IMPLEMENTED)

Tables (migration `003_judging.sql`, all FK to Tier 1, additive only):
`event_judges` (roster + invited/active/suspended/completed),
`rubrics` + `rubric_criteria` (versioned, one active per event),
`judge_assignments` (normal/calibration, `UNIQUE(judge,project,round)`),
`evaluations` (criterion scores JSONB + server-computed raw_total; immutable
once submitted; organizer reopen audited),
`calibration_runs` (per-event versions, configurable reference judge + mode),
`judge_calibrations` (persisted anchors, four scores, slope, intercept,
status), `normalized_scores` (derived, versioned per run, never overwrite
raw), `audit_events` (append-only lifecycle trail).

Services: `backend/src/judging/normalization.js` (`NormalizationStrategy` base +
production `TwoPointLinearNormalization`; future strategies plug in without
touching routes/UI). API: `backend/src/routes/judging.js` mounted at
`/api/judging/*` (judges, rubrics, assignments, evaluations, progress,
calibration, results, export, audit). UI: judge workspace (`#/judging`,
`#/judging/evaluate/:id`) + organizer section (`#/organizer/judging/*`).
Role isolation: judges query only via assignment join; cross-judge analytics
organizer-only. Pairwise/Bradley-Terry explicitly excluded (future bonus).

## 6. Tier 3 — Community (designed, not built)

Tables: `votes(id, project_id, voter_id, value, UNIQUE(project_id, voter_id))`,
`comments(id, project_id, author_id, body, status, created_at)`,
`audit_log(id, actor_id, action, entity, entity_id, meta JSONB, created_at)`.
Behaviors: public results hidden until `events.reveal_at` (new nullable column);
gallery ordering randomized per visitor-session seed; rate limits
(express-rate-limit, per-IP + per-user buckets) on auth/votes/comments;
duplicate-vote detection via unique constraint + idempotency keys.

## 7. Tier 4 — Platform (designed, not built)

- REST API v1: `/api/v1/*` JSON envelope + API keys table (`api_keys`), scopes.
- Webhooks: `webhook_endpoints(id, owner_id, url, secret, events[])`,
  `webhook_deliveries(id, endpoint_id, event, payload, status, attempts)` +
  signed (HMAC) POST worker with backoff.
- Certificates: `certificates(id, submission_id UNIQUE, code UNIQUE, pdf_path)`
  + verification page.
- Verifiable judge records: hash-chained `result_snapshots` published to gallery.
- Embeds: `frontend/embed.js` + `/api/v1/events/:id/embed` (paginated JSON/HTML snippet).
- Bulk import/export: CSV/JSON for events/teams/projects/results.

## 8. Bonus — Judging engine (designed, not built)

Standalone contract (`bonus/`): normalization proof doc + fixtures,
pairwise module (Bradley-Terry over judge pairwise prefs table
`pairwise_prefs`), threat-model doc (collusion/bias/Sybil/timing mitigations),
API-first OpenAPI sketch so the engine can run as a sidecar later.

## 9. Performance & scale notes (engineering targets)

- 10k participants / 100 staff / ~1k public visitors-min: served by indexed
  queries + pagination + stateless API + pool (20) + nginx gzip + static SPA.
- No N+1: counts batched via `IN (…)` aggregates; gallery selects a 220-char
  excerpt, never full bodies in lists.
- Rate-limit-ready: auth/gallery paths structured for middleware buckets (Tier 3).
- Scale path (no rewrite): read-replica for gallery, Redis for sessions/rate
  limits, judging worker split from `routes/` services.

### Query discipline (verified in code — no full-table loads)

| Endpoint | Strategy |
|---|---|
| `GET /api/events` | `WHERE status` on `idx_events_status`, `LIMIT/OFFSET`; counts via 3 batched `IN (…)` aggregates |
| `GET /api/gallery` | `WHERE status + ILIKE` with `LIMIT ≤ 24`; `SUBSTRING` excerpt; link counts batched |
| `GET /api/organizer/*` | Scoped by `created_by` (`idx_events_created_by`), then `IN (…)` aggregates |
| `GET /api/stats/organizer` | Single grouped aggregate over indexed FK joins (no per-row queries) |
| All lists | Envelope `{data, page, limit, total, totalPages}`; frontend never holds more than one page |
| Writes | Parameterized, FK-guarded, unique-constraint backed (duplicates rejected by DB, not just app code) |

## 10. Security model

bcrypt (10 rounds) passwords; opaque 256-bit session tokens (sha256 stored,
30-day expiry, httpOnly `SameSite=Lax` cookie + Bearer fallback); admin-bypass
RBAC; ownership checks on every mutation; invite codes are 64–128-bit random;
deadline/clock checks server-side; parameterized queries throughout (no string
SQL); 256 KB JSON body cap; validation errors returned per-field.
