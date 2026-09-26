'use strict';
// Express app factory (exported for tests; server.js starts listening).
const path = require('path');
const fs = require('fs');
const express = require('express');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const db = require('./db');
const { loadSessionUser } = require('./auth');

const authRoutes = require('./routes/auth');
const eventRoutes = require('./routes/events');
const teamRoutes = require('./routes/teams');
const projectRoutes = require('./routes/projects');
const galleryRoutes = require('./routes/gallery');
const submissionRoutes = require('./routes/submissions');
const organizerRoutes = require('./routes/organizer');
const judgingRoutes = require('./routes/judging');
const adminRoutes = require('./routes/admin');
const votingRoutes = require('./routes/voting');
const commentsRoutes = require('./routes/comments');

function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '256kb' }));
  app.use(cookieParser());
  app.use(
    cors({
      origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : true,
      credentials: true,
    })
  );
  app.use(loadSessionUser);

  app.get('/api/health', async (_req, res) => {
    try {
      await db.query('SELECT 1');
      return res.json({ ok: true, service: 'dogfood-backend', tier: 3, time: new Date().toISOString() });
    } catch (e) {
      return res.status(503).json({ ok: false, error: 'database unavailable' });
    }
  });

  app.use('/api/auth', authRoutes);
  app.use('/api/events', eventRoutes);
  // Team invite routes live under /api/teams AND /api/invites — mount same router twice
  // with a small shim for /api/invites prefix.
  app.use('/api/teams', teamRoutes);
  app.use('/api/invites', (req, res, next) => {
    // rewrite /api/invites/:code/... -> /api/teams/invites/:code/...
    req.url = '/invites' + (req.url === '/' ? '' : req.url);
    return teamRoutes(req, res, next);
  });
  app.use('/api/projects', projectRoutes);
  app.use('/api/gallery', galleryRoutes);
  app.use('/api/submissions', submissionRoutes);
  app.use('/api/organizer', organizerRoutes);
  app.use('/api/admin/users', adminRoutes);
  app.use('/api/admin', adminRoutes);

  // ---- Tier 2 judging (live) ----
  app.use('/api/judging', judgingRoutes);

  // ---- Tier 3 community voting + comments (live) ----
  app.use('/api/voting', votingRoutes);
  app.use('/api/comments', commentsRoutes);

  // ---- Tier 4 placeholders: explicit 501s ----
  const notImplemented = (tier) => (_req, res) =>
    res.status(501).json({ error: `${tier} is not implemented yet. See ARCHITECTURE.md.` });
  app.use('/api/webhooks', notImplemented('Webhooks (Tier 4)'));
  app.use('/api/certificates', notImplemented('Certificates (Tier 4)'));

  // Organizer dashboard stats (Tier 1): counts for own events
  app.get('/api/stats/organizer', async (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Authentication required.' });
    if (!['organizer', 'admin'].includes(req.user.role))
      return res.status(403).json({ error: 'Forbidden.' });
    try {
      const filter = req.user.role === 'admin' ? '' : 'WHERE e.created_by = $1';
      const params = req.user.role === 'admin' ? [] : [req.user.id];
      const r = await db.query(
        `SELECT COUNT(DISTINCT e.id)::int AS events,
          COUNT(DISTINCT t.id)::int AS teams,
          COUNT(DISTINCT p.id)::int AS projects,
          COUNT(DISTINCT s.project_id)::int AS submissions,
          COUNT(DISTINCT m.user_id)::int AS participants,
          COUNT(DISTINCT CASE WHEN p.status = 'draft' THEN p.id END)::int AS drafts
         FROM events e
         LEFT JOIN teams t ON t.event_id=e.id
         LEFT JOIN projects p ON p.event_id=e.id
         LEFT JOIN submissions s ON s.event_id=e.id
         LEFT JOIN team_members m ON m.team_id=t.id
         ${filter}`,
        params
      );
      const upcoming = await db.query(
        `SELECT id, title, submission_deadline, status FROM events e ${filter} ORDER BY submission_deadline ASC LIMIT 5`,
        params
      );
      return res.json({ totals: r.rows[0], upcoming: upcoming.rows });
    } catch (e) {
      return res.status(500).json({ error: 'Failed to load stats.' });
    }
  });

  // Participant dashboard summary
  app.get('/api/stats/me', async (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Authentication required.' });
    try {
      const teams = await db.query(
        `SELECT t.id, t.name, e.id AS event_id, e.title AS event_title, e.submission_deadline
         FROM team_members m JOIN teams t ON t.id=m.team_id JOIN events e ON e.id=t.event_id
         WHERE m.user_id=$1 ORDER BY e.submission_deadline ASC`,
        [req.user.id]
      );
      const projs = await db.query(
        `SELECT p.*, e.title AS event_title, e.submission_deadline FROM projects p
         JOIN team_members m ON m.team_id=p.team_id JOIN events e ON e.id=p.event_id
         WHERE m.user_id=$1 ORDER BY p.updated_at DESC`,
        [req.user.id]
      );
      const events = await db.query(
        `SELECT * FROM events WHERE status='published' ORDER BY submission_deadline ASC LIMIT 6`
      );
      return res.json({ teams: teams.rows, projects: projs.rows, events: events.rows });
    } catch (e) {
      return res.status(500).json({ error: 'Failed to load dashboard.' });
    }
  });

  // 404 for unknown API routes
  app.use('/api', (_req, res) => res.status(404).json({ error: 'API route not found.' }));

  // Serve frontend static files if present
  const frontendDir = path.resolve(__dirname, '../../frontend');
  if (fs.existsSync(frontendDir)) {
    app.use(express.static(frontendDir));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api')) return next();
      res.sendFile(path.join(frontendDir, 'index.html'));
    });
  }

  // Central error handler
  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    // eslint-disable-next-line no-console
    console.error('[unhandled]', err);
    res.status(500).json({ error: 'Internal server error.' });
  });

  return app;
}

module.exports = { createApp };
