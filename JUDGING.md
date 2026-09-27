# DOGFOOD Judging Subsystem Documentation

> **Status:** Fully implemented and verified. All algorithms, constraints, and audit flows described herein represent live code in `backend/src/judging/` and `backend/src/routes/judging.js`, verified by automated tests in `backend/tests/normalization.test.js`, `backend/tests/judging.test.js`, and `backend/tests/judging_e2e.test.js`.

---

## 1. Overview and Problem Statement

Hackathon judging at scale faces three systemic challenges:
1. **Judge Variance & Scale Divergence:** Certain judges are naturally lenient (clustering scores between 85–100), while others are strict (clustering scores between 50–75). A team assigned to strict judges is penalized simply by the luck of the draw.
2. **Evaluation Incompleteness:** Judges cannot evaluate every project due to human attention limits. Thus, raw averages cannot be directly compared across different judge panels without calibration.
3. **Auditability and Transparency:** Organizers must be able to explain exactly why a project received its final rank, defend against allegations of tampering or bias, and inspect the mathematical derivation of every score.

DOGFOOD resolves this with an **anchor-calibrated, two-point linear normalization engine** coupled with deterministic assignment, configurable versioned rubrics, strict role isolation, and a tamper-evident audit trail.

---

## 2. Judge Assignment Subsystem

### 2.1 Judge Invitation & Roster Lifecycle
Judges are invited to specific events by organizers or platform admins:
- An `event_judges` record links a user to an event with a lifecycle status:
  - `invited`: Invitation issued; judge has not yet acknowledged.
  - `active`: Judge is eligible to receive assignments and submit evaluations.
  - `suspended`: Judge is temporarily blocked from submitting evaluations (`403 Forbidden`). Existing submitted evaluations are preserved.
  - `completed`: Judge has completed their assignments.
- Roster management prevents accidental data loss: an organizer cannot remove a judge from an event if that judge has already submitted evaluations.

### 2.2 Assignment Strategy & Workflow
DOGFOOD supports two assignment workflows:
1. **Manual Assignment (`POST /api/judging/events/:id/assignments`):**
   - The organizer assigns an individual project to an active judge.
   - Enforces database constraints: the judge must be in `active` status for the event, and the project must have been submitted before the deadline.
   - Idempotent: Attempting to assign the same judge to the same project in the same round returns a `409 Conflict` (or skipped count in batch mode).
2. **Deterministic Algorithmic Batch Assignment (`POST /api/judging/events/:id/assignments/batch`):**
   - Built to handle large hackathons (tested with 10 judges across 100 projects).
   - Parameters:
     - `coverage`: Target number of distinct judges assigned to each project (e.g., 2 or 3).
     - `max_load`: Maximum number of projects assigned to any single judge.
     - `seed`: Integer seed for the pseudo-random generator, ensuring **100% deterministic reproducibility**.
   - **Algorithm:**
     1. Uses the **Mulberry32** pseudo-random number generator initialized with `seed`.
     2. Shuffles the list of submitted projects deterministically.
     3. Distributes assignments using a balanced round-robin rotational deal across all active judges.
     4. Tracks per-judge workload and prevents exceeding `max_load`.
     5. Skips pre-existing assignments without throwing errors.
     6. Returns a structured JSON summary: `{ created, skipped, unassigned, judgeLoads }`.

### 2.3 Conflict Handling and Reassignment
- **Unique Constraint:** The table `judge_assignments` enforces `UNIQUE (judge_id, project_id, round)`. Duplicates cannot be created at the storage layer.
- **Reassignment Rules:** An assignment can only be deleted (`DELETE /api/judging/assignments/:id`) if its associated evaluation has **not** been submitted. Once an evaluation is submitted, the assignment is locked to preserve historical evaluation integrity.

---

## 3. Rubric & Scoring Methodology

### 3.1 Rubric Configuration & Criteria
- Each event has a configurable rubric defined in `rubrics` and `rubric_criteria`.
- Rubrics are **versioned** (`version INTEGER`). When an organizer modifies a rubric, a new version is created and previous versions are deactivated (`is_active = FALSE`). This guarantees that already submitted evaluations remain pinned to the exact criteria under which they were graded.
- Each criterion contains:
  - `label`: Name of the criterion (e.g., "Technical Execution", "Innovation").
  - `description`: Detailed instructions for the judge.
  - `max_score`: Maximum point value allowed (e.g., 25.0).
  - `weight`: Multiplier applied during scoring (default `1.0`).
  - `required`: Boolean flag indicating if a score must be provided before submission.
  - `position`: Visual order in the UI.

### 3.2 Evaluation Lifecycle: Draft to Submitted
Judges score projects in their private workspace:
1. **Draft State:**
   - The judge can save partial progress with optional criteria scores and draft feedback (`PUT /api/judging/evaluations/assignment/:assignmentId`).
   - Server validates score bounds ($0 \le score \le max\_score$) but allows missing required fields while in `draft`.
2. **Submission State:**
   - On final submit (`status: "submitted"`), the backend strictly validates that all required criteria are answered and within range.
   - **Server-Side Computation:** The server computes `raw_total` directly:
     $$\text{raw\_total} = \sum_{i=1}^{n} (\text{score}_i \times \text{weight}_i)$$
     Client-provided totals are never trusted.
   - The evaluation timestamp is locked (`submitted_at = now()`), and the assignment status moves to `submitted`.
3. **Organizer Reopen:**
   - If a judge needs to revise a score after submission, only an organizer can reopen it (`POST /api/judging/evaluations/:id/reopen`).
   - The action is logged to `audit_events`, the evaluation status returns to `draft`, and any downstream calibration runs are marked for recalculation.

---

## 4. Cross-Judge Calibration & Normalization

### 4.1 The Shared Anchor Project Principle
Standard statistical normalizations like Z-score ($z = \frac{x - \mu}{\sigma}$) fail in hackathon environments because judges evaluate small subsets of projects (e.g., 5 to 10 projects). With small sample sizes, variance $\sigma$ is unstable and extreme outliers distort ratings. Furthermore, rank-matching unrelated projects across judges is mathematically invalid.

DOGFOOD enforces the **Shared Anchor Project Principle**:
- Judges are calibrated against one another **only** through projects that were evaluated by **both** judges.
- Anchor projects must be identical database entities (`project_id`), verified by `low_anchor_project_id` and `high_anchor_project_id` stored on every calibration record.

### 4.2 Mathematical Normalization Model

Let Judge $B$ be a source judge whose scores must be normalized onto the scale of a reference Judge $A$ (the target scale).

Let $P_L$ be the shared **low anchor project** and $P_H$ be the shared **high anchor project**, evaluated by both Judge $A$ and Judge $B$:
- $A_L$: Judge $A$'s raw total score on $P_L$
- $A_H$: Judge $A$'s raw total score on $P_H$
- $B_L$: Judge $B$'s raw total score on $P_L$
- $B_H$: Judge $B$'s raw total score on $P_H$

#### Two-Point Linear Transformation Formula
The linear transformation mapping any raw score $S_B$ from Judge $B$ to Judge $A$'s scale is:

$$S(B \to A) = A_L + \left( \frac{S_B - B_L}{B_H - B_L} \right) \times (A_H - A_L)$$

Expressed in standard slope-intercept form ($y = mx + c$):

$$\text{slope } (m) = \frac{A_H - A_L}{B_H - B_L}$$

$$\text{intercept } (c) = A_L - (m \times B_L)$$

$$S(B \to A) = c + (m \times S_B)$$

### 4.3 Calibration Modes and Anchor Selection
The anchor selection engine (`selectAnchors` in `normalization.js`) supports multiple modes based on the minimum number of shared projects available:
- `ONE_LOW_ONE_HIGH` (Default, requires $\ge 2$ shared projects):
  - Selects the pair with the minimum and maximum scores according to the target (reference) judge.
- `TWO_LOW_ONE_HIGH` (Requires $\ge 3$ shared projects):
  - Uses two low anchors and one high anchor; intermediate pairs are retained in `evidence` JSONB.
- `ONE_LOW_TWO_HIGH` (Requires $\ge 3$ shared projects).
- `TWO_LOW_TWO_HIGH` (Requires $\ge 4$ shared projects).

### 4.4 Guardrails, Edge Cases, and Statuses
The normalization engine evaluates every pair and assigns a deterministic status:
1. `VALID`: Positive slope ($m > 0$), distinct anchors ($B_L \ne B_H$), and sufficient shared projects. Score is safely normalized.
2. `INSUFFICIENT_CALIBRATION_DATA`: Fewer than the required number of shared projects between Judge $B$ and Judge $A$. Raw scores cannot be normalized to the reference scale.
3. `INVALID`:
   - `ZERO_SOURCE_RANGE`: Judge $B$ scored both anchors identically ($B_H - B_L = 0$). Denominator is zero; cannot divide.
   - `IDENTICAL_ANCHORS` or `DUPLICATE_ANCHOR_PROJECT`: Data integrity error.
4. `SUSPICIOUS_CALIBRATION` (`NEGATIVE_SLOPE`):
   - Occurs when Judge $A$ and Judge $B$ disagree on the ordering of the anchors (e.g., $A_H > A_L$ while $B_H < B_L$).
   - Indicates fundamental subjective divergence on project quality. These transformations are flagged for organizer review and **excluded** from final rankings to protect fairness.
5. `EXTRAPOLATED`:
   - If a raw score $S_B < \min(B_L, B_H)$ or $S_B > \max(B_L, B_H)$, the linear formula is applied, but the score is flagged as `extrapolated = true`.
   - Organizers can audit whether winners were decided based on extrapolated scores.
6. `PENDING`: One or more evaluations for the required anchors have not yet been submitted.

---

## 5. Step-by-Step Numerical Example (from Shipped Tests)

The following example is verified directly by test suite `backend/tests/judging.test.js`:

### Given:
- **Reference Judge:** Judge $A$
- **Source Judge:** Judge $B$
- **Shared Anchor 1 (Low):** Project 1 ($P_1$)
  - Judge $A$ score ($A_L$) = $70.0$
  - Judge $B$ score ($B_L$) = $87.0$
- **Shared Anchor 2 (High):** Project 3 ($P_3$)
  - Judge $A$ score ($A_H$) = $80.0$
  - Judge $B$ score ($B_H$) = $96.0$

### Step 1: Compute Slope ($m$)
$$m = \frac{A_H - A_L}{B_H - B_L} = \frac{80.0 - 70.0}{96.0 - 87.0} = \frac{10}{9} \approx 1.111111$$

### Step 2: Compute Intercept ($c$)
$$c = A_L - (m \times B_L) = 70.0 - \left(\frac{10}{9} \times 87.0\right) = 70.0 - 96.666667 = -26.666667$$

### Step 3: Normalize Scores from Judge $B$
- **Check Low Anchor ($P_1$):**
  $$S(87 \to A) = -26.666667 + (1.111111 \times 87.0) = 70.00$$
  *(Correctly maps to Judge A's anchor score)*
- **Check High Anchor ($P_3$):**
  $$S(96 \to A) = -26.666667 + (1.111111 \times 96.0) = 80.00$$
  *(Correctly maps to Judge A's anchor score)*
- **Transform Non-Anchor Project ($P_4$):**
  - Judge $B$ evaluated $P_4$ with a raw score of $92.0$.
  - Transform to Judge $A$'s scale:
    $$S(92 \to A) = -26.666667 + (1.111111 \times 92.0) = -26.666667 + 102.222222 = 75.555556 \approx 75.56$$

---

## 6. Score Finalization & Ranking

When the organizer requests results (`GET /api/judging/events/:id/results`):
1. **Per-Project Aggregation:**
   - Filters evaluations to those with status `VALID` or `EXTRAPOLATED`.
   - Computes:
     - `normalized_avg`: Arithmetic mean of valid normalized scores.
     - `raw_avg`, `raw_min`, `raw_max`: Descriptive statistics of raw input scores.
     - `stddev` ($\sigma$): Standard deviation of normalized scores.
     - `n_judges`: Total judges who evaluated the project.
     - `pending`, `invalid`, `excluded`: Explicit counts of non-participating scores.
2. **Dense Ranking:**
   - Projects are ranked in descending order of `normalized_avg`.
   - Tied scores receive identical ranks without skipping numbers.
3. **No Overwriting:**
   - Raw scores in `evaluations` are **never** modified or overwritten.
   - Normalized outputs are stored separately in `normalized_scores` linked to the specific `calibration_runs.id`. If an organizer recalculates calibration with a different reference judge or new anchors, a new run version is generated.

---

## 7. Auditability and Explainability

DOGFOOD provides end-to-end explainability:
1. **Interactive "Why is this score?" Derivation (`GET /api/judging/normalized/:id`):**
   - Returns a structured derivation object (`explainNormalization`) detailing:
     - The raw score.
     - Source judge and reference judge names.
     - The low and high anchor projects with their respective raw scores.
     - The exact formula with substituted values.
     - The slope and intercept used.
     - The resulting normalized score.
2. **Append-Only Audit Log (`audit_events`):**
   - Every mutation in the judging lifecycle is recorded with `actor_id`, `event_id`, `action`, `entity`, `entity_id`, and `meta` (JSONB):
     - `judge.invited`, `judge.status_updated`, `judge.removed`
     - `rubric.created`
     - `assignment.created`, `assignment.batch_created`, `assignment.deleted`
     - `evaluation.saved`, `evaluation.submitted`, `evaluation.reopened`
     - `calibration.run_created`, `calibration.assigned`, `calibration.calculated`
     - `results.exported`

---

## 8. CSV Exports

Organizers can export judging data via `GET /api/judging/events/:id/results/export`:

### 8.1 Evaluations-Level Export (`?level=evaluations`)
Contains one row per evaluation for granular auditing:
- `project_id`: ID of the project.
- `project_name`: Title of the project.
- `judge_id`: ID of the evaluating judge.
- `judge_name`: Name of the evaluating judge.
- `raw_score`: Raw total score assigned by this judge.
- `normalized_score`: Calibrated score mapped to the reference scale.
- `reference_judge`: Name of the reference judge for this calibration run.
- `calibration_id`: ID of the `judge_calibrations` transformation record.
- `low_anchor_project_id`: Project ID of the low anchor.
- `high_anchor_project_id`: Project ID of the high anchor.
- `slope`: Fitted slope ($m$).
- `intercept`: Fitted intercept ($c$).
- `final_score`: Project's aggregate normalized average.
- `evaluation_status`: Status of the score (`VALID`, `EXTRAPOLATED`, etc.).
- `extrapolated`: Boolean (`true` / `false`).

### 8.2 Projects-Level Export (`?level=projects`)
Contains one row per project summarizing the final standings:
- `project_id`: ID of the project.
- `project_name`: Title of the project.
- `team`: Team name.
- `n_judges`: Count of participating judges.
- `raw_avg`: Average of uncalibrated raw scores.
- `normalized_avg`: Final official calibrated average score.
- `raw_min`: Minimum raw score received.
- `raw_max`: Maximum raw score received.
- `stddev`: Standard deviation across normalized scores.
- `pending`: Count of pending assignments.
- `invalid`: Count of invalid evaluations.
- `excluded`: Count of suspicious or excluded evaluations.

---

## 9. Engineering Design Rationale

1. **Why Linear Anchor Normalization instead of Z-scores?**
   Hackathon judges typically grade 5–15 projects. At $n < 30$, sample variance estimates are volatile. A single very good or very bad project heavily distorts a judge's mean and variance. Anchor-based two-point scaling anchors the translation directly to concrete, shared artifacts observed by both parties.
2. **Why Shared Anchors instead of Rank-Matching?**
   Rank-matching (e.g., matching Judge A's #1 project to Judge B's #1 project) assumes that both panels received project pools of identical quality. In reality, one judge panel may have received three world-class projects while another received none. Shared anchors ensure that score transformations reflect the *judges' scoring standards*, not disparities in their assigned project pools.
3. **Why Flag Extrapolation?**
   Linear models cannot guarantee validity outside their observed domain. If Judge B gives a project 99 when their high anchor was 90, projecting above 90 carries uncertainty. Flagging extrapolated scores allows organizers to review borderline medal contenders manually.
4. **Why Versioned Rubrics and Calibration Runs?**
   Once a hackathon concludes, transparency requires reproducibility. If a sponsor questions a placement weeks later, organizers can load the exact calibration run, inspect the anchors, view the slope and intercept, and prove how the scores were calculated without retroactive data mutation.
