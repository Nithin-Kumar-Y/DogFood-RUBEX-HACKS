'use strict';
const express = require('express');
const db = require('../db');

const router = express.Router();

// GET /api/gallery — public, server-side paginated + filtered. Submitted only.
router.get('/', async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page || '1', 10));
    const limit = Math.min(24, Math.max(1, parseInt(req.query.limit || '9', 10)));
    const offset = (page - 1) * limit;
    const q = String(req.query.q || req.query.search || '').trim();
    const eventId = req.query.event_id ? parseInt(req.query.event_id, 10) : null;
    const trackId = req.query.track_id ? parseInt(req.query.track_id, 10) : null;

    const conds = [`p.status = 'submitted'`, `e.status = 'published'`];
    const params = [];
    if (q) {
      params.push(`%${q}%`);
      conds.push(`(p.title ILIKE $${params.length} OR p.description ILIKE $${params.length} OR t.name ILIKE $${params.length})`);
    }
    if (eventId) {
      params.push(eventId);
      conds.push(`p.event_id = $${params.length}`);
    }
    if (trackId) {
      params.push(trackId);
      conds.push(`p.track_id = $${params.length}`);
    }
    const where = 'WHERE ' + conds.join(' AND ');
    const countR = await db.query(
      `SELECT COUNT(*)::int c FROM projects p JOIN teams t ON t.id=p.team_id JOIN events e ON e.id=p.event_id ${where}`,
      params
    );
    const total = countR.rows[0].c;
    params.push(limit, offset);
    const r = await db.query(
      `SELECT p.id, p.title, SUBSTRING(p.description, 1, 220) AS excerpt, p.track_id, p.updated_at,
        t.name AS team_name, e.title AS event_title, e.id AS event_id,
        et.name AS track_name, s.submitted_at
       FROM projects p
       JOIN teams t ON t.id=p.team_id
       JOIN events e ON e.id=p.event_id
       LEFT JOIN event_tracks et ON et.id=p.track_id
       JOIN submissions s ON s.project_id=p.id
       ${where}
       ORDER BY s.submitted_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    const rows = r.rows;
    if (rows.length > 0) {
      const ids = rows.map((x) => x.id);
      const inList = ids.map((_, i) => `$${i + 1}`).join(',');
      const c = await db.query(
        `SELECT project_id, COUNT(*)::int n FROM project_links WHERE project_id IN (${inList}) GROUP BY project_id`,
        ids
      );
      const m = new Map(c.rows.map((x) => [x.project_id, x.n]));
      for (const row of rows) row.link_count = m.get(row.id) || 0;
    }
    return res.json({ data: rows, page, limit, total, totalPages: Math.ceil(total / limit) });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('[gallery]', e.message);
    return res.status(500).json({ error: 'Failed to load gallery.' });
  }
});

// GET /api/gallery/:id — public project details (submitted only)
router.get('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const r = await db.query(
      `SELECT p.*, t.name AS team_name, e.title AS event_title, e.status AS event_status,
        et.name AS track_name, s.submitted_at
       FROM projects p
       JOIN teams t ON t.id=p.team_id
       JOIN events e ON e.id=p.event_id
       LEFT JOIN event_tracks et ON et.id=p.track_id
       JOIN submissions s ON s.project_id=p.id
       WHERE p.id=$1 AND p.status='submitted' LIMIT 1`,
      [id]
    );
    if (r.rows.length === 0) return res.status(404).json({ error: 'Project not found.' });
    if (r.rows[0].event_status !== 'published')
      return res.status(404).json({ error: 'Project not found.' });
    const links = await db.query(
      'SELECT * FROM project_links WHERE project_id=$1 ORDER BY position ASC, id ASC',
      [id]
    );
    const members = await db.query(
      `SELECT u.name FROM team_members m JOIN users u ON u.id=m.user_id WHERE m.team_id=$1 ORDER BY m.joined_at`,
      [r.rows[0].team_id]
    );
    return res.json({ ...r.rows[0], links: links.rows, members: members.rows });
  } catch (e) {
    return res.status(500).json({ error: 'Failed to load project.' });
  }
});

module.exports = router;
