'use strict';
// Entry point: wait for DB, migrate, seed, listen.
const { createApp } = require('./app');
const db = require('./db');
const { migrate } = require('./migrate');
const { initMemoryDb } = require('./memdb');

const PORT = parseInt(process.env.PORT || '3000', 10);

async function connectOrFallbackDb() {
  if (process.env.USE_MEM_DB === 'true') {
    console.log('[server] USE_MEM_DB=true: Initializing in-memory PostgreSQL engine (pg-mem)...');
    initMemoryDb();
    return false;
  }

  const isRemoteOrDocker =
    process.env.DATABASE_URL &&
    !process.env.DATABASE_URL.includes('localhost') &&
    !process.env.DATABASE_URL.includes('127.0.0.1');

  const maxRetries = isRemoteOrDocker ? 30 : (process.env.DB_RETRIES ? parseInt(process.env.DB_RETRIES, 10) : 2);

  for (let i = 1; i <= maxRetries; i++) {
    try {
      await db.query('SELECT 1');
      console.log('[server] Connected to PostgreSQL successfully.');
      return true;
    } catch (e) {
      if (i < maxRetries) {
        console.log(`[server] waiting for db (${i}/${maxRetries}): ${e.message}`);
        await new Promise((r) => setTimeout(r, 1000));
      } else {
        if (isRemoteOrDocker) {
          throw new Error(`Database unreachable at ${process.env.DATABASE_URL}: ${e.message}`);
        }
        console.log(`[server] Local PostgreSQL not detected (${e.message}).`);
        console.log('[server] Falling back to built-in in-memory PostgreSQL engine (pg-mem)...');
        initMemoryDb();
        return false;
      }
    }
  }
  return false;
}

async function main() {
  const isRealDb = await connectOrFallbackDb();
  if (isRealDb) {
    await migrate();
  }

  // Auto-seed on first startup (idempotent: seed.js checks for existing users).
  try {
    const { seed } = require('./seed');
    await seed();
  } catch (e) {
    console.error('[server] seed warning:', e.message);
  }

  const app = createApp();
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n======================================================`);
    console.log(`🐶 DOGFOOD is running and ready!`);
    console.log(`- Web App:      http://localhost:${PORT}`);
    console.log(`- API Health:   http://localhost:${PORT}/api/health`);
    console.log(`------------------------------------------------------`);
    console.log(`Demo Accounts:`);
    console.log(`- Admin:        admin@dogfood.local      / Admin123!`);
    console.log(`- Organizer:    organizer@dogfood.local  / Organizer123!`);
    console.log(`- Judge:        judge@dogfood.local      / Judge123!`);
    console.log(`- Participant:  priya@dogfood.local      / Password123!`);
    console.log(`======================================================\n`);
  });
}

if (require.main === module) {
  main().catch((e) => {
    console.error('[server] fatal', e);
    process.exit(1);
  });
}

module.exports = { main };
