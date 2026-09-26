'use strict';
// Tier-2 deterministic E2E: 10 judges × 100 projects.
// Normal judging in non-overlapping blocks → calibration run calculates to
// INSUFFICIENT first (edge proof) → shared anchors → VALID run → finals/CSV/audit.
// Plus an isolated batch-assignment check (coverage, balance, max_load, seed).
const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const db = require('../src/db');
const { setupTestDb, api } = require('./helpers');

const future = (d) => new Date(Date.now() + d * 86400000).toISOString();
const approx = (a, b, tol = 1e-4) => Math.abs(a - b) <= tol;
// Deterministic valid 0–25 ×4 split of a total in [60, 100].
function split4(total) {
  const q = Math.floor(total / 4);
  const r = total - 4 * q;
  return [0, 1, 2, 3].map((i) => q + (i < r ? 1 : 0));
}

describe('Tier 2 — E2E 10 judges / 100 projects', () => {
  before(async () => {
    await setupTestDb();
  });

  let tokenOrg;
  let eventId;
  let critIds = [];
  const judges = []; // {id, token, idx}
  const projects = []; // project ids P0..P99

  it('setup: organizer, event, rubric, 10 judges, 100 submitted projects', async () => {
    await api().post('/api/auth/register').send({ email: 'eorg@x.com', name: 'E Org', password: 'Password123!' });
    await db.query(`UPDATE users SET role='organizer' WHERE email='eorg@x.com'`);
    const login = await api().post('/api/auth/login').send({ email: 'eorg@x.com', password: 'Password123!' });
    tokenOrg = login.body.token;

    const ev = await api().post('/api/events').set('Authorization', `Bearer ${tokenOrg}`).send({
      title: 'E2E Hack', description: 'e2e', starts_at: future(1), ends_at: future(3),
      submission_deadline: future(3), status: 'published',
    });
    eventId = ev.body.id;

    const rb = await api().post(`/api/judging/events/${eventId}/rubrics`).set('Authorization', `Bearer ${tokenOrg}`).send({
      title: 'E2E Rubric',
      criteria: [
        { label: 'Innovation', max_score: 25 }, { label: 'Technical', max_score: 25 },
        { label: 'Impact', max_score: 25 }, { label: 'Presentation', max_score: 25 },
      ],
    });
    assert.equal(rb.status, 201);
    critIds = rb.body.criteria.map((c) => c.id);

    for (let j = 0; j < 10; j++) {
      // eslint-disable-next-line no-await-in-loop
      const inv = await api().post(`/api/judging/events/${eventId}/judges`).set('Authorization', `Bearer ${tokenOrg}`).send({
        email: `e2ej${j}@x.com`, name: `E2E Judge ${j}`,
      });
      assert.equal(inv.status, 201);
      // eslint-disable-next-line no-await-in-loop
      const li = await api().post('/api/auth/login').send({ email: `e2ej${j}@x.com`, password: inv.body.temp_password });
      assert.equal(li.status, 200);
      judges.push({ id: inv.body.user.id, token: li.body.token, idx: j });
    }

    for (let k = 0; k < 100; k++) {
      // eslint-disable-next-line no-await-in-loop
      const u = await api().post('/api/auth/register').send({ email: `e2ep${k}@x.com`, name: `E2E P ${k}`, password: 'Password123!' });
      // eslint-disable-next-line no-await-in-loop
      const t = await api().post('/api/teams').set('Authorization', `Bearer ${u.body.token}`).send({ event_id: eventId, name: `E2E Team ${k}` });
      // eslint-disable-next-line no-await-in-loop
      const pj = await api().post('/api/projects').set('Authorization', `Bearer ${u.body.token}`).send({
        team_id: t.body.id, title: `E2E Project ${k}`,
        description: 'End-to-end load project with a sufficiently long description for submit.',
        links: [{ label: 'Repo', url: 'https://example.com/e2e' }],
      });
      // eslint-disable-next-line no-await-in-loop
      await api().post(`/api/projects/${pj.body.id}/submit`).set('Authorization', `Bearer ${u.body.token}`);
      projects.push(pj.body.id);
    }
    assert.equal(projects.length, 100);
  });

  it('batch assignment is deterministic, balanced and honors coverage/max_load', async () => {
    // Isolated event for the batch check.
    const ev = await api().post('/api/events').set('Authorization', `Bearer ${tokenOrg}`).send({
      title: 'Batch Hack', description: 'b', starts_at: future(1), ends_at: future(3),
      submission_deadline: future(3), status: 'published',
    });
    const bEvent = ev.body.id;
    const jids = [];
    for (let j = 0; j < 2; j++) {
      // eslint-disable-next-line no-await-in-loop
      const inv = await api().post(`/api/judging/events/${bEvent}/judges`).set('Authorization', `Bearer ${tokenOrg}`).send({ email: `btj${j}@x.com`, name: `BT J ${j}` });
      jids.push(inv.body.user.id);
    }
    const pids = [];
    for (let k = 0; k < 6; k++) {
      // eslint-disable-next-line no-await-in-loop
      const u = await api().post('/api/auth/register').send({ email: `btp${k}@x.com`, name: `BT P ${k}`, password: 'Password123!' });
      // eslint-disable-next-line no-await-in-loop
      const t = await api().post('/api/teams').set('Authorization', `Bearer ${u.body.token}`).send({ event_id: bEvent, name: `BT Team ${k}` });
      // eslint-disable-next-line no-await-in-loop
      const pj = await api().post('/api/projects').set('Authorization', `Bearer ${u.body.token}`).send({
        team_id: t.body.id, title: `BT Proj ${k}`, description: 'Batch test project with a long enough description.',
        links: [{ label: 'Repo', url: 'https://example.com/bt' }],
      });
      // eslint-disable-next-line no-await-in-loop
      await api().post(`/api/projects/${pj.body.id}/submit`).set('Authorization', `Bearer ${u.body.token}`);
      pids.push(pj.body.id);
    }
    const b1 = await api().post(`/api/judging/events/${bEvent}/assignments/batch`).set('Authorization', `Bearer ${tokenOrg}`).send({ coverage: 2, seed: 42 });
    assert.equal(b1.status, 201);
    assert.equal(b1.body.created, 12); // 6 projects × coverage 2
    assert.deepEqual(b1.body.loads.map((x) => x.assigned).sort(), [6, 6]); // balanced
    // Idempotent re-run: nothing new.
    const b2 = await api().post(`/api/judging/events/${bEvent}/assignments/batch`).set('Authorization', `Bearer ${tokenOrg}`).send({ coverage: 2, seed: 42 });
    assert.equal(b2.body.created, 0);
    assert.equal(b2.body.skipped_existing, 6);
    // max_load respected.
    const b3 = await api().post(`/api/judging/events/${bEvent}/assignments/batch`).set('Authorization', `Bearer ${tokenOrg}`).send({ coverage: 2, round: 2, max_load: 1 });
    assert.equal(b3.status, 201);
    assert.ok(b3.body.loads.every((x) => x.assigned <= 7)); // 6 existing + ≤1 new
  });

  it('normal judging: contiguous blocks, no overlap → run calculates INSUFFICIENT', async () => {
    for (let j = 0; j < 10; j++) {
      const block = projects.slice(j * 10, j * 10 + 10);
      // eslint-disable-next-line no-await-in-loop
      const a = await api().post(`/api/judging/events/${eventId}/assignments`).set('Authorization', `Bearer ${tokenOrg}`).send({
        judge_id: judges[j].id, project_ids: block,
      });
      assert.equal(a.body.created, 10);
    }
    // Submit all normal evaluations with deterministic totals 60..95.
    for (let j = 0; j < 10; j++) {
      const mine = (await api().get('/api/judging/mine').set('Authorization', `Bearer ${judges[j].token}`)).body.data;
      assert.equal(mine.length, 10);
      for (const asg of mine) {
        const k = projects.indexOf(asg.project_id);
        // Pin anchor values: J0's PA (k=0) = 70; J9's PB (k=99) = 95 (ordering agrees).
        const total = j === 0 && k === 0 ? 70 : j === 9 && k === 99 ? 95 : 60 + ((j * 7 + k * 3) % 36);
        const vals = split4(total);
        const scores = Object.fromEntries(critIds.map((id, i) => [id, vals[i]]));
        // eslint-disable-next-line no-await-in-loop
        const r = await api().put(`/api/judging/evaluations/assignment/${asg.id}`).set('Authorization', `Bearer ${judges[j].token}`).send({ scores, submit: true });
        assert.equal(r.status, 200);
        assert.equal(r.body.raw_total, total);
      }
    }
    const st = await api().post(`/api/judging/events/${eventId}/calibration/runs`).set('Authorization', `Bearer ${tokenOrg}`).send({
      reference_judge_id: judges[0].id, mode: 'ONE_LOW_ONE_HIGH',
    });
    assert.equal(st.body.version, 1);
    const calc = await api().post(`/api/judging/calibration/runs/${st.body.id}/calculate`).set('Authorization', `Bearer ${tokenOrg}`);
    assert.equal(calc.body.status, 'complete');
    assert.equal(calc.body.summary.valid, 1); // only the reference self-row
    assert.equal(calc.body.summary.insufficient, 9);
    assert.equal(calc.body.summary.normalized, 10); // reference judge's own 10
  });

  it('shared anchors → VALID run: slopes persisted, finals + CSV + audit verified', async () => {
    const PA = projects[0];
    const PB = projects[99];
    const runs = await api().get(`/api/judging/events/${eventId}/calibration/runs`).set('Authorization', `Bearer ${tokenOrg}`);
    const run1 = runs.body.find((x) => x.version === 1);
    const st = await api().post(`/api/judging/events/${eventId}/calibration/runs`).set('Authorization', `Bearer ${tokenOrg}`).send({
      reference_judge_id: judges[0].id, mode: 'ONE_LOW_ONE_HIGH',
    });
    const run2 = st.body.id;
    const as = await api().post(`/api/judging/calibration/runs/${run2}/assign`).set('Authorization', `Bearer ${tokenOrg}`).send({ project_ids: [PA, PB] });
    assert.equal(as.body.judges, 10);
    // Anchor scores: J0 → 70/80; judge j → (82+j)/(90+j).
    for (let j = 0; j < 10; j++) {
      const mine = (await api().get('/api/judging/mine').set('Authorization', `Bearer ${judges[j].token}`)).body.data;
      const cal = mine.filter((x) => x.kind === 'calibration' && x.status === 'pending');
      assert.equal(cal.length, j === 0 || j === 9 ? 1 : 2); // J0 owns PA already, J9 owns PB already
      for (const a of cal) {
        const low = a.project_id === PA;
        const total = j === 0 ? (low ? 70 : 80) : low ? 82 + j : 90 + j;
        const vals = split4(total);
        const scores = Object.fromEntries(critIds.map((id, i) => [id, vals[i]]));
        // eslint-disable-next-line no-await-in-loop
        const r = await api().put(`/api/judging/evaluations/assignment/${a.id}`).set('Authorization', `Bearer ${judges[j].token}`).send({ scores, submit: true });
        assert.equal(r.status, 200);
      }
    }
    const calc = await api().post(`/api/judging/calibration/runs/${run2}/calculate`).set('Authorization', `Bearer ${tokenOrg}`);
    assert.equal(calc.body.summary.valid, 10);
    assert.equal(calc.body.summary.normalized, 118); // 100 normal + 18 calibration (2 anchors pre-owned)

    // Judge 5: slope 10/8 = 1.25, intercept 70 − 1.25×87 = −38.75.
    const detail = await api().get(`/api/judging/calibration/runs/${run2}`).set('Authorization', `Bearer ${tokenOrg}`);
    const c5 = detail.body.calibrations.find((c) => c.source_name === 'E2E Judge 5');
    assert.equal(c5.status, 'VALID');
    assert.ok(approx(c5.slope, 1.25));
    assert.ok(approx(c5.intercept, -38.75));
    assert.equal(c5.low_anchor_project_id, PA);
    assert.equal(c5.high_anchor_project_id, PB);

    // Raw scores unchanged.
    const raws = await db.query(
      `SELECT COUNT(*)::int n FROM evaluations e JOIN judge_assignments a ON a.id=e.assignment_id WHERE a.event_id=$1 AND e.status='submitted'`,
      [eventId]
    );
    assert.equal(raws.rows[0].n, 118);

    // Finals present for all 100 projects; run-1 outputs persist (versioning).
    const res = await api().get(`/api/judging/events/${eventId}/results`).set('Authorization', `Bearer ${tokenOrg}`);
    assert.equal(res.body.run.version, 2);
    assert.equal(res.body.finals.length, 100);
    const n1 = await db.query('SELECT COUNT(*)::int n FROM normalized_scores WHERE run_id=$1', [run1.id]);
    assert.equal(n1.rows[0].n, 100); // all submitted evals recorded, most INSUFFICIENT
    const n1ins = await db.query(`SELECT COUNT(*)::int n FROM normalized_scores WHERE run_id=$1 AND status='INSUFFICIENT_CALIBRATION_DATA'`, [run1.id]);
    assert.equal(n1ins.rows[0].n, 90);

    // CSV: header contract + 118 data rows.
    const csv = await api().get(`/api/judging/events/${eventId}/results/export?level=evaluations&run_id=${run2}`).set('Authorization', `Bearer ${tokenOrg}`);
    assert.equal(csv.status, 200);
    const lines = csv.text.trim().split('\n');
    assert.equal(lines.length, 119);
    assert.ok(lines[0].includes('normalized_score') && lines[0].includes('slope') && lines[0].includes('final_score'));

    // Isolation holds at scale; audit exists.
    const denied = await api().get(`/api/judging/events/${eventId}/results`).set('Authorization', `Bearer ${judges[3].token}`);
    assert.equal(denied.status, 403);
    const audit = await api().get(`/api/judging/events/${eventId}/audit?limit=5`).set('Authorization', `Bearer ${tokenOrg}`);
    assert.ok(audit.body.total > 0);
  });
});
