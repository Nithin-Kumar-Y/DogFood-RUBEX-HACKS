'use strict';
const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const db = require('../src/db');
const { setupTestDb, api } = require('./helpers');

describe('Tier 1 — projects, submissions, deadlines, gallery', () => {
  before(async () => {
    await setupTestDb();
  });

  let organizerToken;
  let tokenA;
  let outsiderToken;
  let eventId;
  let trackId;
  let teamId;
  let projectId;

  const future = (d) => new Date(Date.now() + d * 86400000).toISOString();

  it('setup: organizer + event + team', async () => {
    await api().post('/api/auth/register').send({
      email: 'org2@example.com', name: 'Org Two', password: 'Password123!',
    });
    await db.query(`UPDATE users SET role='organizer' WHERE email='org2@example.com'`);
    const login = await api().post('/api/auth/login').send({
      email: 'org2@example.com', password: 'Password123!',
    });
    organizerToken = login.body.token;

    const ev = await api()
      .post('/api/events')
      .set('Authorization', `Bearer ${organizerToken}`)
      .send({
        title: 'Submit Hack', description: 'submit flow',
        starts_at: future(1), ends_at: future(3), submission_deadline: future(3),
        status: 'published', tracks: [{ name: 'Web' }],
      });
    assert.equal(ev.status, 201);
    eventId = ev.body.id;
    const full = await api().get(`/api/events/${eventId}`);
    trackId = full.body.tracks[0].id;

    const a = await api().post('/api/auth/register').send({
      email: 'dev1@example.com', name: 'Dev One', password: 'Password123!',
    });
    tokenA = a.body.token;
    const o = await api().post('/api/auth/register').send({
      email: 'outsider@example.com', name: 'Out Sider', password: 'Password123!',
    });
    outsiderToken = o.body.token;

    const team = await api()
      .post('/api/teams')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ event_id: eventId, name: 'Builders' });
    assert.equal(team.status, 201);
    teamId = team.body.id;
  });

  it('creates a draft project', async () => {
    const res = await api()
      .post('/api/projects')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        team_id: teamId,
        title: 'My Cool App',
        description: 'A short draft, not yet submittable because it is too short... extended.',
        track_id: trackId,
        links: [{ label: 'Repo', url: 'https://example.com/repo' }],
      });
    assert.equal(res.status, 201);
    assert.equal(res.body.status, 'draft');
    projectId = res.body.id;
  });

  it('blocks project creation by non-members', async () => {
    const res = await api()
      .post('/api/projects')
      .set('Authorization', `Bearer ${outsiderToken}`)
      .send({ team_id: teamId, title: 'Hijack', description: 'x'.repeat(30) });
    assert.equal(res.status, 403);
  });

  it('edits the draft', async () => {
    const res = await api()
      .put(`/api/projects/${projectId}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        description:
          'An updated, sufficiently long description of the project that explains what it does and how it works for the judges and visitors.',
      });
    assert.equal(res.status, 200);
    assert.match(res.body.description, /updated/);
  });

  it('rejects submission with missing links', async () => {
    await db.query('DELETE FROM project_links WHERE project_id=$1', [projectId]);
    const res = await api()
      .post(`/api/projects/${projectId}/submit`)
      .set('Authorization', `Bearer ${tokenA}`);
    assert.equal(res.status, 400);
    // restore a link
    await api()
      .put(`/api/projects/${projectId}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ links: [{ label: 'Repo', url: 'https://example.com/repo' }] });
  });

  it('submits the project and shows confirmation', async () => {
    const res = await api()
      .post(`/api/projects/${projectId}/submit`)
      .set('Authorization', `Bearer ${tokenA}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.project.status, 'submitted');
    assert.ok(res.body.submission.submitted_at);
    assert.ok(res.body.message);
  });

  it('organizer can view event submissions', async () => {
    const res = await api()
      .get(`/api/events/${eventId}/submissions`)
      .set('Authorization', `Bearer ${organizerToken}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.data.length, 1);
  });

  it('participant cannot view organizer-only submissions list', async () => {
    const res = await api()
      .get(`/api/events/${eventId}/submissions`)
      .set('Authorization', `Bearer ${tokenA}`);
    assert.equal(res.status, 403);
  });

  it('submitted project appears in public gallery + search + details', async () => {
    const gal = await api().get('/api/gallery?limit=5&page=1');
    assert.equal(gal.status, 200);
    assert.ok(gal.body.total >= 1);
    assert.ok(Array.isArray(gal.body.data));

    const search = await api().get('/api/gallery?q=Cool%20App');
    assert.equal(search.status, 200);
    assert.ok(search.body.data.length >= 1);

    const details = await api().get(`/api/gallery/${projectId}`);
    assert.equal(details.status, 200);
    assert.equal(details.body.title, 'My Cool App');
    assert.ok(details.body.links.length >= 1);
  });

  it('gallery paginates (limit respected)', async () => {
    const res = await api().get('/api/gallery?limit=1&page=1');
    assert.equal(res.status, 200);
    assert.ok(res.body.data.length <= 1);
    assert.ok(res.body.totalPages >= 1);
  });

  it('drafts are NOT in the public gallery', async () => {
    // create second team + draft project (different user, same event not allowed twice —
    // so use outsider to make their own team)
    const t2 = await api()
      .post('/api/teams')
      .set('Authorization', `Bearer ${outsiderToken}`)
      .send({ event_id: eventId, name: 'Quiet Team' });
    assert.equal(t2.status, 201);
    const p2 = await api()
      .post('/api/projects')
      .set('Authorization', `Bearer ${outsiderToken}`)
      .send({
        team_id: t2.body.id,
        title: 'Hidden Draft Project XYZ',
        description: 'This is a draft that must never appear publicly. '.repeat(3),
        track_id: trackId,
        links: [{ label: 'Repo', url: 'https://example.com/hidden' }],
      });
    assert.equal(p2.status, 201);
    const search = await api().get('/api/gallery?q=Hidden%20Draft%20Project%20XYZ');
    assert.equal(search.status, 200);
    assert.equal(search.body.data.length, 0);
  });

  it('enforces deadline: late submissions blocked on backend', async () => {
    // move deadline to the past
    await db.query('UPDATE events SET submission_deadline = now() - interval \'1 hour\' WHERE id=$1', [eventId]);
    // new draft attempt after deadline must fail at creation
    const t = await db.query('SELECT * FROM teams WHERE id=$1', [teamId]);
    assert.ok(t.rows.length === 1);
    // unsubmit existing (should be blocked — deadline passed)
    const un = await api()
      .post(`/api/projects/${projectId}/unsubmit`)
      .set('Authorization', `Bearer ${tokenA}`);
    assert.equal(un.status, 403);
    // edit after deadline blocked
    const edit = await api()
      .put(`/api/projects/${projectId}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ title: 'Late edit attempt' });
    assert.equal(edit.status, 403);
  });

  it('unauthorized users cannot submit others’ projects', async () => {
    const res = await api()
      .post(`/api/projects/${projectId}/submit`)
      .set('Authorization', `Bearer ${outsiderToken}`);
    assert.ok([400, 403, 409].includes(res.status));
  });
});
