'use strict';
const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const db = require('../src/db');
const { setupTestDb, api } = require('./helpers');

describe('Tier 1 — events, teams, invitations', () => {
  before(async () => {
    await setupTestDb();
  });

  let organizerToken;
  let participantAToken;
  let participantBToken;
  let eventId;
  let trackId;
  let inviteCode;

  it('promotes an organizer directly in DB then logs in', async () => {
    await api().post('/api/auth/register').send({
      email: 'org@example.com', name: 'Orga', password: 'Password123!',
    });
    await db.query(`UPDATE users SET role='organizer' WHERE email='org@example.com'`);
    const login = await api().post('/api/auth/login').send({
      email: 'org@example.com', password: 'Password123!',
    });
    assert.equal(login.status, 200);
    assert.equal(login.body.user.role, 'organizer');
    organizerToken = login.body.token;

    const a = await api().post('/api/auth/register').send({
      email: 'p1@example.com', name: 'P One', password: 'Password123!',
    });
    participantAToken = a.body.token;
    const b = await api().post('/api/auth/register').send({
      email: 'p2@example.com', name: 'P Two', password: 'Password123!',
    });
    participantBToken = b.body.token;
  });

  it('organizer creates a published event with tracks + prizes', async () => {
    const res = await api()
      .post('/api/events')
      .set('Authorization', `Bearer ${organizerToken}`)
      .send({
        title: 'Test Hack 2026',
        description: 'A test event',
        starts_at: new Date(Date.now() + 86400000).toISOString(),
        ends_at: new Date(Date.now() + 3 * 86400000).toISOString(),
        submission_deadline: new Date(Date.now() + 3 * 86400000).toISOString(),
        status: 'published',
        tracks: [{ name: 'Web' }, { name: 'AI' }],
        prizes: [{ title: 'First', amount: '$100' }],
      });
    assert.equal(res.status, 201);
    eventId = res.body.id;
    assert.ok(eventId);
  });

  it('validates event dates (end before start rejected)', async () => {
    const res = await api()
      .post('/api/events')
      .set('Authorization', `Bearer ${organizerToken}`)
      .send({
        title: 'Bad Dates Hack',
        starts_at: new Date(Date.now() + 3 * 86400000).toISOString(),
        ends_at: new Date(Date.now() + 86400000).toISOString(),
        submission_deadline: new Date(Date.now() + 86400000).toISOString(),
      });
    assert.equal(res.status, 400);
  });

  it('public can list published events', async () => {
    const res = await api().get('/api/events');
    assert.equal(res.status, 200);
    assert.ok(res.body.data.length >= 1);
  });

  it('participant creates a team', async () => {
    const res = await api()
      .post('/api/teams')
      .set('Authorization', `Bearer ${participantAToken}`)
      .send({ event_id: eventId, name: 'Team Rocket' });
    assert.equal(res.status, 201);
    assert.ok(res.body.invite_code || res.body.id);
    inviteCode = res.body.invite_code;
    assert.equal(res.body.members.length, 1);
  });

  it('prevents duplicate team membership in same event', async () => {
    const res = await api()
      .post('/api/teams')
      .set('Authorization', `Bearer ${participantAToken}`)
      .send({ event_id: eventId, name: 'Second Team' });
    assert.equal(res.status, 409);
  });

  it('second participant joins via invite code', async () => {
    const preview = await api()
      .get(`/api/teams/invites/${inviteCode}/preview`)
      .set('Authorization', `Bearer ${participantBToken}`);
    assert.equal(preview.status, 200);
    const join = await api()
      .post(`/api/invites/${inviteCode}/accept`)
      .set('Authorization', `Bearer ${participantBToken}`);
    assert.equal(join.status, 200);
    assert.equal(join.body.members.length, 2);
  });

  it('prevents duplicate join (already a member)', async () => {
    const join = await api()
      .post(`/api/invites/${inviteCode}/accept`)
      .set('Authorization', `Bearer ${participantBToken}`);
    assert.equal(join.status, 409);
  });

  it('rejects invalid invite codes', async () => {
    const join = await api()
      .post('/api/invites/doesnotexist123/accept')
      .set('Authorization', `Bearer ${participantBToken}`);
    assert.equal(join.status, 404);
  });

  it('non-owner cannot rename the team', async () => {
    // find team id via /mine
    const mine = await api().get('/api/teams/mine').set('Authorization', `Bearer ${participantBToken}`);
    const teamId = mine.body[0].id;
    const res = await api()
      .put(`/api/teams/${teamId}`)
      .set('Authorization', `Bearer ${participantBToken}`)
      .send({ name: 'Hijacked' });
    assert.equal(res.status, 403);
  });

  it('owner-only leave is blocked without ownership transfer', async () => {
    const mine = await api().get('/api/teams/mine').set('Authorization', `Bearer ${participantAToken}`);
    const teamId = mine.body[0].id;
    const res = await api()
      .post(`/api/teams/${teamId}/leave`)
      .set('Authorization', `Bearer ${participantAToken}`);
    assert.equal(res.status, 400);
  });
});
