'use strict';
const express = require('express');
const db = require('../db');
const { requireAuth, requireRole } = require('../auth');

const router = express.Router();

// Admin: list users (paginated, searchable)
router.get('/', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit || '20', 10)));
    const offset = (page - 1) * limit;
    const q = String(req.query.q || '').trim();
    const params = [];
    let where = '';
    if (q) {
      params.push(`%${q}%`);
      where = `WHERE (email ILIKE $1 OR name ILIKE $1)`;
    }
    const c = await db.query(`SELECT COUNT(*)::int c FROM users ${where}`, params);
    params.push(limit, offset);
    const r = await db.query(
      `SELECT id, email, name, role, created_at FROM users ${where}
       ORDER BY created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    return res.json({ data: r.rows, page, limit, total: c.rows[0].c });
  } catch (e) {
    return res.status(500).json({ error: 'Failed to load users.' });
  }
});

// Admin: change role
router.put('/:id/role', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { role } = req.body || {};
    if (!['participant', 'organizer', 'judge', 'admin'].includes(role))
      return res.status(400).json({ error: 'Invalid role.' });
    if (id === req.user.id && role !== 'admin')
      return res.status(400).json({ error: 'You cannot demote yourself.' });
    const r = await db.query(
      'UPDATE users SET role=$1, updated_at=now() WHERE id=$2 RETURNING id,email,name,role',
      [role, id]
    );
    if (r.rows.length === 0) return res.status(404).json({ error: 'User not found.' });
    return res.json(r.rows[0]);
  } catch (e) {
    return res.status(500).json({ error: 'Failed to update role.' });
  }
});

// Admin/system overview + health
router.get('/system/overview', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const [u, e, t, p, s] = await Promise.all([
      db.query('SELECT COUNT(*)::int c FROM users'),
      db.query('SELECT COUNT(*)::int c FROM events'),
      db.query('SELECT COUNT(*)::int c FROM teams'),
      db.query('SELECT COUNT(*)::int c FROM projects'),
      db.query('SELECT COUNT(*)::int c FROM submissions'),
    ]);
    return res.json({
      users: u.rows[0].c,
      events: e.rows[0].c,
      teams: t.rows[0].c,
      projects: p.rows[0].c,
      submissions: s.rows[0].c,
      version: '2.0.0-tier2',
      judging: 'implemented (Tier 2: rubrics, assignments, calibration, results)',
    });
  } catch (e) {
    return res.status(500).json({ error: 'Failed to load overview.' });
  }
});

module.exports = router;
