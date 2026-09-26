'use strict';
const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const db = require('../src/db');
const { setupTestDb, api } = require('./helpers');

describe('Tier 1 — organizer aggregates, stats, invite expiry', () => {
  before(async () => {
    await setupTestDb();
  });

  let organizerToken;
  let participantToken;
  let eventId;
  let teamId;
  let inviteCode;

  const future = (d) => new Date(Date.now() + d * 86400000).toISOString();

  it('setup: organizer, participant, event, team with draft project', async () => {
    await api().post('/api/auth/register').send({ email: 'o3@x.com', name: 'Org Three', password: 'Password123!' });
    await db.query(`UPDATE users SET role='organizer' WHERE email='o3@x.com'`);
    const login = await api().post('/api/auth/login').send({ email: 'o3@x.com', password: 'Password123!' });
    organizerToken = login.body.token;
    const p = await api().post('/api/auth/register').send({ email: 'pp@x.com', name: 'Part P', password: 'Password123!' });
    participantToken = p.body.token;

    const ev = await api().post('/api/events').set('Authorization', `Bearer ${organizerToken}`).send({
      title: 'Agg Hack', description: 'agg', starts_at: future(1), ends_at: future(3),
      submission_deadline: future(3), status: 'published', tracks: [{ name: 'Open' }],
    });
    assert.equal(ev.status, 201);
    eventId = ev.body.id;

    const team = await api().post('/api/teams').set('Authorization', `Bearer ${participantToken}`).send({ event_id: eventId, name: 'Agg Team' });
    assert.equal(team.status, 201);
    teamId = team.body.id;
    inviteCode = team.body.invite_code;
    assert.ok(team.body.invite_expires_at);
    const full = await api().get(`/api/events/${eventId}`);
    const trackId = full.body.tracks[0].id;
    const proj = await api().post('/api/projects').set('Authorization', `Bearer ${participantToken}`).send({
      team_id: teamId, title: 'Agg Draft', track_id: trackId,
      description: 'A draft project with a long enough description for later submit.',
      links: [{ label: 'Repo', url: 'https://example.com/agg' }],
    });
    assert.equal(proj.status, 201);
  });

  it('organizer stats report real DB numbers incl. participants + drafts', async () => {
    const r = await api().get('/api/stats/organizer').set('Authorization', `Bearer ${organizerToken}`);
    assert.equal(r.status, 200);
    assert.equal(r.body.totals.events, 1);
    assert.equal(r.body.totals.teams, 1);
    assert.equal(r.body.totals.projects, 1);
    assert.equal(r.body.totals.drafts, 1);
    assert.equal(r.body.totals.submissions, 0);
    assert.equal(r.body.totals.participants, 1);
  });

  it('participant cannot access organizer aggregates', async () => {
    for (const path of ['/organizer/teams', '/organizer/projects', '/organizer/submissions', '/stats/organizer']) {
      const r = await api().get('/api' + path).set('Authorization', `Bearer ${participantToken}`);
      assert.equal(r.status, 403, path);
    }
  });

  it('organizer teams/projects/submissions aggregates work', async () => {
    const t = await api().get('/api/organizer/teams').set('Authorization', `Bearer ${organizerToken}`);
    assert.equal(t.status, 200);
    assert.equal(t.body.length, 1);
    assert.equal(t.body[0].member_count, 1);
    const pr = await api().get('/api/organizer/projects').set('Authorization', `Bearer ${organizerToken}`);
    assert.equal(pr.status, 200);
    assert.equal(pr.body.length, 1);
    assert.equal(pr.body[0].status, 'draft');
    const s = await api().get('/api/organizer/submissions').set('Authorization', `Bearer ${organizerToken}`);
    assert.equal(s.status, 200);
    assert.equal(s.body.total, 0);
  });

  it('organizer sees only their own events (isolation)', async () => {
    // second organizer with their own event
    await api().post('/api/auth/register').send({ email: 'o4@x.com', name: 'Org Four', password: 'Password123!' });
    await db.query(`UPDATE users SET role='organizer' WHERE email='o4@x.com'`);
    const login = await api().post('/api/auth/login').send({ email: 'o4@x.com', password: 'Password123!' });
    const other = login.body.token;
    const t = await api().get('/api/organizer/teams').set('Authorization', `Bearer ${other}`);
    assert.equal(t.status, 200);
    assert.equal(t.body.length, 0);
  });

  it('expired invitations are rejected with 410 (preview + accept)', async () => {
    await db.query(`UPDATE teams SET invite_expires_at = now() - interval '1 hour' WHERE id=$1`, [teamId]);
    const prev = await api().get(`/api/teams/invites/${inviteCode}/preview`).set('Authorization', `Bearer ${participantToken}`);
    assert.equal(prev.status, 410);
    const outsider = await api().post('/api/auth/register').send({ email: 'out9@x.com', name: 'Out Nine', password: 'Password123!' });
    const join = await api().post(`/api/invites/${inviteCode}/accept`).set('Authorization', `Bearer ${outsider.body.token}`);
    assert.equal(join.status, 410);
  });

  it('regenerating the invite restores a working code and kills the old one', async () => {
    const regen = await api().post(`/api/teams/${teamId}/invites`).set('Authorization', `Bearer ${participantToken}`).send({ regenerate: true });
    assert.equal(regen.status, 201);
    const newCode = regen.body.code;
    assert.notEqual(newCode, inviteCode);
    const oldPrev = await api().get(`/api/teams/invites/${inviteCode}/preview`).set('Authorization', `Bearer ${participantToken}`);
    assert.equal(oldPrev.status, 404);
    const outsider = await api().post('/api/auth/register').send({ email: 'out10@x.com', name: 'Out Ten', password: 'Password123!' });
    const join = await api().post(`/api/invites/${newCode}/accept`).set('Authorization', `Bearer ${outsider.body.token}`);
    assert.equal(join.status, 200);
    assert.equal(join.body.members.length, 2);
  });
});
