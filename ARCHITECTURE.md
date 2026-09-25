# DOGFOOD Platform System Architecture (Tier 1 → Tier 4 + Bonus)

## Executive Summary

**DOGFOOD** is an open-source, self-hostable, offline-first hackathon registration, submission, judging, and results platform. It is engineered with a strict modular decoupled architecture that runs reliably on local developer hardware via Docker Compose without external internet dependencies, hosted databases, or proprietary services.

---

## 1. System Topology & Tier Progression

```
+-----------------------------------------------------------------------------------+
|                                 DOGFOOD PLATFORM                                  |
+-----------------------------------------------------------------------------------+
|  [TIER 1 - CORE] (FULLY IMPLEMENTED)                                              |
|  - Relational Schema (SQLite / PostgreSQL)                                        |
|  - Role-Based Access Control (Participant, Organizer, Judge, Admin)               |
|  - Hackathon Lifecycles, Timelines & Strict Backend Deadline Enforcement          |
|  - Team Formation, Unique Event Membership & Invitation Links                    |
|  - Project Draft Management & Validation                                          |
|  - Public Searchable & Paginated Project Gallery                                  |
+-----------------------------------------------------------------------------------+
|  [TIER 2 - JUDGING ENGINE] (PLANNED EXTENSION)                                    |
|  - Configurable Weighted Rubrics & Track Specialization                           |
|  - Algorithmic Judge Assignment (Round-Robin, COI mitigation)                     |
|  - Mathematical Normalization (Z-Score, Trimmed Mean) & CSV Export               |
+-----------------------------------------------------------------------------------+
|  [TIER 3 - COMMUNITY & FAIR DISCOVERY] (PLANNED EXTENSION)                       |
|  - Sybil-Resistant Community Voting & Threaded Feedback                           |
|  - Blinded Results & Fair Project Card Randomization                              |
|  - Cryptographic Audit Trail                                                      |
+-----------------------------------------------------------------------------------+
|  [TIER 4 - STRETCH CAPABILITIES] (PLANNED EXTENSION)                              |
|  - REST Developer API & Webhooks                                                  |
|  - Verifiable Digital Certificates (OpenCerts/W3C)                                |
|  - Embeddable Gallery Widgets                                                     |
+-----------------------------------------------------------------------------------+
```

---

## 2. Multi-Layer Modular Architecture

The application strictly implements the **Frontend → Backend/API → Service/Business Logic → Database** paradigm:

```
[ CLIENT BROWSER ]
       │
       ▼ HTTP / REST
[ FRONTEND LAYER: React 18 + Vite SPA ]
  ├── AuthContext & RBAC Guards
  ├── Design System (Glassmorphism, Dark Mode Tokens)
  └── Role-Specific Views (Participant, Organizer, Judge, Admin, Public)
       │
       ▼ Reverse Proxy (Nginx) / Direct API (Port 4000)
[ BACKEND API LAYER: Node.js Express ]
  ├── Security: Helmet, CORS, Rate-Limiting
  ├── Middleware: JWT Session Verification, RBAC Route Protection
  └── Controllers: DTO Validation & HTTP Serialization
       │
       ▼ Domain Invocations
[ SERVICE / BUSINESS LOGIC LAYER ]
  ├── AuthService (Bcrypt, Session Tokens)
  ├── EventsService (Timeline Validation, Publication)
  ├── TeamsService (Membership Integrity, Unique Constraints)
  ├── ProjectsService (Draft Persistence, Link Verification)
  ├── SubmissionsService (Monotonic Backend Deadline Enforcement)
  └── GalleryService (Server-Side Query Construction & Pagination)
       │
       ▼ Parameterized SQL
[ DATABASE REPOSITORY ADAPTER LAYER ]
  ├── SQLiteAdapter (better-sqlite3 WAL mode for local zero-dependency operation)
  └── PostgresAdapter (pg Pool for Docker Compose multi-service deployment)
```

---

## 3. Security & Access Control Architecture (RBAC)

DOGFOOD enforces security on the backend; frontend route shielding serves purely as an interface aid.

### Role Hierarchy
1. **ADMIN**: Superuser access. Controls platform users, reviews all events, monitors system diagnostics, and overrides settings.
2. **ORGANIZER**: Creates and edits hackathons, configures tracks and prizes, inspects all project submissions, and toggles publication.
3. **PARTICIPANT**: Creates/joins teams (strictly one team per event), drafts project submissions, attaches demo links, and submits before deadlines.
4. **JUDGE**: Assigned evaluations portal, previews submissions, and awaits rubric scoring activation in Tier 2.

### Enforced Security Invariants
- **Backend Deadline Barrier**: Submissions submitted after `event.submission_deadline` are unconditionally rejected by `SubmissionsService` with HTTP 400.
- **Unique Event Team Membership**: A participant cannot be a member or creator of more than one team in the same hackathon.
- **Role Isolation**: Only organizers and admins can access `/api/events` creation and `/api/submissions` review. Participants attempting restricted calls receive HTTP 403 Forbidden.

---

## 4. Performance & Scalability Targets

Tier 1 is engineered to fulfill high-traffic benchmarks:
- **10,000+ Registered Participants**: Relational indexed foreign keys on `users.id`, `teams.event_id`, and `projects.event_id`.
- **1,000 Public Requests/Minute**: Public gallery endpoints use indexed limit/offset queries, preventing out-of-memory overhead.
- **In-Memory Rate Limiting**: Safeguards authentication endpoints from brute-force attempts without requiring external Redis instances.

---

## 5. Offline Operation & Docker Architecture

The platform requires zero external cloud connections:
- `docker-compose.yml` orchestrates:
  - `db`: PostgreSQL 16 Alpine container with healthchecks and persistent volume.
  - `backend`: Multi-stage Node Alpine container with automatic schema migrations and demo data seeding on startup.
  - `frontend`: Multi-stage Nginx Alpine container serving the pre-built React application and proxying `/api` traffic.
- When running locally outside of Docker (`npm test` or `npm run dev`), the system automatically utilizes the built-in SQLite engine with zero configuration needed.
