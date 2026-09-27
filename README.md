# DOGFOOD 🐶 — Hackathon Management & Judging Platform

**DOGFOOD** ("eat your own dogfood") is an open-source, self-hostable, production-ready platform for hackathon registration, team formation, project submissions, cross-judge calibrated scoring, and community engagement.

Built as an offline-first modular monolith, DOGFOOD runs out of the box with zero external cloud dependencies, zero API keys, and zero frontend bundling toolchains.

---

## 1. Project Overview

Running hackathons smoothly requires solving three major coordination problems:
1. **Participant Lifecycle & Deadline Integrity:** Hackathon participants need frictionless team creation, invite link sharing, and project draft staging, while organizers require strict, server-side deadline enforcement to prevent late submissions.
2. **Fair & Defensible Judging:** Judges exhibit varying scoring behaviors—some grade strictly while others are generous. Comparing uncalibrated raw scores distorts winners. DOGFOOD solves this with a **mathematically grounded two-point linear normalization engine** based on shared anchor projects.
3. **Auditability & Community Engagement:** Organizers need transparent score derivations ("Why is this project ranked here?"), tamper-evident audit trails, and anti-brigading community voting.

---

## 2. Main Capabilities

DOGFOOD provides a complete end-to-end platform across three implemented tiers:

### Tier 1 — Core Hackathon Management
- **Authentication & RBAC:** Email + bcrypt passwords, opaque SHA-256 database sessions, and backend-enforced roles (`participant`, `organizer`, `judge`, `admin`).
- **Event Lifecycle:** Create, edit, publish, and archive events with custom tracks, prizes, and strict server-enforced submission deadlines.
- **Teams & Invitations:** Create teams, generate 30-day expiring shareable invite codes, join/leave teams, transfer ownership, with strict one-team-per-user-per-event rules.
- **Projects & Submissions:** Draft editing, track selection, rich links, pre-submission review modals, frozen JSONB submission snapshots, and server-side submission locks.
- **Public Project Gallery:** Server-side paginated showcase with search queries (`q`) and track filters.

### Tier 2 — Calibrated Judging Subsystem
- **Judge Roster Lifecycle:** Invite judges and track status (`invited`, `active`, `suspended`, `completed`).
- **Flexible Rubrics:** Multi-criteria weighted rubrics with versioning (`rubrics` + `rubric_criteria`).
- **Assignment Engine:** Manual 1-to-1 assignments or deterministic, balanced batch assignment using the Mulberry32 seeded PRNG with coverage and max-load controls.
- **Judge Workspace:** Isolated scoring view where judges grade assigned projects with criterion-level validation and draft-saving. Server calculates weighted totals.
- **Cross-Judge Calibration & Normalization:** Two-point linear transformation mapping source judges to a configurable reference judge scale using shared anchor projects.
- **Explainability:** Interactive "Why is this score?" derivations providing step-by-step mathematical proofs from persisted anchor scores.
- **Exports & Auditing:** Granular evaluation-level and project-level CSV exports, plus an append-only audit trail (`audit_events`).

### Tier 3 — Community Voting & Discussion
- **Public Voting Rounds:** Configurable voting rounds (`open`, `paused`, `closed`, `results_revealed`) with custom vote allowances.
- **Anti-Brigading Guardrails:** Relational constraint `UNIQUE(voting_round_id, voter_id, project_id)` guarantees one vote per project per user.
- **Hidden Results During Voting:** Prevents bandwagon effects; live counts are revealed only when organizers officially close and reveal results.
- **Randomized Presentation Ordering:** Eliminates primacy bias by shuffling project presentation per visitor session.
- **Community Feedback & Moderation:** Project comments with an organizer moderation workflow (`visible`, `hidden`, `flagged`, `deleted`).
- **In-Database Rate Limiting:** Sliding-window throttling on votes and comments without external Redis dependencies.

---

## 3. Architecture Overview

```
                               ┌────────────────────────────────┐
                               │     Web Browser (Client)       │
                               └──────────────┬─────────────────┘
                                              │ HTTP :8080
                                              ▼
                               ┌────────────────────────────────┐
                               │   NGINX Reverse Proxy & SPA    │
                               │     (Same-Origin /api/*)       │
                               └──────────────┬─────────────────┘
                                              │ Proxy Pass :3000
                                              ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                        Node.js 20 / Express 4 API Backend                              │
├────────────────────────────────┬───────────────────────────────┬──────────────────────┤
│  Authentication & Sessions     │  Event & Team Management      │  Project Submissions │
├────────────────────────────────┼───────────────────────────────┼──────────────────────┤
│  Judging & Assignment Engine   │  Normalization Engine         │  Community Voting    │
├────────────────────────────────┼───────────────────────────────┼──────────────────────┤
│  Audit Logger                  │  CSV Streaming Exporter       │  In-DB Rate Limiter  │
└────────────────────────────────┬───────────────────────────────┴──────────────────────┘
                                 │ PostgreSQL Protocol :5432
                                 ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                             PostgreSQL 16 Database                                    │
│   (Relational Schema · Foreign Keys · Unique Constraints · B-Tree Indexes · JSONB)     │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

For full architectural diagrams, component breakdowns, and data flows, see [`ARCHITECTURE.md`](ARCHITECTURE.md).

---

## 4. Technology Stack

- **Frontend:** Plain HTML5, CSS3, Vanilla JavaScript (ES2022) Single-Page Application (SPA). Zero build step, zero bundling dependencies, zero external CDNs.
- **Reverse Proxy / Web Server:** NGINX 1.27 Alpine.
- **Backend API:** Node.js 20 LTS, Express 4.19.
- **Database:** PostgreSQL 16 Alpine with connection pooling (`pg` 8.12).
- **In-Memory PostgreSQL Engine:** `pg-mem` 2.9 (integrated for test execution and offline fallback).
- **Security:** `bcryptjs` for salted password hashing, SHA-256 for opaque session token lookups.
- **Testing:** Native Node.js test runner (`node:test`), `supertest` for HTTP integration tests.
- **Containerization:** Docker & Docker Compose v2.

---

## 5. Quick Start

### Running with Docker Compose (Recommended)

Clone the repository and launch the multi-container stack:

```bash
git clone https://github.com/Nithin-Kumar-Y/DogFood-RUBEX-HACKS.git
cd DogFood-RUBEX-HACKS
docker compose up
```

*(If making code modifications, run `docker compose up --build`)*

Once started, open your browser:
- **Web Application:** [http://localhost:8080](http://localhost:8080)
- **API Health Check:** [http://localhost:3001/api/health](http://localhost:3001/api/health) (or [http://localhost:8080/api/health](http://localhost:8080/api/health))

### Running Locally Without Docker (Zero-Dependency Node Run)

DOGFOOD supports a fully embedded local development mode that boots an embedded PostgreSQL engine:

```bash
npm install
npm start
```
The application will automatically initialize the database, execute all migrations, load seed data, and start the frontend at [http://localhost:8080](http://localhost:8080).

---

## 6. Seeded Demo Accounts & Sample Data

On initial boot, the database is deterministically seeded with realistic demo data (`backend/src/seed.js`).

### Pre-Configured Demo Accounts

> **Note:** These credentials are for local demo and testing environments only.

| Role | Email | Password | Primary Capabilities |
|---|---|---|---|
| **Admin** | `admin@dogfood.local` | `Admin123!` | System-wide visibility, role management, user administration |
| **Organizer** | `organizer@dogfood.local` | `Organizer123!` | Create events, manage rubrics, batch assign judges, run calibration, export CSVs |
| **Judge** | `judge@dogfood.local` | `Judge123!` | Isolated judging queue, submit criterion scores, provide qualitative feedback |
| **Participant** | `priya@dogfood.local` | `Password123!` | Lead of team "Pixel Pioneers", project "StudyBuddy", view submissions |
| **Participant** | `sam@dogfood.local` | `Password123!` | Team member of "Pixel Pioneers" |
| **Participant** | `lena@dogfood.local` | `Password123!` | Lead of team "Data Wizards", project "CampusEats" |
| **Participant** | `marco@dogfood.local` | `Password123!` | Team member of "Data Wizards" |
| **Participant** | `aisha@dogfood.local` | `Password123!` | Solo builder of draft project "DormDash" |

### Pre-Seeded Hackathon Environment
- **Flagship Event:** "Campus Hack 2026" (Published, actively running with 3 tracks and 3 prizes).
- **Submitted Projects:**
  - *StudyBuddy:* Web & Mobile track, submitted with repository and live demo links.
  - *CampusEats:* AI & Data track, submitted with video demo link.
  - *DormDash:* Draft project (unsubmitted).
- **Pre-Configured Judging:** Active 4-criteria rubric ("Standard 100"), judge assignments, submitted evaluations, and a completed calibration run with persisted normalized scores.
- **Community Voting:** Active voting round ("Community Choice") with cast votes and discussion comments.

---

## 7. Complete Event Lifecycle Walkthrough

To experience the complete platform flow:

1. **Log in as Organizer:** Sign in as `organizer@dogfood.local` (`Organizer123!`). Visit the Organizer Dashboard to inspect live metrics.
2. **Inspect or Create an Event:** View "Campus Hack 2026" under `#/events` or create a new event with custom tracks and submission deadlines.
3. **Participant Registration & Team Formation:** Log in as `priya@dogfood.local` (`Password123!`), navigate to `#/teams`, copy the invite code, or add team members.
4. **Project Submission:** In `#/projects`, review the project draft. Click "Submit", inspect the pre-submission modal, and submit before the deadline.
5. **Configure Judging Rubric:** As Organizer, navigate to `#/organizer/judging/rubric` and configure evaluation criteria (e.g., Innovation, Technical Execution, Impact, Presentation) with custom weights and point caps.
6. **Assign Judges:** Under `#/organizer/judging/assignments`, view assignments or execute a batch assignment using a deterministic random seed.
7. **Judge Scoring:** Sign in as `judge@dogfood.local` (`Judge123!`), open `#/judging`, select an assigned project, fill out rubric scores, add comments, and click "Submit Evaluation".
8. **Normalize Scores:** As Organizer, open `#/organizer/judging/calibration`. Select a reference judge, calculate two-point linear normalization across shared anchor projects, and view fitted slopes and intercepts.
9. **Inspect Final Standings & Explainability:** Open `#/organizer/judging/results`. Review final calibrated rankings, standard deviations, and click "Why?" to inspect the exact mathematical derivation.
10. **Export Results:** Click "Export evaluations CSV" or "Export projects CSV" to download timestamped audit reports.

---

## 8. Test Suite

The repository includes a comprehensive, multi-tier automated test suite executed with the native Node.js test runner and `supertest` over an in-memory PostgreSQL instance.

### Running Tests

From the repository root:

```bash
npm test
```

Or from the `backend/` directory:

```bash
cd backend
npm test
```

### Test Results Summary

```
✔ Tier 1 — Auth & RBAC (registration, login, invalid credentials, sessions, roles)
✔ Tier 1 — Organizer Aggregates, Stats, Invite Expiry (410 handling, token regeneration)
✔ Tier 1 — Projects, Submissions, Deadlines, Gallery (CRUD, deadline guards, pagination)
✔ Tier 2 — Normalization Engine (slope/intercept math, zero-range guards, edge statuses)
✔ Tier 2 — Judging Workflow (roster, rubric versions, evaluations, calibration, CSV, audit)
✔ Tier 2 — E2E Scale Simulation (10 judges, 100 projects, deterministic PRNG batch assignment)
✔ Tier 3 — Community Voting Lifecycle (round states, vote limits, withdrawal rules)
✔ Tier 3 — Anti-Brigading & Concurrency (atomic duplicate prevention, rate limits)
✔ Tier 3 — Moderation & Comments (comment thread, hiding/restoring, profanity/XSS guards)
✔ Tier 3 — Hidden Results & Randomized Presentation (elimination of bandwagon/primacy bias)
✔ Tier 3 — E2E Acceptance Flow (complete voting round from creation to public reveal)

----------------------------------------------------------------------------------------
Test Suites: 23 passed, 23 total
Tests:       163 passed, 163 total
Failures:    0
Duration:    ~45 seconds
```

---

## 9. Docker Architecture & Container Details

Docker Compose orchestrates three networked services:

```yaml
services:
  db:
    image: postgres:16-alpine
    volumes: [dogfood_pgdata:/var/lib/postgresql/data]
    healthcheck: pg_isready
  backend:
    build: ./backend
    depends_on: { db: { condition: service_healthy } }
    ports: ["3001:3000"]
  frontend:
    build: ./frontend
    depends_on: [backend]
    ports: ["8080:80"]
```

- **Clean Startup Dependency:** The backend waits for the database container to pass health checks before executing database migrations and idempotent seeding.
- **Data Persistence:** Relational database records are safely retained in the named volume `dogfood_pgdata`. To reset to clean seed data, run `docker compose down -v` followed by `docker compose up`.

---

## 10. 5-Minute Demonstration Walkthrough

When recording or evaluating a 5-minute live platform demonstration:

| Timestamp | Phase | Action / Screen | Key Talking Points |
|---|---|---|---|
| **0:00 – 0:30** | **Platform Overview** | Homepage (`#/`), Gallery (`#/gallery`) | Introduce DOGFOOD: self-hostable, zero-dependency stack, offline-capable hackathon platform. |
| **0:30 – 1:00** | **Event & Submissions** | Organizer Dashboard (`#/organizer`), Projects (`#/projects`) | Show event creation with deadlines and tracks; demonstrate project submission lock and snapshot integrity. |
| **1:00 – 1:45** | **Rubric & Assignments** | Rubrics (`#/organizer/judging/rubric`), Assignments (`#/organizer/judging/assignments`) | Show weighted multi-criteria rubric; execute deterministic batch assignment of judges using Mulberry32 PRNG. |
| **1:45 – 3:00** | **Judge Evaluation** | Judge Workspace (`#/judging`), Score Form (`#/judging/evaluate/:id`) | Log in as judge; show isolated queue; score criteria; submit evaluation; highlight server-side weighted sum computation. |
| **3:00 – 4:00** | **Calibration & Normalization** | Calibration (`#/organizer/judging/calibration`), Results (`#/organizer/judging/results`) | Explain shared anchor projects; run calibration; show slope/intercept calculations; inspect "Why is this score?" popup. |
| **4:00 – 4:30** | **Exports & Audit Trail** | Results (`#/organizer/judging/results`), Audit (`#/organizer/judging/audit`) | Download evaluations and projects CSVs; view immutable audit log capturing every event mutation. |
| **4:30 – 5:00** | **Architecture & Integrity** | Architecture Diagram, Community Voting (`#/voting`) | Highlight PostgreSQL relational guarantees, Docker Compose topology, and anti-brigading community voting. |

---

## 11. Documentation Directory

For in-depth technical documentation, consult the following specifications:
- [`ARCHITECTURE.md`](ARCHITECTURE.md): Comprehensive system architecture, security model, request flows, and technical decisions.
- [`DATA-MODEL.md`](DATA-MODEL.md): Complete database entity definitions, Mermaid ER diagrams, indexes, constraints, and CSV formats.
- [`JUDGING.md`](JUDGING.md): Mathematical derivation of two-point linear normalization, anchor project rules, edge cases, and numerical examples.
- [`acceptance-report.txt`](acceptance-report.txt): Formal requirement-by-requirement verification and test audit.

---

## 12. Open-Source License

DOGFOOD is released under the **MIT License**, an OSI-approved permissive open-source license. See the [`LICENSE`](LICENSE) file for complete terms.
