# Tier 3 — Public & Community Engagement (Planned Architecture)

> **STATUS: NOT IMPLEMENTED YET**
>
> In accordance with the prompt guidelines, Tier 3 is **NOT** implemented in this phase.
> The database schema extension points (`community_votes`, `project_comments`, `audit_logs`) are reserved and documented in `DATA-MODEL.md`.

---

## Planned Capabilities for Tier 3

### 1. Community Voting & People's Choice
- Public and participant-driven voting mechanisms with strict anti-sybil protections.
- Client fingerprinting and IP hashing to prevent voting fraud without requiring invasive trackers.
- Rate-limiting voting actions with exponential backoff on burst activity.

### 2. Moderated Feedback & Discussion
- Threaded project discussions with organizer moderation controls.
- Markdown-enabled constructive feedback sections.

### 3. Fair Discovery & Hidden Results
- Randomized project ordering algorithms to avoid positional bias on popular project cards.
- Blinded results: Organizer can hide live vote tallies until the awards ceremony broadcast.

### 4. Comprehensive Audit Trails
- Cryptographically timestamped audit logging of all sensitive administrative, team, and score actions.
