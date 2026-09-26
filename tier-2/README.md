# Tier 2 — Judging (IMPLEMENTED)

Tier-2 judging is implemented as an incremental extension of the Tier-1
platform. No Tier-1 architecture was replaced; one mount line in
`backend/src/app.js` wires the new router, plus additive migration
`003_judging.sql`.

## What shipped

- **Database** (`backend/migrations/003_judging.sql`): `event_judges`,
  `rubrics`, `rubric_criteria`, `judge_assignments`, `evaluations`,
  `calibration_runs`, `judge_calibrations`, `normalized_scores`,
  `audit_events` — FKs, uniques, indexes, status fields, timestamps.
- **Normalization engine** (`backend/src/judging/normalization.js`):
  `NormalizationStrategy` base + production `TwoPointLinearNormalization`
  (exact B→A formula as slope + intercept; all six edge statuses).
  Future strategies (regression, Bradley-Terry, …) plug in here.
- **API** (`backend/src/routes/judging.js`, mounted at `/api/judging`):
  judge invite/manage, rubric versions, manual + batch assignments,
  draft/submit/reopen evaluations, judge queue, progress analytics,
  calibration start/assign/calculate, results, why-explanations,
  evaluations + projects CSV export, audit trail.
- **UI**: judge workspace (`#/judging`, `#/judging/evaluate/:id`) and
  organizer judging section (`#/organizer/judging/*`: judges, assignments,
  rubric, progress, calibration, comparison, results) in the existing
  design system.
- **Tests**: `tests/normalization.test.js`, `tests/judging.test.js`,
  `tests/judging_e2e.test.js` (10 judges / 100 projects). Full suite 73/73.
- **Docs**: `JUDGING.md` (implemented), `ARCHITECTURE.md` §5,
  `DATA-MODEL.md` (Tier-2 tables), `acceptance-report.txt` (Tier-2 section).

Deliberately NOT included (future): pairwise/Bradley-Terry, Tier-3
voting/comments, Tier-4 webhooks/certificates/embeds.
