# DOGFOOD 🐶🥫
### Open-Source, Self-Hostable Hackathon Registration, Submission, Judging & Results Platform

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Tier 1 Status](https://img.shields.io/badge/Tier%201%20Core-100%25%20Complete-emerald)](https://github.com/)
[![Tests](https://img.shields.io/badge/Acceptance%20Tests-26%2F26%20Passing-brightgreen)](https://github.com/)
[![Offline First](https://img.shields.io/badge/Offline--First-Enabled-indigo)](https://github.com/)

**DOGFOOD** is an open-source, offline-first platform designed to run hackathons anywhere—from university auditoriums with spotty internet to air-gapped corporate labs and global remote challenges.

> **PROJECT SCOPE NOTICE**:
> This codebase implements and verifies **TIER 1 (CORE PLATFORM)**.
> Tiers 2, 3, 4, and Bonus capabilities are designed with full extension points, schema definitions, and module boundaries, but are **NOT** implemented yet in accordance with the prompt instructions.

---

## 🌟 Key Tier 1 Features (Fully Working)

- **Authentication & Sessions**: Secure salted bcrypt password hashing, persistent relational session tracking, and JWT token issuance.
- **Backend-Enforced RBAC**: Strict server-side role isolation for `PARTICIPANT`, `ORGANIZER`, `JUDGE`, and `ADMIN`. Never relies on client-side routing alone.
- **Event Management**: Organizers configure events, start/end timelines, submission deadlines, custom tracks, prizes, and publish toggles.
- **Team Formation & Membership Integrity**: Form teams, generate invite codes and direct invite links, and prevent duplicate memberships within the same hackathon.
- **Project Drafts & Submissions**: Participants draft projects, save descriptions, and link repositories and demos. Clear state management (`DRAFT`, `SUBMITTED`, `LOCKED`).
- **Strict Backend Deadline Enforcement**: The backend server unconditionally rejects submissions after the deadline.
- **Public Searchable Gallery**: Server-side pagination, search queries, track filters, and project cards with full team rosters.
- **Modern SaaS UI/UX**: Dark mode with glassmorphism, responsive navigation, live deadline countdown timers, confirmation modals, loading skeletons, and interactive toast alerts.

---

## 🏛️ Clean Modular Architecture

DOGFOOD follows the **Frontend → Backend/API → Service/Business Logic → Database** paradigm:

```
dogfood/
├── backend/
│   ├── src/
│   │   ├── config/          # Environment configuration
│   │   ├── database/        # Relational schema, SQLite/Postgres adapters, seeds
│   │   ├── middleware/      # Auth, RBAC guards, error handling, rate limiting
│   │   ├── modules/
│   │   │   ├── auth/        # Authentication & persistent sessions
│   │   │   ├── events/      # Hackathons, tracks, prizes, dates
│   │   │   ├── teams/       # Team formation, invites, membership integrity
│   │   │   ├── projects/    # Drafts, external links, editing
│   │   │   ├── submissions/ # Backend deadline enforcement & locking
│   │   │   ├── gallery/     # Search, filter, server-side pagination
│   │   │   ├── admin/       # System health & user management
│   │   │   └── judging/     # Tier 2 extension interfaces
│   │   ├── tests/           # 26 automated acceptance tests
│   │   └── server.ts        # Express API bootstrap
│   ├── Dockerfile
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── components/      # Navbar, Sidebar, CountdownTimer, Modal, Toast, StatCard
│   │   ├── context/         # AuthContext (with quick demo switchers) & ToastContext
│   │   ├── pages/           # Participant, Organizer, Judge, Admin, Public pages
│   │   ├── services/        # Type-safe API client
│   │   ├── styles/          # Modern SaaS CSS design system (tokens, glassmorphism)
│   │   └── App.tsx          # Client router with RBAC guards
│   ├── Dockerfile
│   ├── nginx.conf
│   └── package.json
├── tier-2/                  # Tier 2 Judging Engine extension documentation
├── tier-3/                  # Tier 3 Community Voting extension documentation
├── tier-4/                  # Tier 4 Webhooks & REST API extension documentation
├── bonus/                   # Bonus mathematical normalization proofs
├── docker-compose.yml       # Production Compose with DB, Backend, and Frontend
├── ARCHITECTURE.md          # End-to-end multi-tier architecture design
├── DATA-MODEL.md            # Relational database schema & ER diagram
├── JUDGING.md               # Planned judging engine architecture & proofs
├── acceptance-report.txt    # Verification report of Tier 1 tests
└── LICENSE                  # MIT License
```

---

## 🚀 Running the Application

### Option A: Using Docker Compose (Primary Target)

Start the entire stack (PostgreSQL database, Node.js backend, and Nginx React frontend):

```bash
docker compose up
```

Once running:
- **Frontend App**: [http://localhost:3000](http://localhost:3000)
- **Backend API**: [http://localhost:4000/api](http://localhost:4000/api)
- **Database**: PostgreSQL on port 5432 (auto-initialized and seeded on startup)

To stop the containers:
```bash
docker compose down
```

---

### Option B: Local Direct Execution (100% Offline with SQLite)

DOGFOOD contains an embedded relational SQLite adapter (`better-sqlite3` with WAL mode). You can run it directly on any computer without Docker or external databases:

1. **Install Dependencies**:
   ```bash
   cd backend && npm install
   cd ../frontend && npm install
   cd ..
   ```

2. **Initialize Database & Seed Data**:
   ```bash
   npm run seed
   ```

3. **Start the Development Servers**:
   In terminal 1 (Backend API on port 4000):
   ```bash
   npm run backend
   ```
   In terminal 2 (Frontend SPA on port 3000):
   ```bash
   npm run frontend
   ```
   Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 👥 Demo Accounts & Credentials

The database seeds realistic demo users automatically on initial startup. All accounts share the password: **`Dogfood123!`**

| Role | Email | Password | Name / Description |
|---|---|---|---|
| **Organizer** | `organizer@dogfood.local` | `Dogfood123!` | Elena Rostova (Lead Hackathon Director) |
| **Participant (Lead)** | `alice@dogfood.local` | `Dogfood123!` | Alice Chen (Leader of *NeuralForge*) |
| **Participant (Member)**| `bob@dogfood.local` | `Dogfood123!` | Bob Martinez (Member of *NeuralForge*) |
| **Judge** | `judge@dogfood.local` | `Dogfood123!` | Marcus Sterling (Hackathon Judge) |
| **Admin** | `admin@dogfood.local` | `Dogfood123!` | Alex Vance (System Administrator) |

> 💡 **Tip**: When testing in the browser, click the **"Switch Role Demo"** dropdown in the top navigation bar to switch between roles in 1 click!

---

## 🧪 Automated Testing

Execute the 26 automated acceptance tests verifying authentication, authorization, role isolation, team uniqueness, deadline enforcement, and public gallery search:

```bash
npm test
```

All 26 tests will run against the relational database and output a verified pass report:
```
======================================================
 ACCEPTANCE TEST SUMMARY:
 Passed: 26
 Failed: 0
 Status: ALL TIER 1 CAPABILITIES VERIFIED ✓
======================================================
```

---

## 📚 Architectural Documentation Links

- **System Architecture**: [ARCHITECTURE.md](file:///./ARCHITECTURE.md)
- **Relational Data Model**: [DATA-MODEL.md](file:///./DATA-MODEL.md)
- **Planned Judging Blueprint**: [JUDGING.md](file:///./JUDGING.md)
- **Verification Report**: [acceptance-report.txt](file:///./acceptance-report.txt)

---

## 📄 License

DOGFOOD is open-source software licensed under the **MIT License**. See [LICENSE](file:///./LICENSE) for details.
