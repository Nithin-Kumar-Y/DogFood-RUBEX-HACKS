# DOGFOOD Judging — Tier 2 (IMPLEMENTED)

> Status: **Tier 2 is implemented and tested** (73/73 backend tests green,
> incl. 31 judging tests + a 10-judge/100-project E2E). This document describes
> the shipped workflow. Pairwise/Bradley-Terry remains a future extension and
> is explicitly NOT included.

## Workflow (all persisted, all backend-enforced)

Organizer invites judges → configures rubric → assigns projects (manual or
deterministic batch) → judges evaluate assigned projects (draft → submit) →
organizer starts a calibration run (reference judge + mode) → shared
calibration projects are evaluated by multiple judges → organizer calculates
two-point linear normalization → normalized scores + finals persist →
organizer reviews calibration dashboard, score comparison, final results with
"why is this score?" derivations → CSV export → audit trail covers the lifecycle.

## Assignment model

- `event_judges(event_id, user_id, status)` — roster with lifecycle
  `invited → active → suspended/completed`. Suspended/completed judges are
  blocked from scoring (403); removal is blocked after submitted evaluations.
- `judge_assignments(event_id, judge_id, project_id, kind, round, status)` with
  `UNIQUE(judge_id, project_id, round)` — duplicates rejected by constraint +
  application-level skip reporting. Kinds: `normal`, `calibration`.
- Manual: `POST /judging/events/:id/assignments` (validates roster status +
  submitted-project membership). Reassignment = DELETE (blocked post-submit) + re-add.
- Batch: `POST …/assignments/batch {coverage, max_load, seed}` — deterministic
  seeded shuffle (mulberry32) + rotation deal across active judges; reports
  created/skipped/unassigned + per-judge loads. Example: 100 projects × 10
  judges × coverage 2 works with no hard-coded numbers.

## Rubric model

- `rubrics(event_id, title, version, is_active)` + `rubric_criteria(label,
  max_score, weight, required, position)`. Organizers create versions (old ones
  deactivated, never mutated under submitted evaluations); drafts keep their
  original rubric version for stability.
- Evaluations store criterion-level `scores` JSONB + server-computed
  `raw_total = Σ value × weight` (validated 0 ≤ value ≤ max_score; required
  criteria enforced on submit). Frontend totals are display-only.
- States: `draft → submitted`, plus `invalid`/`excluded` (excluded from finals).
  Submitted evaluations lock for judges; organizer reopen is audited
  (`evaluation.reopened`) and preserves raw scores.

## Calibration: shared projects + two-point formula

Calibration anchors MUST be the SAME projects evaluated by BOTH judges —
never rank-matched unrelated projects. Anchor project IDs persist on every
`judge_calibrations` row.

Exact Tier-2 transformation (Judge B → reference Judge A):

```
S(B→A) = A_L + ((S_B − B_L) / (B_H − B_L)) × (A_H − A_L)
slope     = (A_H − A_L) / (B_H − B_L)
intercept = A_L − slope × B_L
S(B→A)    = intercept + slope × S_B
```

Modes (minimum shared submitted projects): `ONE_LOW_ONE_HIGH` (2, default),
`TWO_LOW_ONE_HIGH` (3), `ONE_LOW_TWO_HIGH` (3), `TWO_LOW_TWO_HIGH` (4). Anchors
are ordered by the reference scale (low = reference-min); extras are retained
in `evidence` JSONB as validation data. Mandatory example verified in tests:
P1 A=70/B=87, P3 A=80/B=96 ⇒ slope 10/9 ≈ 1.111111, intercept ≈ −26.666667;
B 87→70, 92→75.5556 (≈75.56), 96→80.

Transformations are stored per pair as `Judge X → Judge Y` with source/target
judges, anchors, four scores, slope, intercept, version (`calibration_runs`
per-event versioning), timestamp, and status. The reference judge is
configurable per run (self-row: slope 1, intercept 0) — never hard-coded.

## Normalization statuses & edge cases

`VALID · INVALID · INSUFFICIENT_CALIBRATION_DATA · SUSPICIOUS_CALIBRATION ·
EXTRAPOLATED · PENDING` — persisted per calibration and per normalized score.
Zero denominator → `INVALID/ZERO_SOURCE_RANGE`; one shared project →
`INSUFFICIENT/ONLY_ONE_SHARED_PROJECT`; inverted anchor order →
`SUSPICIOUS/NEGATIVE_SLOPE` (excluded from finals, organizer review);
out-of-range raws still transform but set `extrapolated=true` (+`EXTRAPOLATED`
status); missing data → `PENDING` (nothing invented); duplicate anchors
rejected by `CHECK` + validator. Raw scores are never overwritten;
recalculation creates a new run version.

## Final aggregation

Per project: mean of `VALID`/`EXTRAPOLATED` normalized scores, plus raw
avg/min/max, normalized min/max, σ, and explicit pending/invalid/excluded
counts. Only valid normalized scores participate — visibly, not silently.

## Auditability & security

- Every normalized score carries: raw, normalized, source/reference judges,
  calibration id, anchors, four scores, slope, intercept, timestamp, run
  version, extrapolated flag, status. `GET /judging/normalized/:id` renders the
  worked formula from persisted data ("Why is this score 75.56?").
- `audit_events` records judge/roster changes, assignments, submissions,
  reopens, calibration lifecycle, and exports (actor + entity + meta JSONB).
- Judges access only own assignments/evaluations (403 otherwise), never other
  judges' raw scores or organizer analytics; participants see nothing;
  organizers manage only own events (admin bypass). All enforced in SQL-backed
  route checks, never just hidden UI.

## Tests

`tests/normalization.test.js` (13: formula, precision, all edges, anchor
rules, explanation), `tests/judging.test.js` (14: full lifecycle incl. 70/87 +
80/96 numbers, isolation, progress, suspend, versioning, reopen, CSV, audit),
`tests/judging_e2e.test.js` (4: 10 judges/100 projects, batch determinism,
INSUFFICIENT-then-VALID runs, slope 1.25 identity checks, 118 normalized rows,
CSV row counts, scale isolation). Tier-1 suites (42) still green unmodified.
