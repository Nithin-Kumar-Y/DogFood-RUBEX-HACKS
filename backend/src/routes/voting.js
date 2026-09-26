'use strict';
/**
 * Tier-3 Voting API
 *
 * Route prefix: /api/voting
 *
 * Public endpoints (no auth):
 *   GET  /api/voting                          – list voting rounds (active/revealed)
 *   GET  /api/voting/:id                      – get round detail
 *   GET  /api/voting/:id/projects             – randomized eligible project list
 *   GET  /api/voting/:id/results              – results (only after reveal; hides live)
 *
 * Authenticated (participant+):
 *   POST   /api/voting/:id/votes              – cast a vote
 *   DELETE /api/voting/:id/votes/:projectId   – withdraw vote (if allowed)
 *   GET    /api/voting/:id/my-votes           – my vote state
 *
 * Organizer/Admin management:
 *   POST   /api/voting                        – create voting round
 *   PATCH  /api/voting/:id                    – update config
 *   POST   /api/voting/:id/projects           – add projects to round
 *   DELETE /api/voting/:id/projects/:pid      – remove project from round
 *   POST   /api/voting/:id/open              – open voting
 *   POST   /api/voting/:id/pause             – pause voting
 *   POST   /api/voting/:id/close             – close voting
 *   POST   /api/voting/:id/reveal            – reveal results
 *   POST   /api/voting/:id/archive           – archive round
 *   GET    /api/voting/:id/analytics          – live analytics (organizer only)
 *   GET    /api/voting/:id/audit              – audit trail
 *   GET    /api/voting/:id/moderation         – flagged votes/abuse
 *   DELETE /api/voting/:id/votes/:projectId/user/:userId – admin remove vote
 */

const express = require('express');
const db = require('../db');
const { requireAuth, requireRole } = require('../auth');

const router = express.Router();

/* ------------------------------------------------------------------ helpers */

async function audit(actorId, eventId, action, entity = '', entityId = null, meta = {}) {
  try {
    await db.query(
      `INSERT INTO audit_events (actor_id, event_id, action, entity, entity_id, meta)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [actorId, eventId, action, entity, entityId, JSON.stringify(meta)]
    );
  } catch (e) {
    console.error('[audit:voting]', e.message);
  }
}

async function getRound(id) {
  const r = await db.query('SELECT * FROM voting_rounds WHERE id=$1', [id]);
  return r.rows[0] || null;
}

function canManage(user, round, event) {
  if (!user || !round) return false;
  if (user.role === 'admin') return true;
  return user.role === 'organizer' && event && event.created_by === user.id;
}

/**
 * In-DB rate limiter: counts requests per (actor, resource) in a 1-hour window.
 * Returns { limited: bool, count: int }.
 */
async function checkRateLimit(actorId, resource, maxPerHour, votingRoundId = null) {
  const windowStart = new Date(Math.floor(Date.now() / 3600000) * 3600000).toISOString();
  try {
    // Upsert the counter for this actor+resource+window
    const r = await db.query(
      `INSERT INTO rate_limit_events (actor_id, resource, voting_round_id, window_start, request_count, last_request_at)
         VALUES ($1, $2, $3, $4, 1, now())
       ON CONFLICT (actor_id, resource, window_start) DO UPDATE
         SET request_count = rate_limit_events.request_count + 1,
             last_request_at = now()
       RETURNING request_count`,
      [actorId, resource, votingRoundId, windowStart]
    );
    const count = r.rows[0].request_count;
    return { limited: count > maxPerHour, count };
  } catch (e) {
    // If rate-limit table fails, fail open (don't block legitimate requests)
    console.error('[ratelimit]', e.message);
    return { limited: false, count: 0 };
  }
}

/**
 * Flag potentially abusive activity.
 */
async function flagAbuse(votingRoundId, actorId, flagType, severity, details) {
  try {
    await db.query(
      `INSERT INTO abuse_flags (voting_round_id, actor_id, flag_type, severity, details)
       VALUES ($1,$2,$3,$4,$5)`,
      [votingRoundId, actorId, flagType, severity, JSON.stringify(details)]
    );
  } catch (e) {
    console.error('[abuse_flag]', e.message);
  }
}

/**
 * Seeded deterministic shuffle for stable randomized project ordering.
 * Uses mulberry32 PRNG seeded from votingRoundId + userId.
 * The same (round, user) always produces the same ordering within an hour,
 * but different users get different orderings.
 */
function deterministicShuffle(arr, seed) {
  const copy = [...arr];
  let s = seed >>> 0;
  function rand() {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function getOrderSeed(roundId, userId) {
  // Combine round ID, user ID, and current hour for stable-per-hour ordering
  const hourBucket = Math.floor(Date.now() / 3600000);
  return (roundId * 999983 + (userId || 0) * 100003 + hourBucket * 7) | 0;
}

/* --------------------------------------------------------- public endpoints */

// GET /api/voting — list rounds that are open or results-revealed for this event
router.get('/', async (req, res) => {
  try {
    const eventId = req.query.event_id ? parseInt(req.query.event_id, 10) : null;
    const conds = [`vr.status IN ('open','paused','closed','results_revealed')`];
    const params = [];
    if (eventId) {
      params.push(eventId);
      conds.push(`vr.event_id = $${params.length}`);
    }
    const r = await db.query(
      `SELECT vr.*, e.title AS event_title,
         (SELECT COUNT(*)::int FROM voting_round_projects vrp WHERE vrp.voting_round_id=vr.id) AS project_count,
         (SELECT COUNT(DISTINCT voter_id)::int FROM community_votes cv WHERE cv.voting_round_id=vr.id AND cv.status='active') AS voter_count
       FROM voting_rounds vr
       JOIN events e ON e.id = vr.event_id
       WHERE ${conds.join(' AND ')}
       ORDER BY vr.voting_start DESC NULLS LAST`,
      params
    );
    return res.json({ data: r.rows });
  } catch (e) {
    console.error('[voting:list]', e.message);
    return res.status(500).json({ error: 'Failed to load voting rounds.' });
  }
});

// GET /api/voting/:id — round detail (public)
router.get('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const round = await getRound(id);
    if (!round) return res.status(404).json({ error: 'Voting round not found.' });
    // Only expose open/revealed rounds to the public; organizer/admin see all
    const isManager = req.user && (req.user.role === 'admin' ||
      (req.user.role === 'organizer'));
    if (!isManager && !['open','paused','closed','results_revealed','scheduled'].includes(round.status)) {
      return res.status(404).json({ error: 'Voting round not found.' });
    }
    const ev = await db.query('SELECT title FROM events WHERE id=$1', [round.event_id]);
    return res.json({ ...round, event_title: ev.rows[0]?.title });
  } catch (e) {
    return res.status(500).json({ error: 'Failed to load voting round.' });
  }
});

// GET /api/voting/:id/projects — randomized eligible project list
router.get('/:id/projects', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const round = await getRound(id);
    if (!round) return res.status(404).json({ error: 'Voting round not found.' });
    if (!['open','paused','closed','results_revealed'].includes(round.status) &&
        !(req.user && (req.user.role === 'admin' || req.user.role === 'organizer'))) {
      return res.status(403).json({ error: 'Voting is not currently active.' });
    }

    const r = await db.query(
      `SELECT p.id, p.title, SUBSTRING(p.description, 1, 280) AS excerpt,
         t.name AS team_name, et.name AS track_name, e.title AS event_title,
         s.submitted_at
       FROM voting_round_projects vrp
       JOIN projects p ON p.id = vrp.project_id
       JOIN teams t ON t.id = p.team_id
       JOIN events e ON e.id = p.event_id
       LEFT JOIN event_tracks et ON et.id = p.track_id
       JOIN submissions s ON s.project_id = p.id
       WHERE vrp.voting_round_id = $1`,
      [id]
    );
    let projects = r.rows;

    // Apply stable randomized ordering if enabled
    if (round.randomized_ordering) {
      const userId = req.user ? req.user.id : 0;
      const seed = getOrderSeed(id, userId);
      projects = deterministicShuffle(projects, seed);
    }

    // If user is authenticated, annotate which projects they've already voted for
    let myVotes = new Set();
    let myVoteCount = 0;
    if (req.user) {
      const vr = await db.query(
        `SELECT project_id FROM community_votes WHERE voting_round_id=$1 AND voter_id=$2 AND status='active'`,
        [id, req.user.id]
      );
      myVotes = new Set(vr.rows.map(v => v.project_id));
      myVoteCount = myVotes.size;
    }

    const annotated = projects.map(p => ({
      ...p,
      has_voted: myVotes.has(p.id),
    }));

    const remainingVotes = req.user
      ? Math.max(0, round.max_votes_per_user - myVoteCount)
      : null;

    return res.json({
      data: annotated,
      total: annotated.length,
      votes_remaining: remainingVotes,
      max_votes_per_user: round.max_votes_per_user,
      results_hidden: round.results_hidden_during_voting && round.status === 'open',
    });
  } catch (e) {
    console.error('[voting:projects]', e.message);
    return res.status(500).json({ error: 'Failed to load projects.' });
  }
});

// GET /api/voting/:id/results — public results (only after reveal)
router.get('/:id/results', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const round = await getRound(id);
    if (!round) return res.status(404).json({ error: 'Voting round not found.' });

    const isManager = req.user && (req.user.role === 'admin' ||
      (req.user.role === 'organizer'));

    // Enforce: live results hidden from public while voting is open (backend-enforced, not CSS)
    if (!isManager) {
      if (round.results_hidden_during_voting) {
        // Results only available after explicit reveal by organizer
        if (!['results_revealed'].includes(round.status)) {
          return res.status(403).json({
            error: round.status === 'open' || round.status === 'paused'
              ? 'Results are hidden while voting is active.'
              : 'Results have not been revealed yet.',
            status: round.status,
          });
        }
      } else {
        // results_hidden=false: results available once round is at least open
        if (!['open','paused','closed','results_revealed'].includes(round.status)) {
          return res.status(403).json({
            error: 'Results are not yet available.',
            status: round.status,
          });
        }
      }
    }

    const r = await db.query(
      `SELECT p.id, p.title, t.name AS team_name, et.name AS track_name,
         COUNT(cv.id) FILTER (WHERE cv.status='active')::int AS vote_count
       FROM voting_round_projects vrp
       JOIN projects p ON p.id = vrp.project_id
       JOIN teams t ON t.id = p.team_id
       LEFT JOIN event_tracks et ON et.id = p.track_id
       LEFT JOIN community_votes cv ON cv.project_id = p.id AND cv.voting_round_id = $1
       WHERE vrp.voting_round_id = $1
       GROUP BY p.id, p.title, t.name, et.name
       ORDER BY vote_count DESC, p.id ASC`,
      [id]
    );
    const rows = r.rows;
    const total = rows.reduce((s, x) => s + x.vote_count, 0);

    // Assign ranks: equal votes = same rank (dense ranking)
    let rank = 1;
    for (let i = 0; i < rows.length; i++) {
      if (i > 0 && rows[i].vote_count < rows[i - 1].vote_count) rank = i + 1;
      rows[i].rank = rank;
      rows[i].percentage = total > 0
        ? Math.round((rows[i].vote_count / total) * 1000) / 10
        : 0;
    }

    return res.json({
      round_id: id,
      round_name: round.name,
      status: round.status,
      total_votes: total,
      results: rows,
    });
  } catch (e) {
    console.error('[voting:results]', e.message);
    return res.status(500).json({ error: 'Failed to load results.' });
  }
});

/* --------------------------------------------------------- voting endpoints */

// GET /api/voting/:id/my-votes — authenticated user's vote state
router.get('/:id/my-votes', requireAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const round = await getRound(id);
    if (!round) return res.status(404).json({ error: 'Voting round not found.' });
    const r = await db.query(
      `SELECT cv.project_id, cv.status, cv.cast_at, p.title AS project_title
       FROM community_votes cv
       JOIN projects p ON p.id = cv.project_id
       WHERE cv.voting_round_id=$1 AND cv.voter_id=$2`,
      [id, req.user.id]
    );
    const active = r.rows.filter(v => v.status === 'active');
    return res.json({
      votes: r.rows,
      active_count: active.length,
      votes_remaining: Math.max(0, round.max_votes_per_user - active.length),
      max_votes_per_user: round.max_votes_per_user,
    });
  } catch (e) {
    return res.status(500).json({ error: 'Failed to load your votes.' });
  }
});

// POST /api/voting/:id/votes — cast a vote (TRANSACTIONAL)
router.post('/:id/votes', requireAuth, async (req, res) => {
  const roundId = parseInt(req.params.id, 10);
  const { project_id } = req.body || {};
  const projectId = parseInt(project_id, 10);

  if (!projectId || isNaN(projectId)) {
    return res.status(400).json({ error: 'project_id is required.' });
  }

  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    // 1. Verify voting round exists and is OPEN
    const rr = await client.query('SELECT * FROM voting_rounds WHERE id=$1 FOR UPDATE', [roundId]);
    const round = rr.rows[0];
    if (!round) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Voting round not found.' }); }
    if (round.status !== 'open') {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: `Voting is not open (status: ${round.status}).`, code: 'VOTING_NOT_OPEN' });
    }

    // 2. Check voting window (backend-enforced)
    const now = new Date();
    if (round.voting_start && now < new Date(round.voting_start)) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'Voting has not started yet.', code: 'VOTING_NOT_STARTED' });
    }
    if (round.voting_end && now > new Date(round.voting_end)) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'Voting has ended.', code: 'VOTING_ENDED' });
    }

    // 3. Rate limiting
    const { limited, count } = await checkRateLimit(
      req.user.id, `vote:${roundId}`, round.rate_limit_votes_per_hour, roundId
    );
    if (limited) {
      await client.query('ROLLBACK');
      await flagAbuse(roundId, req.user.id, 'rapid_votes', 'medium', { count, limit: round.rate_limit_votes_per_hour });
      await audit(req.user.id, round.event_id, 'vote.rate_limited', 'voting_round', roundId,
        { project_id: projectId, count });
      return res.status(429).json({
        error: 'VOTE_RATE_LIMITED: Too many vote requests. Please slow down.',
        code: 'VOTE_RATE_LIMITED',
      });
    }

    // 4. Verify project is eligible for this round
    const ep = await client.query(
      'SELECT 1 FROM voting_round_projects WHERE voting_round_id=$1 AND project_id=$2',
      [roundId, projectId]
    );
    if (ep.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Project is not eligible for this voting round.', code: 'PROJECT_NOT_ELIGIBLE' });
    }

    // 5. Check user's active vote count hasn't exceeded limit
    const vc = await client.query(
      `SELECT COUNT(*)::int c FROM community_votes WHERE voting_round_id=$1 AND voter_id=$2 AND status='active'`,
      [roundId, req.user.id]
    );
    if (vc.rows[0].c >= round.max_votes_per_user) {
      await client.query('ROLLBACK');
      await flagAbuse(roundId, req.user.id, 'quota_exceeded', 'low', { quota: round.max_votes_per_user });
      await audit(req.user.id, round.event_id, 'vote.quota_exceeded', 'voting_round', roundId,
        { project_id: projectId, count: vc.rows[0].c });
      return res.status(409).json({
        error: `Vote limit reached (${round.max_votes_per_user} max).`,
        code: 'VOTE_LIMIT_REACHED',
        votes_used: vc.rows[0].c,
        max_votes: round.max_votes_per_user,
      });
    }

    // 6. Check per-project limit
    if (round.max_votes_per_project > 1) {
      const pvc = await client.query(
        `SELECT COUNT(*)::int c FROM community_votes WHERE voting_round_id=$1 AND voter_id=$2 AND project_id=$3 AND status='active'`,
        [roundId, req.user.id, projectId]
      );
      if (pvc.rows[0].c >= round.max_votes_per_project) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: 'Already voted for this project.', code: 'DUPLICATE_VOTE' });
      }
    }

    // 7. Attempt to insert vote (DB UNIQUE constraint catches concurrent dupes)
    let vote;
    try {
      const vi = await client.query(
        `INSERT INTO community_votes (voting_round_id, voter_id, project_id, status)
         VALUES ($1,$2,$3,'active') RETURNING *`,
        [roundId, req.user.id, projectId]
      );
      vote = vi.rows[0];
    } catch (err) {
      await client.query('ROLLBACK');
      if (err.code === '23505') {
        // Unique constraint violation — duplicate vote
        await flagAbuse(roundId, req.user.id, 'duplicate_vote_attempt', 'low', { project_id: projectId });
        await audit(req.user.id, round.event_id, 'vote.duplicate_rejected', 'community_vote', null,
          { project_id: projectId });
        return res.status(409).json({ error: 'Duplicate vote: you already voted for this project.', code: 'DUPLICATE_VOTE' });
      }
      throw err;
    }

    // 8. Record vote history
    await client.query(
      `INSERT INTO vote_history (vote_id, action, actor_id) VALUES ($1,'cast',$2)`,
      [vote.id, req.user.id]
    );

    // 9. Audit
    await client.query(
      `INSERT INTO audit_events (actor_id, event_id, action, entity, entity_id, meta)
       VALUES ($1,$2,'vote.cast','community_vote',$3,$4)`,
      [req.user.id, round.event_id, vote.id, JSON.stringify({ project_id: projectId, round_id: roundId })]
    );

    await client.query('COMMIT');

    // Return remaining votes
    const newCount = vc.rows[0].c + 1;
    return res.status(201).json({
      vote,
      votes_used: newCount,
      votes_remaining: Math.max(0, round.max_votes_per_user - newCount),
    });
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch (_) {}
    console.error('[voting:cast]', e.message);
    return res.status(500).json({ error: 'Failed to cast vote.' });
  } finally {
    client.release();
  }
});

// DELETE /api/voting/:id/votes/:projectId — withdraw own vote
router.delete('/:id/votes/:projectId', requireAuth, async (req, res) => {
  const roundId = parseInt(req.params.id, 10);
  const projectId = parseInt(req.params.projectId, 10);

  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    const rr = await client.query('SELECT * FROM voting_rounds WHERE id=$1', [roundId]);
    const round = rr.rows[0];
    if (!round) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Voting round not found.' }); }
    if (!round.allow_vote_change) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Vote changes are not allowed for this round.', code: 'VOTE_CHANGE_DISABLED' });
    }
    if (round.status !== 'open') {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'Voting is not open.', code: 'VOTING_NOT_OPEN' });
    }

    const vr = await client.query(
      `SELECT * FROM community_votes WHERE voting_round_id=$1 AND voter_id=$2 AND project_id=$3`,
      [roundId, req.user.id, projectId]
    );
    if (vr.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Vote not found.' });
    }
    const vote = vr.rows[0];
    if (vote.status !== 'active') {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'Vote is already withdrawn.' });
    }

    await client.query(
      `UPDATE community_votes SET status='withdrawn', updated_at=now() WHERE id=$1`,
      [vote.id]
    );
    await client.query(
      `INSERT INTO vote_history (vote_id, action, actor_id) VALUES ($1,'withdrawn',$2)`,
      [vote.id, req.user.id]
    );
    await client.query(
      `INSERT INTO audit_events (actor_id, event_id, action, entity, entity_id, meta)
       VALUES ($1,$2,'vote.withdrawn','community_vote',$3,$4)`,
      [req.user.id, round.event_id, vote.id, JSON.stringify({ project_id: projectId })]
    );

    await client.query('COMMIT');
    return res.json({ ok: true, message: 'Vote withdrawn.' });
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch (_) {}
    return res.status(500).json({ error: 'Failed to withdraw vote.' });
  } finally {
    client.release();
  }
});

/* ------------------------------------------------- organizer/admin endpoints */

// POST /api/voting — create voting round
router.post('/', requireAuth, requireRole('organizer'), async (req, res) => {
  try {
    const {
      event_id, name, description, voting_start, voting_end,
      max_votes_per_user = 5, max_votes_per_project = 1,
      allow_vote_change = false, comments_enabled = true,
      comments_require_auth = true, results_hidden_during_voting = true,
      randomized_ordering = true,
      rate_limit_votes_per_hour = 20, rate_limit_comments_per_hour = 10,
      max_comment_length = 1000,
    } = req.body || {};

    if (!event_id) return res.status(400).json({ error: 'event_id is required.' });
    if (!name || String(name).trim().length < 3)
      return res.status(400).json({ error: 'name must be at least 3 characters.' });

    const ev = await db.query('SELECT * FROM events WHERE id=$1', [parseInt(event_id, 10)]);
    if (!ev.rows[0]) return res.status(404).json({ error: 'Event not found.' });
    const event = ev.rows[0];
    if (req.user.role !== 'admin' && event.created_by !== req.user.id)
      return res.status(403).json({ error: 'You can only create voting rounds for your own events.' });

    const r = await db.query(
      `INSERT INTO voting_rounds
         (event_id, name, description, status, voting_start, voting_end,
          max_votes_per_user, max_votes_per_project, allow_vote_change,
          comments_enabled, comments_require_auth, results_hidden_during_voting,
          randomized_ordering, rate_limit_votes_per_hour, rate_limit_comments_per_hour,
          max_comment_length, created_by)
       VALUES ($1,$2,$3,'draft',$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
       RETURNING *`,
      [
        parseInt(event_id, 10), String(name).trim(), description || '',
        voting_start || null, voting_end || null,
        max_votes_per_user, max_votes_per_project, allow_vote_change,
        comments_enabled, comments_require_auth, results_hidden_during_voting,
        randomized_ordering, rate_limit_votes_per_hour, rate_limit_comments_per_hour,
        max_comment_length, req.user.id,
      ]
    );
    const round = r.rows[0];
    await audit(req.user.id, event.id, 'voting_round.created', 'voting_round', round.id, { name });
    return res.status(201).json(round);
  } catch (e) {
    console.error('[voting:create]', e.message);
    return res.status(500).json({ error: 'Failed to create voting round.' });
  }
});

// PATCH /api/voting/:id — update config (only in draft/scheduled)
router.patch('/:id', requireAuth, requireRole('organizer'), async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const round = await getRound(id);
    if (!round) return res.status(404).json({ error: 'Voting round not found.' });
    const ev = await db.query('SELECT * FROM events WHERE id=$1', [round.event_id]);
    if (!canManage(req.user, round, ev.rows[0]))
      return res.status(403).json({ error: 'Forbidden.' });
    if (!['draft', 'scheduled', 'paused'].includes(round.status))
      return res.status(409).json({ error: 'Cannot modify a round that is open, closed, or archived.' });

    const allowed = [
      'name','description','voting_start','voting_end','max_votes_per_user',
      'max_votes_per_project','allow_vote_change','comments_enabled',
      'comments_require_auth','results_hidden_during_voting','randomized_ordering',
      'rate_limit_votes_per_hour','rate_limit_comments_per_hour','max_comment_length',
    ];
    const sets = ['updated_at=now()'];
    const vals = [];
    for (const k of allowed) {
      if (req.body[k] !== undefined) {
        vals.push(req.body[k]);
        sets.push(`${k}=$${vals.length}`);
      }
    }
    if (vals.length === 0) return res.status(400).json({ error: 'No fields to update.' });
    vals.push(id);
    const r = await db.query(
      `UPDATE voting_rounds SET ${sets.join(',')} WHERE id=$${vals.length} RETURNING *`,
      vals
    );
    await audit(req.user.id, round.event_id, 'voting_round.updated', 'voting_round', id, req.body);
    return res.json(r.rows[0]);
  } catch (e) {
    return res.status(500).json({ error: 'Failed to update voting round.' });
  }
});

// POST /api/voting/:id/projects — add eligible projects
router.post('/:id/projects', requireAuth, requireRole('organizer'), async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const round = await getRound(id);
    if (!round) return res.status(404).json({ error: 'Voting round not found.' });
    const ev = await db.query('SELECT * FROM events WHERE id=$1', [round.event_id]);
    if (!canManage(req.user, round, ev.rows[0])) return res.status(403).json({ error: 'Forbidden.' });
    if (round.status === 'archived') return res.status(409).json({ error: 'Round is archived.' });

    const { project_ids } = req.body || {};
    if (!Array.isArray(project_ids) || project_ids.length === 0)
      return res.status(400).json({ error: 'project_ids array is required.' });

    let added = 0;
    for (const pid of project_ids) {
      const p = parseInt(pid, 10);
      // Verify project is submitted and belongs to this event
      const pr = await db.query(
        `SELECT 1 FROM projects WHERE id=$1 AND event_id=$2 AND status='submitted'`,
        [p, round.event_id]
      );
      if (pr.rows.length === 0) continue;
      try {
        await db.query(
          `INSERT INTO voting_round_projects (voting_round_id, project_id, added_by)
           VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`,
          [id, p, req.user.id]
        );
        added++;
      } catch (_) {}
    }
    await audit(req.user.id, round.event_id, 'voting_round.projects_added', 'voting_round', id,
      { project_ids, added });
    return res.json({ ok: true, added });
  } catch (e) {
    return res.status(500).json({ error: 'Failed to add projects.' });
  }
});

// DELETE /api/voting/:id/projects/:pid — remove project from round
router.delete('/:id/projects/:pid', requireAuth, requireRole('organizer'), async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const pid = parseInt(req.params.pid, 10);
    const round = await getRound(id);
    if (!round) return res.status(404).json({ error: 'Voting round not found.' });
    const ev = await db.query('SELECT * FROM events WHERE id=$1', [round.event_id]);
    if (!canManage(req.user, round, ev.rows[0])) return res.status(403).json({ error: 'Forbidden.' });
    await db.query(
      'DELETE FROM voting_round_projects WHERE voting_round_id=$1 AND project_id=$2',
      [id, pid]
    );
    await audit(req.user.id, round.event_id, 'voting_round.project_removed', 'voting_round', id, { project_id: pid });
    return res.json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: 'Failed to remove project.' });
  }
});

// Lifecycle state transitions helper
async function transitionRound(req, res, targetStatus, action, allowedFrom) {
  try {
    const id = parseInt(req.params.id, 10);
    const round = await getRound(id);
    if (!round) return res.status(404).json({ error: 'Voting round not found.' });
    const ev = await db.query('SELECT * FROM events WHERE id=$1', [round.event_id]);
    if (!canManage(req.user, round, ev.rows[0])) return res.status(403).json({ error: 'Forbidden.' });
    if (!allowedFrom.includes(round.status))
      return res.status(409).json({ error: `Cannot ${action} from status '${round.status}'.` });
    const r = await db.query(
      'UPDATE voting_rounds SET status=$1, updated_at=now() WHERE id=$2 RETURNING *',
      [targetStatus, id]
    );
    await audit(req.user.id, round.event_id, `voting_round.${action}`, 'voting_round', id, { previous: round.status });
    return res.json(r.rows[0]);
  } catch (e) {
    return res.status(500).json({ error: `Failed to ${action} voting round.` });
  }
}

router.post('/:id/open',    requireAuth, requireRole('organizer'), (req, res) => transitionRound(req, res, 'open',             'opened',   ['draft','scheduled','paused']));
router.post('/:id/pause',   requireAuth, requireRole('organizer'), (req, res) => transitionRound(req, res, 'paused',           'paused',   ['open']));
router.post('/:id/close',   requireAuth, requireRole('organizer'), (req, res) => transitionRound(req, res, 'closed',           'closed',   ['open','paused']));
router.post('/:id/reveal',  requireAuth, requireRole('organizer'), (req, res) => transitionRound(req, res, 'results_revealed', 'revealed', ['closed']));
router.post('/:id/archive', requireAuth, requireRole('organizer'), (req, res) => transitionRound(req, res, 'archived',         'archived', ['closed','results_revealed']));

// GET /api/voting/:id/analytics — organizer live analytics (hidden from public)
router.get('/:id/analytics', requireAuth, requireRole('organizer'), async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const round = await getRound(id);
    if (!round) return res.status(404).json({ error: 'Voting round not found.' });
    const ev = await db.query('SELECT * FROM events WHERE id=$1', [round.event_id]);
    if (!canManage(req.user, round, ev.rows[0])) return res.status(403).json({ error: 'Forbidden.' });

    const [voters, votes, comments, rejected, flagged, rle] = await Promise.all([
      db.query(`SELECT COUNT(DISTINCT voter_id)::int c FROM community_votes WHERE voting_round_id=$1 AND status='active'`, [id]),
      db.query(`SELECT COUNT(*)::int c FROM community_votes WHERE voting_round_id=$1 AND status='active'`, [id]),
      db.query(`SELECT COUNT(*)::int c FROM comments WHERE voting_round_id=$1 AND moderation_status='visible'`, [id]),
      db.query(`SELECT COUNT(*)::int c FROM abuse_flags WHERE voting_round_id=$1`, [id]),
      db.query(`SELECT COUNT(*)::int c FROM abuse_flags WHERE voting_round_id=$1 AND reviewed=FALSE`, [id]),
      db.query(`SELECT COUNT(*)::int c FROM rate_limit_events WHERE voting_round_id=$1`, [id]),
    ]);

    // Top 10 projects by votes (organizer can always see this)
    const top = await db.query(
      `SELECT p.id, p.title,
         COUNT(cv.id) FILTER (WHERE cv.status='active')::int AS vote_count
       FROM voting_round_projects vrp
       JOIN projects p ON p.id=vrp.project_id
       LEFT JOIN community_votes cv ON cv.project_id=p.id AND cv.voting_round_id=$1
       WHERE vrp.voting_round_id=$1
       GROUP BY p.id, p.title
       ORDER BY vote_count DESC LIMIT 10`,
      [id]
    );

    return res.json({
      round,
      stats: {
        total_voters: voters.rows[0].c,
        total_valid_votes: votes.rows[0].c,
        total_comments: comments.rows[0].c,
        total_flagged_events: flagged.rows[0].c,
        unreviewed_flags: rejected.rows[0].c,
        rate_limit_events: rle.rows[0].c,
      },
      top_projects: top.rows,
    });
  } catch (e) {
    console.error('[voting:analytics]', e.message);
    return res.status(500).json({ error: 'Failed to load analytics.' });
  }
});

// GET /api/voting/:id/audit — audit trail for a voting round
router.get('/:id/audit', requireAuth, requireRole('organizer'), async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const round = await getRound(id);
    if (!round) return res.status(404).json({ error: 'Voting round not found.' });
    const ev = await db.query('SELECT * FROM events WHERE id=$1', [round.event_id]);
    if (!canManage(req.user, round, ev.rows[0])) return res.status(403).json({ error: 'Forbidden.' });

    const page = Math.max(1, parseInt(req.query.page || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit || '50', 10)));
    const offset = (page - 1) * limit;
    const actionFilter = req.query.action ? `AND ae.action ILIKE $3` : '';
    const params = [round.event_id, `%vote%`];
    if (req.query.action) params.push(`%${req.query.action}%`);
    params.push(limit, offset);

    const r = await db.query(
      `SELECT ae.*, u.name AS actor_name, u.email AS actor_email
       FROM audit_events ae
       LEFT JOIN users u ON u.id=ae.actor_id
       WHERE ae.event_id=$1 AND (ae.action ILIKE $2 OR ae.action ILIKE '%comment%' OR ae.action ILIKE '%voting%')
       ${actionFilter}
       ORDER BY ae.created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    return res.json({ data: r.rows, page, limit });
  } catch (e) {
    return res.status(500).json({ error: 'Failed to load audit trail.' });
  }
});

// GET /api/voting/:id/moderation — flagged abuse + rate-limit events
router.get('/:id/moderation', requireAuth, requireRole('organizer'), async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const round = await getRound(id);
    if (!round) return res.status(404).json({ error: 'Voting round not found.' });
    const ev = await db.query('SELECT * FROM events WHERE id=$1', [round.event_id]);
    if (!canManage(req.user, round, ev.rows[0])) return res.status(403).json({ error: 'Forbidden.' });

    const [flags, rle] = await Promise.all([
      db.query(
        `SELECT af.*, u.name AS actor_name FROM abuse_flags af
         LEFT JOIN users u ON u.id=af.actor_id
         WHERE af.voting_round_id=$1 ORDER BY af.created_at DESC LIMIT 100`,
        [id]
      ),
      db.query(
        `SELECT rle.*, u.name AS actor_name FROM rate_limit_events rle
         LEFT JOIN users u ON u.id=rle.actor_id
         WHERE rle.voting_round_id=$1 ORDER BY rle.last_request_at DESC LIMIT 100`,
        [id]
      ),
    ]);
    return res.json({ abuse_flags: flags.rows, rate_limit_events: rle.rows });
  } catch (e) {
    return res.status(500).json({ error: 'Failed to load moderation data.' });
  }
});

// DELETE /api/voting/:id/votes/:projectId/user/:userId — admin removes a vote
router.delete('/:id/votes/:projectId/user/:userId', requireAuth, requireRole('organizer'), async (req, res) => {
  try {
    const roundId = parseInt(req.params.id, 10);
    const projectId = parseInt(req.params.projectId, 10);
    const targetUserId = parseInt(req.params.userId, 10);
    const { reason } = req.body || {};

    const round = await getRound(roundId);
    if (!round) return res.status(404).json({ error: 'Voting round not found.' });
    const ev = await db.query('SELECT * FROM events WHERE id=$1', [round.event_id]);
    if (!canManage(req.user, round, ev.rows[0])) return res.status(403).json({ error: 'Forbidden.' });

    const vr = await db.query(
      `SELECT * FROM community_votes WHERE voting_round_id=$1 AND voter_id=$2 AND project_id=$3`,
      [roundId, targetUserId, projectId]
    );
    if (vr.rows.length === 0) return res.status(404).json({ error: 'Vote not found.' });
    const vote = vr.rows[0];

    await db.query(
      `UPDATE community_votes SET status='removed_by_admin', updated_at=now() WHERE id=$1`,
      [vote.id]
    );
    await db.query(
      `INSERT INTO vote_history (vote_id, action, actor_id, reason) VALUES ($1,'removed_by_admin',$2,$3)`,
      [vote.id, req.user.id, reason || '']
    );
    await audit(req.user.id, round.event_id, 'vote.removed_by_admin', 'community_vote', vote.id,
      { voter_id: targetUserId, project_id: projectId, reason });
    return res.json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: 'Failed to remove vote.' });
  }
});

module.exports = router;
