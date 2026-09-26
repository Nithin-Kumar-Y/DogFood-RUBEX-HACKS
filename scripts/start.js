'use strict';
// One-command local run for DOGFOOD (no Docker required):
//   npm start
// Boots an embedded PostgreSQL, runs migrations + seed, starts the API,
// and serves the SPA with an /api reverse proxy — all in one process.
const path = require('path');
const fs = require('fs');

const ROOT = path.join(__dirname, '..');
const DATA_DIR = path.join(ROOT, '.localdata', 'pg');
const PG_PORT = parseInt(process.env.DOGFOOD_PG_PORT || '5433', 10);
const API_PORT = parseInt(process.env.PORT || '3000', 10);
const WEB_PORT = parseInt(process.env.WEB_PORT || '8080', 10);

let EmbeddedPostgres = require('embedded-postgres');
EmbeddedPostgres = EmbeddedPostgres.default || EmbeddedPostgres.EmbeddedPostgres || EmbeddedPostgres;

async function main() {
  console.log('[start] DOGFOOD local run — no Docker required');

  const alreadyInit = fs.existsSync(path.join(DATA_DIR, 'PG_VERSION'));
  const pg = new EmbeddedPostgres({
    databaseDir: DATA_DIR,
    user: 'dogfood',
    password: 'dogfood',
    port: PG_PORT,
    persistent: true,
    initdbFlags: ['--locale=C', '-E', 'UTF8'],
    onLog: (m) => console.log('[pg]', String(m).trim().slice(0, 300)),
    onError: (m) => console.error('[pg:err]', String(m).trim().slice(0, 300)),
  });

  if (!alreadyInit) {
    console.log(`[start] First run: initialising embedded PostgreSQL in .localdata/pg (port ${PG_PORT})…`);
    await pg.initialise();
  } else {
    console.log('[start] Reusing existing database in .localdata/pg');
  }
  await pg.start();
  console.log('[start] PostgreSQL up');

  try {
    await pg.createDatabase('dogfood');
    console.log('[start] Database "dogfood" created');
  } catch (e) {
    if (!/already exists/i.test(String(e.message))) throw e;
  }

  process.env.DATABASE_URL = `postgres://dogfood:dogfood@127.0.0.1:${PG_PORT}/dogfood`;
  process.env.PORT = String(API_PORT);

  const backend = require(path.join(ROOT, 'backend', 'src', 'server.js'));
  await backend.main();

  const { startFrontend } = require('./serve-frontend.js');
  await startFrontend(WEB_PORT);

  console.log(`[start] App ready → http://localhost:${WEB_PORT}  (Ctrl+C to stop)`);

  let stopping = false;
  const shutdown = async (sig) => {
    if (stopping) return;
    stopping = true;
    console.log(`\n[start] ${sig} received, stopping…`);
    try {
      await pg.stop();
      console.log('[start] PostgreSQL stopped');
    } catch (e) {
      console.error('[start] pg stop warning:', e.message);
    }
    process.exit(0);
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((e) => {
  console.error('[start] FATAL:', e);
  process.exit(1);
});
