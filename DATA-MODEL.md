# DOGFOOD Relational Data Model Specification

## Overview

The DOGFOOD platform employs a normalized, relational database architecture designed to run completely offline without external cloud databases. It supports both embedded **SQLite** (via `better-sqlite3` with WAL mode and foreign keys enabled) for instant local development and zero-configuration setups, as well as **PostgreSQL 16** via Docker Compose.

---

## Entity Relationship Overview (Tier 1)

```
       +------------------+
       |      users       |<-----------------------------------+
       +------------------+                                    |
         | 1            | 1                                    | 1
         |              +-------------------+                  |
         | *            | *                 | *                |
+----------------+ +---------------+ +---------------+ +---------------+
|    sessions    | |    events     | | team_members  | |  submissions  |
+----------------+ +---------------+ +---------------+ +---------------+
                          | 1               | *                | 1
                          +--------+        |                  |
                          | 1      | 1      | 1                | 1
                   +-----------+ +----+  +-----+         +-----------+
                   |  tracks   | |priz|  |teams|-------->| projects  |
                   +-----------+ +----+  +-----+ 1     1 +-----------+
                                                           | 1
                                                           | *
                                                    +---------------+
                                                    | project_links |
                                                    +---------------+
```

---

## Tier 1 Database Tables & Constraints

### 1. `users`
Represents all system actors across the platform.
- `id` (VARCHAR(36) PRIMARY KEY): UUIDv4.
- `email` (VARCHAR(255) UNIQUE NOT NULL): Normalized lowercase email.
- `password_hash` (TEXT NOT NULL): Salted bcrypt hash.
- `full_name` (VARCHAR(255) NOT NULL).
- `role` (VARCHAR(32) NOT NULL): Enum (`PARTICIPANT`, `ORGANIZER`, `JUDGE`, `ADMIN`).
- `avatar_url` (TEXT): Profile photo or DiceBear avatar SVG URL.
- `bio` (TEXT): User professional bio and affiliations.
- `created_at` (TIMESTAMP DEFAULT CURRENT_TIMESTAMP).
- `updated_at` (TIMESTAMP DEFAULT CURRENT_TIMESTAMP).
- **Indexes**: `idx_users_email`, `idx_users_role`.

### 2. `sessions`
Provides persistent session management and token lifecycle tracking.
- `id` (VARCHAR(36) PRIMARY KEY): UUIDv4.
- `user_id` (VARCHAR(36) NOT NULL REFERENCES `users(id)` ON DELETE CASCADE).
- `token` (VARCHAR(512) UNIQUE NOT NULL): Signed JWT with unique session JTI.
- `expires_at` (TIMESTAMP NOT NULL).
- `user_agent` (TEXT).
- `ip_address` (VARCHAR(64)).
- `created_at` (TIMESTAMP DEFAULT CURRENT_TIMESTAMP).
- **Indexes**: `idx_sessions_token`, `idx_sessions_user_id`.

### 3. `events`
Hackathon competition records managed by Organizers.
- `id` (VARCHAR(36) PRIMARY KEY): UUIDv4.
- `organizer_id` (VARCHAR(36) NOT NULL REFERENCES `users(id)`).
- `name` (VARCHAR(255) NOT NULL): Full event title.
- `slug` (VARCHAR(255) UNIQUE NOT NULL): URL-safe kebab-cased identifier.
- `description` (TEXT NOT NULL): Comprehensive challenge details.
- `banner_url` (TEXT): Event header artwork.
- `start_date` (TIMESTAMP NOT NULL).
- `end_date` (TIMESTAMP NOT NULL).
- `submission_deadline` (TIMESTAMP NOT NULL): Strict cutoff timestamp.
- `status` (VARCHAR(32) NOT NULL DEFAULT 'DRAFT'): Enum (`DRAFT`, `PUBLISHED`, `ARCHIVED`).
- `created_at` (TIMESTAMP DEFAULT CURRENT_TIMESTAMP).
- `updated_at` (TIMESTAMP DEFAULT CURRENT_TIMESTAMP).
- **Business Rule**: Validated on write: `start_date < submission_deadline <= end_date`.
- **Indexes**: `idx_events_slug`, `idx_events_status`, `idx_events_organizer`, `idx_events_deadline`.

### 4. `event_tracks`
Competition categories within an event.
- `id` (VARCHAR(36) PRIMARY KEY): UUIDv4.
- `event_id` (VARCHAR(36) NOT NULL REFERENCES `events(id)` ON DELETE CASCADE).
- `name` (VARCHAR(255) NOT NULL): Track title (e.g. *Autonomous Agents*).
- `description` (TEXT).
- `created_at` (TIMESTAMP DEFAULT CURRENT_TIMESTAMP).
- **Indexes**: `idx_tracks_event_id`.

### 5. `prizes`
Awards and bounties associated with an event.
- `id` (VARCHAR(36) PRIMARY KEY): UUIDv4.
- `event_id` (VARCHAR(36) NOT NULL REFERENCES `events(id)` ON DELETE CASCADE).
- `name` (VARCHAR(255) NOT NULL): Prize title (e.g. *Grand Champion*).
- `description` (TEXT).
- `amount` (VARCHAR(128)): Financial or prize description (e.g. *$15,000*).
- `rank` (INTEGER DEFAULT 1): Display and tier order.
- `created_at` (TIMESTAMP DEFAULT CURRENT_TIMESTAMP).
- **Indexes**: `idx_prizes_event_id`.

### 6. `teams`
Participant teams formed for a specific event.
- `id` (VARCHAR(36) PRIMARY KEY): UUIDv4.
- `event_id` (VARCHAR(36) NOT NULL REFERENCES `events(id)` ON DELETE CASCADE).
- `creator_id` (VARCHAR(36) NOT NULL REFERENCES `users(id)`).
- `name` (VARCHAR(255) NOT NULL): Team title.
- `code` (VARCHAR(64) UNIQUE NOT NULL): Short shareable code (e.g. `NF-9082`).
- `created_at` (TIMESTAMP DEFAULT CURRENT_TIMESTAMP).
- `updated_at` (TIMESTAMP DEFAULT CURRENT_TIMESTAMP).
- **Indexes**: `idx_teams_event_id`, `idx_teams_code`, `idx_teams_creator`.

### 7. `team_members`
Association between participants and teams.
- `id` (VARCHAR(36) PRIMARY KEY): UUIDv4.
- `team_id` (VARCHAR(36) NOT NULL REFERENCES `teams(id)` ON DELETE CASCADE).
- `user_id` (VARCHAR(36) NOT NULL REFERENCES `users(id)` ON DELETE CASCADE).
- `role` (VARCHAR(32) NOT NULL DEFAULT 'MEMBER'): Enum (`LEADER`, `MEMBER`).
- `joined_at` (TIMESTAMP DEFAULT CURRENT_TIMESTAMP).
- **Unique Constraint**: `UNIQUE(team_id, user_id)`
- **Event-Level Integrity**: Server verifies that a user cannot belong to multiple teams in the same event.
- **Indexes**: `idx_team_members_team`, `idx_team_members_user`.

### 8. `team_invitations`
Pending and accepted invitations to join a team.
- `id` (VARCHAR(36) PRIMARY KEY): UUIDv4.
- `team_id` (VARCHAR(36) NOT NULL REFERENCES `teams(id)` ON DELETE CASCADE).
- `email` (VARCHAR(255) NOT NULL): Invited recipient email.
- `token` (VARCHAR(128) UNIQUE NOT NULL): Secure invitation token.
- `status` (VARCHAR(32) NOT NULL DEFAULT 'PENDING'): Enum (`PENDING`, `ACCEPTED`, `EXPIRED`, `REVOKED`).
- `expires_at` (TIMESTAMP NOT NULL): 7-day expiration.
- `created_at` (TIMESTAMP DEFAULT CURRENT_TIMESTAMP).
- **Indexes**: `idx_invitations_token`, `idx_invitations_team`, `idx_invitations_email`.

### 9. `projects`
Project submissions drafted by teams.
- `id` (VARCHAR(36) PRIMARY KEY): UUIDv4.
- `event_id` (VARCHAR(36) NOT NULL REFERENCES `events(id)` ON DELETE CASCADE).
- `team_id` (VARCHAR(36) UNIQUE NOT NULL REFERENCES `teams(id)` ON DELETE CASCADE).
- `track_id` (VARCHAR(36) REFERENCES `event_tracks(id)` ON DELETE SET NULL).
- `title` (VARCHAR(255) NOT NULL).
- `tagline` (VARCHAR(500)).
- `description` (TEXT NOT NULL).
- `status` (VARCHAR(32) NOT NULL DEFAULT 'DRAFT'): Enum (`DRAFT`, `SUBMITTED`, `LOCKED`).
- `created_at` (TIMESTAMP DEFAULT CURRENT_TIMESTAMP).
- `updated_at` (TIMESTAMP DEFAULT CURRENT_TIMESTAMP).
- **Indexes**: `idx_projects_event`, `idx_projects_team`, `idx_projects_track`, `idx_projects_status`, `idx_projects_title`.

### 10. `project_links`
Demonstration and repository links for projects.
- `id` (VARCHAR(36) PRIMARY KEY): UUIDv4.
- `project_id` (VARCHAR(36) NOT NULL REFERENCES `projects(id)` ON DELETE CASCADE).
- `title` (VARCHAR(128) NOT NULL): e.g. *GitHub*, *Live Demo*, *Walkthrough Video*.
- `url` (TEXT NOT NULL).
- `type` (VARCHAR(32) NOT NULL DEFAULT 'OTHER'): Enum (`GITHUB`, `DEMO`, `VIDEO`, `SLIDES`, `OTHER`).
- `created_at` (TIMESTAMP DEFAULT CURRENT_TIMESTAMP).
- **Indexes**: `idx_links_project`.

### 11. `submissions`
Official timestamped submission record confirming adherence to event deadline.
- `id` (VARCHAR(36) PRIMARY KEY): UUIDv4.
- `project_id` (VARCHAR(36) UNIQUE NOT NULL REFERENCES `projects(id)` ON DELETE CASCADE).
- `submitted_by_user_id` (VARCHAR(36) NOT NULL REFERENCES `users(id)`).
- `submitted_at` (TIMESTAMP NOT NULL): Exact server timestamp.
- `notes` (TEXT): Submitter comments for judges.
- `is_final` (INTEGER NOT NULL DEFAULT 1): Flag indicating verified submission.
- `created_at` (TIMESTAMP DEFAULT CURRENT_TIMESTAMP).
- **Backend Invariant**: `submitted_at <= event.submission_deadline` strictly verified before insert.
- **Indexes**: `idx_submissions_project`, `idx_submissions_user`, `idx_submissions_date`.

---

## Planned Extension Schemas (Tiers 2, 3, 4)

### Planned Tier 2 Tables (Judging Engine)
- `rubric_criteria` (`id`, `event_id`, `name`, `description`, `weight`, `max_points`)
- `judge_assignments` (`id`, `event_id`, `judge_user_id`, `project_id`, `status`, `assigned_at`)
- `rubric_scores` (`id`, `assignment_id`, `criterion_id`, `score`, `feedback`, `submitted_at`)
- `score_normalizations` (`id`, `event_id`, `project_id`, `raw_avg`, `z_score`, `trimmed_mean`, `rank`)

### Planned Tier 3 Tables (Community Engagement)
- `community_votes` (`id`, `project_id`, `user_id`, `ip_hash`, `created_at`, `UNIQUE(project_id, user_id)`)
- `project_comments` (`id`, `project_id`, `user_id`, `parent_id`, `content`, `status`, `created_at`)
- `audit_logs` (`id`, `entity_type`, `entity_id`, `user_id`, `action`, `metadata`, `created_at`)

### Planned Tier 4 Tables (Integrations & Verifiable Credentials)
- `api_keys` (`id`, `user_id`, `key_prefix`, `hashed_secret`, `scopes`, `last_used_at`, `expires_at`)
- `webhooks` (`id`, `event_id`, `target_url`, `secret`, `subscribed_events`, `is_active`)
- `certificates` (`id`, `event_id`, `user_id`, `project_id`, `type`, `verification_hash`, `issued_at`)
