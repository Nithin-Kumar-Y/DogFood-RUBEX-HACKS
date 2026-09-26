'use strict';
// Idempotent demo seed: realistic organizer/admin/participants, events, tracks,
// prizes, teams, draft + submitted projects. Safe to run on every boot.
const bcrypt = require('bcryptjs');
const db = require('./db');
const { slugify, randomCode } = require('./util');

function daysFromNow(d, h = 12) {
  const x = new Date();
  x.setDate(x.getDate() + d);
  x.setHours(h, 0, 0, 0);
  return x;
}

async function ensureUser(email, name, role, password) {
  const existing = await db.query('SELECT * FROM users WHERE email=$1', [email]);
  if (existing.rows.length > 0) return existing.rows[0];
  const hash = await bcrypt.hash(password, 10);
  const r = await db.query(
    'INSERT INTO users (email, password_hash, name, role) VALUES ($1,$2,$3,$4) RETURNING *',
    [email, hash, name, role]
  );
  return r.rows[0];
}

async function seed() {
  const count = await db.query('SELECT COUNT(*)::int c FROM users');
  if (count.rows[0].c > 0) {
    // eslint-disable-next-line no-console
    console.log('[seed] users exist — skipping');
    return { skipped: true };
  }
  // eslint-disable-next-line no-console
  console.log('[seed] seeding demo data…');

  const admin = await ensureUser('admin@dogfood.local', 'Ada Admin', 'admin', 'Admin123!');
  const organizer = await ensureUser('organizer@dogfood.local', 'Olivia Organizer', 'organizer', 'Organizer123!');
  const judge = await ensureUser('judge@dogfood.local', 'Jasper Judge', 'judge', 'Judge123!');
  const participants = [];
  const names = [
    ['Priya Participant', 'priya@dogfood.local'],
    ['Sam Coder', 'sam@dogfood.local'],
    ['Lena Hacker', 'lena@dogfood.local'],
    ['Marco Maker', 'marco@dogfood.local'],
    ['Aisha Builder', 'aisha@dogfood.local'],
    ['Tom Tinkerer', 'tom@dogfood.local'],
  ];
  for (const [n, e] of names) {
    // eslint-disable-next-line no-await-in-loop
    participants.push(await ensureUser(e, n, 'participant', 'Password123!'));
  }

  async function createEvent({ title, description, startOff, endOff, deadlineOff, status, tracks, prizes }) {
    const starts = daysFromNow(startOff);
    const ends = daysFromNow(endOff, 18);
    const deadline = daysFromNow(deadlineOff, 17);
    const slug = `${slugify(title)}-${randomCode(3)}`;
    const r = await db.query(
      `INSERT INTO events (title, slug, description, starts_at, ends_at, submission_deadline, status, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [title, slug, description, starts.toISOString(), ends.toISOString(), deadline.toISOString(), status, organizer.id]
    );
    const ev = r.rows[0];
    const trackIds = [];
    for (let i = 0; i < tracks.length; i++) {
      // eslint-disable-next-line no-await-in-loop
      const tr = await db.query(
        'INSERT INTO event_tracks (event_id, name, description, position) VALUES ($1,$2,$3,$4) RETURNING *',
        [ev.id, tracks[i].name, tracks[i].description || '', i]
      );
      trackIds.push(tr.rows[0]);
    }
    for (let i = 0; i < prizes.length; i++) {
      // eslint-disable-next-line no-await-in-loop
      await db.query(
        'INSERT INTO prizes (event_id, title, description, amount, position) VALUES ($1,$2,$3,$4,$5)',
        [ev.id, prizes[i].title, prizes[i].description || '', prizes[i].amount || '', i]
      );
    }
    return { ev, trackIds };
  }

  const hack = await createEvent({
    title: 'Campus Hack 2026',
    description:
      'Our flagship 48-hour hackathon. Build something delightful: web apps, AI tools, games, or hardware hacks. Open to all skill levels with mentors on call.',
    startOff: -1,
    endOff: 2,
    deadlineOff: 2,
    status: 'published',
    tracks: [
      { name: 'Web & Mobile', description: 'Full-stack apps, PWAs, mobile experiences.' },
      { name: 'AI & Data', description: 'LLM apps, ML models, data visualizations.' },
      { name: 'Games & Fun', description: 'Games, creative coding, playful hardware.' },
    ],
    prizes: [
      { title: 'Grand Prize', description: 'Best overall build.', amount: '$1,500' },
      { title: 'Best Design', description: 'Outstanding UX and polish.', amount: '$500' },
      { title: 'Rookie Award', description: 'Best first-time hacker team.', amount: '$250' },
    ],
  });

  const past = await createEvent({
    title: 'Winter Mini-Hack 2025',
    description: 'A short archived showcase event from last season. Submissions are closed.',
    startOff: -60,
    endOff: -58,
    deadlineOff: -58,
    status: 'archived',
    tracks: [{ name: 'Open', description: 'Anything goes.' }],
    prizes: [{ title: 'Winner', description: 'Archived winner.', amount: '$100' }],
  });

  const upcoming = await createEvent({
    title: 'AI Builders Sprint',
    description: 'Draft event being prepared by organizers. Tracks and prizes are still being finalized.',
    startOff: 14,
    endOff: 16,
    deadlineOff: 16,
    status: 'draft',
    tracks: [{ name: 'LLM Apps', description: 'Prompt-powered products.' }],
    prizes: [{ title: 'Best AI Demo', description: 'Most impressive live demo.', amount: '$750' }],
  });

  async function createTeam(eventId, name, owner, members = []) {
    const code = randomCode(8);
    const exp = new Date(Date.now() + 30 * 86400000).toISOString();
    const t = await db.query(
      'INSERT INTO teams (event_id, name, invite_code, invite_expires_at, created_by) VALUES ($1,$2,$3,$4,$5) RETURNING *',
      [eventId, name, code, exp, owner.id]
    );
    const team = t.rows[0];
    await db.query(`INSERT INTO team_members (team_id, user_id, member_role) VALUES ($1,$2,'owner')`, [
      team.id,
      owner.id,
    ]);
    for (const m of members) {
      // eslint-disable-next-line no-await-in-loop
      await db.query(`INSERT INTO team_members (team_id, user_id, member_role) VALUES ($1,$2,'member') ON CONFLICT DO NOTHING`, [
        team.id,
        m.id,
      ]);
    }
    await db.query(
      `INSERT INTO team_invitations (team_id, code, created_by, status, accepted_by, accepted_at) VALUES ($1,$2,$3,'accepted',$3, now())`,
      [team.id, code, owner.id]
    );
    return team;
  }

  async function createProject(team, track, title, description, linkguids, author, submit) {
    const p = await db.query(
      `INSERT INTO projects (team_id, event_id, title, description, track_id, status, created_by)
       VALUES ($1,$2,$3,$4,$5,'draft',$6) RETURNING *`,
      [team.id, team.event_id, title, description, track ? track.id : null, author.id]
    );
    const proj = p.rows[0];
    for (let i = 0; i < linkguids.length; i++) {
      // eslint-disable-next-line no-await-in-loop
      await db.query(
        'INSERT INTO project_links (project_id, label, url, position) VALUES ($1,$2,$3,$4)',
        [proj.id, linkguids[i].label, linkguids[i].url, i]
      );
    }
    if (submit) {
      await db.query(
        `INSERT INTO submissions (project_id, event_id, team_id, submitted_by, snapshot)
         VALUES ($1,$2,$3,$4,$5)`,
        [proj.id, team.event_id, team.id, author.id, JSON.stringify({ title, description, links: linkguids })]
      );
      await db.query(`UPDATE projects SET status='submitted' WHERE id=$1`, [proj.id]);
    }
    return proj;
  }

  const [priya, sam, lena, marco, aisha, tom] = participants;
  const teamA = await createTeam(hack.ev.id, 'Pixel Pioneers', priya, [sam]);
  const teamB = await createTeam(hack.ev.id, 'Data Wizards', lena, [marco]);
  const teamC = await createTeam(hack.ev.id, 'Solo Rocket', aisha, []);

  const projA = await createProject(
    teamA,
    hack.trackIds[0],
    'StudyBuddy — campus study matcher',
    'StudyBuddy matches students into focused study groups based on courses, availability, and learning style. Built with a realtime lobby, shared whiteboard, and gentle streaks to keep momentum. Our demo includes the matcher, group chat, and organizer analytics.',
    [
      { label: 'Repo', url: 'https://example.com/studybuddy/repo' },
      { label: 'Live demo', url: 'https://example.com/studybuddy/demo' },
    ],
    priya,
    true
  );
  const projB = await createProject(
    teamB,
    hack.trackIds[1],
    'CampusEats demand forecaster',
    'A forecasting tool for campus food outlets that predicts hourly demand from historical sales, weather, and class schedules, cutting waste and wait times. Includes a dashboard, CSV import, and an explainability view for managers.',
    [
      { label: 'Repo', url: 'https://example.com/campuseats/repo' },
      { label: 'Demo video', url: 'https://example.com/campuseats/video' },
    ],
    lena,
    true
  );
  await createProject(
    teamC,
    hack.trackIds[0],
    'DormDash (draft)',
    'Work in progress: a dorm package tracker with QR check-in. Still wiring up notifications.',
    [{ label: 'Repo', url: 'https://example.com/dormdash/repo' }],
    aisha,
    false
  );

  // Past-event submitted project (archived, still queryable by staff)
  const oldTeam = await createTeam(past.ev.id, 'Alumni Hackers', tom, []);
  await createProject(
    oldTeam,
    past.trackIds[0],
    'Retro arcade leaderboard',
    'An archived submission: a tiny arcade leaderboard with QR score upload, built during Winter Mini-Hack 2025.',
    [{ label: 'Repo', url: 'https://example.com/arcade/repo' }],
    tom,
    true
  );

  // ---- Tier 2 demo judging: rubric + roster + assignments + submitted ----
  // evaluations + a completed v1 (identity) calibration run, so every judging
  // page is demonstrable immediately after `docker compose up`.
  const rubR = await db.query(
    `INSERT INTO rubrics (event_id, title, description, is_active, version, created_by)
     VALUES ($1,'Standard 100','Demo rubric: four equally weighted criteria.',TRUE,1,$2) RETURNING *`,
    [hack.ev.id, organizer.id]
  );
  const rubricSeed = rubR.rows[0];
  const critSeed = [];
  for (const [i, label] of ['Innovation', 'Technical Implementation', 'Impact', 'Presentation'].entries()) {
    // eslint-disable-next-line no-await-in-loop
    const cr = await db.query(
      `INSERT INTO rubric_criteria (rubric_id, label, description, max_score, weight, required, position)
       VALUES ($1,$2,'',25,1,TRUE,$3) RETURNING *`,
      [rubricSeed.id, label, i]
    );
    critSeed.push(cr.rows[0]);
  }
  await db.query(
    `INSERT INTO event_judges (event_id, user_id, status, invited_by) VALUES ($1,$2,'active',$3)`,
    [hack.ev.id, judge.id, organizer.id]
  );
  async function seedEval(project, vals) {
    const asg = await db.query(
      `INSERT INTO judge_assignments (event_id, judge_id, project_id, kind, round, status)
       VALUES ($1,$2,$3,'normal',1,'submitted') RETURNING *`,
      [hack.ev.id, judge.id, project.id]
    );
    const scores = {};
    let total = 0;
    critSeed.forEach((c, i) => {
      scores[c.id] = vals[i];
      total += vals[i];
    });
    await db.query(
      `INSERT INTO evaluations (assignment_id, rubric_id, scores, raw_total, feedback, status, submitted_at)
       VALUES ($1,$2,$3,$4,'Seeded demo evaluation.','submitted', now()) RETURNING *`,
      [asg.rows[0].id, rubricSeed.id, JSON.stringify(scores), total]
    );
    return { assignment: asg.rows[0], total };
  }
  const sA = await seedEval(projA, [20, 18, 16, 16]); // 70
  const sB = await seedEval(projB, [20, 20, 20, 20]); // 80
  const runR = await db.query(
    `INSERT INTO calibration_runs (event_id, reference_judge_id, mode, version, status, created_by)
     VALUES ($1,$2,'ONE_LOW_ONE_HIGH',1,'complete',$2) RETURNING *`,
    [hack.ev.id, judge.id]
  );
  const runSeed = runR.rows[0];
  await db.query(
    `INSERT INTO judge_calibrations
      (run_id, source_judge_id, target_judge_id, low_anchor_project_id, high_anchor_project_id,
       source_low, source_high, target_low, target_high, slope, intercept, status, reason, evidence)
     VALUES ($1,$2,$2,$3,$4,$5,$6,$5,$6,1,0,'VALID','self','[]')`,
    [runSeed.id, judge.id, projA.id, projB.id, sA.total, sB.total]
  );
  for (const s of [sA, sB]) {
    const evRow = await db.query('SELECT id FROM evaluations WHERE assignment_id=$1', [s.assignment.id]);
    // eslint-disable-next-line no-await-in-loop
    await db.query(
      `INSERT INTO normalized_scores (run_id, evaluation_id, project_id, judge_id, raw_score, normalized_score, extrapolated, status)
       VALUES ($1,$2,$3,$4,$5,$5,FALSE,'VALID')`,
      [runSeed.id, evRow.rows[0].id, s.assignment.project_id, judge.id, s.total]
    );
  }
  await db.query(
    `INSERT INTO audit_events (actor_id, event_id, action, entity, entity_id, meta)
     VALUES ($1,$2,'calibration.calculated','calibration_run',$3,'{"seeded": true}')`,
    [organizer.id, hack.ev.id, runSeed.id]
  );

  // eslint-disable-next-line no-console
  console.log('[seed] done: admin, organizer, judge, 6 participants, 3 events, 4 teams, 4 projects (+ Tier-2 demo judging)');

  // ---- Tier 3 demo: voting round for hack event ---
  // Create voting round
  const vrR = await db.query(
    `INSERT INTO voting_rounds
       (event_id, name, description, status, voting_start, voting_end,
        max_votes_per_user, max_votes_per_project, allow_vote_change,
        comments_enabled, comments_require_auth, results_hidden_during_voting,
        randomized_ordering, rate_limit_votes_per_hour, rate_limit_comments_per_hour,
        max_comment_length, created_by)
     VALUES ($1,'Community Choice','Vote for the project you love most!',
             'open', now() - interval '2 hours', now() + interval '22 hours',
             5, 1, FALSE, TRUE, TRUE, TRUE, TRUE, 20, 10, 1000, $2)
     RETURNING *`,
    [hack.ev.id, organizer.id]
  );
  const vRound = vrR.rows[0];

  // Add submitted projects to the voting round
  for (const proj of [projA, projB]) {
    await db.query(
      `INSERT INTO voting_round_projects (voting_round_id, project_id, added_by)
       VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`,
      [vRound.id, proj.id, organizer.id]
    );
  }

  // Seed a few demo votes from participants
  const demoVoters = participants.slice(0, 4); // priya, sam, lena, marco
  for (let i = 0; i < demoVoters.length; i++) {
    const voter = demoVoters[i];
    const targetProj = i % 2 === 0 ? projA : projB;
    try {
      // eslint-disable-next-line no-await-in-loop
      const vr = await db.query(
        `INSERT INTO community_votes (voting_round_id, voter_id, project_id, status)
         VALUES ($1,$2,$3,'active') RETURNING *`,
        [vRound.id, voter.id, targetProj.id]
      );
      // eslint-disable-next-line no-await-in-loop
      await db.query(
        `INSERT INTO vote_history (vote_id, action, actor_id) VALUES ($1,'cast',$2)`,
        [vr.rows[0].id, voter.id]
      );
    } catch (_) { /* skip if duplicate */ }
  }
  // Give projA an extra vote from participant 5
  try {
    const vr5 = await db.query(
      `INSERT INTO community_votes (voting_round_id, voter_id, project_id, status)
       VALUES ($1,$2,$3,'active') RETURNING *`,
      [vRound.id, participants[4].id, projA.id]
    );
    await db.query(
      `INSERT INTO vote_history (vote_id, action, actor_id) VALUES ($1,'cast',$2)`,
      [vr5.rows[0].id, participants[4].id]
    );
  } catch (_) {}

  // Seed demo comments
  const commentTexts = [
    'Impressive UX — the onboarding flow is very intuitive.',
    'The data visualizations are stunning. Great work!',
    'Love the real-time features. How did you handle concurrency?',
  ];
  for (let i = 0; i < 3; i++) {
    try {
      // eslint-disable-next-line no-await-in-loop
      await db.query(
        `INSERT INTO comments (voting_round_id, project_id, author_id, body)
         VALUES ($1,$2,$3,$4)`,
        [vRound.id, i % 2 === 0 ? projA.id : projB.id, participants[i].id, commentTexts[i]]
      );
    } catch (_) {}
  }

  // Audit: voting round opened
  await db.query(
    `INSERT INTO audit_events (actor_id, event_id, action, entity, entity_id, meta)
     VALUES ($1,$2,'voting_round.opened','voting_round',$3,'{"seeded":true}')`,
    [organizer.id, hack.ev.id, vRound.id]
  );

  // eslint-disable-next-line no-console
  console.log('[seed] Tier-3: voting round seeded (open, 2 projects, 5 votes, 3 comments)');

  return { admin: admin.email };
}

if (require.main === module) {
  seed()
    .then(() => process.exit(0))
    .catch((e) => {
      // eslint-disable-next-line no-console
      console.error('[seed] failed', e);
      process.exit(1);
    });
}

module.exports = { seed };
