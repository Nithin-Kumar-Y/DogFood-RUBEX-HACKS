'use strict';
const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const { setupTestDb, api } = require('./helpers');

describe('Tier 1 — authentication & RBAC', () => {
  before(async () => {
    await setupTestDb();
  });

  let participantToken;
  let participantId;

  it('registers a participant', async () => {
    const res = await api().post('/api/auth/register').send({
      email: 'alice@example.com',
      name: 'Alice',
      password: 'Password123!',
    });
    assert.equal(res.status, 201);
    assert.equal(res.body.user.email, 'alice@example.com');
    assert.equal(res.body.user.role, 'participant');
    assert.ok(res.body.token);
    participantToken = res.body.token;
    participantId = res.body.user.id;
  });

  it('rejects duplicate registration', async () => {
    const res = await api().post('/api/auth/register').send({
      email: 'alice@example.com',
      name: 'Alice2',
      password: 'Password123!',
    });
    assert.equal(res.status, 409);
  });

  it('rejects public self-promotion to organizer', async () => {
    const res = await api().post('/api/auth/register').send({
      email: 'evil@example.com',
      name: 'Evil',
      password: 'Password123!',
      role: 'organizer',
    });
    assert.equal(res.status, 403);
  });

  it('rejects short passwords', async () => {
    const res = await api().post('/api/auth/register').send({
      email: 'bob@example.com',
      name: 'Bob',
      password: 'short',
    });
    assert.equal(res.status, 400);
  });

  it('logs in with correct credentials', async () => {
    const res = await api().post('/api/auth/login').send({
      email: 'alice@example.com',
      password: 'Password123!',
    });
    assert.equal(res.status, 200);
    assert.ok(res.body.token);
  });

  it('rejects wrong password', async () => {
    const res = await api().post('/api/auth/login').send({
      email: 'alice@example.com',
      password: 'WrongPass999!',
    });
    assert.equal(res.status, 401);
  });

  it('returns current user on /me with token', async () => {
    const res = await api().get('/api/auth/me').set('Authorization', `Bearer ${participantToken}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.user.email, 'alice@example.com');
  });

  it('blocks /me without token', async () => {
    const res = await api().get('/api/auth/me');
    assert.equal(res.status, 401);
  });

  it('blocks participant from creating events (organizer-only)', async () => {
    const res = await api()
      .post('/api/events')
      .set('Authorization', `Bearer ${participantToken}`)
      .send({
        title: 'Nope Hack',
        starts_at: new Date(Date.now() + 86400000).toISOString(),
        ends_at: new Date(Date.now() + 2 * 86400000).toISOString(),
        submission_deadline: new Date(Date.now() + 2 * 86400000).toISOString(),
      });
    assert.equal(res.status, 403);
  });

  it('logs out and invalidates the session', async () => {
    const out = await api()
      .post('/api/auth/logout')
      .set('Authorization', `Bearer ${participantToken}`);
    assert.equal(out.status, 200);
    const me = await api().get('/api/auth/me').set('Authorization', `Bearer ${participantToken}`);
    assert.equal(me.status, 401);
  });
});
