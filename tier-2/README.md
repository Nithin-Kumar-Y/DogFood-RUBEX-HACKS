# Tier 2 — Judging Engine (Planned Architecture)

> **STATUS: NOT IMPLEMENTED YET**
>
> In accordance with the prompt guidelines, Tier 2 is **NOT** implemented in this phase.
> Only the foundational extension hooks, database schema extension plans, and type contracts in `backend/src/modules/judging/judging.types.ts` are established to ensure seamless evolution in subsequent prompts without major rewrites.

---

## Planned Capabilities for Tier 2

### 1. Judge Management & Invitations
- Dedicated judge invitations with cryptographic invite tokens.
- Judge profile onboarding and track-specialization preference selection.
- Role isolation ensuring judges cannot modify submissions or view other judges' unscored entries before blinding lifts.

### 2. Algorithmic Project Assignment
- **Round-Robin Assignment**: Equal distribution of projects across judges ensuring $K$ evaluations per project.
- **Track-Specialized Assignment**: Matching projects with judges based on track expertise.
- **Conflict of Interest (COI) Mitigation**: Ensuring judges cannot evaluate projects from their own company, university, or direct collaborators.

### 3. Configurable Weighted Rubrics
- Dynamic rubric criteria per event:
  - Criteria definition (`name`, `description`, `weight`, `max_points`).
  - Example: *Technical Sophistication (35%)*, *Design & Usability (25%)*, *Originality (25%)*, *Presentation (15%)*.

### 4. Score Normalization Engine
- Mathematical normalization algorithms to eliminate judge bias:
  - **Z-Score Normalization**: $z = \frac{x - \mu}{\sigma}$ (standardizing strict vs lenient scoring curves).
  - **Trimmed Mean / Modified Borda Count**: Removing statistical outliers.
- Pairwise comparison rankings.

### 5. Judge Dashboards & CSV Export
- Dedicated real-time evaluation dashboard.
- Offline evaluation mode with local persistence and background synchronization.
- Complete CSV export of raw and normalized evaluation data for organizers.

---

## Extension Interface Reference
See `backend/src/modules/judging/judging.types.ts` for the TypeScript contracts and data structures ready for Tier 2 activation.
