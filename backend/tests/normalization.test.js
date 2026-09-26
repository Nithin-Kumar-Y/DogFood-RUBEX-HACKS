'use strict';
// Tier-2 normalization engine unit tests — incl. the MANDATORY calibration example:
//   P1: A=70, B=87 · P3: A=80, B=96  ⇒  B 87→70, 92→≈75.56, 96→80.
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  STATUSES,
  TwoPointLinearNormalization,
  selectAnchors,
  explainNormalization,
} = require('../src/judging/normalization');

const strat = new TwoPointLinearNormalization();
const approx = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol;

describe('TwoPointLinearNormalization — mandatory example', () => {
  const t = strat.computeTransformation({ sourceLow: 87, sourceHigh: 96, targetLow: 70, targetHigh: 80 });

  it('computes slope 10/9 and intercept ≈ -26.666667', () => {
    assert.equal(t.status, STATUSES.VALID);
    assert.ok(approx(t.slope, 10 / 9), `slope=${t.slope}`);
    assert.ok(approx(t.intercept, 70 - (10 / 9) * 87), `intercept=${t.intercept}`);
  });

  it('maps B raw 87 → 70', () => {
    const r = strat.applyTransformation(87, { ...t, sourceLow: 87, sourceHigh: 96 });
    assert.ok(approx(r.normalized, 70));
    assert.equal(r.extrapolated, false);
  });

  it('maps B raw 92 → ≈75.56', () => {
    const r = strat.applyTransformation(92, { ...t, sourceLow: 87, sourceHigh: 96 });
    assert.ok(approx(r.normalized, 75.5555556, 1e-4), `got ${r.normalized}`);
    assert.equal(r.extrapolated, false);
  });

  it('maps B raw 96 → 80', () => {
    const r = strat.applyTransformation(96, { ...t, sourceLow: 87, sourceHigh: 96 });
    assert.ok(approx(r.normalized, 80));
  });
});

describe('TwoPointLinearNormalization — edge cases', () => {
  it('zero denominator → INVALID / ZERO_SOURCE_RANGE (no crash)', () => {
    const t = strat.computeTransformation({ sourceLow: 85, sourceHigh: 85, targetLow: 70, targetHigh: 80 });
    assert.equal(t.status, STATUSES.INVALID);
    assert.equal(t.reason, 'ZERO_SOURCE_RANGE');
  });

  it('negative slope → SUSPICIOUS_CALIBRATION', () => {
    const t = strat.computeTransformation({ sourceLow: 80, sourceHigh: 90, targetLow: 85, targetHigh: 75 });
    assert.equal(t.status, STATUSES.SUSPICIOUS);
    assert.equal(t.reason, 'NEGATIVE_SLOPE');
    assert.ok(t.slope < 0);
  });

  it('extrapolation is calculated but flagged', () => {
    const t = strat.computeTransformation({ sourceLow: 87, sourceHigh: 96, targetLow: 70, targetHigh: 80 });
    const r = strat.applyTransformation(100, { ...t, sourceLow: 87, sourceHigh: 96 });
    assert.ok(approx(r.normalized, 70 + ((100 - 87) / 9) * 10));
    assert.equal(r.extrapolated, true);
  });

  it('missing scores → PENDING (never invents numbers)', () => {
    const t = strat.computeTransformation({ sourceLow: null, sourceHigh: 96, targetLow: 70, targetHigh: 80 });
    assert.equal(t.status, STATUSES.PENDING);
  });
});

describe('selectAnchors — shared-project rules', () => {
  const pairs = [
    { project_id: 1, sourceScore: 87, targetScore: 70 },
    { project_id: 3, sourceScore: 96, targetScore: 80 },
  ];

  it('selects low/high anchors from shared pairs', () => {
    const a = selectAnchors(pairs, 'ONE_LOW_ONE_HIGH');
    assert.equal(a.status, STATUSES.VALID);
    assert.equal(a.low.project_id, 1);
    assert.equal(a.high.project_id, 3);
    assert.deepEqual(a.extras, []);
  });

  it('one shared project → INSUFFICIENT / ONLY_ONE_SHARED_PROJECT', () => {
    const a = selectAnchors([pairs[0]], 'ONE_LOW_ONE_HIGH');
    assert.equal(a.status, STATUSES.INSUFFICIENT);
    assert.equal(a.reason, 'ONLY_ONE_SHARED_PROJECT');
  });

  it('mode minimums enforced (TWO_LOW_TWO_HIGH needs 4)', () => {
    const a = selectAnchors(pairs, 'TWO_LOW_TWO_HIGH');
    assert.equal(a.status, STATUSES.INSUFFICIENT);
    const four = [...pairs,
      { project_id: 5, sourceScore: 88, targetScore: 72 },
      { project_id: 7, sourceScore: 95, targetScore: 79 }];
    const b = selectAnchors(four, 'TWO_LOW_TWO_HIGH');
    assert.equal(b.status, STATUSES.VALID);
    assert.equal(b.low.project_id, 1);
    assert.equal(b.high.project_id, 3);
    assert.equal(b.extras.length, 2);
  });

  it('duplicate anchor project → INVALID', () => {
    const a = selectAnchors([pairs[0], { project_id: 1, sourceScore: 88, targetScore: 71 }], 'ONE_LOW_ONE_HIGH');
    assert.equal(a.status, STATUSES.INVALID);
    assert.equal(a.reason, 'DUPLICATE_ANCHOR_PROJECT');
  });
});

describe('explainNormalization — audit derivation', () => {
  it('derives the worked formula from persisted values', () => {
    const e = explainNormalization({
      raw: 92, sourceJudgeName: 'Judge B', targetJudgeName: 'Judge A',
      lowAnchor: { project_id: 1, sourceScore: 87, targetScore: 70 },
      highAnchor: { project_id: 3, sourceScore: 96, targetScore: 80 },
      slope: 10 / 9, intercept: 70 - (10 / 9) * 87, normalized: 75.5555556,
    });
    assert.match(e.formula, /70/);
    assert.match(e.formula, /92/);
    assert.equal(e.sourceJudge, 'Judge B');
  });
});
