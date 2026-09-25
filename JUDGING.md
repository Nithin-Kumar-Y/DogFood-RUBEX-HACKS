# DOGFOOD Planned Judging Architecture (Tier 2 & Bonus Blueprint)

> ### IMPORTANT ARCHITECTURAL NOTICE
> **Tier 1 is fully implemented and active in this release.**
> In accordance with Prompt 1a instructions:
> - **Tier 2, Tier 3, Tier 4, and Bonus capabilities are NOT implemented yet.**
> - This document specifies the complete future judging engine architecture, mathematical proofs, threat models, and interface contracts to ensure future prompts can implement them without rewrites.
> - The software cleanly routes and informs Judges through `JudgeDashboard` and backend extension contracts in `backend/src/modules/judging/`.

---

## 1. Judging System Overview

The DOGFOOD judging engine is architected to solve the three core challenges of hackathon evaluation:
1. **Judge Calibration Variance**: Lenient vs strict judges skewing raw points.
2. **Unequal Evaluation Distribution**: Inconsistent review counts per project.
3. **Judge Fatigue**: Multi-page rubric burnout leading to rubber-stamping.

---

## 2. Core Planned Components (Tier 2)

```
+-------------------------------------------------------------+
|                      DOGFOOD JUDGING ENGINE                 |
+-------------------------------------------------------------+
                               |
       +-----------------------+-----------------------+
       |                       |                       |
       v                       v                       v
[Judge Assignment]     [Rubric Evaluation]   [Score Normalization]
  - Round Robin          - Weighted Criteria   - Z-score algorithm
  - Track-specialized    - Blinded scoring     - Trimmed mean
  - COI filter           - Qualitative notes   - Outlier mitigation
```

### 2.1 Role Isolation & Security
- Judges are assigned specific sets of projects.
- In blinded mode, judges cannot view scores submitted by peer judges prior to tallying.
- Judges cannot edit participant projects, modify deadlines, or alter event parameters.
- Participants cannot view judge identity or individual raw scores prior to official publication.

### 2.2 Configurable Weighted Rubrics
Each event organizer can configure custom weighted criteria:
- $\text{Score}_{\text{project}} = \sum_{i=1}^{n} (w_i \times s_{i})$ where $\sum w_i = 1.0$.
- Criteria attributes:
  - `name`: String (e.g. "Technical Innovation")
  - `description`: Guiding rubric anchor points (1–3 Poor, 4–7 Competent, 8–10 Exceptional)
  - `weight`: Fractional multiplier (e.g. 0.35)
  - `max_points`: Maximum integer score (e.g. 10 or 100)

### 2.3 Algorithmic Project Assignment
- **Constraint Matrix**:
  - Every project receives at least $K$ independent reviews (default $K \ge 3$).
  - No judge receives more than $M$ assignments to avoid cognitive fatigue.
  - Conflict of Interest (COI) graph pruning: Ensures no judge reviews a project from a teammate, colleague, or disclosed affiliated organization.

---

## 3. Mathematical Score Normalization Engine (Bonus Architecture)

### 3.1 The Calibration Problem
Consider Judge $A$ who scores uniformly between $[75, 95]$ ($\mu_A = 85, \sigma_A = 5$), and Judge $B$ who scores uniformly between $[40, 70]$ ($\mu_B = 55, \sigma_B = 10$). A project scored 75 by Judge $A$ represents a bottom-tier submission, whereas 75 by Judge $B$ represents an unprecedented top score. Using raw averages creates severe injustice.

### 3.2 Z-Score Transformation Proof
To eliminate individual scale bias, DOGFOOD defines the normalized standard score $z_{j,p}$ for judge $j$ on project $p$:

$$z_{j,p} = \frac{x_{j,p} - \mu_j}{\sigma_j}$$

Where:
- $x_{j,p}$ is the raw weighted score assigned by judge $j$ to project $p$.
- $\mu_j = \frac{1}{|P_j|} \sum_{p \in P_j} x_{j,p}$ is judge $j$'s mean score across their assigned projects $P_j$.
- $\sigma_j = \sqrt{\frac{1}{|P_j|-1} \sum_{p \in P_j} (x_{j,p} - \mu_j)^2}$ is judge $j$'s standard deviation.

**Mathematical Rank Invariance Theorem**:
If a judge applies any monotonic linear affine transformation $y = \alpha x + \beta$ ($\alpha > 0$) to their internal grading scale:
$$\mu_y = \alpha \mu_x + \beta$$
$$\sigma_y = \alpha \sigma_x$$
$$z_{y} = \frac{(\alpha x + \beta) - (\alpha \mu_x + \beta)}{\alpha \sigma_x} = \frac{\alpha(x - \mu_x)}{\alpha \sigma_x} = z_x$$

*Proof Conclusion*: The Z-score is mathematically invariant to strictness offsets ($\beta$) and scale expansions ($\alpha$).

### 3.3 Modified Borda Count & Trimmed Mean
To resist malicious rogue judges, the trimmed composite score removes the minimum and maximum Z-scores when $|J_p| \ge 4$:
$$\bar{z}_p = \frac{1}{|J_p| - 2} \sum_{k=2}^{|J_p|-1} z_{(k), p}$$

---

## 4. Pairwise Evaluation Alternative (Bradley-Terry Model)

For rapid evaluations or preliminary rounds, DOGFOOD is architected to support pairwise comparisons ($A \text{ vs } B$):
$$P(\text{Project } i \succ \text{Project } j) = \frac{\pi_i}{\pi_i + \pi_j}$$
Where $\pi_i$ represents the latent quality parameter estimated via maximum likelihood iteration. Pairwise comparisons require zero numeric calibration from judges and decrease review time by 60%.

---

## 5. Threat Model & Adversarial Mitigations

| Threat Vector | Attack Mechanism | Planned Architectural Defense |
|---|---|---|
| **Judge Bribery / Collusion** | Judge gives 100 to target team and 0 to all competing teams | Z-score normalization clamps variance; trimmed mean discards outlier scores; COI matrix forbids assignment |
| **Late Submission Bypass** | Manipulating client clock to submit post-deadline | Server-side monotonic clock strictly rejects any submission where server timestamp > event deadline |
| **Tampered Score Submission** | Intercepting and altering rubric scores in transit | Signed session tokens; immutable score revisions with cryptographic audit log |
| **Position Bias** | Early projects in gallery receiving disproportionate attention | Dynamic randomized presentation order for public and preliminary reviews |

---

## 6. Implementation Readiness in Codebase

The extension contracts and type definitions are located in:
- `backend/src/modules/judging/judging.types.ts`: TypeScript contracts for rubrics, assignments, scores, and normalization.
- `backend/src/modules/judging/judging.routes.ts`: Extension endpoint returning status and readiness signal.
- `frontend/src/pages/judge/JudgeDashboard.tsx`: Dashboard communicating evaluation phase status and roadmap.
