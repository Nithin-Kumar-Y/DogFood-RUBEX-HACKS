'use strict';
// In-memory PostgreSQL engine via pg-mem.
// Allows running DOGFOOD locally without external PostgreSQL or Docker dependencies.
const fs = require('fs');
const path = require('path');
const { newDb } = require('pg-mem');
const db = require('./db');

function initMemoryDb() {
  const mem = newDb({ autoCreateForeignKeyIndices: true });
  // Apply every migration in order, minus the CREATE EXTENSION line which pg-mem does not require
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
  return { mem, pool };
}

module.exports = { initMemoryDb };
