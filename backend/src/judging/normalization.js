'use strict';
// Tier-2 normalization engine.
// Architecture: NormalizationStrategy base; production strategy is
// TwoPointLinearNormalization. Future strategies (regression, robust,
// Bradley-Terry, …) plug in here without touching routes or UI.
//
// Exact Tier-2 formula — convert source judge raw score S to the target
// (reference) judge scale, given SHARED anchor projects evaluated by BOTH:
//
//   S(B→A) = A_L + ((S_B − B_L) / (B_H − B_L)) × (A_H − A_L)
//
// Stored/explained as slope + intercept:
//
//   slope     = (A_H − A_L) / (B_H − B_L)
//   intercept = A_L − slope × B_L
//   S(B→A)    = intercept + slope × S_B
//
// Anchors MUST be the same projects for both judges (never matched by rank).

const STATUSES = {
  VALID: 'VALID',
  INVALID: 'INVALID',
  INSUFFICIENT: 'INSUFFICIENT_CALIBRATION_DATA',
  SUSPICIOUS: 'SUSPICIOUS_CALIBRATION',
  EXTRAPOLATED: 'EXTRAPOLATED',
  PENDING: 'PENDING',
};

// Calibration modes → minimum shared submitted projects required.
const MODES = {
  ONE_LOW_ONE_HIGH: { lows: 1, highs: 1, minShared: 2 },
  TWO_LOW_ONE_HIGH: { lows: 2, highs: 1, minShared: 3 },
  ONE_LOW_TWO_HIGH: { lows: 1, highs: 2, minShared: 3 },
  TWO_LOW_TWO_HIGH: { lows: 2, highs: 2, minShared: 4 },
};

class NormalizationStrategy {
  get name() {
    return 'base';
  }
  // Must return { slope, intercept, status, reason } — never throws for data issues.
  // eslint-disable-next-line no-unused-vars
  computeTransformation(args) {
    throw new Error('not implemented');
  }
}

class TwoPointLinearNormalization extends NormalizationStrategy {
  get name() {
    return 'two-point-linear';
  }

  // { sourceLow, sourceHigh, targetLow, targetHigh } → transformation.
  computeTransformation({ sourceLow, sourceHigh, targetLow, targetHigh }) {
    for (const v of [sourceLow, sourceHigh, targetLow, targetHigh]) {
      if (v === null || v === undefined || !Number.isFinite(v)) {
        return { slope: null, intercept: null, status: STATUSES.PENDING, reason: 'MISSING_SCORES' };
      }
    }
    const denom = sourceHigh - sourceLow;
    if (denom === 0) {
      return { slope: null, intercept: null, status: STATUSES.INVALID, reason: 'ZERO_SOURCE_RANGE' };
    }
    const slope = (targetHigh - targetLow) / denom;
    const intercept = targetLow - slope * sourceLow;
    if (!Number.isFinite(slope) || !Number.isFinite(intercept)) {
      return { slope: null, intercept: null, status: STATUSES.INVALID, reason: 'NON_FINITE_RESULT' };
    }
    // Negative slope: source and target orderings disagree on the anchors.
    if ((sourceHigh > sourceLow && targetHigh < targetLow) ||
        (sourceHigh < sourceLow && targetHigh > targetLow)) {
      return { slope, intercept, status: STATUSES.SUSPICIOUS, reason: 'NEGATIVE_SLOPE' };
    }
    return { slope, intercept, status: STATUSES.VALID, reason: '' };
  }

  // Apply persisted transformation; flags extrapolation outside [sourceLow, sourceHigh].
  applyTransformation(raw, { slope, intercept, sourceLow, sourceHigh }) {
    if (!Number.isFinite(raw) || !Number.isFinite(slope) || !Number.isFinite(intercept)) {
      return { normalized: null, extrapolated: false };
    }
    const lo = Math.min(sourceLow, sourceHigh);
    const hi = Math.max(sourceLow, sourceHigh);
    return {
      normalized: intercept + slope * raw,
      extrapolated: raw < lo || raw > hi,
    };
  }
}

// Select LOW/HIGH anchors from shared pairs evaluated by BOTH judges.
// sharedPairs: [{ project_id, sourceScore, targetScore }, …] (same project each row).
// Returns { low, high, extras, status, reason } where low/high are pair rows.
function selectAnchors(sharedPairs, mode = 'ONE_LOW_ONE_HIGH', strategy = new TwoPointLinearNormalization()) {
  const spec = MODES[mode] || MODES.ONE_LOW_ONE_HIGH;
  const pairs = (sharedPairs || []).filter(
    (p) => Number.isFinite(p.sourceScore) && Number.isFinite(p.targetScore)
  );
  if (pairs.length === 0) {
    return { low: null, high: null, extras: pairs, status: STATUSES.INSUFFICIENT, reason: 'NO_SHARED_PROJECTS' };
  }
  if (pairs.length === 1) {
    return { low: null, high: null, extras: pairs, status: STATUSES.INSUFFICIENT, reason: 'ONLY_ONE_SHARED_PROJECT' };
  }
  if (pairs.length < spec.minShared) {
    return { low: null, high: null, extras: pairs, status: STATUSES.INSUFFICIENT, reason: `NEED_${spec.minShared}_SHARED_PROJECTS` };
  }
  // Duplicate-anchor guard: same project twice is a data error, not calibration.
  const seen = new Set();
  for (const p of pairs) {
    if (seen.has(p.project_id)) {
      return { low: null, high: null, extras: pairs, status: STATUSES.INVALID, reason: 'DUPLICATE_ANCHOR_PROJECT' };
    }
    seen.add(p.project_id);
  }
  // Anchors ordered by the TARGET (reference) scale: low = reference-min,
  // high = reference-max. Extras retained as validation evidence.
  const sorted = [...pairs].sort((a, b) => a.targetScore - b.targetScore);
  const low = sorted[0];
  const high = sorted[sorted.length - 1];
  if (low.project_id === high.project_id) {
    return { low: null, high: null, extras: pairs, status: STATUSES.INVALID, reason: 'IDENTICAL_ANCHORS' };
  }
  const extras = sorted.slice(1, -1);
  void strategy;
  return { low, high, extras, status: STATUSES.VALID, reason: '' };
}

// Human-readable derivation of a normalized score from persisted data.
function explainNormalization({ raw, sourceJudgeName, targetJudgeName, lowAnchor, highAnchor, slope, intercept, normalized }) {
  const f = (n) => (Number.isFinite(n) ? Math.round(n * 100) / 100 : n);
  return {
    raw,
    sourceJudge: sourceJudgeName,
    referenceJudge: targetJudgeName,
    lowAnchor,
    highAnchor,
    formula: `${f(lowAnchor.targetScore)} + ((${f(raw)} − ${f(lowAnchor.sourceScore)}) / (${f(highAnchor.sourceScore)} − ${f(lowAnchor.sourceScore)})) × (${f(highAnchor.targetScore)} − ${f(lowAnchor.targetScore)})`,
    slopeIntercept: `slope=${f(slope)}, intercept=${f(intercept)}; normalized = intercept + slope × raw`,
    normalized,
  };
}

module.exports = {
  STATUSES,
  MODES,
  NormalizationStrategy,
  TwoPointLinearNormalization,
  selectAnchors,
  explainNormalization,
};
