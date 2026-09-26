'use strict';
// Tier-2 judging API. All permissions backend-enforced:
//  - judges: only own assignments/evaluations; never others' raw scores or analytics
//  - organizer (own events) / admin: manage, inspect, calibrate, export
//  - participants: no access. Raw totals computed server-side, never trusted from client.
const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { requireAuth, requireRole } = require('../auth');
const {
  STATUSES,
  MODES,
  TwoPointLinearNormalization,
  selectAnchors,
  explainNormalization,
} = require('../judging/normalization');

const router = express.Router();
const strategy = new TwoPointLinearNormalization();

/* ---------------- helpers ---------------- */

async function audit(actorId, eventId, action, entity = '', entityId = null, meta = {}) {
  try {
    await db.query(
      `INSERT INTO audit_events (actor_id, event_id, action, entity, entity_id, meta)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [actorId, eventId, action, entity, entityId, JSON.stringify(meta)]
    );
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('[audit]', e.message);
  }
}

async function getEvent(id) {
  const r = await db.query('SELECT * FROM events WHERE id=$1', [id]);
  return r.rows[0] || null;
}

function canManageEvent(user, event) {
  if (!user || !event) return false;
  if (user.role === 'admin') return true;
  return user.role === 'organizer' && event.created_by === user.id;
}

async function getEventJudge(eventId, userId) {
  const r = await db.query('SELECT * FROM event_judges WHERE event_id=$1 AND user_id=$2 LIMIT 1', [eventId, userId]);
  return r.rows[0] || null;
}

async function getActiveRubric(eventId) {
  const r = await db.query(
    `SELECT * FROM rubrics WHERE event_id=$1 AND is_active=TRUE ORDER BY version DESC LIMIT 1`,
    [eventId]
  );
  if (r.rows.length === 0) return null;
  const rubric = r.rows[0];
  const c = await db.query('SELECT * FROM rubric_criteria WHERE rubric_id=$1 ORDER BY position ASC, id ASC', [rubric.id]);
  rubric.criteria = c.rows;
  return rubric;
}

function computeRawTotal(scores, criteria, forSubmit) {
  const errors = [];
  let total = 0;
  const clean = {};
  for (const c of criteria) {
    const key = String(c.id);
    const raw = scores ? scores[key] ?? scores[c.id] : undefined;
    if (raw === undefined || raw === null || raw === '') {
      if (c.required && forSubmit) errors.push(`"${c.label}" is required.`);
      continue;
    }
    const v = Number(raw);
    if (!Number.isFinite(v)) {
      errors.push(`"${c.label}" must be a number.`);
      continue;
    }
    if (v < 0 || v > c.max_score) {
      errors.push(`"${c.label}" must be between 0 and ${c.max_score}.`);
      continue;
    }
    clean[key] = v;
    total += v * Number(c.weight || 1);
  }
  return { errors, total, clean };
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function publicAssignment(a) {
  return {
    id: a.id, event_id: a.event_id, project_id: a.project_id, kind: a.kind,
    round: a.round, status: a.status, created_at: a.created_at,
    project_title: a.project_title, team_name: a.team_name,
    track_name: a.track_name, event_title: a.event_title,
  };
}

/* ---------------- judge management ---------------- */

// POST /api/judging/events/:id/judges — invite (existing user or new account)
router.post('/events/:id/judges', requireAuth, requireRole('organizer'), async (req, res) => {
  try {
    const eventId = parseInt(req.params.id, 10);
    const event = await getEvent(eventId);
    if (!event) return res.status(404).json({ error: 'Event not found.' });
    if (!canManageEvent(req.user, event)) return res.status(403).json({ error: 'You can only manage judges for your own events.' });
    const { email, name, user_id, password } = req.body || {};
    let user = null;
    if (user_id) {
      const r = await db.query('SELECT * FROM users WHERE id=$1', [parseInt(user_id, 10)]);
      if (r.rows.length === 0) return res.status(404).json({ error: 'User not found.' });
      user = r.rows[0];
      if (!['judge', 'participant'].includes(user.role))
        return res.status(400).json({ error: 'Only participants or judges can be added as event judges.' });
      if (user.role === 'participant') {
        await db.query(`UPDATE users SET role='judge', updated_at=now() WHERE id=$1`, [user.id]);
        user.role = 'judge';
      }
    } else {
      const cleanEmail = String(email || '').trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail))
        return res.status(400).json({ error: 'Valid email is required.' });
      const existing = await db.query('SELECT * FROM users WHERE email=$1', [cleanEmail]);
      if (existing.rows.length > 0) {
        user = existing.rows[0];
        if (!['judge', 'participant'].includes(user.role))
          return res.status(400).json({ error: 'That account holds a staff role already.' });
        if (user.role === 'participant') {
          await db.query(`UPDATE users SET role='judge', updated_at=now() WHERE id=$1`, [user.id]);
          user.role = 'judge';
        }
      } else {
        const cleanName = String(name || '').trim();
        if (cleanName.length < 2) return res.status(400).json({ error: 'Name is required for new judges.' });
        const pw = String(password || '').length >= 8 ? String(password) : null;
        const tempPw = pw || Math.random().toString(36).slice(2, 10) + 'A1!';
        const hash = await bcrypt.hash(tempPw, 10);
        const ins = await db.query(
          `INSERT INTO users (email, password_hash, name, role) VALUES ($1,$2,$3,'judge') RETURNING *`,
          [cleanEmail, hash, cleanName]
        );
        user = ins.rows[0];
        await audit(req.user.id, eventId, 'judge.created', 'user', user.id, { email: cleanEmail });
        const dup = await db.query('SELECT * FROM event_judges WHERE event_id=$1 AND user_id=$2', [eventId, user.id]);
        if (dup.rows.length > 0) {
          return res.status(409).json({ error: 'This judge is already on the roster.', judge: { id: user.id, email: user.email, name: user.name } });
        }
        const row = await db.query(
          `INSERT INTO event_judges (event_id, user_id, status, invited_by) VALUES ($1,$2,'invited',$3) RETURNING *`,
          [eventId, user.id, req.user.id]
        );
        await audit(req.user.id, eventId, 'judge.invited', 'event_judge', row.rows[0].id, { user_id: user.id });
        return res.status(201).json({
          roster: row.rows[0],
          user: { id: user.id, email: user.email, name: user.name, role: user.role },
          ...(pw ? {} : { temp_password: tempPw }),
        });
      }
    }
    const dup = await db.query('SELECT * FROM event_judges WHERE event_id=$1 AND user_id=$2', [eventId, user.id]);
    if (dup.rows.length > 0) return res.status(409).json({ error: 'This judge is already on the roster.' });
    const row = await db.query(
      `INSERT INTO event_judges (event_id, user_id, status, invited_by) VALUES ($1,$2,'invited',$3) RETURNING *`,
      [eventId, user.id, req.user.id]
    );
    await audit(req.user.id, eventId, 'judge.invited', 'event_judge', row.rows[0].id, { user_id: user.id });
    return res.status(201).json({
      roster: row.rows[0],
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
    });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('[judging/invite]', e.message);
    return res.status(500).json({ error: 'Failed to invite judge.' });
  }
});

// GET /api/judging/events/:id/judges — roster (organizer)
router.get('/events/:id/judges', requireAuth, requireRole('organizer'), async (req, res) => {
  try {
    const eventId = parseInt(req.params.id, 10);
    const event = await getEvent(eventId);
    if (!event) return res.status(404).json({ error: 'Event not found.' });
    if (!canManageEvent(req.user, event)) return res.status(403).json({ error: 'Forbidden.' });
    const r = await db.query(
      `SELECT ej.*, u.name, u.email FROM event_judges ej
       JOIN users u ON u.id = ej.user_id WHERE ej.event_id=$1 ORDER BY ej.created_at ASC`,
      [eventId]
    );
    return res.json(r.rows);
  } catch (e) {
    return res.status(500).json({ error: 'Failed to load judges.' });
  }
});

// PUT /api/judging/judges/:rosterId/status — suspend / reactivate / complete
router.put('/judges/:rosterId/status', requireAuth, requireRole('organizer'), async (req, res) => {
  try {
    const rosterId = parseInt(req.params.rosterId, 10);
    const { status } = req.body || {};
    if (!['invited', 'active', 'suspended', 'completed'].includes(status))
      return res.status(400).json({ error: 'Invalid status.' });
    const cur = await db.query('SELECT * FROM event_judges WHERE id=$1', [rosterId]);
    if (cur.rows.length === 0) return res.status(404).json({ error: 'Judge roster entry not found.' });
    const event = await getEvent(cur.rows[0].event_id);
    if (!canManageEvent(req.user, event)) return res.status(403).json({ error: 'Forbidden.' });
    const r = await db.query(
      `UPDATE event_judges SET status=$1, updated_at=now() WHERE id=$2 RETURNING *`,
      [status, rosterId]
    );
    await audit(req.user.id, event.id, 'judge.status_changed', 'event_judge', rosterId, { from: cur.rows[0].status, to: status });
    return res.json(r.rows[0]);
  } catch (e) {
    return res.status(500).json({ error: 'Failed to update judge status.' });
  }
});

// DELETE /api/judging/judges/:rosterId — remove judge with no submitted evaluations
router.delete('/judges/:rosterId', requireAuth, requireRole('organizer'), async (req, res) => {
  try {
    const rosterId = parseInt(req.params.rosterId, 10);
    const cur = await db.query('SELECT * FROM event_judges WHERE id=$1', [rosterId]);
    if (cur.rows.length === 0) return res.status(404).json({ error: 'Not found.' });
    const event = await getEvent(cur.rows[0].event_id);
    if (!canManageEvent(req.user, event)) return res.status(403).json({ error: 'Forbidden.' });
    const subs = await db.query(
      `SELECT COUNT(*)::int c FROM evaluations e JOIN judge_assignments a ON a.id=e.assignment_id
       WHERE a.judge_id=$1 AND a.event_id=$2 AND e.status='submitted'`,
      [cur.rows[0].user_id, event.id]
    );
    if (subs.rows[0].c > 0)
      return res.status(400).json({ error: 'Cannot remove a judge with submitted evaluations. Suspend them instead.' });
    await db.query('DELETE FROM event_judges WHERE id=$1', [rosterId]);
    await audit(req.user.id, event.id, 'judge.removed', 'event_judge', rosterId, { user_id: cur.rows[0].user_id });
    return res.json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: 'Failed to remove judge.' });
  }
});

/* ---------------- rubrics ---------------- */

// POST /api/judging/events/:id/rubrics — create (deactivates previous; version+1)
router.post('/events/:id/rubrics', requireAuth, requireRole('organizer'), async (req, res) => {
  try {
    const eventId = parseInt(req.params.id, 10);
    const event = await getEvent(eventId);
    if (!event) return res.status(404).json({ error: 'Event not found.' });
    if (!canManageEvent(req.user, event)) return res.status(403).json({ error: 'Forbidden.' });
    const { title, description, criteria } = req.body || {};
    if (!title || String(title).trim().length < 3)
      return res.status(400).json({ error: 'Rubric title is required (min 3 chars).' });
    if (!Array.isArray(criteria) || criteria.length === 0)
      return res.status(400).json({ error: 'At least one criterion is required.' });
    if (criteria.length > 20) return res.status(400).json({ error: 'Maximum 20 criteria.' });
    const clean = [];
    for (let i = 0; i < criteria.length; i++) {
      const c = criteria[i] || {};
      if (!c.label || String(c.label).trim().length < 2)
        return res.status(400).json({ error: `Criterion ${i + 1}: label required.` });
      const max = Number(c.max_score);
      if (!Number.isFinite(max) || max <= 0 || max > 1000)
        return res.status(400).json({ error: `Criterion "${c.label}": max_score must be > 0.` });
      const w = c.weight === undefined ? 1 : Number(c.weight);
      if (!Number.isFinite(w) || w < 0)
        return res.status(400).json({ error: `Criterion "${c.label}": weight must be ≥ 0.` });
      clean.push({
        label: String(c.label).trim(),
        description: String(c.description || ''),
        max_score: max,
        weight: w,
        required: c.required === undefined ? true : !!c.required,
        position: i,
      });
    }
    const ver = await db.query('SELECT COALESCE(MAX(version),0)::int v FROM rubrics WHERE event_id=$1', [eventId]);
    await db.query('UPDATE rubrics SET is_active=FALSE WHERE event_id=$1', [eventId]);
    const ins = await db.query(
      `INSERT INTO rubrics (event_id, title, description, is_active, version, created_by)
       VALUES ($1,$2,$3,TRUE,$4,$5) RETURNING *`,
      [eventId, String(title).trim(), String(description || ''), ver.rows[0].v + 1, req.user.id]
    );
    const rubric = ins.rows[0];
    for (const c of clean) {
      // eslint-disable-next-line no-await-in-loop
      await db.query(
        `INSERT INTO rubric_criteria (rubric_id, label, description, max_score, weight, required, position)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [rubric.id, c.label, c.description, c.max_score, c.weight, c.required, c.position]
      );
    }
    await audit(req.user.id, eventId, 'rubric.created', 'rubric', rubric.id, { version: rubric.version, criteria: clean.length });
    const full = await getActiveRubric(eventId);
    return res.status(201).json(full);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('[judging/rubric]', e.message);
    return res.status(500).json({ error: 'Failed to create rubric.' });
  }
});

// GET /api/judging/events/:id/rubric — active rubric (organizer + assigned judges)
router.get('/events/:id/rubric', requireAuth, async (req, res) => {
  try {
    const eventId = parseInt(req.params.id, 10);
    const event = await getEvent(eventId);
    if (!event) return res.status(404).json({ error: 'Event not found.' });
    const ej = await getEventJudge(eventId, req.user.id);
    if (!canManageEvent(req.user, event) && !ej)
      return res.status(403).json({ error: 'Only event judges and organizers can view the rubric.' });
    const rubric = await getActiveRubric(eventId);
    if (!rubric) return res.status(404).json({ error: 'No rubric configured yet.' });
    return res.json(rubric);
  } catch (e) {
    return res.status(500).json({ error: 'Failed to load rubric.' });
  }
});

/* ---------------- assignments ---------------- */

// POST /api/judging/events/:id/assignments — manual assignment
router.post('/events/:id/assignments', requireAuth, requireRole('organizer'), async (req, res) => {
  try {
    const eventId = parseInt(req.params.id, 10);
    const event = await getEvent(eventId);
    if (!event) return res.status(404).json({ error: 'Event not found.' });
    if (!canManageEvent(req.user, event)) return res.status(403).json({ error: 'Forbidden.' });
    const { judge_id, project_ids, kind, round } = req.body || {};
    const judgeId = parseInt(judge_id, 10);
    if (!judgeId || !Array.isArray(project_ids) || project_ids.length === 0)
      return res.status(400).json({ error: 'judge_id and non-empty project_ids are required.' });
    if (project_ids.length > 500) return res.status(400).json({ error: 'Maximum 500 projects per request.' });
    const k = kind === 'calibration' ? 'calibration' : 'normal';
    const rnd = round ? parseInt(round, 10) : 1;
    const ej = await getEventJudge(eventId, judgeId);
    if (!ej) return res.status(400).json({ error: 'Judge is not on this event roster.' });
    if (['suspended', 'completed'].includes(ej.status))
      return res.status(400).json({ error: `Judge is ${ej.status}; reactivate before assigning.` });
    const pids = [...new Set(project_ids.map((x) => parseInt(x, 10)).filter(Boolean))];
    if (pids.length === 0) return res.status(400).json({ error: 'No valid project ids.' });
    const inList = pids.map((_, i) => `$${i + 2}`).join(',');
    const chk = await db.query(
      `SELECT id FROM projects WHERE event_id=$1 AND status='submitted' AND id IN (${inList})`,
      [eventId, ...pids]
    );
    const valid = new Set(chk.rows.map((x) => x.id));
    const bad = pids.filter((x) => !valid.has(x));
    if (bad.length > 0)
      return res.status(400).json({ error: 'Only submitted projects of this event can be assigned.', invalid: bad });
    const exist = await db.query(
      `SELECT project_id FROM judge_assignments WHERE judge_id=$1 AND round=$2 AND project_id IN (${inList})`,
      [judgeId, rnd, ...pids]
    );
    const have = new Set(exist.rows.map((x) => x.project_id));
    let created = 0;
    const skipped = [];
    for (const pid of pids) {
      if (have.has(pid)) {
        skipped.push(pid);
        continue;
      }
      // eslint-disable-next-line no-await-in-loop
      await db.query(
        `INSERT INTO judge_assignments (event_id, judge_id, project_id, kind, round) VALUES ($1,$2,$3,$4,$5)`,
        [eventId, judgeId, pid, k, rnd]
      );
      created += 1;
    }
    await audit(req.user.id, eventId, 'assignment.created', 'judge', judgeId, { kind: k, round: rnd, created, skipped });
    return res.status(201).json({ created, skipped, judge_id: judgeId });
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'Duplicate assignment prevented.' });
    // eslint-disable-next-line no-console
    console.error('[judging/assign]', e.message);
    return res.status(500).json({ error: 'Failed to create assignments.' });
  }
});

// POST /api/judging/events/:id/assignments/batch — deterministic algorithmic assignment
router.post('/events/:id/assignments/batch', requireAuth, requireRole('organizer'), async (req, res) => {
  try {
    const eventId = parseInt(req.params.id, 10);
    const event = await getEvent(eventId);
    if (!event) return res.status(404).json({ error: 'Event not found.' });
    if (!canManageEvent(req.user, event)) return res.status(403).json({ error: 'Forbidden.' });
    const coverage = Math.min(20, Math.max(1, parseInt(req.body?.coverage ?? 2, 10)));
    const maxLoad = req.body?.max_load ? Math.max(1, parseInt(req.body.max_load, 10)) : null;
    const seed = req.body?.seed !== undefined ? parseInt(req.body.seed, 10) : eventId;
    const kind = req.body?.kind === 'calibration' ? 'calibration' : 'normal';
    const round = req.body?.round ? parseInt(req.body.round, 10) : 1;

    const judgesR = await db.query(
      `SELECT user_id FROM event_judges WHERE event_id=$1 AND status IN ('invited','active') ORDER BY user_id ASC`,
      [eventId]
    );
    const judges = judgesR.rows.map((x) => x.user_id);
    if (judges.length === 0) return res.status(400).json({ error: 'No eligible judges on the roster.' });
    const projsR = await db.query(
      `SELECT id FROM projects WHERE event_id=$1 AND status='submitted' ORDER BY id ASC`,
      [eventId]
    );
    const projects = projsR.rows.map((x) => x.id);
    if (projects.length === 0) return res.status(400).json({ error: 'No submitted projects to assign.' });

    // Deterministic seeded shuffle (mulberry32) → rotation deal for balance.
    const rand = mulberry32(Number.isFinite(seed) ? seed : eventId);
    const order = [...projects];
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    const exist = await db.query(
      `SELECT judge_id, project_id FROM judge_assignments WHERE event_id=$1 AND round=$2`,
      [eventId, round]
    );
    const have = new Set(exist.rows.map((x) => `${x.judge_id}:${x.project_id}`));
    const loadR = await db.query(
      `SELECT judge_id, COUNT(*)::int n FROM judge_assignments WHERE event_id=$1 AND round=$2 GROUP BY judge_id`,
      [eventId, round]
    );
    const load = new Map(loadR.rows.map((x) => [x.judge_id, x.n]));
    let created = 0;
    let skipped = 0;
    let unassigned = 0;
    for (let i = 0; i < order.length; i++) {
      let need = coverage;
      // Count judges already holding this project in this round.
      for (const jid of judges) {
        if (have.has(`${jid}:${order[i]}`)) need -= 1;
      }
      if (need <= 0) {
        skipped += 1;
        continue;
      }
      let dealt = 0;
      for (let k = 0; k < judges.length && dealt < need; k++) {
        const jid = judges[(i + k) % judges.length];
        if (have.has(`${jid}:${order[i]}`)) continue;
        if (maxLoad !== null && (load.get(jid) || 0) >= maxLoad) continue;
        // eslint-disable-next-line no-await-in-loop
        await db.query(
          `INSERT INTO judge_assignments (event_id, judge_id, project_id, kind, round) VALUES ($1,$2,$3,$4,$5)`,
          [eventId, jid, order[i], kind, round]
        );
        have.add(`${jid}:${order[i]}`);
        load.set(jid, (load.get(jid) || 0) + 1);
        created += 1;
        dealt += 1;
      }
      if (dealt < need) unassigned += 1;
    }
    await audit(req.user.id, eventId, 'assignment.batch', 'event', eventId, { kind, round, coverage, maxLoad, seed, created, skipped, unassigned });
    return res.status(201).json({
      created, skipped_existing: skipped, unassigned_projects: unassigned,
      judges: judges.length, projects: projects.length, coverage, kind, round,
      loads: judges.map((jid) => ({ judge_id: jid, assigned: load.get(jid) || 0 })),
    });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('[judging/batch]', e.message);
    return res.status(500).json({ error: 'Batch assignment failed.' });
  }
});

// GET /api/judging/events/:id/assignments — organizer view (paginated, filterable)
router.get('/events/:id/assignments', requireAuth, requireRole('organizer'), async (req, res) => {
  try {
    const eventId = parseInt(req.params.id, 10);
    const event = await getEvent(eventId);
    if (!event) return res.status(404).json({ error: 'Event not found.' });
    if (!canManageEvent(req.user, event)) return res.status(403).json({ error: 'Forbidden.' });
    const page = Math.max(1, parseInt(req.query.page || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit || '20', 10)));
    const offset = (page - 1) * limit;
    const conds = ['a.event_id=$1'];
    const params = [eventId];
    if (req.query.judge_id) {
      params.push(parseInt(req.query.judge_id, 10));
      conds.push(`a.judge_id=$${params.length}`);
    }
    if (['pending', 'submitted'].includes(req.query.status)) {
      params.push(req.query.status);
      conds.push(`a.status=$${params.length}`);
    }
    if (['normal', 'calibration'].includes(req.query.kind)) {
      params.push(req.query.kind);
      conds.push(`a.kind=$${params.length}`);
    }
    const where = 'WHERE ' + conds.join(' AND ');
    const c = await db.query(`SELECT COUNT(*)::int n FROM judge_assignments a ${where}`, params);
    const r = await db.query(
      `SELECT a.*, p.title AS project_title, t.name AS team_name, u.name AS judge_name,
        e.raw_total, e.status AS eval_status
       FROM judge_assignments a
       JOIN projects p ON p.id=a.project_id
       JOIN teams t ON t.id=p.team_id
       JOIN users u ON u.id=a.judge_id
       LEFT JOIN evaluations e ON e.assignment_id=a.id
       ${where} ORDER BY a.id ASC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset]
    );
    return res.json({ data: r.rows, page, limit, total: c.rows[0].n, totalPages: Math.ceil(c.rows[0].n / limit) });
  } catch (e) {
    return res.status(500).json({ error: 'Failed to load assignments.' });
  }
});

// DELETE /api/judging/assignments/:id — reassign support (blocked after submit)
router.delete('/assignments/:id', requireAuth, requireRole('organizer'), async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const a = await db.query('SELECT * FROM judge_assignments WHERE id=$1', [id]);
    if (a.rows.length === 0) return res.status(404).json({ error: 'Assignment not found.' });
    const event = await getEvent(a.rows[0].event_id);
    if (!canManageEvent(req.user, event)) return res.status(403).json({ error: 'Forbidden.' });
    const ev = await db.query(`SELECT * FROM evaluations WHERE assignment_id=$1`, [id]);
    if (ev.rows.length > 0 && ev.rows[0].status === 'submitted')
      return res.status(400).json({ error: 'Cannot remove an assignment with a submitted evaluation.' });
    await db.query('DELETE FROM judge_assignments WHERE id=$1', [id]);
    await audit(req.user.id, event.id, 'assignment.removed', 'judge_assignment', id, { judge_id: a.rows[0].judge_id, project_id: a.rows[0].project_id });
    return res.json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: 'Failed to remove assignment.' });
  }
});

// GET /api/judging/mine — judge's own assignment queue (never others')
router.get('/mine', requireAuth, async (req, res) => {
  try {
    const status = ['pending', 'submitted'].includes(req.query.status) ? req.query.status : null;
    const params = [req.user.id];
    let extra = '';
    if (status) {
      params.push(status);
      extra = `AND a.status=$${params.length}`;
    }
    if (req.query.event_id) {
      params.push(parseInt(req.query.event_id, 10));
      extra += ` AND a.event_id=$${params.length}`;
    }
    const r = await db.query(
      `SELECT a.*, p.title AS project_title, t.name AS team_name, e.title AS event_title,
        et.name AS track_name, ev.status AS eval_status, ev.raw_total
       FROM judge_assignments a
       JOIN projects p ON p.id=a.project_id
       JOIN teams t ON t.id=p.team_id
       JOIN events e ON e.id=a.event_id
       LEFT JOIN event_tracks et ON et.id=p.track_id
       LEFT JOIN evaluations ev ON ev.assignment_id=a.id
       WHERE a.judge_id=$1 ${extra} ORDER BY a.id ASC`,
      params
    );
    // Judge progress summary (own only).
    const done = r.rows.filter((x) => x.status === 'submitted').length;
    return res.json({ data: r.rows.map(publicAssignment), assigned: r.rows.length, completed: done, remaining: r.rows.length - done });
  } catch (e) {
    return res.status(500).json({ error: 'Failed to load assignments.' });
  }
});

// GET /api/judging/assignments/:id — scoped detail (owner judge or organizer)
router.get('/assignments/:id', requireAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const a = await db.query(
      `SELECT a.*, p.title AS project_title, p.description AS project_description,
        p.track_id, t.name AS team_name, e.title AS event_title, et.name AS track_name
       FROM judge_assignments a
       JOIN projects p ON p.id=a.project_id
       JOIN teams t ON t.id=p.team_id
       JOIN events e ON e.id=a.event_id
       LEFT JOIN event_tracks et ON et.id=p.track_id
       WHERE a.id=$1 LIMIT 1`,
      [id]
    );
    if (a.rows.length === 0) return res.status(404).json({ error: 'Assignment not found.' });
    const row = a.rows[0];
    const event = await getEvent(row.event_id);
    const isOwner = row.judge_id === req.user.id;
    if (!isOwner && !canManageEvent(req.user, event))
      return res.status(403).json({ error: 'Only the assigned judge can open this.' });
    const links = await db.query('SELECT * FROM project_links WHERE project_id=$1 ORDER BY position ASC, id ASC', [row.project_id]);
    const rubric = await getActiveRubric(row.event_id);
    let evaluation = null;
    // Judges see ONLY their own evaluation; organizers may inspect it.
    if (isOwner || canManageEvent(req.user, event)) {
      const ev = await db.query('SELECT * FROM evaluations WHERE assignment_id=$1 LIMIT 1', [id]);
      evaluation = ev.rows[0] || null;
    }
    const ej = await getEventJudge(row.event_id, row.judge_id);
    return res.json({ ...row, links: links.rows, rubric, evaluation, judge_status: ej ? ej.status : null });
  } catch (e) {
    return res.status(500).json({ error: 'Failed to load assignment.' });
  }
});

/* ---------------- evaluations ---------------- */

// PUT /api/judging/evaluations/assignment/:assignmentId — save draft / submit
router.put('/evaluations/assignment/:assignmentId', requireAuth, async (req, res) => {
  try {
    const assignmentId = parseInt(req.params.assignmentId, 10);
    const a = await db.query('SELECT * FROM judge_assignments WHERE id=$1', [assignmentId]);
    if (a.rows.length === 0) return res.status(404).json({ error: 'Assignment not found.' });
    const row = a.rows[0];
    if (row.judge_id !== req.user.id)
      return res.status(403).json({ error: "You can only evaluate your own assignments." });
    const ej = await getEventJudge(row.event_id, req.user.id);
    if (!ej) return res.status(403).json({ error: 'You are not a judge for this event.' });
    if (ej.status === 'suspended') return res.status(403).json({ error: 'Your judging access is suspended.' });
    if (ej.status === 'completed') return res.status(403).json({ error: 'Your judging is marked complete (read-only).' });
    const existing = await db.query('SELECT * FROM evaluations WHERE assignment_id=$1 LIMIT 1', [assignmentId]);
    if (existing.rows.length > 0 && existing.rows[0].status === 'submitted')
      return res.status(409).json({ error: 'Evaluation already submitted. Ask an organizer to reopen it.' });
    // Rubric: active rubric, or the draft's original rubric (version stability).
    let rubric = await getActiveRubric(row.event_id);
    if (existing.rows.length > 0) {
      const orig = await db.query('SELECT * FROM rubrics WHERE id=$1', [existing.rows[0].rubric_id]);
      if (orig.rows.length > 0) {
        rubric = orig.rows[0];
        const oc = await db.query('SELECT * FROM rubric_criteria WHERE rubric_id=$1 ORDER BY position ASC, id ASC', [rubric.id]);
        rubric.criteria = oc.rows;
      }
    }
    if (!rubric) return res.status(400).json({ error: 'No rubric configured for this event yet.' });
    const { scores, feedback, submit } = req.body || {};
    const forSubmit = !!submit;
    const { errors, total, clean } = computeRawTotal(scores || {}, rubric.criteria, forSubmit);
    if (errors.length > 0) return res.status(400).json({ error: 'Validation failed.', details: errors });
    let evaluation;
    if (existing.rows.length > 0) {
      const merged = { ...(existing.rows[0].scores || {}), ...clean };
      const recalc = computeRawTotal(merged, rubric.criteria, false);
      const upd = await db.query(
        `UPDATE evaluations SET scores=$1, raw_total=$2, feedback=$3, status=$4, submitted_at=$5, updated_at=now()
         WHERE id=$6 RETURNING *`,
        [
          JSON.stringify(merged), recalc.total, String(feedback ?? existing.rows[0].feedback ?? ''),
          forSubmit ? 'submitted' : 'draft', forSubmit ? new Date().toISOString() : null,
          existing.rows[0].id,
        ]
      );
      evaluation = upd.rows[0];
    } else {
      const ins = await db.query(
        `INSERT INTO evaluations (assignment_id, rubric_id, scores, raw_total, feedback, status, submitted_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
        [
          assignmentId, rubric.id, JSON.stringify(clean), total, String(feedback || ''),
          forSubmit ? 'submitted' : 'draft', forSubmit ? new Date().toISOString() : null,
        ]
      );
      evaluation = ins.rows[0];
    }
    if (forSubmit) {
      await db.query(`UPDATE judge_assignments SET status='submitted' WHERE id=$1`, [assignmentId]);
      if (ej.status === 'invited') {
        await db.query(`UPDATE event_judges SET status='active', updated_at=now() WHERE id=$1`, [ej.id]);
      }
      await audit(req.user.id, row.event_id, 'evaluation.submitted', 'evaluation', evaluation.id, {
        assignment_id: assignmentId, project_id: row.project_id, raw_total: evaluation.raw_total,
      });
    }
    return res.json(evaluation);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('[judging/evaluate]', e.message);
    return res.status(500).json({ error: 'Failed to save evaluation.' });
  }
});

// GET /api/judging/evaluations/:id — owner judge or organizer only
router.get('/evaluations/:id', requireAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const r = await db.query(
      `SELECT e.*, a.judge_id, a.event_id, a.project_id FROM evaluations e
       JOIN judge_assignments a ON a.id=e.assignment_id WHERE e.id=$1 LIMIT 1`,
      [id]
    );
    if (r.rows.length === 0) return res.status(404).json({ error: 'Evaluation not found.' });
    const row = r.rows[0];
    const event = await getEvent(row.event_id);
    if (row.judge_id !== req.user.id && !canManageEvent(req.user, event))
      return res.status(403).json({ error: "You cannot read another judge's evaluation." });
    const crit = await db.query('SELECT * FROM rubric_criteria WHERE rubric_id=$1 ORDER BY position ASC, id ASC', [row.rubric_id]);
    return res.json({ ...row, criteria: crit.rows });
  } catch (e) {
    return res.status(500).json({ error: 'Failed to load evaluation.' });
  }
});

// POST /api/judging/evaluations/:id/reopen — organizer only, audited
router.post('/evaluations/:id/reopen', requireAuth, requireRole('organizer'), async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const r = await db.query(
      `SELECT e.*, a.event_id, a.judge_id FROM evaluations e
       JOIN judge_assignments a ON a.id=e.assignment_id WHERE e.id=$1 LIMIT 1`,
      [id]
    );
    if (r.rows.length === 0) return res.status(404).json({ error: 'Evaluation not found.' });
    const event = await getEvent(r.rows[0].event_id);
    if (!canManageEvent(req.user, event)) return res.status(403).json({ error: 'Forbidden.' });
    if (r.rows[0].status !== 'submitted')
      return res.status(400).json({ error: 'Only submitted evaluations need reopening.' });
    await db.query(`UPDATE evaluations SET status='draft', submitted_at=NULL, updated_at=now() WHERE id=$1`, [id]);
    await db.query(`UPDATE judge_assignments SET status='pending' WHERE id=$1`, [r.rows[0].assignment_id]);
    await audit(req.user.id, event.id, 'evaluation.reopened', 'evaluation', id, {
      judge_id: r.rows[0].judge_id, reason: String(req.body?.reason || ''),
    });
    const upd = await db.query('SELECT * FROM evaluations WHERE id=$1', [id]);
    return res.json(upd.rows[0]);
  } catch (e) {
    return res.status(500).json({ error: 'Failed to reopen evaluation.' });
  }
});

/* ---------------- judge progress (organizer) ---------------- */

router.get('/events/:id/progress', requireAuth, requireRole('organizer'), async (req, res) => {
  try {
    const eventId = parseInt(req.params.id, 10);
    const event = await getEvent(eventId);
    if (!event) return res.status(404).json({ error: 'Event not found.' });
    if (!canManageEvent(req.user, event)) return res.status(403).json({ error: 'Forbidden.' });
    const judges = await db.query(
      `SELECT ej.*, u.name, u.email FROM event_judges ej JOIN users u ON u.id=ej.user_id
       WHERE ej.event_id=$1 ORDER BY u.name ASC`,
      [eventId]
    );
    const agg = await db.query(
      `SELECT a.judge_id,
        COUNT(*)::int AS assigned,
        COUNT(CASE WHEN a.status='submitted' THEN 1 END)::int AS completed,
        AVG(CASE WHEN e.status='submitted' THEN e.raw_total END)::float AS avg_raw,
        MIN(CASE WHEN e.status='submitted' THEN e.raw_total END)::float AS min_raw,
        MAX(CASE WHEN e.status='submitted' THEN e.raw_total END)::float AS max_raw
       FROM judge_assignments a LEFT JOIN evaluations e ON e.assignment_id=a.id
       WHERE a.event_id=$1 GROUP BY a.judge_id`,
      [eventId]
    );
    const m = new Map(agg.rows.map((x) => [x.judge_id, x]));
    const rows = judges.rows.map((j) => {
      const s = m.get(j.user_id) || { assigned: 0, completed: 0, avg_raw: null, min_raw: null, max_raw: null };
      const pct = s.assigned > 0 ? Math.round((s.completed / s.assigned) * 100) : 0;
      return {
        judge_id: j.user_id, name: j.name, email: j.email, status: j.status,
        assigned: s.assigned, completed: s.completed, remaining: s.assigned - s.completed,
        pct, avg_raw: s.avg_raw, min_raw: s.min_raw, max_raw: s.max_raw,
      };
    });
    return res.json(rows);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('[judging/progress]', e.message);
    return res.status(500).json({ error: 'Failed to load progress.' });
  }
});

// POST /api/judging/events/:id/calibration/runs — start a run (reference + mode)
router.post('/events/:id/calibration/runs', requireAuth, requireRole('organizer'), async (req, res) => {
  try {
    const eventId = parseInt(req.params.id, 10);
    const event = await getEvent(eventId);
    if (!event) return res.status(404).json({ error: 'Event not found.' });
    if (!canManageEvent(req.user, event)) return res.status(403).json({ error: 'Forbidden.' });
    const { reference_judge_id, mode } = req.body || {};
    const refId = parseInt(reference_judge_id, 10);
    const m = MODES[mode] ? mode : 'ONE_LOW_ONE_HIGH';
    if (!refId) return res.status(400).json({ error: 'reference_judge_id is required.' });
    const ej = await getEventJudge(eventId, refId);
    if (!ej) return res.status(400).json({ error: 'Reference judge is not on this event roster.' });
    const ver = await db.query('SELECT COALESCE(MAX(version),0)::int v FROM calibration_runs WHERE event_id=$1', [eventId]);
    const ins = await db.query(
      `INSERT INTO calibration_runs (event_id, reference_judge_id, mode, version, status, created_by)
       VALUES ($1,$2,$3,$4,'pending',$5) RETURNING *`,
      [eventId, refId, m, ver.rows[0].v + 1, req.user.id]
    );
    await audit(req.user.id, eventId, 'calibration.started', 'calibration_run', ins.rows[0].id, { reference_judge_id: refId, mode: m, version: ins.rows[0].version });
    return res.status(201).json(ins.rows[0]);
  } catch (e) {
    return res.status(500).json({ error: 'Failed to start calibration run.' });
  }
});

// POST /api/judging/calibration/runs/:runId/assign — shared calibration assignments
router.post('/calibration/runs/:runId/assign', requireAuth, requireRole('organizer'), async (req, res) => {
  try {
    const runId = parseInt(req.params.runId, 10);
    const run = await db.query('SELECT * FROM calibration_runs WHERE id=$1', [runId]);
    if (run.rows.length === 0) return res.status(404).json({ error: 'Calibration run not found.' });
    const event = await getEvent(run.rows[0].event_id);
    if (!canManageEvent(req.user, event)) return res.status(403).json({ error: 'Forbidden.' });
    const { project_ids } = req.body || {};
    if (!Array.isArray(project_ids) || project_ids.length === 0)
      return res.status(400).json({ error: 'project_ids (shared calibration projects) are required.' });
    const pids = [...new Set(project_ids.map((x) => parseInt(x, 10)).filter(Boolean))].slice(0, 50);
    if (pids.length === 0) return res.status(400).json({ error: 'No valid project ids.' });
    const inList = pids.map((_, i) => `$${i + 2}`).join(',');
    const chk = await db.query(`SELECT id FROM projects WHERE event_id=$1 AND status='submitted' AND id IN (${inList})`, [event.id, ...pids]);
    const valid = new Set(chk.rows.map((x) => x.id));
    const bad = pids.filter((x) => !valid.has(x));
    if (bad.length > 0) return res.status(400).json({ error: 'Only submitted projects of this event can be calibration anchors.', invalid: bad });
    const judges = await db.query(
      `SELECT user_id FROM event_judges WHERE event_id=$1 AND status IN ('invited','active') ORDER BY user_id ASC`,
      [event.id]
    );
    let created = 0;
    let skipped = 0;
    for (const j of judges.rows) {
      for (const pid of pids) {
        // eslint-disable-next-line no-await-in-loop
        const ex = await db.query(
          `SELECT id FROM judge_assignments WHERE judge_id=$1 AND project_id=$2 AND round=$3 LIMIT 1`,
          [j.user_id, pid, 1]
        );
        if (ex.rows.length > 0) {
          skipped += 1;
          continue;
        }
        // eslint-disable-next-line no-await-in-loop
        await db.query(
          `INSERT INTO judge_assignments (event_id, judge_id, project_id, kind, round) VALUES ($1,$2,$3,'calibration',1)`,
          [event.id, j.user_id, pid]
        );
        created += 1;
      }
    }
    await audit(req.user.id, event.id, 'calibration.assigned', 'calibration_run', runId, { project_ids: pids, created, skipped });
    return res.status(201).json({ created, skipped_existing: skipped, judges: judges.rows.length, project_ids: pids });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('[judging/calassign]', e.message);
    return res.status(500).json({ error: 'Failed to create calibration assignments.' });
  }
});

// POST /api/judging/calibration/runs/:runId/calculate — two-point normalization
router.post('/calibration/runs/:runId/calculate', requireAuth, requireRole('organizer'), async (req, res) => {
  try {
    const runId = parseInt(req.params.runId, 10);
    const runR = await db.query('SELECT * FROM calibration_runs WHERE id=$1', [runId]);
    if (runR.rows.length === 0) return res.status(404).json({ error: 'Calibration run not found.' });
    const run = runR.rows[0];
    const event = await getEvent(run.event_id);
    if (!canManageEvent(req.user, event)) return res.status(403).json({ error: 'Forbidden.' });

    // Fresh recompute for this run (raw evaluations untouched — versioning via runs).
    await db.query('DELETE FROM normalized_scores WHERE run_id=$1', [runId]);
    await db.query('DELETE FROM judge_calibrations WHERE run_id=$1', [runId]);

    const evalsR = await db.query(
      `SELECT e.*, a.judge_id, a.project_id FROM evaluations e
       JOIN judge_assignments a ON a.id=e.assignment_id
       WHERE a.event_id=$1 AND e.status='submitted' ORDER BY e.id ASC`,
      [event.id]
    );
    const byJudge = new Map();
    for (const ev of evalsR.rows) {
      if (!byJudge.has(ev.judge_id)) byJudge.set(ev.judge_id, []);
      byJudge.get(ev.judge_id).push(ev);
    }
    const refEvals = byJudge.get(run.reference_judge_id) || [];
    if (refEvals.length === 0) {
      await db.query(`UPDATE calibration_runs SET status='failed' WHERE id=$1`, [runId]);
      await audit(req.user.id, event.id, 'calibration.calculated', 'calibration_run', runId, { status: 'failed', reason: 'REFERENCE_HAS_NO_SUBMITTED_EVALUATIONS' });
      return res.status(400).json({ error: 'Reference judge has no submitted evaluations.', code: 'PENDING_CALIBRATION' });
    }
    const refByProject = new Map(refEvals.map((e) => [e.project_id, e]));
    const calibIds = new Map();

    // Self-calibration row for the reference judge (identity transform).
    const refScores = refEvals.map((e) => e.raw_total);
    const refMin = Math.min(...refScores);
    const refMax = Math.max(...refScores);
    const refMinEv = refEvals.find((e) => e.raw_total === refMin);
    const refMaxEv = refEvals.find((e) => e.raw_total === refMax);
    const selfIns = await db.query(
      `INSERT INTO judge_calibrations
        (run_id, source_judge_id, target_judge_id, low_anchor_project_id, high_anchor_project_id,
         source_low, source_high, target_low, target_high, slope, intercept, status, reason, evidence)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,1,0,'VALID','self', '[]') RETURNING *`,
      [runId, run.reference_judge_id, run.reference_judge_id,
        refMinEv ? refMinEv.project_id : null, refMaxEv ? refMaxEv.project_id : null,
        refMin, refMax, refMin, refMax]
    );
    calibIds.set(run.reference_judge_id, selfIns.rows[0].id);

    const summary = { valid: 1, invalid: 0, insufficient: 0, suspicious: 0 };
    for (const [judgeId, list] of byJudge) {
      if (judgeId === run.reference_judge_id) continue;
      // Shared pairs: SAME project submitted by both judges.
      const pairs = [];
      for (const ev of list) {
        const ref = refByProject.get(ev.project_id);
        if (ref) pairs.push({ project_id: ev.project_id, sourceScore: ev.raw_total, targetScore: ref.raw_total });
      }
      const sel = selectAnchors(pairs, run.mode);
      let row;
      if (sel.status !== STATUSES.VALID) {
        // eslint-disable-next-line no-await-in-loop
        const ins = await db.query(
          `INSERT INTO judge_calibrations
            (run_id, source_judge_id, target_judge_id, status, reason, evidence)
           VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
          [runId, judgeId, run.reference_judge_id, sel.status, sel.reason, JSON.stringify(pairs)]
        );
        row = ins.rows[0];
        if (sel.status === STATUSES.INSUFFICIENT) summary.insufficient += 1;
        else summary.invalid += 1;
      } else {
        const t = strategy.computeTransformation({
          sourceLow: sel.low.sourceScore, sourceHigh: sel.high.sourceScore,
          targetLow: sel.low.targetScore, targetHigh: sel.high.targetScore,
        });
        // eslint-disable-next-line no-await-in-loop
        const ins = await db.query(
          `INSERT INTO judge_calibrations
            (run_id, source_judge_id, target_judge_id, low_anchor_project_id, high_anchor_project_id,
             source_low, source_high, target_low, target_high, slope, intercept, status, reason, evidence)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
          [runId, judgeId, run.reference_judge_id,
            sel.low.project_id, sel.high.project_id,
            sel.low.sourceScore, sel.high.sourceScore, sel.low.targetScore, sel.high.targetScore,
            t.slope, t.intercept, t.status, t.reason, JSON.stringify(sel.extras)]
        );
        row = ins.rows[0];
        if (t.status === STATUSES.VALID) summary.valid += 1;
        else if (t.status === STATUSES.SUSPICIOUS) summary.suspicious += 1;
        else summary.invalid += 1;
      }
      calibIds.set(judgeId, row.id);
    }

    // Normalized scores for every submitted evaluation.
    const calibByJudge = new Map();
    const calR = await db.query('SELECT * FROM judge_calibrations WHERE run_id=$1', [runId]);
    for (const c of calR.rows) calibByJudge.set(c.source_judge_id, c);
    let normalized = 0;
    let extrapolated = 0;
    for (const ev of evalsR.rows) {
      const cal = calibByJudge.get(ev.judge_id);
      let nScore = null;
      let nStatus = STATUSES.PENDING;
      let nExtrap = false;
      if (cal && cal.status === STATUSES.VALID) {
        const ap = strategy.applyTransformation(ev.raw_total, {
          slope: cal.slope, intercept: cal.intercept,
          sourceLow: cal.source_low, sourceHigh: cal.source_high,
        });
        nScore = ap.normalized;
        nExtrap = ap.extrapolated;
        nStatus = ap.extrapolated ? STATUSES.EXTRAPOLATED : STATUSES.VALID;
        if (ap.extrapolated) extrapolated += 1;
        normalized += 1;
      } else if (cal) {
        nStatus = cal.status;
      }
      // eslint-disable-next-line no-await-in-loop
      await db.query(
        `INSERT INTO normalized_scores (run_id, evaluation_id, project_id, judge_id, raw_score, normalized_score, extrapolated, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [runId, ev.id, ev.project_id, ev.judge_id, ev.raw_total, nScore, nExtrap, nStatus]
      );
    }
    await db.query(`UPDATE calibration_runs SET status='complete' WHERE id=$1`, [runId]);
    await audit(req.user.id, event.id, 'calibration.calculated', 'calibration_run', runId, {
      ...summary, normalized, extrapolated, strategy: strategy.name,
    });
    return res.json({ run_id: runId, status: 'complete', summary: { ...summary, normalized, extrapolated } });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('[judging/calculate]', e.message);
    return res.status(500).json({ error: 'Calibration calculation failed.' });
  }
});

// GET /api/judging/events/:id/calibration/runs — run history
router.get('/events/:id/calibration/runs', requireAuth, requireRole('organizer'), async (req, res) => {
  try {
    const eventId = parseInt(req.params.id, 10);
    const event = await getEvent(eventId);
    if (!event) return res.status(404).json({ error: 'Event not found.' });
    if (!canManageEvent(req.user, event)) return res.status(403).json({ error: 'Forbidden.' });
    const r = await db.query(
      `SELECT cr.*, u.name AS reference_judge_name FROM calibration_runs cr
       JOIN users u ON u.id=cr.reference_judge_id
       WHERE cr.event_id=$1 ORDER BY cr.version DESC`,
      [eventId]
    );
    const rows = r.rows;
    for (const row of rows) {
      // eslint-disable-next-line no-await-in-loop
      const c1 = await db.query('SELECT COUNT(*)::int n FROM judge_calibrations WHERE run_id=$1', [row.id]);
      // eslint-disable-next-line no-await-in-loop
      const c2 = await db.query('SELECT COUNT(*)::int n FROM normalized_scores WHERE run_id=$1', [row.id]);
      row.calibrations = c1.rows[0].n;
      row.normalized = c2.rows[0].n;
    }
    return res.json(rows);
  } catch (e) {
    return res.status(500).json({ error: 'Failed to load calibration runs.' });
  }
});

// GET /api/judging/calibration/runs/:runId — dashboard table data
router.get('/calibration/runs/:runId', requireAuth, requireRole('organizer'), async (req, res) => {
  try {
    const runId = parseInt(req.params.runId, 10);
    const runR = await db.query(
      `SELECT cr.*, u.name AS reference_judge_name FROM calibration_runs cr
       JOIN users u ON u.id=cr.reference_judge_id WHERE cr.id=$1`,
      [runId]
    );
    if (runR.rows.length === 0) return res.status(404).json({ error: 'Run not found.' });
    const event = await getEvent(runR.rows[0].event_id);
    if (!canManageEvent(req.user, event)) return res.status(403).json({ error: 'Forbidden.' });
    const cal = await db.query(
      `SELECT jc.*, su.name AS source_name, tu.name AS target_name,
        pl.title AS low_anchor_title, ph.title AS high_anchor_title
       FROM judge_calibrations jc
       JOIN users su ON su.id=jc.source_judge_id
       JOIN users tu ON tu.id=jc.target_judge_id
       LEFT JOIN projects pl ON pl.id=jc.low_anchor_project_id
       LEFT JOIN projects ph ON ph.id=jc.high_anchor_project_id
       WHERE jc.run_id=$1 ORDER BY su.name ASC`,
      [runId]
    );
    const counts = await db.query(
      `SELECT COUNT(*)::int AS normalized,
        COUNT(CASE WHEN extrapolated THEN 1 END)::int AS extrapolated
       FROM normalized_scores WHERE run_id=$1`,
      [runId]
    );
    return res.json({ run: runR.rows[0], calibrations: cal.rows, counts: counts.rows[0] });
  } catch (e) {
    return res.status(500).json({ error: 'Failed to load calibration run.' });
  }
});

/* ---------------- results, explanation, export, audit ---------------- */

async function buildResults(eventId, runId) {
  // Latest complete run by default.
  let run = null;
  if (runId) {
    const r = await db.query('SELECT * FROM calibration_runs WHERE id=$1 AND event_id=$2', [runId, eventId]);
    run = r.rows[0] || null;
  } else {
    const r = await db.query(
      `SELECT * FROM calibration_runs WHERE event_id=$1 AND status='complete' ORDER BY version DESC LIMIT 1`,
      [eventId]
    );
    run = r.rows[0] || null;
  }
  if (!run) return { run: null, finals: [], rows: [], calibrations: [], calByJudge: new Map() };

  const norm = await db.query(
    `SELECT ns.*, p.title AS project_title, t.name AS team_name, u.name AS judge_name
     FROM normalized_scores ns
     JOIN projects p ON p.id=ns.project_id
     JOIN teams t ON t.id=p.team_id
     JOIN users u ON u.id=ns.judge_id
     WHERE ns.run_id=$1 ORDER BY p.id ASC, u.name ASC`,
    [run.id]
  );
  const cal = await db.query(
    `SELECT jc.*, su.name AS source_name FROM judge_calibrations jc
     JOIN users su ON su.id=jc.source_judge_id WHERE jc.run_id=$1`,
    [run.id]
  );
  const calByJudge = new Map(cal.rows.map((c) => [c.source_judge_id, c]));

  // Per-project aggregation (only VALID + EXTRAPOLATED participate).
  const byProject = new Map();
  for (const n of norm.rows) {
    if (!byProject.has(n.project_id)) {
      byProject.set(n.project_id, { project_id: n.project_id, title: n.project_title, team: n.team_name, raws: [], norms: [], judges: [] });
    }
    const g = byProject.get(n.project_id);
    g.raws.push(n.raw_score);
    g.judges.push({ judge_id: n.judge_id, judge: n.judge_name, raw: n.raw_score, normalized: n.normalized_score, status: n.status, extrapolated: n.extrapolated, evaluation_id: n.evaluation_id, normalized_id: n.id });
    if ((n.status === 'VALID' || n.status === 'EXTRAPOLATED') && Number.isFinite(n.normalized_score)) {
      g.norms.push(n.normalized_score);
    }
  }
  // Pending/invalid/excluded visibility from assignments + evaluations.
  const pend = await db.query(
    `SELECT a.project_id,
      COUNT(CASE WHEN a.status='pending' THEN 1 END)::int AS pending,
      COUNT(CASE WHEN e.status='invalid' THEN 1 END)::int AS invalid,
      COUNT(CASE WHEN e.status='excluded' THEN 1 END)::int AS excluded
     FROM judge_assignments a LEFT JOIN evaluations e ON e.assignment_id=a.id
     WHERE a.event_id=$1 GROUP BY a.project_id`,
    [eventId]
  );
  const pendMap = new Map(pend.rows.map((x) => [x.project_id, x]));
  const mean = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : null);
  const std = (a) => {
    if (a.length < 2) return 0;
    const m = mean(a);
    return Math.sqrt(a.reduce((s, v) => s + (v - m) * (v - m), 0) / a.length);
  };
  const finals = [...byProject.values()].map((g) => {
    const p = pendMap.get(g.project_id) || { pending: 0, invalid: 0, excluded: 0 };
    return {
      project_id: g.project_id, title: g.title, team: g.team,
      n_judges: g.judges.length,
      raw_avg: mean(g.raws), normalized_avg: mean(g.norms),
      raw_min: g.raws.length ? Math.min(...g.raws) : null,
      raw_max: g.raws.length ? Math.max(...g.raws) : null,
      norm_min: g.norms.length ? Math.min(...g.norms) : null,
      norm_max: g.norms.length ? Math.max(...g.norms) : null,
      stddev: std(g.norms),
      pending: p.pending, invalid: p.invalid, excluded: p.excluded,
      judges: g.judges,
    };
  }).sort((a, b) => (b.normalized_avg ?? -Infinity) - (a.normalized_avg ?? -Infinity));
  return { run, finals, rows: norm.rows, calibrations: cal.rows, calByJudge };
}

// GET /api/judging/events/:id/results — organizer-only analytics
router.get('/events/:id/results', requireAuth, requireRole('organizer'), async (req, res) => {
  try {
    const eventId = parseInt(req.params.id, 10);
    const event = await getEvent(eventId);
    if (!event) return res.status(404).json({ error: 'Event not found.' });
    if (!canManageEvent(req.user, event)) return res.status(403).json({ error: 'Forbidden.' });
    const { run, finals, calibrations } = await buildResults(eventId, req.query.run_id ? parseInt(req.query.run_id, 10) : null);
    if (!run) return res.json({ run: null, finals: [], calibrations: [], message: 'No completed calibration run yet.' });
    return res.json({ run, finals, calibrations });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('[judging/results]', e.message);
    return res.status(500).json({ error: 'Failed to build results.' });
  }
});

// GET /api/judging/normalized/:id — "why is this score?" (organizer, or owner judge)
router.get('/normalized/:id', requireAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const r = await db.query(
      `SELECT ns.*, su.name AS source_name, tu.name AS target_name, p.title AS project_title
       FROM normalized_scores ns
       JOIN calibration_runs cr ON cr.id=ns.run_id
       JOIN users su ON su.id=ns.judge_id
       JOIN users tu ON tu.id=cr.reference_judge_id
       JOIN projects p ON p.id=ns.project_id
       WHERE ns.id=$1 LIMIT 1`,
      [id]
    );
    if (r.rows.length === 0) return res.status(404).json({ error: 'Normalized score not found.' });
    const n = r.rows[0];
    const evR = await db.query(
      `SELECT a.event_id FROM evaluations e JOIN judge_assignments a ON a.id=e.assignment_id WHERE e.id=$1`,
      [n.evaluation_id]
    );
    const event = await getEvent(evR.rows[0].event_id);
    const isOwner = n.judge_id === req.user.id;
    if (!isOwner && !canManageEvent(req.user, event))
      return res.status(403).json({ error: 'Forbidden.' });
    const c = await db.query('SELECT * FROM judge_calibrations WHERE run_id=$1 AND source_judge_id=$2 LIMIT 1', [n.run_id, n.judge_id]);
    const cal = c.rows[0] || null;
    let lowTitle = null;
    let highTitle = null;
    if (cal && cal.low_anchor_project_id) {
      const t = await db.query('SELECT title FROM projects WHERE id=$1', [cal.low_anchor_project_id]);
      lowTitle = t.rows[0] ? t.rows[0].title : null;
    }
    if (cal && cal.high_anchor_project_id) {
      const t = await db.query('SELECT title FROM projects WHERE id=$1', [cal.high_anchor_project_id]);
      highTitle = t.rows[0] ? t.rows[0].title : null;
    }
    // Include the run's reference judge id for display.
    const runR = await db.query('SELECT reference_judge_id, mode, version FROM calibration_runs WHERE id=$1', [n.run_id]);
    const explanation = cal && cal.status === 'VALID'
      ? explainNormalization({
        raw: n.raw_score, sourceJudgeName: n.source_name, targetJudgeName: n.target_name,
        lowAnchor: { project_id: cal.low_anchor_project_id, sourceScore: cal.source_low, targetScore: cal.target_low },
        highAnchor: { project_id: cal.high_anchor_project_id, sourceScore: cal.source_high, targetScore: cal.target_high },
        slope: cal.slope, intercept: cal.intercept, normalized: n.normalized_score,
      })
      : null;
    return res.json({ ...n, run: runR.rows[0], calibration: cal, low_anchor_title: lowTitle, high_anchor_title: highTitle, explanation });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('[judging/why]', e.message);
    return res.status(500).json({ error: 'Failed to explain score.' });
  }
});

function csvCell(v) {
  const s = v === null || v === undefined ? '' : String(v);
  return `"${s.replace(/"/g, '""')}"`;
}

// GET /api/judging/events/:id/results/export?level=evaluations|projects&run_id=
router.get('/events/:id/results/export', requireAuth, requireRole('organizer'), async (req, res) => {
  try {
    const eventId = parseInt(req.params.id, 10);
    const event = await getEvent(eventId);
    if (!event) return res.status(404).json({ error: 'Event not found.' });
    if (!canManageEvent(req.user, event)) return res.status(403).json({ error: 'Forbidden.' });
    const level = req.query.level === 'projects' ? 'projects' : 'evaluations';
    const { run, finals, rows, calByJudge } = await buildResults(eventId, req.query.run_id ? parseInt(req.query.run_id, 10) : null);
    if (!run) return res.status(400).json({ error: 'No completed calibration run to export.' });
    let csv = '';
    let filename = '';
    if (level === 'evaluations') {
      const head = ['project_id', 'project_name', 'judge_id', 'judge_name', 'raw_score', 'normalized_score', 'reference_judge', 'calibration_id', 'low_anchor_project_id', 'high_anchor_project_id', 'slope', 'intercept', 'final_score', 'evaluation_status', 'extrapolated'];
      const finalByProject = new Map(finals.map((f) => [f.project_id, f.normalized_avg]));
      const refName = (await db.query('SELECT name FROM users WHERE id=$1', [run.reference_judge_id])).rows[0].name;
      const lines = rows.map((n) => {
        const cal = calByJudge.get(n.judge_id) || {};
        return [n.project_id, n.project_title, n.judge_id, n.judge_name, n.raw_score, n.normalized_score ?? '', refName, cal.id ?? '', cal.low_anchor_project_id ?? '', cal.high_anchor_project_id ?? '', cal.slope ?? '', cal.intercept ?? '', finalByProject.get(n.project_id) ?? '', n.status, n.extrapolated ? 'true' : 'false'].map(csvCell).join(',');
      });
      csv = head.join(',') + '\n' + lines.join('\n');
      filename = `judging-evaluations-event${eventId}-run${run.version}.csv`;
    } else {
      const head = ['project_id', 'project_name', 'team', 'n_judges', 'raw_avg', 'normalized_avg', 'raw_min', 'raw_max', 'stddev', 'pending', 'invalid', 'excluded'];
      const lines = finals.map((f) => [f.project_id, f.title, f.team, f.n_judges, f.raw_avg ?? '', f.normalized_avg ?? '', f.raw_min ?? '', f.raw_max ?? '', Math.round((f.stddev || 0) * 100) / 100, f.pending, f.invalid, f.excluded].map(csvCell).join(','));
      csv = head.join(',') + '\n' + lines.join('\n');
      filename = `judging-results-event${eventId}-run${run.version}.csv`;
    }
    await audit(req.user.id, eventId, 'results.exported', 'calibration_run', run.id, { level, version: run.version });
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.send(csv);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('[judging/export]', e.message);
    return res.status(500).json({ error: 'Export failed.' });
  }
});

// GET /api/judging/events/:id/audit — organizer audit trail (paginated)
router.get('/events/:id/audit', requireAuth, requireRole('organizer'), async (req, res) => {
  try {
    const eventId = parseInt(req.params.id, 10);
    const event = await getEvent(eventId);
    if (!event) return res.status(404).json({ error: 'Event not found.' });
    if (!canManageEvent(req.user, event)) return res.status(403).json({ error: 'Forbidden.' });
    const page = Math.max(1, parseInt(req.query.page || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit || '30', 10)));
    const offset = (page - 1) * limit;
    const c = await db.query('SELECT COUNT(*)::int n FROM audit_events WHERE event_id=$1', [eventId]);
    const r = await db.query(
      `SELECT ae.*, u.name AS actor_name FROM audit_events ae
       LEFT JOIN users u ON u.id=ae.actor_id
       WHERE ae.event_id=$1 ORDER BY ae.id DESC LIMIT $2 OFFSET $3`,
      [eventId, limit, offset]
    );
    return res.json({ data: r.rows, page, limit, total: c.rows[0].n, totalPages: Math.ceil(c.rows[0].n / limit) });
  } catch (e) {
    return res.status(500).json({ error: 'Failed to load audit trail.' });
  }
});

/* ---------------- calibration (appended Tier-2 section) ---------------- */
module.exports = router;
