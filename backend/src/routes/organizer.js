'use strict';
// Organizer aggregate views across OWN events (admin: all events).
// Tier 1 only: teams, projects (incl. drafts), submissions.
const express = require('express');
const db = require('../db');
const { requireAuth, requireRole } = require('../auth');

const router = express.Router();

function eventFilter(user) {
  if (user.role === 'admin') return { clause: '', params: [] };
  return { clause: 'e.created_by = $1', params: [user.id] };
}

// GET /api/organizer/teams — every team in scoped events
router.get('/teams', requireAuth, requireRole('organizer'), async (req, res) => {
  try {
    const { clause, params } = eventFilter(req.user);
    const where = clause ? `WHERE ${clause}` : '';
    const r = await db.query(
      `SELECT t.*, e.title AS event_title, u.name AS owner_name
       FROM teams t JOIN events e ON e.id = t.event_id
       LEFT JOIN users u ON u.id = t.created_by
       ${where} ORDER BY t.created_at DESC`,
      params
    );
    const rows = r.rows;
    if (rows.length > 0) {
      const ids = rows.map((x) => x.id);
      const inList = ids.map((_, i) => `$${i + 1}`).join(',');
      const [mc, pc] = await Promise.all([
        db.query(`SELECT team_id, COUNT(*)::int n FROM team_members WHERE team_id IN (${inList}) GROUP BY team_id`, ids),
        db.query(`SELECT team_id, COUNT(*)::int n FROM projects WHERE team_id IN (${inList}) GROUP BY team_id`, ids),
      ]);
      const mm = new Map(mc.rows.map((x) => [x.team_id, x.n]));
      const pm = new Map(pc.rows.map((x) => [x.team_id, x.n]));
      for (const row of rows) {
        row.member_count = mm.get(row.id) || 0;
        row.project_count = pm.get(row.id) || 0;
      }
    }
    return res.json(rows);
  } catch (e) {
    return res.status(500).json({ error: 'Failed to load teams.' });
  }
});

// GET /api/organizer/projects — every project in scoped events (drafts included)
router.get('/projects', requireAuth, requireRole('organizer'), async (req, res) => {
  try {
    const { clause, params } = eventFilter(req.user);
    const where = clause ? `WHERE ${clause}` : '';
    const status = req.query.status;
    const extra = status && ['draft', 'submitted', 'locked'].includes(status) ? ' AND p.status = $' + (params.length + 1) : '';
    const p2 = status && ['draft', 'submitted', 'locked'].includes(status) ? [...params, status] : params;
    const r = await db.query(
      `SELECT p.*, t.name AS team_name, e.title AS event_title, et.name AS track_name
       FROM projects p JOIN teams t ON t.id = p.team_id
       JOIN events e ON e.id = p.event_id
       LEFT JOIN event_tracks et ON et.id = p.track_id
       ${where}${extra} ORDER BY p.updated_at DESC`,
      p2
    );
    return res.json(r.rows);
  } catch (e) {
    return res.status(500).json({ error: 'Failed to load projects.' });
  }
});

// GET /api/organizer/submissions — every submission in scoped events
router.get('/submissions', requireAuth, requireRole('organizer'), async (req, res) => {
  try {
    const { clause, params } = eventFilter(req.user);
    const where = clause ? `WHERE ${clause}` : '';
    const page = Math.max(1, parseInt(req.query.page || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit || '20', 10)));
    const offset = (page - 1) * limit;
    const c = await db.query(
      `SELECT COUNT(*)::int n FROM submissions s JOIN events e ON e.id = s.event_id ${where}`,
      params
    );
    const total = c.rows[0].n;
    const r = await db.query(
      `SELECT s.*, p.title AS project_title, p.status AS project_status,
        t.name AS team_name, e.title AS event_title, u.name AS submitted_by_name,
        et.name AS track_name
       FROM submissions s
       JOIN projects p ON p.id = s.project_id
       JOIN teams t ON t.id = s.team_id
       JOIN events e ON e.id = s.event_id
       LEFT JOIN users u ON u.id = s.submitted_by
       LEFT JOIN event_tracks et ON et.id = p.track_id
       ${where} ORDER BY s.submitted_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset]
    );
    return res.json({ data: r.rows, page, limit, total, totalPages: Math.ceil(total / limit) });
  } catch (e) {
    return res.status(500).json({ error: 'Failed to load submissions.' });
  }
});

module.exports = router;
