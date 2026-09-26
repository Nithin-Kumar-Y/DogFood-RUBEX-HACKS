'use strict';
const express = require('express');
const db = require('../db');
const { isValidUrl, isPastDeadline, validateProjectForSubmit } = require('../util');
const { requireAuth } = require('../auth');

const router = express.Router();

async function getProjectFull(id) {
  const r = await db.query(
    `SELECT p.*, t.name AS team_name, t.event_id AS team_event_id, e.title AS event_title,
      e.submission_deadline, e.status AS event_status, et.name AS track_name,
      u.name AS author_name
     FROM projects p
     JOIN teams t ON t.id=p.team_id
     JOIN events e ON e.id=p.event_id
     LEFT JOIN event_tracks et ON et.id=p.track_id
     LEFT JOIN users u ON u.id=p.created_by
     WHERE p.id=$1 LIMIT 1`,
    [id]
  );
  if (r.rows.length === 0) return null;
  const project = r.rows[0];
  const links = await db.query(
    'SELECT * FROM project_links WHERE project_id=$1 ORDER BY position ASC, id ASC',
    [id]
  );
  project.links = links.rows;
  return project;
}

async function isTeamMember(teamId, userId) {
  const r = await db.query(
    'SELECT * FROM team_members WHERE team_id=$1 AND user_id=$2 LIMIT 1',
    [teamId, userId]
  );
  return r.rows[0] || null;
}

function canAccessProject(project, user) {
  if (!user) return false;
  if (user.role === 'admin') return true;
  return true; // membership checked by caller; organizers checked separately
}

// GET /api/projects/mine
router.get('/mine', requireAuth, async (req, res) => {
  try {
    const r = await db.query(
      `SELECT p.*, t.name AS team_name, e.title AS event_title, e.submission_deadline,
        et.name AS track_name
       FROM projects p
       JOIN teams t ON t.id=p.team_id
       JOIN events e ON e.id=p.event_id
       LEFT JOIN event_tracks et ON et.id=p.track_id
       JOIN team_members m ON m.team_id=p.team_id
       WHERE m.user_id=$1 ORDER BY p.updated_at DESC`,
      [req.user.id]
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
    return res.json(rows);
  } catch (e) {
    return res.status(500).json({ error: 'Failed to load projects.' });
  }
});

// POST /api/projects — create draft
router.post('/', requireAuth, async (req, res) => {
  try {
    const { team_id, title, description, track_id, links } = req.body || {};
    const teamId = parseInt(team_id, 10);
    if (!teamId) return res.status(400).json({ error: 'team_id is required.' });
    if (!title || String(title).trim().length < 3)
      return res.status(400).json({ error: 'Title must be at least 3 characters.' });
    const membership = await isTeamMember(teamId, req.user.id);
    if (!membership && req.user.role !== 'admin')
      return res.status(403).json({ error: 'Only team members can create projects.' });
    const teamR = await db.query('SELECT * FROM teams WHERE id=$1', [teamId]);
    if (teamR.rows.length === 0) return res.status(404).json({ error: 'Team not found.' });
    const team = teamR.rows[0];
    const evR = await db.query('SELECT * FROM events WHERE id=$1', [team.event_id]);
    const event = evR.rows[0];
    if (isPastDeadline(event))
      return res.status(400).json({ error: 'Submission deadline has passed. Cannot create project.' });
    // One project per team per event (keeps Tier 1 simple & predictable).
    const existing = await db.query('SELECT id FROM projects WHERE team_id=$1 AND event_id=$2 LIMIT 1', [
      teamId,
      team.event_id,
    ]);
    if (existing.rows.length > 0)
      return res.status(409).json({ error: 'This team already has a project for this event.' });
    let trackId = track_id ? parseInt(track_id, 10) : null;
    if (trackId) {
      const tr = await db.query('SELECT * FROM event_tracks WHERE id=$1 AND event_id=$2', [
        trackId,
        team.event_id,
      ]);
      if (tr.rows.length === 0)
        return res.status(400).json({ error: 'Selected track does not belong to this event.' });
    }
    const ins = await db.query(
      `INSERT INTO projects (team_id, event_id, title, description, track_id, status, created_by)
       VALUES ($1,$2,$3,$4,$5,'draft',$6) RETURNING *`,
      [teamId, team.event_id, String(title).trim(), String(description || ''), trackId, req.user.id]
    );
    const project = ins.rows[0];
    const arr = Array.isArray(links) ? links : [];
    for (let i = 0; i < arr.length; i++) {
      const l = arr[i];
      if (l && l.url && isValidUrl(l.url)) {
        await db.query(
          'INSERT INTO project_links (project_id, label, url, position) VALUES ($1,$2,$3,$4)',
          [project.id, String(l.label || 'Link').slice(0, 120), String(l.url), i]
        );
      }
    }
    const full = await getProjectFull(project.id);
    return res.status(201).json(full);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('[projects/create]', e.message);
    return res.status(500).json({ error: 'Failed to create project.' });
  }
});

// GET /api/projects/:id — team members, organizer of event, admin; submitted also visible via gallery (separate route)
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const project = await getProjectFull(id);
    if (!project) return res.status(404).json({ error: 'Project not found.' });
    const membership = await isTeamMember(project.team_id, req.user.id);
    const evR = await db.query('SELECT created_by FROM events WHERE id=$1', [project.event_id]);
    const isOrganizer =
      req.user.role === 'admin' ||
      (req.user.role === 'organizer' && evR.rows[0] && evR.rows[0].created_by === req.user.id);
    // Drafts are private to team + staff; submitted visible to members/staff here (public via gallery).
    if (!membership && !isOrganizer)
      return res.status(403).json({ error: 'Only team members can view this draft.' });
    return res.json(project);
  } catch (e) {
    return res.status(500).json({ error: 'Failed to load project.' });
  }
});

// PUT /api/projects/:id — edit draft (or submitted before deadline)
router.put('/:id', requireAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const project = await getProjectFull(id);
    if (!project) return res.status(404).json({ error: 'Project not found.' });
    const membership = await isTeamMember(project.team_id, req.user.id);
    if (!membership && req.user.role !== 'admin')
      return res.status(403).json({ error: 'Only team members can edit.' });
    const evR = await db.query('SELECT * FROM events WHERE id=$1', [project.event_id]);
    const event = evR.rows[0];
    if (isPastDeadline(event))
      return res.status(403).json({ error: 'Deadline has passed. Project is locked.' });
    if (project.status === 'locked')
      return res.status(403).json({ error: 'Project is locked.' });
    const { title, description, track_id, links } = req.body || {};
    let trackId = project.track_id;
    if (track_id !== undefined) {
      trackId = track_id ? parseInt(track_id, 10) : null;
      if (trackId) {
        const tr = await db.query('SELECT id FROM event_tracks WHERE id=$1 AND event_id=$2', [
          trackId,
          project.event_id,
        ]);
        if (tr.rows.length === 0)
          return res.status(400).json({ error: 'Selected track does not belong to this event.' });
      }
    }
    const newTitle = title !== undefined ? String(title).trim() : project.title;
    if (!newTitle || newTitle.length < 3)
      return res.status(400).json({ error: 'Title must be at least 3 characters.' });
    const newDesc = description !== undefined ? String(description) : project.description;
    await db.query(
      'UPDATE projects SET title=$1, description=$2, track_id=$3, updated_at=now() WHERE id=$4',
      [newTitle, newDesc, trackId, id]
    );
    if (Array.isArray(links)) {
      await db.query('DELETE FROM project_links WHERE project_id=$1', [id]);
      for (let i = 0; i < links.length; i++) {
        const l = links[i];
        if (l && l.url && String(l.url).trim()) {
          if (!isValidUrl(l.url))
            return res.status(400).json({ error: `Invalid URL: ${l.url}` });
          await db.query(
            'INSERT INTO project_links (project_id, label, url, position) VALUES ($1,$2,$3,$4)',
            [id, String(l.label || 'Link').slice(0, 120), String(l.url), i]
          );
        }
      }
    }
    // Keep submission snapshot in sync if already submitted (edit-before-deadline allowed).
    if (project.status === 'submitted') {
      const fresh = await getProjectFull(id);
      await db.query('UPDATE submissions SET snapshot=$1 WHERE project_id=$2', [
        JSON.stringify({ title: fresh.title, description: fresh.description, links: fresh.links }),
        id,
      ]);
    }
    const full = await getProjectFull(id);
    return res.json(full);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('[projects/update]', e.message);
    return res.status(500).json({ error: 'Failed to update project.' });
  }
});

// DELETE /api/projects/:id — only drafts, only team members, only before deadline
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const project = await getProjectFull(id);
    if (!project) return res.status(404).json({ error: 'Project not found.' });
    const membership = await isTeamMember(project.team_id, req.user.id);
    if (!membership && req.user.role !== 'admin')
      return res.status(403).json({ error: 'Only team members can delete.' });
    if (project.status === 'submitted')
      return res.status(400).json({ error: 'Cannot delete a submitted project. Unsubmit first (before deadline).' });
    const evR = await db.query('SELECT * FROM events WHERE id=$1', [project.event_id]);
    if (isPastDeadline(evR.rows[0]))
      return res.status(403).json({ error: 'Deadline has passed. Project is locked.' });
    await db.query('DELETE FROM projects WHERE id=$1', [id]);
    return res.json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: 'Failed to delete project.' });
  }
});

// POST /api/projects/:id/submit — backend-enforced validation + deadline
router.post('/:id/submit', requireAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const project = await getProjectFull(id);
    if (!project) return res.status(404).json({ error: 'Project not found.' });
    const membership = await isTeamMember(project.team_id, req.user.id);
    if (!membership && req.user.role !== 'admin')
      return res.status(403).json({ error: 'Only team members can submit.' });
    const evR = await db.query('SELECT * FROM events WHERE id=$1', [project.event_id]);
    const event = evR.rows[0];
    // Backend deadline enforcement — never rely on hidden buttons.
    if (isPastDeadline(event))
      return res.status(400).json({ error: 'Submission deadline has passed. Late submissions are blocked.' });
    if (project.status === 'submitted')
      return res.status(409).json({ error: 'Project is already submitted.' });
    const trackCountR = await db.query('SELECT COUNT(*)::int c FROM event_tracks WHERE event_id=$1', [
      project.event_id,
    ]);
    event._trackCount = trackCountR.rows[0].c;
    const problems = validateProjectForSubmit(project, project.links, event);
    if (problems.length > 0) return res.status(400).json({ error: 'Validation failed.', details: problems });
    await db.query(
      `INSERT INTO submissions (project_id, event_id, team_id, submitted_by, snapshot)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (project_id) DO UPDATE SET submitted_at=now(), submitted_by=$4, snapshot=$5`,
      [
        id,
        project.event_id,
        project.team_id,
        req.user.id,
        JSON.stringify({ title: project.title, description: project.description, links: project.links }),
      ]
    );
    await db.query("UPDATE projects SET status='submitted', updated_at=now() WHERE id=$1", [id]);
    const full = await getProjectFull(id);
    const sub = await db.query('SELECT * FROM submissions WHERE project_id=$1', [id]);
    return res.json({ project: full, submission: sub.rows[0], message: 'Project submitted successfully.' });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('[projects/submit]', e.message);
    return res.status(500).json({ error: 'Submission failed.' });
  }
});

// POST /api/projects/:id/unsubmit — revert to draft, only before deadline
router.post('/:id/unsubmit', requireAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const project = await getProjectFull(id);
    if (!project) return res.status(404).json({ error: 'Project not found.' });
    const membership = await isTeamMember(project.team_id, req.user.id);
    if (!membership && req.user.role !== 'admin')
      return res.status(403).json({ error: 'Only team members can unsubmit.' });
    if (project.status !== 'submitted')
      return res.status(400).json({ error: 'Project is not submitted.' });
    const evR = await db.query('SELECT * FROM events WHERE id=$1', [project.event_id]);
    if (isPastDeadline(evR.rows[0]))
      return res.status(403).json({ error: 'Deadline has passed. Cannot unsubmit.' });
    await db.query('DELETE FROM submissions WHERE project_id=$1', [id]);
    await db.query("UPDATE projects SET status='draft', updated_at=now() WHERE id=$1", [id]);
    const full = await getProjectFull(id);
    return res.json(full);
  } catch (e) {
    return res.status(500).json({ error: 'Unsubmit failed.' });
  }
});

module.exports = router;
