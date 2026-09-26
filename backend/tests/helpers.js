'use strict';
// Test harness: in-memory Postgres (pg-mem) + supertest, no Docker needed.
const fs = require('fs');
const path = require('path');
const { newDb } = require('pg-mem');
const request = require('supertest');
const db = require('../src/db');
const { createApp } = require('../src/app');

let app = null;

async function setupTestDb() {
  const mem = newDb({ autoCreateForeignKeyIndices: true });
  // Apply every migration in order (like src/migrate.js), minus the
  // CREATE EXTENSION line which pg-mem does not support.
  const migDir = path.join(__dirname, '..', 'migrations');
  const files = fs.readdirSync(migDir).filter((f) => f.endsWith('.sql')).sort();
  for (const f of files) {
    let sql = fs.readFileSync(path.join(migDir, f), 'utf8');
    sql = sql.split('\n').filter((l) => !l.trim().toUpperCase().startsWith('CREATE EXTENSION')).join('\n');
    mem.public.none(sql);
  }
  const pgMock = mem.adapters.createPg();
  const pool = new pgMock.Pool();
  db.setPool(pool);
  app = createApp();
  return { mem, app };
}

function api() {
  if (!app) throw new Error('call setupTestDb() first');
  return request(app);
}

// Register a user and return { user, token, cookie }
async function registerUser({ email, name, password = 'Password123!', role } = {}) {
  const body = { email, name, password };
  if (role) body.role = role;
  const res = await api().post('/api/auth/register').send(body);
  return res;
}

async function authHeader(token) {
  return { Authorization: `Bearer ${token}` };
}

module.exports = { setupTestDb, api, registerUser, authHeader };
