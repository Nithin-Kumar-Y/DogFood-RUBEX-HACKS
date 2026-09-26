'use strict';
const express = require('express');
const db = require('../db');
const { slugify, randomCode, validateEventInput } = require('../util');
const { requireAuth, requireRole } = require('../auth');

const router = express.Router();

// Public: list published events (paginated). Authenticated staff see more via ?scope=all.
router.get('/', async (req, res) => {
  try {
    const scope = String(req.query.scope || 'public');
    const page = Math.max(1, parseInt(req.query.page || '1', 10));
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit || '12', 10)));
    const offset = (page - 1) * limit;
    const q = String(req.query.q || '').trim();

    let where = '';
    const params = [];
    if (scope === 'all' && req.user && ['organizer', 'admin'].includes(req.user.role)) {
      where = 'WHERE 1=1';
    } else {
      where = `WHERE e.status = 'published'`;
    }
    if (q) {
      params.push(`%${q}%`);
      where += ` AND (e.title ILIKE $${params.length} OR e.description ILIKE $${params.length})`;
    }
    const countR = await db.query(`SELECT COUNT(*)::int AS c FROM events e ${where}`, params);
    const total = countR.rows[0].c;
    params.push(limit, offset);
    const r = await db.query(
      `SELECT e.*, u.name AS organizer_name
       FROM events e LEFT JOIN users u ON u.id = e.created_by
       ${where} ORDER BY e.starts_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    // Counts fetched separately (keeps queries simple, indexed, and portable).
    const rows = r.rows;
    if (rows.length > 0) {
      const ids = rows.map((x) => x.id);
      const inList = ids.map((_, i) => `$${i + 1}`).join(',');
      const [teams, projs, subs] = await Promise.all([
        db.query(`SELECT event_id, COUNT(*)::int c FROM teams WHERE event_id IN (${inList}) GROUP BY event_id`, ids),
        db.query(`SELECT event_id, COUNT(*)::int c FROM projects WHERE event_id IN (${inList}) GROUP BY event_id`, ids),
        db.query(`SELECT event_id, COUNT(*)::int c FROM projects WHERE event_id IN (${inList}) AND status='submitted' GROUP BY event_id`, ids),
      ]);
      const map = (arr) => new Map(arr.rows.map((x) => [x.event_id, x.c]));
      const tm = map(teams);
      const pm = map(projs);
      const sm = map(subs);
      for (const row of rows) {
        row.team_count = tm.get(row.id) || 0;
        row.project_count = pm.get(row.id) || 0;
        row.submitted_count = sm.get(row.id) || 0;
      }
    }
    return res.json({ data: rows, page, limit, total, totalPages: Math.ceil(total / limit) });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('[events/list]', e.message);
    return res.status(500).json({ error: 'Failed to list events.' });
  }
});

// Public: get single event (published) with tracks + prizes. Staff can view drafts.
router.get('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!id) return res.status(400).json({ error: 'Invalid event id.' });
    const r = await db.query(
      `SELECT e.*, u.name AS organizer_name FROM events e
       LEFT JOIN users u ON u.id = e.created_by WHERE e.id=$1 LIMIT 1`,
      [id]
    );
    if (r.rows.length === 0) return res.status(404).json({ error: 'Event not found.' });
    const ev = r.rows[0];
    const canSeeDraft =
      req.user && (req.user.role === 'admin' || req.user.role === 'organizer');
    if (ev.status !== 'published' && !canSeeDraft)
      return res.status(404).json({ error: 'Event not found.' });
    const tracks = await db.query(
      'SELECT * FROM event_tracks WHERE event_id=$1 ORDER BY position ASC, id ASC',
      [id]
    );
    const prizes = await db.query(
      'SELECT * FROM prizes WHERE event_id=$1 ORDER BY position ASC, id ASC',
      [id]
    );
    return res.json({ ...ev, tracks: tracks.rows, prizes: prizes.rows });
  } catch (e) {
    return res.status(500).json({ error: 'Failed to load event.' });
  }
});

// Organizer/Admin: create event
router.post('/', requireAuth, requireRole('organizer'), async (req, res) => {
  try {
    const b = req.body || {};
    const { errors, starts, ends, deadline } = validateEventInput(b);
    // Downgrade deadline-after-end from hard error to warning: allow but it was flagged.
    if (errors.submission_deadline && deadline && ends && deadline > ends) {
      // allow creation; frontend shows warning
      delete errors.submission_deadline;
    }
    if (Object.keys(errors).length > 0) return res.status(400).json({ errors });
    const title = String(b.title).trim();
    let slug = slugify(title) + '-' + randomCode(3);
    if (b.slug && String(b.slug).trim()) slug = slugify(b.slug) + '-' + randomCode(2);
    const description = String(b.description || '');
    const status = ['draft', 'published', 'archived'].includes(b.status) ? b.status : 'draft';
    const ins = await db.query(
      `INSERT INTO events (title, slug, description, starts_at, ends_at, submission_deadline, status, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [title, slug, description, starts.toISOString(), ends.toISOString(), deadline.toISOString(), status, req.user.id]
    );
    const event = ins.rows[0];
    // Optional inline tracks & prizes
    const tracks = Array.isArray(b.tracks) ? b.tracks : [];
    for (let i = 0; i < tracks.length; i++) {
      const t = tracks[i];
      if (t && String(t.name || '').trim()) {
        await db.query(
          'INSERT INTO event_tracks (event_id, name, description, position) VALUES ($1,$2,$3,$4)',
          [event.id, String(t.name).trim(), String(t.description || ''), i]
        );
      }
    }
    const prizes = Array.isArray(b.prizes) ? b.prizes : [];
    for (let i = 0; i < prizes.length; i++) {
      const p = prizes[i];
      if (p && String(p.title || '').trim()) {
        await db.query(
          'INSERT INTO prizes (event_id, title, description, amount, position) VALUES ($1,$2,$3,$4,$5)',
          [event.id, String(p.title).trim(), String(p.description || ''), String(p.amount || ''), i]
        );
      }
    }
    const full = await db.query('SELECT * FROM events WHERE id=$1', [event.id]);
    return res.status(201).json(full.rows[0]);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('[events/create]', e.message);
    return res.status(500).json({ error: 'Failed to create event.' });
  }
});

// Organizer/Admin: update event
router.put('/:id', requireAuth, requireRole('organizer'), async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const existing = await db.query('SELECT * FROM events WHERE id=$1', [id]);
    if (existing.rows.length === 0) return res.status(404).json({ error: 'Event not found.' });
    const ev = existing.rows[0];
    // Organizers can only edit their own events; admins can edit all.
    if (req.user.role !== 'admin' && ev.created_by !== req.user.id)
      return res.status(403).json({ error: 'You can only edit events you created.' });
    const b = req.body || {};
    const merged = {
      title: b.title !== undefined ? b.title : ev.title,
      starts_at: b.starts_at !== undefined ? b.starts_at : ev.starts_at,
      ends_at: b.ends_at !== undefined ? b.ends_at : ev.ends_at,
      submission_deadline:
        b.submission_deadline !== undefined ? b.submission_deadline : ev.submission_deadline,
      status: b.status !== undefined ? b.status : ev.status,
    };
    const { errors, starts, ends, deadline } = validateEventInput(merged);
    if (errors.submission_deadline && deadline && ends && deadline > ends) {
      delete errors.submission_deadline;
    }
    if (Object.keys(errors).length > 0) return res.status(400).json({ errors });
    const description = b.description !== undefined ? String(b.description) : ev.description;
    const r = await db.query(
      `UPDATE events SET title=$1, description=$2, starts_at=$3, ends_at=$4,
        submission_deadline=$5, status=$6, updated_at=now() WHERE id=$7 RETURNING *`,
      [String(merged.title).trim(), description, starts.toISOString(), ends.toISOString(), deadline.toISOString(), merged.status, id]
    );
    return res.json(r.rows[0]);
  } catch (e) {
    return res.status(500).json({ error: 'Failed to update event.' });
  }
});

// Organizer/Admin: delete event (only if no submissions, unless admin)
router.delete('/:id', requireAuth, requireRole('organizer'), async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const existing = await db.query('SELECT * FROM events WHERE id=$1', [id]);
    if (existing.rows.length === 0) return res.status(404).json({ error: 'Event not found.' });
    const ev = existing.rows[0];
    if (req.user.role !== 'admin' && ev.created_by !== req.user.id)
      return res.status(403).json({ error: 'You can only delete events you created.' });
    const subs = await db.query('SELECT COUNT(*)::int c FROM submissions WHERE event_id=$1', [id]);
    if (subs.rows[0].c > 0 && req.user.role !== 'admin')
      return res.status(400).json({ error: 'Cannot delete event with submissions. Archive it instead.' });
    await db.query('DELETE FROM events WHERE id=$1', [id]);
    return res.json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: 'Failed to delete event.' });
  }
});

// Tracks sub-resource
router.get('/:id/tracks', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const r = await db.query(
    'SELECT * FROM event_tracks WHERE event_id=$1 ORDER BY position ASC, id ASC',
    [id]
  );
  return res.json(r.rows);
});

router.post('/:id/tracks', requireAuth, requireRole('organizer'), async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const ev = await db.query('SELECT * FROM events WHERE id=$1', [id]);
    if (ev.rows.length === 0) return res.status(404).json({ error: 'Event not found.' });
    if (req.user.role !== 'admin' && ev.rows[0].created_by !== req.user.id)
      return res.status(403).json({ error: 'Forbidden.' });
    const { name, description } = req.body || {};
    if (!name || String(name).trim().length < 2)
      return res.status(400).json({ error: 'Track name required (min 2 chars).' });
    const pos = await db.query('SELECT COUNT(*)::int c FROM event_tracks WHERE event_id=$1', [id]);
    const r = await db.query(
      'INSERT INTO event_tracks (event_id, name, description, position) VALUES ($1,$2,$3,$4) RETURNING *',
      [id, String(name).trim(), String(description || ''), pos.rows[0].c]
    );
    return res.status(201).json(r.rows[0]);
  } catch (e) {
    return res.status(500).json({ error: 'Failed to add track.' });
  }
});

router.delete('/:eventId/tracks/:trackId', requireAuth, requireRole('organizer'), async (req, res) => {
  const { eventId, trackId } = req.params;
  const ev = await db.query('SELECT * FROM events WHERE id=$1', [parseInt(eventId, 10)]);
  if (ev.rows.length === 0) return res.status(404).json({ error: 'Event not found.' });
  if (req.user.role !== 'admin' && ev.rows[0].created_by !== req.user.id)
    return res.status(403).json({ error: 'Forbidden.' });
  await db.query('DELETE FROM event_tracks WHERE id=$1 AND event_id=$2', [parseInt(trackId, 10), parseInt(eventId, 10)]);
  return res.json({ ok: true });
});

// Prizes sub-resource
router.get('/:id/prizes', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const r = await db.query('SELECT * FROM prizes WHERE event_id=$1 ORDER BY position ASC, id ASC', [id]);
  return res.json(r.rows);
});

router.post('/:id/prizes', requireAuth, requireRole('organizer'), async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const ev = await db.query('SELECT * FROM events WHERE id=$1', [id]);
    if (ev.rows.length === 0) return res.status(404).json({ error: 'Event not found.' });
    if (req.user.role !== 'admin' && ev.rows[0].created_by !== req.user.id)
      return res.status(403).json({ error: 'Forbidden.' });
    const { title, description, amount } = req.body || {};
    if (!title || String(title).trim().length < 2)
      return res.status(400).json({ error: 'Prize title required.' });
    const pos = await db.query('SELECT COUNT(*)::int c FROM prizes WHERE event_id=$1', [id]);
    const r = await db.query(
      'INSERT INTO prizes (event_id, title, description, amount, position) VALUES ($1,$2,$3,$4,$5) RETURNING *',
      [id, String(title).trim(), String(description || ''), String(amount || ''), pos.rows[0].c]
    );
    return res.status(201).json(r.rows[0]);
  } catch (e) {
    return res.status(500).json({ error: 'Failed to add prize.' });
  }
});

router.delete('/:eventId/prizes/:prizeId', requireAuth, requireRole('organizer'), async (req, res) => {
  const { eventId, prizeId } = req.params;
  const ev = await db.query('SELECT * FROM events WHERE id=$1', [parseInt(eventId, 10)]);
  if (ev.rows.length === 0) return res.status(404).json({ error: 'Event not found.' });
  if (req.user.role !== 'admin' && ev.rows[0].created_by !== req.user.id)
    return res.status(403).json({ error: 'Forbidden.' });
  await db.query('DELETE FROM prizes WHERE id=$1 AND event_id=$2', [parseInt(prizeId, 10), parseInt(eventId, 10)]);
  return res.json({ ok: true });
});

// Organizer: list submissions for an event (with team + project info)
router.get('/:id/submissions', requireAuth, requireRole('organizer'), async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const ev = await db.query('SELECT * FROM events WHERE id=$1', [id]);
    if (ev.rows.length === 0) return res.status(404).json({ error: 'Event not found.' });
    if (req.user.role !== 'admin' && ev.rows[0].created_by !== req.user.id)
      return res.status(403).json({ error: 'You can only view submissions for your own events.' });
    const page = Math.max(1, parseInt(req.query.page || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit || '20', 10)));
    const offset = (page - 1) * limit;
    const countR = await db.query('SELECT COUNT(*)::int c FROM submissions WHERE event_id=$1', [id]);
    const total = countR.rows[0].c;
    const r = await db.query(
      `SELECT s.*, p.title AS project_title, p.description AS project_description,
        p.status AS project_status, p.track_id, t.name AS team_name, t.id AS team_id,
        u.name AS submitted_by_name, et.name AS track_name
       FROM submissions s
       JOIN projects p ON p.id = s.project_id
       JOIN teams t ON t.id = s.team_id
       LEFT JOIN users u ON u.id = s.submitted_by
       LEFT JOIN event_tracks et ON et.id = p.track_id
       WHERE s.event_id=$1 ORDER BY s.submitted_at DESC LIMIT $2 OFFSET $3`,
      [id, limit, offset]
    );
    return res.json({ data: r.rows, page, limit, total, totalPages: Math.ceil(total / limit) });
  } catch (e) {
    return res.status(500).json({ error: 'Failed to load submissions.' });
  }
});

// Organizer: list teams for an event
router.get('/:id/teams', requireAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const ev = await db.query('SELECT * FROM events WHERE id=$1', [id]);
    if (ev.rows.length === 0) return res.status(404).json({ error: 'Event not found.' });
    const isStaff =
      req.user && (req.user.role === 'admin' || req.user.role === 'organizer');
    if (!isStaff) return res.status(403).json({ error: 'Forbidden.' });
    if (req.user.role !== 'admin' && ev.rows[0].created_by !== req.user.id)
      return res.status(403).json({ error: 'Forbidden.' });
    const r = await db.query(
      `SELECT t.*, u.name AS owner_name,
        (SELECT COUNT(*)::int FROM team_members m WHERE m.team_id=t.id) AS member_count,
        (SELECT COUNT(*)::int FROM projects p WHERE p.team_id=t.id) AS project_count
       FROM teams t LEFT JOIN users u ON u.id=t.created_by
       WHERE t.event_id=$1 ORDER BY t.created_at DESC`,
      [id]
    );
    return res.json(r.rows);
  } catch (e) {
    return res.status(500).json({ error: 'Failed to load teams.' });
  }
});

module.exports = router;
