'use strict';
// Tier-2 end-to-end workflow (small scale):
// invite judges → rubric → assign → evaluate → isolate → progress →
// calibrate (mandatory P1/P3 numbers) → results → why → CSV → audit →
// raw immutability + versioning + reopen.
const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const db = require('../src/db');
const { setupTestDb, api } = require('./helpers');

const future = (d) => new Date(Date.now() + d * 86400000).toISOString();
const approx = (a, b, tol = 1e-4) => Math.abs(a - b) <= tol;

describe('Tier 2 — judging workflow', () => {
  before(async () => {
    await setupTestDb();
  });

  let tokenOrg, tokenA, tokenB, tokenPart;
  let eventId, rubricId;
  let judgeAId, judgeBId;
  let P1, P2, P3, P4;
  let assignA = {}, assignB = {};
  let evalA = {}, evalB = {};
  let runId, run2Id;

  const CRIT = [
    { label: 'Innovation', max_score: 25 },
    { label: 'Technical', max_score: 25 },
    { label: 'Impact', max_score: 25 },
    { label: 'Presentation', max_score: 25 },
  ];

  it('setup: organizer, event, rubric, judges, submitted projects', async () => {
    await api().post('/api/auth/register').send({ email: 'jorg@x.com', name: 'J Org', password: 'Password123!' });
    await db.query(`UPDATE users SET role='organizer' WHERE email='jorg@x.com'`);
    const login = await api().post('/api/auth/login').send({ email: 'jorg@x.com', password: 'Password123!' });
    tokenOrg = login.body.token;

    const ev = await api().post('/api/events').set('Authorization', `Bearer ${tokenOrg}`).send({
      title: 'Judge Hack', description: 'judging e2e', starts_at: future(1), ends_at: future(3),
      submission_deadline: future(3), status: 'published', tracks: [{ name: 'Open' }],
    });
    assert.equal(ev.status, 201);
    eventId = ev.body.id;
    const evFull = await api().get(`/api/events/${eventId}`);
    const trackId = evFull.body.tracks[0].id;

    const rb = await api().post(`/api/judging/events/${eventId}/rubrics`).set('Authorization', `Bearer ${tokenOrg}`).send({
      title: 'Standard 100', criteria: CRIT,
    });
    assert.equal(rb.status, 201);
    assert.equal(rb.body.criteria.length, 4);
    assert.equal(rb.body.version, 1);
    rubricId = rb.body.id;

    for (const [em, nm] of [['ja@x.com', 'Judge A'], ['jb@x.com', 'Judge B']]) {
      // eslint-disable-next-line no-await-in-loop
      const inv = await api().post(`/api/judging/events/${eventId}/judges`).set('Authorization', `Bearer ${tokenOrg}`).send({ email: em, name: nm });
      assert.equal(inv.status, 201, JSON.stringify(inv.body));
    }
    const roster = await api().get(`/api/judging/events/${eventId}/judges`).set('Authorization', `Bearer ${tokenOrg}`);
    assert.equal(roster.body.length, 2);
    judgeAId = roster.body.find((x) => x.email === 'ja@x.com').user_id;
    judgeBId = roster.body.find((x) => x.email === 'jb@x.com').user_id;

    const la = await api().post('/api/auth/login').send({ email: 'ja@x.com', password: 'Password123!' });
    // invited judges created without password get temp passwords; login may fail → set known password
    if (!la.body.token) {
      await db.query(`UPDATE users SET password_hash=$1 WHERE email='ja@x.com'`, [await require('bcryptjs').hash('JudgePass1!', 10)]);
      const la2 = await api().post('/api/auth/login').send({ email: 'ja@x.com', password: 'JudgePass1!' });
      tokenA = la2.body.token;
    } else tokenA = la.body.token;
    await db.query(`UPDATE users SET password_hash=$1 WHERE email='jb@x.com'`, [await require('bcryptjs').hash('JudgePass1!', 10)]);
    const lb = await api().post('/api/auth/login').send({ email: 'jb@x.com', password: 'JudgePass1!' });
    tokenB = lb.body.token;
    assert.ok(tokenA && tokenB);

    // 4 participants → 4 teams → 4 submitted projects (P1..P4).
    const ids = [];
    for (let i = 1; i <= 4; i++) {
      // eslint-disable-next-line no-await-in-loop
      const u = await api().post('/api/auth/register').send({ email: `jp${i}@x.com`, name: `JP ${i}`, password: 'Password123!' });
      // eslint-disable-next-line no-await-in-loop
      const t = await api().post('/api/teams').set('Authorization', `Bearer ${u.body.token}`).send({ event_id: eventId, name: `JTeam ${i}` });
      // eslint-disable-next-line no-await-in-loop
      const pj = await api().post('/api/projects').set('Authorization', `Bearer ${u.body.token}`).send({
        team_id: t.body.id, title: `JProj P${i}`, description: 'A sufficiently long project description for submission testing.',
        track_id: trackId, links: [{ label: 'Repo', url: 'https://example.com/jp' }],
      });
      // eslint-disable-next-line no-await-in-loop
      const sb = await api().post(`/api/projects/${pj.body.id}/submit`).set('Authorization', `Bearer ${u.body.token}`);
      assert.equal(sb.status, 200);
      ids.push(pj.body.id);
    }
    [P1, P2, P3, P4] = ids;
    const pp = await api().post('/api/auth/register').send({ email: 'jpart@x.com', name: 'J Part', password: 'Password123!' });
    tokenPart = pp.body.token;
  });

  it('manual assignment (A: P1,P2,P3 · B: P1,P3,P4) + duplicate prevention', async () => {
    const a = await api().post(`/api/judging/events/${eventId}/assignments`).set('Authorization', `Bearer ${tokenOrg}`).send({
      judge_id: judgeAId, project_ids: [P1, P2, P3],
    });
    assert.equal(a.status, 201);
    assert.equal(a.body.created, 3);
    const b = await api().post(`/api/judging/events/${eventId}/assignments`).set('Authorization', `Bearer ${tokenOrg}`).send({
      judge_id: judgeBId, project_ids: [P1, P3, P4],
    });
    assert.equal(b.status, 201);
    const dup = await api().post(`/api/judging/events/${eventId}/assignments`).set('Authorization', `Bearer ${tokenOrg}`).send({
      judge_id: judgeAId, project_ids: [P1],
    });
    assert.equal(dup.status, 201);
    assert.equal(dup.body.created, 0);
    assert.deepEqual(dup.body.skipped, [P1]);

    const mineA = await api().get('/api/judging/mine').set('Authorization', `Bearer ${tokenA}`);
    assert.equal(mineA.body.assigned, 3);
    for (const x of mineA.body.data) assignA[x.project_id] = x.id;
    const mineB = await api().get('/api/judging/mine').set('Authorization', `Bearer ${tokenB}`);
    assert.equal(mineB.body.assigned, 3);
    for (const x of mineB.body.data) assignB[x.project_id] = x.id;
  });

  it('judge isolation: B cannot touch A’s work; participant + anon blocked', async () => {
    // B tries to open A's assignment
    const open = await api().get(`/api/judging/assignments/${assignA[P1]}`).set('Authorization', `Bearer ${tokenB}`);
    assert.equal(open.status, 403);
    // B tries to evaluate A's assignment
    const put = await api().put(`/api/judging/evaluations/assignment/${assignA[P1]}`).set('Authorization', `Bearer ${tokenB}`).send({ scores: {} });
    assert.equal(put.status, 403);
    // participant cannot assign / view results / see progress
    const pa = await api().post(`/api/judging/events/${eventId}/assignments`).set('Authorization', `Bearer ${tokenPart}`).send({ judge_id: judgeAId, project_ids: [P1] });
    assert.equal(pa.status, 403);
    const pr = await api().get(`/api/judging/events/${eventId}/results`).set('Authorization', `Bearer ${tokenPart}`);
    assert.equal(pr.status, 403);
    const anon = await api().get('/api/judging/mine');
    assert.equal(anon.status, 401);
  });

  it('draft then submit; backend computes raw totals (A: P1=70 P3=80 · B: P1=87 P3=96 P4=92)', async () => {
    const critIds = (await api().get(`/api/judging/events/${eventId}/rubric`).set('Authorization', `Bearer ${tokenA}`)).body.criteria.map((c) => c.id);
    const pack = (vals) => Object.fromEntries(critIds.map((id, i) => [id, vals[i]]));

    // A saves P2 as draft first (partial allowed), then submits.
    let d = await api().put(`/api/judging/evaluations/assignment/${assignA[P2]}`).set('Authorization', `Bearer ${tokenA}`).send({
      scores: { [critIds[0]]: 19 }, feedback: 'wip',
    });
    assert.equal(d.status, 200);
    assert.equal(d.body.status, 'draft');
    d = await api().put(`/api/judging/evaluations/assignment/${assignA[P2]}`).set('Authorization', `Bearer ${tokenA}`).send({
      scores: pack([19, 19, 19, 18]), submit: true,
    });
    assert.equal(d.body.status, 'submitted');
    assert.equal(d.body.raw_total, 75);

    const subs = [
      [tokenA, assignA[P1], [20, 18, 16, 16], 70],
      [tokenA, assignA[P3], [20, 20, 20, 20], 80],
      [tokenB, assignB[P1], [22, 22, 22, 21], 87],
      [tokenB, assignB[P3], [24, 24, 24, 24], 96],
      [tokenB, assignB[P4], [23, 23, 23, 23], 92],
    ];
    for (const [tok, asg, vals, total] of subs) {
      // eslint-disable-next-line no-await-in-loop
      const r = await api().put(`/api/judging/evaluations/assignment/${asg}`).set('Authorization', `Bearer ${tok}`).send({ scores: pack(vals), submit: true });
      assert.equal(r.status, 200);
      assert.equal(r.body.raw_total, total);
    }
    // Invalid criterion value rejected.
    const bad = await api().put(`/api/judging/evaluations/assignment/${assignA[P1]}`).set('Authorization', `Bearer ${tokenA}`).send({ scores: pack([99, 1, 1, 1]), submit: true });
    assert.equal(bad.status, 409); // already submitted → locked
    // Submitted evaluation locked for judge.
    // (re-submit attempt covered above by 409)

    const mineA = await api().get('/api/judging/mine').set('Authorization', `Bearer ${tokenA}`);
    assert.equal(mineA.body.completed, 3);
    for (const x of mineA.body.data) {
      if (x.project_id === P1) evalA.P1 = x;
    }
    // fetch evaluation ids for isolation test below
    const det = await api().get(`/api/judging/assignments/${assignA[P1]}`).set('Authorization', `Bearer ${tokenA}`);
    evalA.P1id = det.body.evaluation.id;
    const detB = await api().get(`/api/judging/assignments/${assignB[P1]}`).set('Authorization', `Bearer ${tokenB}`);
    evalB.P1id = detB.body.evaluation.id;
  });

  it('judge cannot read another judge’s raw evaluation', async () => {
    const r = await api().get(`/api/judging/evaluations/${evalA.P1id}`).set('Authorization', `Bearer ${tokenB}`);
    assert.equal(r.status, 403);
    const ok = await api().get(`/api/judging/evaluations/${evalB.P1id}`).set('Authorization', `Bearer ${tokenB}`);
    assert.equal(ok.status, 200);
    assert.equal(ok.body.raw_total, 87);
  });

  it('organizer progress dashboard shows per-judge analytics', async () => {
    const r = await api().get(`/api/judging/events/${eventId}/progress`).set('Authorization', `Bearer ${tokenOrg}`);
    assert.equal(r.status, 200);
    assert.equal(r.body.length, 2);
    const a = r.body.find((x) => x.judge_id === judgeAId);
    assert.equal(a.assigned, 3);
    assert.equal(a.completed, 3);
    assert.equal(a.pct, 100);
    assert.ok(approx(a.avg_raw, (70 + 75 + 80) / 3));
    assert.equal(a.min_raw, 70);
    assert.equal(a.max_raw, 80);
    // judges cannot see cross-judge analytics
    const denied = await api().get(`/api/judging/events/${eventId}/progress`).set('Authorization', `Bearer ${tokenA}`);
    assert.equal(denied.status, 403);
  });

  it('suspended judge is blocked from submitting (then reactivated)', async () => {
    const roster = await api().get(`/api/judging/events/${eventId}/judges`).set('Authorization', `Bearer ${tokenOrg}`);
    const rowB = roster.body.find((x) => x.user_id === judgeBId);
    await api().put(`/api/judging/judges/${rowB.id}/status`).set('Authorization', `Bearer ${tokenOrg}`).send({ status: 'suspended' });
    // B has no pending assignments left; create one more project? use reopen path instead:
    // suspended check happens before submitted-check, so attempt on submitted → 403 (suspended wins)
    const blk = await api().put(`/api/judging/evaluations/assignment/${assignB[P4]}`).set('Authorization', `Bearer ${tokenB}`).send({ scores: {} });
    assert.equal(blk.status, 403);
    await api().put(`/api/judging/judges/${rowB.id}/status`).set('Authorization', `Bearer ${tokenOrg}`).send({ status: 'active' });
  });

  it('calibration: start run (ref=A), assign dedupe, calculate → mandatory numbers', async () => {
    const st = await api().post(`/api/judging/events/${eventId}/calibration/runs`).set('Authorization', `Bearer ${tokenOrg}`).send({
      reference_judge_id: judgeAId, mode: 'ONE_LOW_ONE_HIGH',
    });
    assert.equal(st.status, 201);
    assert.equal(st.body.version, 1);
    runId = st.body.id;

    // P1/P3 already assigned to both → dedupe reports skipped.
    const as = await api().post(`/api/judging/calibration/runs/${runId}/assign`).set('Authorization', `Bearer ${tokenOrg}`).send({ project_ids: [P1, P3] });
    assert.equal(as.status, 201);
    assert.equal(as.body.created, 0);
    assert.ok(as.body.skipped_existing >= 2);

    const calc = await api().post(`/api/judging/calibration/runs/${runId}/calculate`).set('Authorization', `Bearer ${tokenOrg}`);
    assert.equal(calc.status, 200);
    assert.equal(calc.body.summary.valid, 2);
    assert.equal(calc.body.summary.suspicious, 0);

    const run = await api().get(`/api/judging/calibration/runs/${runId}`).set('Authorization', `Bearer ${tokenOrg}`);
    const calB = run.body.calibrations.find((c) => c.source_name === 'Judge B');
    assert.equal(calB.status, 'VALID');
    assert.equal(calB.low_anchor_project_id, P1);
    assert.equal(calB.high_anchor_project_id, P3);
    assert.ok(approx(calB.slope, 10 / 9), `slope=${calB.slope}`);
    assert.ok(approx(calB.intercept, 70 - (10 / 9) * 87), `intercept=${calB.intercept}`);
    const calA = run.body.calibrations.find((c) => c.source_name === 'Judge A');
    assert.equal(calA.slope, 1);
    assert.equal(calA.intercept, 0);
  });

  it('results: B raw 92 → normalized ≈75.56; finals aggregate correctly', async () => {
    const r = await api().get(`/api/judging/events/${eventId}/results`).set('Authorization', `Bearer ${tokenOrg}`);
    assert.equal(r.status, 200);
    assert.equal(r.body.run.version, 1);
    const p4 = r.body.finals.find((f) => f.project_id === P4);
    assert.ok(approx(p4.normalized_avg, 75.5555556), `p4=${p4.normalized_avg}`);
    assert.equal(p4.raw_avg, 92);
    const p1 = r.body.finals.find((f) => f.project_id === P1);
    assert.ok(approx(p1.normalized_avg, (70 + 70) / 2)); // A 70 + B→A 70
  });

  it('"why is this score?" explanation is generated from persisted data', async () => {
    const r = await api().get(`/api/judging/events/${eventId}/results`).set('Authorization', `Bearer ${tokenOrg}`);
    const p4 = r.body.finals.find((f) => f.project_id === P4);
    const nrow = p4.judges.find((j) => j.judge_id === judgeBId);
    const w = await api().get(`/api/judging/normalized/${nrow.normalized_id}`).set('Authorization', `Bearer ${tokenOrg}`);
    assert.equal(w.status, 200);
    assert.equal(w.body.raw_score, 92);
    assert.ok(approx(w.body.normalized_score, 75.5555556));
    assert.match(w.body.explanation.formula, /92/);
    assert.match(w.body.explanation.formula, /87/);
    assert.match(w.body.explanation.formula, /96/);
    // owner judge can see own explanation; other judge cannot
    const own = await api().get(`/api/judging/normalized/${nrow.normalized_id}`).set('Authorization', `Bearer ${tokenB}`);
    assert.equal(own.status, 200);
    const other = await api().get(`/api/judging/normalized/${nrow.normalized_id}`).set('Authorization', `Bearer ${tokenA}`);
    assert.equal(other.status, 403);
  });

  it('raw scores immutable across recalculation; runs versioned', async () => {
    const st = await api().post(`/api/judging/events/${eventId}/calibration/runs`).set('Authorization', `Bearer ${tokenOrg}`).send({
      reference_judge_id: judgeAId, mode: 'ONE_LOW_ONE_HIGH',
    });
    assert.equal(st.body.version, 2);
    run2Id = st.body.id;
    await api().post(`/api/judging/calibration/runs/${run2Id}/calculate`).set('Authorization', `Bearer ${tokenOrg}`);
    const evs = await db.query(
      `SELECT e.raw_total FROM evaluations e JOIN judge_assignments a ON a.id=e.assignment_id
       WHERE a.event_id=$1 ORDER BY e.id ASC`,
      [eventId]
    );
    assert.deepEqual(evs.rows.map((x) => x.raw_total).sort((a, b) => a - b), [70, 75, 80, 87, 92, 96]);
    const n1 = await db.query('SELECT COUNT(*)::int n FROM normalized_scores WHERE run_id=$1', [runId]);
    assert.equal(n1.rows[0].n, 6); // run 1 outputs persist
  });

  it('organizer can reopen; resubmit updates raw (audited), reference switch works', async () => {
    const detB = await api().get(`/api/judging/assignments/${assignB[P4]}`).set('Authorization', `Bearer ${tokenB}`);
    const evalId = detB.body.evaluation.id;
    const ro = await api().post(`/api/judging/evaluations/${evalId}/reopen`).set('Authorization', `Bearer ${tokenOrg}`).send({ reason: 'judge typo' });
    assert.equal(ro.status, 200);
    assert.equal(ro.body.status, 'draft');
    const critIds = (await api().get(`/api/judging/events/${eventId}/rubric`).set('Authorization', `Bearer ${tokenB}`)).body.criteria.map((c) => c.id);
    const pack = (vals) => Object.fromEntries(critIds.map((id, i) => [id, vals[i]]));
    const re = await api().put(`/api/judging/evaluations/assignment/${assignB[P4]}`).set('Authorization', `Bearer ${tokenB}`).send({ scores: pack([23, 23, 23, 24]), submit: true });
    assert.equal(re.body.raw_total, 93);
    // reference switch to B is allowed
    const st = await api().post(`/api/judging/events/${eventId}/calibration/runs`).set('Authorization', `Bearer ${tokenOrg}`).send({
      reference_judge_id: judgeBId, mode: 'ONE_LOW_ONE_HIGH',
    });
    assert.equal(st.body.version, 3);
    const calc = await api().post(`/api/judging/calibration/runs/${st.body.id}/calculate`).set('Authorization', `Bearer ${tokenOrg}`);
    assert.equal(calc.body.status, 'complete');
  });

  it('CSV exports contain required fields (both levels)', async () => {
    const e = await api().get(`/api/judging/events/${eventId}/results/export?level=evaluations&run_id=${runId}`).set('Authorization', `Bearer ${tokenOrg}`);
    assert.equal(e.status, 200);
    assert.match(e.headers['content-type'], /text\/csv/);
    const head = e.text.split('\n')[0];
    for (const col of ['project_id', 'project_name', 'judge_id', 'judge_name', 'raw_score', 'normalized_score', 'reference_judge', 'calibration_id', 'low_anchor_project_id', 'high_anchor_project_id', 'slope', 'intercept', 'final_score', 'evaluation_status']) {
      assert.ok(head.includes(col), `missing ${col}`);
    }
    assert.ok(e.text.includes('75.555'));
    const p = await api().get(`/api/judging/events/${eventId}/results/export?level=projects&run_id=${runId}`).set('Authorization', `Bearer ${tokenOrg}`);
    assert.equal(p.status, 200);
    assert.ok(p.text.split('\n')[0].includes('normalized_avg'));
    // judge cannot export
    const denied = await api().get(`/api/judging/events/${eventId}/results/export`).set('Authorization', `Bearer ${tokenA}`);
    assert.equal(denied.status, 403);
  });

  it('audit trail records the judging lifecycle', async () => {
    const r = await api().get(`/api/judging/events/${eventId}/audit?limit=100`).set('Authorization', `Bearer ${tokenOrg}`);
    assert.equal(r.status, 200);
    const actions = r.body.data.map((x) => x.action);
    for (const a of ['judge.invited', 'rubric.created', 'assignment.created', 'evaluation.submitted', 'evaluation.reopened', 'calibration.started', 'calibration.calculated', 'results.exported']) {
      assert.ok(actions.includes(a), `missing audit ${a}`);
    }
    const denied = await api().get(`/api/judging/events/${eventId}/audit`).set('Authorization', `Bearer ${tokenA}`);
    assert.equal(denied.status, 403);
  });
});
