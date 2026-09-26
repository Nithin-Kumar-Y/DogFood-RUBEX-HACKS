'use strict';
// Tier 1 acceptance workflow (mirrors prompt §20):
// Register → Login → Create/Join Event → Create Team → Invite → Accept →
// Create Project → Save Draft → Edit Draft → Submit → Enforce Deadline →
// Organizer Views Submission → Public Gallery → Search → Details + role isolation.
const assert = require('node:assert/strict');
const { setupTestDb, api } = require('./helpers');
const db = require('../src/db');

const future = (d) => new Date(Date.now() + d * 86400000).toISOString();
const steps = [];
function step(name) { steps.push(name); console.log('  ✓', name); }

(async () => {
  await setupTestDb();

  // 1. Register organizer + 2 participants
  let r = await api().post('/api/auth/register').send({ email: 'acc-org@x.com', name: 'Acc Org', password: 'Password123!' });
  assert.equal(r.status, 201); step('Register organizer');
  await db.query(`UPDATE users SET role='organizer' WHERE email='acc-org@x.com'`);
  r = await api().post('/api/auth/register').send({ email: 'acc-a@x.com', name: 'Acc A', password: 'Password123!' });
  assert.equal(r.status, 201); step('Register participant A');
  const tokenA = r.body.token;
  r = await api().post('/api/auth/register').send({ email: 'acc-b@x.com', name: 'Acc B', password: 'Password123!' });
  assert.equal(r.status, 201); step('Register participant B');
  const tokenB = r.body.token;

  // 2. Login
  r = await api().post('/api/auth/login').send({ email: 'acc-org@x.com', password: 'Password123!' });
  assert.equal(r.status, 200); step('Login (organizer)');
  const tokenOrg = r.body.token;

  // 3. Create/Join event (organizer creates, participant reads)
  r = await api().post('/api/events').set('Authorization', `Bearer ${tokenOrg}`).send({
    title: 'Acceptance Hack', description: 'acceptance event',
    starts_at: future(1), ends_at: future(3), submission_deadline: future(3),
    status: 'published', tracks: [{ name: 'Open' }], prizes: [{ title: 'Win' }],
  });
  assert.equal(r.status, 201); step('Create event (organizer)');
  const eventId = r.body.id;
  r = await api().get(`/api/events/${eventId}`);
  assert.equal(r.status, 200); step('Join/view event (public read)');
  const trackId = r.body.tracks[0].id;

  // 4-5. Create team + invite link
  r = await api().post('/api/teams').set('Authorization', `Bearer ${tokenA}`).send({ event_id: eventId, name: 'Accepters' });
  assert.equal(r.status, 201); step('Create team');
  const teamId = r.body.id;
  const code = r.body.invite_code;
  assert.ok(code); step(`Generate invite link (${code.slice(0, 6)}…)`);

  // 6. Accept invite
  r = await api().post(`/api/invites/${code}/accept`).set('Authorization', `Bearer ${tokenB}`);
  assert.equal(r.status, 200);
  assert.equal(r.body.members.length, 2); step('Accept invite (2 members)');

  // 7-8. Create project + save draft
  r = await api().post('/api/projects').set('Authorization', `Bearer ${tokenA}`).send({
    team_id: teamId, title: 'Acceptance App', track_id: trackId,
    description: 'An acceptance-test project with a sufficiently long description.',
    links: [{ label: 'Repo', url: 'https://example.com/acc' }],
  });
  assert.equal(r.status, 201);
  assert.equal(r.body.status, 'draft'); step('Create project (draft saved)');
  const projectId = r.body.id;

  // 9. Edit draft
  r = await api().put(`/api/projects/${projectId}`).set('Authorization', `Bearer ${tokenA}`).send({ title: 'Acceptance App v2' });
  assert.equal(r.status, 200);
  assert.equal(r.body.title, 'Acceptance App v2'); step('Edit draft');

  // 10. Submit
  r = await api().post(`/api/projects/${projectId}/submit`).set('Authorization', `Bearer ${tokenA}`);
  assert.equal(r.status, 200);
  assert.equal(r.body.project.status, 'submitted'); step('Submit project (confirmation received)');

  // 11. Deadline enforcement (move deadline to past; late submit/edit blocked)
  await db.query(`UPDATE events SET submission_deadline = now() - interval '1 minute' WHERE id=$1`, [eventId]);
  r = await api().put(`/api/projects/${projectId}`).set('Authorization', `Bearer ${tokenA}`).send({ title: 'Late' });
  assert.equal(r.status, 403); step('Enforce deadline (late edit blocked: 403)');

  // 12. Organizer views submission
  r = await api().get(`/api/events/${eventId}/submissions`).set('Authorization', `Bearer ${tokenOrg}`);
  assert.equal(r.status, 200);
  assert.equal(r.body.data.length, 1); step('Organizer views submission');

  // 13-15. Gallery list → search → details
  r = await api().get('/api/gallery?limit=9&page=1');
  assert.equal(r.status, 200); assert.ok(r.body.total >= 1); step('Public gallery lists project');
  r = await api().get('/api/gallery?q=Acceptance%20App%20v2');
  assert.equal(r.status, 200); assert.ok(r.body.data.length >= 1); step('Search finds project');
  r = await api().get(`/api/gallery/${projectId}`);
  assert.equal(r.status, 200); assert.equal(r.body.title, 'Acceptance App v2'); step('Open project details');

  // 16. Role isolation spot-checks
  r = await api().get(`/api/events/${eventId}/submissions`).set('Authorization', `Bearer ${tokenA}`);
  assert.equal(r.status, 403); step('Role isolation (participant blocked from organizer submissions)');
  r = await api().post('/api/events').set('Authorization', `Bearer ${tokenA}`).send({ title: 'Hack', starts_at: future(1), ends_at: future(2), submission_deadline: future(2) });
  assert.equal(r.status, 403); step('Role isolation (participant blocked from event creation)');

  console.log(`\nACCEPTANCE WORKFLOW: ${steps.length}/${steps.length} steps passed`);
})().catch((e) => { console.error('\nACCEPTANCE WORKFLOW FAILED:', e.message); process.exit(1); });
