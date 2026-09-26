'use strict';
const express = require('express');
const db = require('../db');
const { randomCode } = require('../util');
const { requireAuth } = require('../auth');

const router = express.Router();

async function userTeamsInEvent(userId, eventId) {
  const r = await db.query(
    `SELECT t.* FROM teams t JOIN team_members m ON m.team_id=t.id
     WHERE m.user_id=$1 AND t.event_id=$2`,
    [userId, eventId]
  );
  return r.rows;
}

async function teamWithMembers(teamId) {
  const t = await db.query(
    `SELECT t.*, e.title AS event_title, e.submission_deadline, e.status AS event_status
     FROM teams t JOIN events e ON e.id=t.event_id WHERE t.id=$1`,
    [teamId]
  );
  if (t.rows.length === 0) return null;
  const team = t.rows[0];
  const members = await db.query(
    `SELECT m.*, u.name, u.email FROM team_members m
     JOIN users u ON u.id=m.user_id WHERE m.team_id=$1 ORDER BY m.joined_at ASC`,
    [teamId]
  );
  team.members = members.rows;
  return team;
}

async function isTeamMember(teamId, userId) {
  const r = await db.query(
    'SELECT * FROM team_members WHERE team_id=$1 AND user_id=$2 LIMIT 1',
    [teamId, userId]
  );
  return r.rows[0] || null;
}

// GET /api/teams/mine — teams the current user belongs to
router.get('/mine', requireAuth, async (req, res) => {
  try {
    const r = await db.query(
      `SELECT t.*, e.title AS event_title, e.submission_deadline, m.member_role AS my_role
       FROM teams t JOIN team_members m ON m.team_id=t.id
       JOIN events e ON e.id=t.event_id
       WHERE m.user_id=$1 ORDER BY t.created_at DESC`,
      [req.user.id]
    );
    const rows = r.rows;
    if (rows.length > 0) {
      const ids = rows.map((x) => x.id);
      const inList = ids.map((_, i) => `$${i + 1}`).join(',');
      const c = await db.query(
        `SELECT team_id, COUNT(*)::int n FROM team_members WHERE team_id IN (${inList}) GROUP BY team_id`,
        ids
      );
      const m = new Map(c.rows.map((x) => [x.team_id, x.n]));
      for (const row of rows) row.member_count = m.get(row.id) || 0;
    }
    return res.json(rows);
  } catch (e) {
    return res.status(500).json({ error: 'Failed to load teams.' });
  }
});

// POST /api/teams — create a team for an event
router.post('/', requireAuth, async (req, res) => {
  try {
    const { event_id, name } = req.body || {};
    const eventId = parseInt(event_id, 10);
    if (!eventId) return res.status(400).json({ error: 'event_id is required.' });
    if (!name || String(name).trim().length < 2)
      return res.status(400).json({ error: 'Team name must be at least 2 characters.' });
    const ev = await db.query('SELECT * FROM events WHERE id=$1', [eventId]);
    if (ev.rows.length === 0) return res.status(404).json({ error: 'Event not found.' });
    if (ev.rows[0].status === 'archived')
      return res.status(400).json({ error: 'Cannot join an archived event.' });
    // Prevent duplicate membership: one team per user per event.
    const existing = await userTeamsInEvent(req.user.id, eventId);
    if (existing.length > 0)
      return res.status(409).json({ error: 'You are already in a team for this event. Leave it first.' });
    const inviteCode = randomCode(8);
    const inviteExpires = new Date(Date.now() + 30 * 86400000).toISOString();
    const ins = await db.query(
      'INSERT INTO teams (event_id, name, invite_code, invite_expires_at, created_by) VALUES ($1,$2,$3,$4,$5) RETURNING *',
      [eventId, String(name).trim(), inviteCode, inviteExpires, req.user.id]
    );
    const team = ins.rows[0];
    await db.query(
      `INSERT INTO team_members (team_id, user_id, member_role) VALUES ($1,$2,'owner')`,
      [team.id, req.user.id]
    );
    // A creator invite record for audit trail
    await db.query(
      `INSERT INTO team_invitations (team_id, code, created_by, status, accepted_by, accepted_at)
       VALUES ($1,$2,$3,'accepted',$3, now())`,
      [team.id, inviteCode, req.user.id]
    );
    const full = await teamWithMembers(team.id);
    return res.status(201).json(full);
  } catch (e) {
    if (e.code === '23505')
      return res.status(409).json({ error: 'Team name or membership conflict.' });
    // eslint-disable-next-line no-console
    console.error('[teams/create]', e.message);
    return res.status(500).json({ error: 'Failed to create team.' });
  }
});

// GET /api/teams/:id
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const team = await teamWithMembers(id);
    if (!team) return res.status(404).json({ error: 'Team not found.' });
    const membership = await isTeamMember(id, req.user.id);
    const isStaff = ['organizer', 'admin'].includes(req.user.role);
    if (!membership && !isStaff)
      return res.status(403).json({ error: 'Only team members can view this team.' });
    return res.json(team);
  } catch (e) {
    return res.status(500).json({ error: 'Failed to load team.' });
  }
});

// PUT /api/teams/:id — rename (owner or staff for own events)
router.put('/:id', requireAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const membership = await isTeamMember(id, req.user.id);
    if (!membership) return res.status(403).json({ error: 'Only team members can edit.' });
    if (membership.member_role !== 'owner' && req.user.role !== 'admin')
      return res.status(403).json({ error: 'Only the team owner can rename.' });
    const { name } = req.body || {};
    if (!name || String(name).trim().length < 2)
      return res.status(400).json({ error: 'Team name must be at least 2 characters.' });
    const r = await db.query(
      'UPDATE teams SET name=$1, updated_at=now() WHERE id=$2 RETURNING *',
      [String(name).trim(), id]
    );
    return res.json(r.rows[0]);
  } catch (e) {
    return res.status(500).json({ error: 'Failed to rename team.' });
  }
});

// POST /api/teams/:id/leave
router.post('/:id/leave', requireAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const membership = await isTeamMember(id, req.user.id);
    if (!membership) return res.status(404).json({ error: 'You are not in this team.' });
    // Owner cannot leave if they are the only owner and others remain; transfer or delete instead.
    const all = await db.query('SELECT * FROM team_members WHERE team_id=$1', [id]);
    if (membership.member_role === 'owner' && all.rows.length > 1) {
      const otherOwners = all.rows.filter(
        (m) => m.member_role === 'owner' && m.user_id !== req.user.id
      );
      if (otherOwners.length === 0)
        return res.status(400).json({
          error: 'Transfer ownership before leaving: you are the only owner.',
        });
    }
    await db.query('DELETE FROM team_members WHERE team_id=$1 AND user_id=$2', [id, req.user.id]);
    // If team is now empty, delete it (and cascade projects? keep projects — block instead)
    const remaining = await db.query('SELECT COUNT(*)::int c FROM team_members WHERE team_id=$1', [id]);
    if (remaining.rows[0].c === 0) {
      const projs = await db.query('SELECT COUNT(*)::int c FROM projects WHERE team_id=$1', [id]);
      if (projs.rows[0].c === 0) {
        await db.query('DELETE FROM teams WHERE id=$1', [id]);
        return res.json({ ok: true, deleted: true });
      }
    }
    return res.json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: 'Failed to leave team.' });
  }
});

// DELETE /api/teams/:id — owner can delete if no submitted projects
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const membership = await isTeamMember(id, req.user.id);
    const teamR = await db.query('SELECT * FROM teams WHERE id=$1', [id]);
    if (teamR.rows.length === 0) return res.status(404).json({ error: 'Team not found.' });
    const isOwner = membership && membership.member_role === 'owner';
    if (!isOwner && req.user.role !== 'admin')
      return res.status(403).json({ error: 'Only the team owner can delete.' });
    const subs = await db.query(
      `SELECT COUNT(*)::int c FROM submissions s JOIN projects p ON p.id=s.project_id WHERE p.team_id=$1`,
      [id]
    );
    if (subs.rows[0].c > 0)
      return res.status(400).json({ error: 'Cannot delete a team with submitted projects.' });
    await db.query('DELETE FROM teams WHERE id=$1', [id]);
    return res.json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: 'Failed to delete team.' });
  }
});

// POST /api/teams/:id/invites — (re)generate invitation code; owner only
router.post('/:id/invites', requireAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const membership = await isTeamMember(id, req.user.id);
    if (!membership || (membership.member_role !== 'owner' && req.user.role !== 'admin'))
      return res.status(403).json({ error: 'Only the team owner can invite.' });
    const { regenerate } = req.body || {};
    let code;
    if (regenerate) {
      code = randomCode(8);
      const exp = new Date(Date.now() + 30 * 86400000).toISOString();
      await db.query(
        'UPDATE teams SET invite_code=$1, invite_expires_at=$2, updated_at=now() WHERE id=$3',
        [code, exp, id]
      );
    } else {
      const t = await db.query('SELECT invite_code FROM teams WHERE id=$1', [id]);
      code = t.rows[0].invite_code;
    }
    await db.query(
      'INSERT INTO team_invitations (team_id, code, created_by, status) VALUES ($1,$2,$3,\'pending\')',
      [id, code, req.user.id]
    );
    const team = await db.query('SELECT * FROM teams WHERE id=$1', [id]);
    return res.status(201).json({
      code,
      invite_url: `/join/${code}`,
      team: team.rows[0],
    });
  } catch (e) {
    return res.status(500).json({ error: 'Failed to create invitation.' });
  }
});

// GET /api/teams/:id/invites — list invitations (owner/staff)
router.get('/:id/invites', requireAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const membership = await isTeamMember(id, req.user.id);
    const isStaff = ['organizer', 'admin'].includes(req.user.role);
    if (!membership && !isStaff) return res.status(403).json({ error: 'Forbidden.' });
    const r = await db.query(
      'SELECT * FROM team_invitations WHERE team_id=$1 ORDER BY created_at DESC LIMIT 50',
      [id]
    );
    return res.json(r.rows);
  } catch (e) {
    return res.status(500).json({ error: 'Failed to load invitations.' });
  }
});

// GET /api/invites/:code/preview — public-ish preview (requires login to prevent enumeration abuse, but no membership needed)
router.get('/invites/:code/preview', requireAuth, async (req, res) => {
  try {
    const { code } = req.params;
    const t = await db.query(
      `SELECT t.*, e.title AS event_title FROM teams t JOIN events e ON e.id=t.event_id
       WHERE t.invite_code=$1 LIMIT 1`,
      [code]
    );
    if (t.rows.length === 0) return res.status(404).json({ error: 'Invalid invitation code.' });
    const team = t.rows[0];
    if (team.invite_expires_at && new Date(team.invite_expires_at) < new Date()) {
      await db.query(
        `UPDATE team_invitations SET status='expired' WHERE team_id=$1 AND code=$2 AND status='pending'`,
        [team.id, code]
      ).catch(() => {});
      return res.status(410).json({ error: 'This invitation has expired. Ask the team owner for a new link.' });
    }
    const members = await db.query(
      `SELECT u.name FROM team_members m JOIN users u ON u.id=m.user_id WHERE m.team_id=$1`,
      [team.id]
    );
    const already = await isTeamMember(team.id, req.user.id);
    return res.json({ team, members: members.rows, already_member: !!already });
  } catch (e) {
    return res.status(500).json({ error: 'Failed to preview invitation.' });
  }
});

// POST /api/invites/:code/accept
router.post('/invites/:code/accept', requireAuth, async (req, res) => {
  try {
    const { code } = req.params;
    const t = await db.query('SELECT * FROM teams WHERE invite_code=$1 LIMIT 1', [code]);
    if (t.rows.length === 0) return res.status(404).json({ error: 'Invalid invitation code.' });
    const team = t.rows[0];
    if (team.invite_expires_at && new Date(team.invite_expires_at) < new Date())
      return res.status(410).json({ error: 'This invitation has expired. Ask the team owner for a new link.' });
    const already = await isTeamMember(team.id, req.user.id);
    if (already) return res.status(409).json({ error: 'You are already in this team.' });
    // One team per event rule
    const mine = await userTeamsInEvent(req.user.id, team.event_id);
    if (mine.length > 0)
      return res.status(409).json({ error: 'You are already in a team for this event. Leave it first.' });
    await db.query(
      'INSERT INTO team_members (team_id, user_id, member_role) VALUES ($1,$2,\'member\')',
      [team.id, req.user.id]
    );
    await db.query(
      `INSERT INTO team_invitations (team_id, code, created_by, status, accepted_by, accepted_at)
       VALUES ($1,$2,$3,'accepted',$4, now())`,
      [team.id, code, team.created_by, req.user.id]
    );
    const full = await teamWithMembers(team.id);
    return res.json(full);
  } catch (e) {
    if (e.code === '23505')
      return res.status(409).json({ error: 'Already a member (duplicate prevented).' });
    return res.status(500).json({ error: 'Failed to accept invitation.' });
  }
});

module.exports = router;
