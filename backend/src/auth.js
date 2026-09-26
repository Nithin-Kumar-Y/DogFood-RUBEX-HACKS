'use strict';
// Authentication + RBAC middleware. Backend-enforced; never trust frontend alone.
const db = require('./db');
const { hashToken } = require('./util');

const COOKIE_NAME = 'dogfood_session';
const SESSION_DAYS = 30;

async function loadSessionUser(req, _res, next) {
  try {
    req.user = null;
    const token =
      req.cookies?.[COOKIE_NAME] ||
      (req.headers.authorization || '').replace(/^Bearer\s+/i, '') ||
      null;
    if (!token) return next();
    const th = hashToken(token);
    const r = await db.query(
      `SELECT s.expires_at, u.id, u.email, u.name, u.role, u.created_at
       FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = $1 LIMIT 1`,
      [th]
    );
    if (r.rows.length === 0) return next();
    const row = r.rows[0];
    if (new Date(row.expires_at) < new Date()) {
      await db.query('DELETE FROM sessions WHERE token_hash = $1', [th]).catch(() => {});
      return next();
    }
    req.user = {
      id: row.id,
      email: row.email,
      name: row.name,
      role: row.role,
      created_at: row.created_at,
    };
    req.sessionTokenHash = th;
    return next();
  } catch (e) {
    return next();
  }
}

function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Authentication required.' });
  return next();
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Authentication required.' });
    // Admin bypasses all role checks (backend-enforced superuser).
    if (req.user.role === 'admin') return next();
    if (!roles.includes(req.user.role))
      return res.status(403).json({ error: 'Forbidden: insufficient role.' });
    return next();
  };
}

function cookieOpts() {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.COOKIE_SECURE === 'true',
    path: '/',
    maxAge: SESSION_DAYS * 24 * 3600 * 1000,
  };
}

module.exports = { loadSessionUser, requireAuth, requireRole, cookieOpts, COOKIE_NAME, SESSION_DAYS };
