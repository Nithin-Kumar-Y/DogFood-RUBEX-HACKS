'use strict';
const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { sessionToken, hashToken, isValidEmail, randomCode } = require('../util');
const { requireAuth, cookieOpts, COOKIE_NAME, SESSION_DAYS } = require('../auth');

const router = express.Router();
const SALT_ROUNDS = 10;

function publicUser(u) {
  return { id: u.id, email: u.email, name: u.name, role: u.role, created_at: u.created_at };
}

async function createSession(userId) {
  const token = sessionToken();
  const th = hashToken(token);
  const expires = new Date(Date.now() + SESSION_DAYS * 24 * 3600 * 1000);
  await db.query(
    'INSERT INTO sessions (user_id, token_hash, expires_at) VALUES ($1,$2,$3)',
    [userId, th, expires.toISOString()]
  );
  return { token, expires };
}

// POST /api/auth/register
router.post('/register', async (req, res) => {
  try {
    const { email, password, name, role } = req.body || {};
    const cleanEmail = String(email || '').trim().toLowerCase();
    const cleanName = String(name || '').trim();
    if (!isValidEmail(cleanEmail))
      return res.status(400).json({ error: 'Valid email is required.' });
    if (!password || String(password).length < 8)
      return res.status(400).json({ error: 'Password must be at least 8 characters.' });
    if (!cleanName || cleanName.length < 2)
      return res.status(400).json({ error: 'Name must be at least 2 characters.' });
    // Role self-selection: only participant allowed via public registration.
    // organizer/judge/admin must be promoted by an admin (prevents privilege escalation).
    let requestedRole = 'participant';
    if (role && role !== 'participant') {
      return res.status(403).json({
        error: 'Public registration is participant-only. Ask an admin to grant elevated roles.',
      });
    }
    const existing = await db.query('SELECT id FROM users WHERE email = $1', [cleanEmail]);
    if (existing.rows.length > 0)
      return res.status(409).json({ error: 'An account with this email already exists.' });
    const hash = await bcrypt.hash(String(password), SALT_ROUNDS);
    const ins = await db.query(
      `INSERT INTO users (email, password_hash, name, role) VALUES ($1,$2,$3,$4)
       RETURNING id, email, name, role, created_at`,
      [cleanEmail, hash, cleanName, requestedRole]
    );
    const user = ins.rows[0];
    const { token } = await createSession(user.id);
    res.cookie(COOKIE_NAME, token, cookieOpts());
    return res.status(201).json({ user: publicUser(user), token });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('[auth/register]', e.message);
    return res.status(500).json({ error: 'Registration failed.' });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    const cleanEmail = String(email || '').trim().toLowerCase();
    if (!isValidEmail(cleanEmail) || !password)
      return res.status(400).json({ error: 'Email and password are required.' });
    const r = await db.query('SELECT * FROM users WHERE email = $1 LIMIT 1', [cleanEmail]);
    if (r.rows.length === 0)
      return res.status(401).json({ error: 'Invalid email or password.' });
    const user = r.rows[0];
    const ok = await bcrypt.compare(String(password), user.password_hash);
    if (!ok) return res.status(401).json({ error: 'Invalid email or password.' });
    const { token } = await createSession(user.id);
    res.cookie(COOKIE_NAME, token, cookieOpts());
    return res.json({ user: publicUser(user), token });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('[auth/login]', e.message);
    return res.status(500).json({ error: 'Login failed.' });
  }
});

// POST /api/auth/logout
router.post('/logout', async (req, res) => {
  try {
    const token =
      req.cookies?.[COOKIE_NAME] ||
      (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    if (token) {
      await db.query('DELETE FROM sessions WHERE token_hash = $1', [hashToken(token)]);
    }
    res.clearCookie(COOKIE_NAME, { path: '/' });
    return res.json({ ok: true });
  } catch (e) {
    res.clearCookie(COOKIE_NAME, { path: '/' });
    return res.json({ ok: true });
  }
});

// GET /api/auth/me
router.get('/me', requireAuth, async (req, res) => {
  return res.json({ user: req.user });
});

// PUT /api/auth/profile — update own name
router.put('/profile', requireAuth, async (req, res) => {
  try {
    const { name } = req.body || {};
    const clean = String(name || '').trim();
    if (!clean || clean.length < 2)
      return res.status(400).json({ error: 'Name must be at least 2 characters.' });
    const r = await db.query(
      'UPDATE users SET name=$1, updated_at=now() WHERE id=$2 RETURNING id,email,name,role,created_at',
      [clean, req.user.id]
    );
    return res.json({ user: publicUser(r.rows[0]) });
  } catch (e) {
    return res.status(500).json({ error: 'Profile update failed.' });
  }
});

module.exports = router;
