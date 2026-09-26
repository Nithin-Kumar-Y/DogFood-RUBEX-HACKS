'use strict';
// Central Postgres pool. Supports real Postgres (production/docker)
// and pg-mem injection for tests via setPool().
const { Pool } = require('pg');

let pool = null;

function getPool() {
  if (pool) return pool;
  const connectionString =
    process.env.DATABASE_URL ||
    'postgres://dogfood:dogfood@localhost:5432/dogfood';
  pool = new Pool({
    connectionString,
    max: parseInt(process.env.PG_POOL_MAX || '20', 10),
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  });
  pool.on('error', (err) => {
    // eslint-disable-next-line no-console
    console.error('[db] pool error', err.message);
  });
  return pool;
}

// Test hook: allow pg-mem or a custom pool to be injected.
function setPool(p) {
  pool = p;
}

async function query(text, params) {
  return getPool().query(text, params);
}

async function getClient() {
  return getPool().connect();
}

async function closePool() {
  if (pool) {
    const p = pool;
    pool = null;
    try {
      await p.end();
    } catch (e) {
      /* ignore */
    }
  }
}

module.exports = { getPool, setPool, query, getClient, closePool };
