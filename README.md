# DOGFOOD 🐶

**DOGFOOD** (eat your own dogfood) is an open-source, self-hostable hackathon
registration, submission, judging, and results platform.

> **Tier 1 + Tier 2 judging are complete and tested (73/73).**
> Tier 3 (community), Tier 4 (platform), and the bonus judging engine are
> **architected but not yet implemented** — see `ARCHITECTURE.md`, `JUDGING.md`.

## Features (Tier 1 ✅)

| Area | What works |
|---|---|
| Auth | Register, login, logout, persistent sessions (DB-backed opaque tokens), secure bcrypt passwords |
| Roles | Participant / Organizer / Judge / Admin with **backend-enforced RBAC** |
| Events | Create, edit, publish/unpublish/archive, dates, deadline, tracks, prizes, validation |
| Teams | Create, rename, invite links (30-day expiry, regenerable), join, leave rules, ownership transfer guard, one-team-per-event + duplicate prevention |
| Projects | Create draft, edit, gallery **preview**, track selection, links, DRAFT / SUBMITTED / LOCKED states |
| Submissions | Review-and-submit confirmation, timestamp shown, server-side validation, **backend deadline enforcement**, unsubmit-before-deadline, organizer submissions view + CSV export |
| Gallery | Public, searchable, event + **track filters**, **server-side paginated** project cards + detail pages |
| Judging (Tier 2) | Judge invitations + roster statuses, manual + deterministic batch assignment, versioned weighted rubrics, draft/submit evaluations with server-computed totals, judge progress analytics, shared-anchor calibration with two-point linear normalization (slope/intercept persisted), normalized finals, why-explanations, CSV export, full audit trail |
| UI | Modern SaaS design system: toasts, skeletons, empty/error/loading states, countdowns, responsive + mobile nav, accessible forms |
| Ops | `docker compose up` → app running, DB migrated + seeded; health endpoint; offline-capable |

## Architecture

```
browser (static SPA: frontend/index.html + styles.css + app.js)
   │  same-origin /api/* (nginx reverse-proxy)
   ▼
backend (Node 20 + Express) ── routes → services → pg
   │                              │
   └─ sessions/tokens, RBAC, validation, deadline guards
db (PostgreSQL 16): users, sessions, events, event_tracks, prizes,
   teams, team_members, team_invitations, projects, project_links, submissions
```

## Technology stack

| Layer | Choice | Why |
|---|---|---|
| Frontend | Zero-dependency SPA (plain HTML/CSS/JS, hash router) | No build step → 0 build errors; no CDN → works offline; tiny payload |
| API | Node.js 20 + Express 4 | Stable, boring, huge hiring pool; easy to self-host |
| Auth | bcryptjs + opaque session tokens (sha256 in DB) | No JWT secret management; instant revocation via logout |
| Database | PostgreSQL 16 | Relational integrity (FKs, uniques, checks), indexes, JSONB snapshots |
| Proxy/static | nginx:alpine | Same-origin `/api` proxy (no CORS pain), gzip, caching headers |
| Tests | node:test + supertest + pg-mem | Full API coverage with zero external services |
| Ship | Docker Compose (db + backend + frontend) | One command: `docker compose up --build` |

Role navigation: Participant (Dashboard, Events, Teams, Projects, Submissions,
Profile), Organizer (Dashboard, Events, Teams, Projects, Submissions,
Settings), Admin (Dashboard, Users, Events, System), Judge (placeholder for
Tier 2), Public (Home, Events, Gallery).

Clean module boundaries: `frontend/` → `backend/src/routes/` →
business logic in route handlers + `util.js` → `db.js` (pooled `pg`).
Auth lives in `auth.js` middleware; every privileged route re-checks the
session + role on the server. Full details in [`ARCHITECTURE.md`](ARCHITECTURE.md);
schema details in [`DATA-MODEL.md`](DATA-MODEL.md); judging plan in [`JUDGING.md`](JUDGING.md).

## Quickstart (Docker — the supported path)

Prerequisites: Docker + Docker Compose only. No cloud accounts, no hosted DB,
no API keys. After images are pulled, the app runs **without internet**.

```bash
git clone <this-repo> && cd dogfood
docker compose up --build
```

Then open:

- **App:** http://localhost:8080
- **API (direct):** http://localhost:3001/api/health

On first boot the backend waits for Postgres, runs migrations
(`backend/migrations/*.sql`), seeds demo data (`backend/src/seed.js`,
idempotent — skips if users exist), and starts serving.

Useful commands:

```bash
docker compose up --build      # first run / rebuild
docker compose up -d           # detached
docker compose logs -f backend # follow backend logs
docker compose down            # stop (keeps data)
docker compose down -v         # stop + wipe database
```

## Local development (without Docker)

```bash
# 1. Start Postgres 16 locally and create db `dogfood`
createdb dogfood   # user/pass per DATABASE_URL below

# 2. Backend
cd backend
npm install
set DATABASE_URL=postgres://dogfood:dogfood@localhost:5432/dogfood   # Windows
# export DATABASE_URL=...                                             # macOS/Linux
npm run migrate  # optional — `npm start` migrates automatically
npm start        # → http://localhost:3000

# 3. Frontend (any static server; API must be reachable at /api)
cd ../frontend
npx serve .      # then proxy /api → localhost:3000, or just use Docker
```

## Demo accounts (seeded automatically)

| Role | Email | Password |
|---|---|---|
| Admin | `admin@dogfood.local` | `Admin123!` |
| Organizer | `organizer@dogfood.local` | `Organizer123!` |
| Judge (Tier 2 ready) | `judge@dogfood.local` | `Judge123!` |
| Participant | `priya@dogfood.local` | `Password123!` |
| Participant | `sam@dogfood.local` | `Password123!` |
| … | `lena@, marco@, aisha@, tom@dogfood.local` | `Password123!` |

Seeded content: 3 events (published / archived / draft), tracks + prizes,
4 teams, 2 submitted projects, 1 draft project, 1 archived submission —
plus Tier-2 demo judging on the published event (rubric, judge roster with
`judge@dogfood.local`, assignments, submitted evaluations 70 & 80, and a
completed v1 calibration run, so every judging page is explorable instantly).

## Testing

```bash
cd backend
npm install
npm test   # 73 tests, node:test + supertest + pg-mem (no Docker/DB needed)
```

Covers: auth, role isolation, event validation, team + invite flow
(incl. duplicate prevention), project draft/edit, submission validation,
organizer-only submission view, gallery search/pagination/draft-exclusion,
backend deadline enforcement, and unauthorized-access blocking.
Honest results in [`acceptance-report.txt`](acceptance-report.txt).

## Project layout

```
docker-compose.yml        # db + backend + frontend, one-command boot
backend/                  # Express API, migrations, seeds, tests, Dockerfile
frontend/                 # offline SPA (index.html, styles.css, app.js), nginx.conf, Dockerfile
tier-2/ tier-3/ tier-4/ bonus/   # placeholders with READMEs (not implemented)
README.md ARCHITECTURE.md DATA-MODEL.md JUDGING.md acceptance-report.txt
LICENSE (MIT)
```

## License

MIT — see [LICENSE](LICENSE). Contributions welcome.
