'use strict';
const fs = require('fs');
const path = require('path');
const db = require('./db');

async function migrate() {
  const dir = path.join(__dirname, '..', 'migrations');
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  // migrations table for idempotency
  await db.query(
    `CREATE TABLE IF NOT EXISTS schema_migrations (filename TEXT PRIMARY KEY, applied_at TIMESTAMPTZ DEFAULT now())`
  );
  const done = await db.query('SELECT filename FROM schema_migrations');
  const doneSet = new Set(done.rows.map((r) => r.filename));
  for (const f of files) {
    if (doneSet.has(f)) {
      // eslint-disable-next-line no-console
      console.log(`[migrate] skip ${f}`);
      continue;
    }
    const sql = fs.readFileSync(path.join(dir, f), 'utf8');
    // eslint-disable-next-line no-console
    console.log(`[migrate] apply ${f}`);
    await db.query(sql);
    await db.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [f]);
  }
  // eslint-disable-next-line no-console
  console.log('[migrate] done');
}

if (require.main === module) {
  migrate()
    .then(() => process.exit(0))
    .catch((e) => {
      // eslint-disable-next-line no-console
      console.error('[migrate] failed', e);
      process.exit(1);
    });
}

module.exports = { migrate };
