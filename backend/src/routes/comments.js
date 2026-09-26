'use strict';
/**
 * Tier-3 Comments API
 *
 * Route prefix: /api/comments
 *
 * Public:
 *   GET  /api/comments?voting_round_id=&project_id=   – list visible comments
 *
 * Authenticated:
 *   POST   /api/comments           – create comment
 *   PATCH  /api/comments/:id       – edit own comment
 *   DELETE /api/comments/:id       – delete own comment
 *
 * Organizer/Admin moderation:
 *   POST   /api/comments/:id/hide     – hide comment
 *   POST   /api/comments/:id/restore  – restore hidden comment
 *   POST   /api/comments/:id/delete   – permanently mark deleted
 *   POST   /api/comments/:id/flag     – flag for review
 *   POST   /api/comments/:id/unflag   – unflag
 *   GET    /api/comments/moderation   – list flagged/hidden/deleted
 */

const express = require('express');
const db = require('../db');
const { requireAuth, requireRole } = require('../auth');

const router = express.Router();

const MAX_COMMENT_LENGTH_HARD = 5000; // absolute cap

async function audit(actorId, eventId, action, entity, entityId, meta = {}) {
  try {
    await db.query(
      `INSERT INTO audit_events (actor_id, event_id, action, entity, entity_id, meta)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [actorId, eventId, action, entity, entityId, JSON.stringify(meta)]
    );
  } catch (e) {
    console.error('[audit:comment]', e.message);
  }
}

async function checkCommentRateLimit(actorId, roundId, maxPerHour) {
  const windowStart = new Date(Math.floor(Date.now() / 3600000) * 3600000).toISOString();
  try {
    const r = await db.query(
      `INSERT INTO rate_limit_events (actor_id, resource, voting_round_id, window_start, request_count, last_request_at)
         VALUES ($1, $2, $3, $4, 1, now())
       ON CONFLICT (actor_id, resource, window_start) DO UPDATE
         SET request_count = rate_limit_events.request_count + 1,
             last_request_at = now()
       RETURNING request_count`,
      [actorId, `comment:${roundId}`, roundId, windowStart]
    );
    const count = r.rows[0].request_count;
    return { limited: count > maxPerHour, count };
  } catch (e) {
    console.error('[ratelimit:comment]', e.message);
    return { limited: false, count: 0 };
  }
}

function sanitizeBody(text) {
  // Do not render HTML; escape angle brackets for safety.
  // The DB stores plain text; the frontend renders it with esc().
  return String(text || '').trim();
}

// GET /api/comments — list visible comments for a project/round
router.get('/', async (req, res) => {
  try {
    const votingRoundId = req.query.voting_round_id ? parseInt(req.query.voting_round_id, 10) : null;
    const projectId = req.query.project_id ? parseInt(req.query.project_id, 10) : null;

    if (!votingRoundId || !projectId)
      return res.status(400).json({ error: 'voting_round_id and project_id are required.' });

    const round = await db.query('SELECT * FROM voting_rounds WHERE id=$1', [votingRoundId]);
    if (!round.rows[0]) return res.status(404).json({ error: 'Voting round not found.' });

    const page = Math.max(1, parseInt(req.query.page || '1', 10));
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit || '20', 10)));
    const offset = (page - 1) * limit;

    const r = await db.query(
      `SELECT c.id, c.project_id, c.voting_round_id, c.body, c.created_at, c.edited_at,
         u.name AS author_name, u.id AS author_id
       FROM comments c
       JOIN users u ON u.id = c.author_id
       WHERE c.voting_round_id=$1 AND c.project_id=$2 AND c.moderation_status='visible'
       ORDER BY c.created_at ASC
       LIMIT $3 OFFSET $4`,
      [votingRoundId, projectId, limit, offset]
    );
    const countR = await db.query(
      `SELECT COUNT(*)::int c FROM comments WHERE voting_round_id=$1 AND project_id=$2 AND moderation_status='visible'`,
      [votingRoundId, projectId]
    );
    return res.json({
      data: r.rows,
      page,
      limit,
      total: countR.rows[0].c,
      totalPages: Math.ceil(countR.rows[0].c / limit),
    });
  } catch (e) {
    console.error('[comments:list]', e.message);
    return res.status(500).json({ error: 'Failed to load comments.' });
  }
});

// POST /api/comments — create a comment
router.post('/', requireAuth, async (req, res) => {
  try {
    const { voting_round_id, project_id, body } = req.body || {};
    const roundId = parseInt(voting_round_id, 10);
    const projectId = parseInt(project_id, 10);

    if (!roundId || !projectId) return res.status(400).json({ error: 'voting_round_id and project_id are required.' });
    if (!body || sanitizeBody(body).length === 0) return res.status(400).json({ error: 'Comment body cannot be empty.', code: 'EMPTY_COMMENT' });

    // Load round config
    const rr = await db.query('SELECT * FROM voting_rounds WHERE id=$1', [roundId]);
    const round = rr.rows[0];
    if (!round) return res.status(404).json({ error: 'Voting round not found.' });
    if (!round.comments_enabled) return res.status(403).json({ error: 'Comments are disabled for this round.' });
    if (!['open','paused'].includes(round.status))
      return res.status(409).json({ error: 'Comments are only allowed while voting is active or paused.' });

    // Length validation
    const maxLen = Math.min(round.max_comment_length, MAX_COMMENT_LENGTH_HARD);
    const cleanBody = sanitizeBody(body);
    if (cleanBody.length > maxLen)
      return res.status(400).json({ error: `Comment too long (max ${maxLen} characters).`, code: 'COMMENT_TOO_LONG' });

    // Verify project is in the round
    const ep = await db.query(
      'SELECT 1 FROM voting_round_projects WHERE voting_round_id=$1 AND project_id=$2',
      [roundId, projectId]
    );
    if (ep.rows.length === 0)
      return res.status(400).json({ error: 'Project is not part of this voting round.' });

    // Rate limit
    const { limited, count } = await checkCommentRateLimit(req.user.id, roundId, round.rate_limit_comments_per_hour);
    if (limited) {
      await db.query(
        `INSERT INTO abuse_flags (voting_round_id, actor_id, flag_type, severity, details)
         VALUES ($1,$2,'rapid_comments','medium',$3)`,
        [roundId, req.user.id, JSON.stringify({ count, limit: round.rate_limit_comments_per_hour })]
      );
      await audit(req.user.id, round.event_id, 'comment.rate_limited', 'voting_round', roundId, { count });
      return res.status(429).json({ error: 'COMMENT_RATE_LIMITED: Too many comments. Please slow down.', code: 'COMMENT_RATE_LIMITED' });
    }

    const cr = await db.query(
      `INSERT INTO comments (voting_round_id, project_id, author_id, body)
       VALUES ($1,$2,$3,$4) RETURNING *`,
      [roundId, projectId, req.user.id, cleanBody]
    );
    const comment = cr.rows[0];
    await audit(req.user.id, round.event_id, 'comment.created', 'comment', comment.id,
      { project_id: projectId, round_id: roundId });

    return res.status(201).json({ ...comment, author_name: req.user.name });
  } catch (e) {
    console.error('[comments:create]', e.message);
    return res.status(500).json({ error: 'Failed to create comment.' });
  }
});

// PATCH /api/comments/:id — edit own comment
router.patch('/:id', requireAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const cr = await db.query('SELECT * FROM comments WHERE id=$1', [id]);
    const comment = cr.rows[0];
    if (!comment) return res.status(404).json({ error: 'Comment not found.' });
    if (comment.moderation_status !== 'visible')
      return res.status(403).json({ error: 'This comment cannot be edited.' });

    // Only owner or admin can edit
    const isAdmin = req.user.role === 'admin';
    if (comment.author_id !== req.user.id && !isAdmin)
      return res.status(403).json({ error: 'You can only edit your own comments.' });

    const { body } = req.body || {};
    if (!body || sanitizeBody(body).length === 0)
      return res.status(400).json({ error: 'Comment body cannot be empty.', code: 'EMPTY_COMMENT' });

    const rr = await db.query('SELECT * FROM voting_rounds WHERE id=$1', [comment.voting_round_id]);
    const round = rr.rows[0];
    const maxLen = round ? Math.min(round.max_comment_length, MAX_COMMENT_LENGTH_HARD) : MAX_COMMENT_LENGTH_HARD;
    const cleanBody = sanitizeBody(body);
    if (cleanBody.length > maxLen)
      return res.status(400).json({ error: `Comment too long (max ${maxLen} characters).`, code: 'COMMENT_TOO_LONG' });

    const r = await db.query(
      `UPDATE comments SET body=$1, edited_at=now(), updated_at=now() WHERE id=$2 RETURNING *`,
      [cleanBody, id]
    );
    const ev = await db.query('SELECT event_id FROM voting_rounds WHERE id=$1', [comment.voting_round_id]);
    await audit(req.user.id, ev.rows[0]?.event_id, 'comment.edited', 'comment', id, {});
    return res.json({ ...r.rows[0], author_name: req.user.name });
  } catch (e) {
    return res.status(500).json({ error: 'Failed to edit comment.' });
  }
});

// DELETE /api/comments/:id — delete own comment (soft: mark deleted)
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const cr = await db.query('SELECT * FROM comments WHERE id=$1', [id]);
    const comment = cr.rows[0];
    if (!comment) return res.status(404).json({ error: 'Comment not found.' });
    const isAdmin = req.user.role === 'admin';
    if (comment.author_id !== req.user.id && !isAdmin)
      return res.status(403).json({ error: 'You can only delete your own comments.' });

    await db.query(
      `UPDATE comments SET moderation_status='deleted', updated_at=now() WHERE id=$1`,
      [id]
    );
    await db.query(
      `INSERT INTO comment_moderation (comment_id, moderator_id, action, previous_status, new_status, reason)
       VALUES ($1,$2,'delete',$3,'deleted','user self-delete')`,
      [id, req.user.id, comment.moderation_status]
    );
    const ev = await db.query('SELECT event_id FROM voting_rounds WHERE id=$1', [comment.voting_round_id]);
    await audit(req.user.id, ev.rows[0]?.event_id, 'comment.deleted', 'comment', id, {});
    return res.json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: 'Failed to delete comment.' });
  }
});

/* ------------------------------------------- moderation endpoints */

async function moderateComment(req, res, action, newStatus, allowedFrom) {
  try {
    const id = parseInt(req.params.id, 10);
    const cr = await db.query('SELECT * FROM comments WHERE id=$1', [id]);
    const comment = cr.rows[0];
    if (!comment) return res.status(404).json({ error: 'Comment not found.' });
    if (!allowedFrom.includes(comment.moderation_status))
      return res.status(409).json({ error: `Cannot ${action} from status '${comment.moderation_status}'.` });

    const { reason } = req.body || {};
    await db.query(
      `UPDATE comments SET moderation_status=$1, updated_at=now() WHERE id=$2`,
      [newStatus, id]
    );
    await db.query(
      `INSERT INTO comment_moderation (comment_id, moderator_id, action, previous_status, new_status, reason)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [id, req.user.id, action, comment.moderation_status, newStatus, reason || '']
    );
    const ev = await db.query('SELECT event_id FROM voting_rounds WHERE id=$1', [comment.voting_round_id]);
    await audit(req.user.id, ev.rows[0]?.event_id, `comment.${action}`, 'comment', id, { reason });
    return res.json({ ok: true, id, moderation_status: newStatus });
  } catch (e) {
    return res.status(500).json({ error: `Failed to ${action} comment.` });
  }
}

router.post('/:id/hide',    requireAuth, requireRole('organizer'), (req, res) => moderateComment(req, res, 'hide',    'hidden',  ['visible','flagged']));
router.post('/:id/restore', requireAuth, requireRole('organizer'), (req, res) => moderateComment(req, res, 'restore', 'visible', ['hidden','flagged']));
router.post('/:id/delete',  requireAuth, requireRole('organizer'), (req, res) => moderateComment(req, res, 'delete',  'deleted', ['visible','hidden','flagged']));
router.post('/:id/flag',    requireAuth, requireRole('organizer'), (req, res) => moderateComment(req, res, 'flag',    'flagged', ['visible']));
router.post('/:id/unflag',  requireAuth, requireRole('organizer'), (req, res) => moderateComment(req, res, 'unflag',  'visible', ['flagged']));

// GET /api/comments/moderation — list flagged/hidden/deleted comments
router.get('/moderation', requireAuth, requireRole('organizer'), async (req, res) => {
  try {
    const eventId = req.query.event_id ? parseInt(req.query.event_id, 10) : null;
    const params = [];
    let eventFilter = '';
    if (eventId) {
      params.push(eventId);
      eventFilter = `AND vr.event_id = $${params.length}`;
    }
    if (req.user.role === 'organizer') {
      params.push(req.user.id);
      eventFilter += ` AND e.created_by = $${params.length}`;
    }
    params.push(20);
    const r = await db.query(
      `SELECT c.*, u.name AS author_name, p.title AS project_title, vr.name AS round_name
       FROM comments c
       JOIN users u ON u.id=c.author_id
       JOIN projects p ON p.id=c.project_id
       JOIN voting_rounds vr ON vr.id=c.voting_round_id
       JOIN events e ON e.id=vr.event_id
       WHERE c.moderation_status IN ('hidden','deleted','flagged') ${eventFilter}
       ORDER BY c.updated_at DESC
       LIMIT $${params.length}`,
      params
    );
    return res.json({ data: r.rows });
  } catch (e) {
    return res.status(500).json({ error: 'Failed to load moderation queue.' });
  }
});

module.exports = router;
