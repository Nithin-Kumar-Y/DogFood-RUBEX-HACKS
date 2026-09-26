'use strict';
const express = require('express');
const db = require('../db');
const { requireAuth } = require('../auth');

const router = express.Router();

// GET /api/submissions/mine — current user's team submissions
router.get('/mine', requireAuth, async (req, res) => {
  try {
    const r = await db.query(
      `SELECT s.*, p.title AS project_title, p.status AS project_status,
        t.name AS team_name, e.title AS event_title, e.submission_deadline
       FROM submissions s
       JOIN projects p ON p.id=s.project_id
       JOIN teams t ON t.id=s.team_id
       JOIN events e ON e.id=s.event_id
       JOIN team_members m ON m.team_id=t.id
       WHERE m.user_id=$1 ORDER BY s.submitted_at DESC`,
      [req.user.id]
    );
    return res.json(r.rows);
  } catch (e) {
    return res.status(500).json({ error: 'Failed to load submissions.' });
  }
});

module.exports = router;
