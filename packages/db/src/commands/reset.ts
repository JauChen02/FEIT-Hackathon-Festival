/**
 * `pnpm db:reset` — drop everything, re-apply migrations, re-seed.
 *
 * §14.4: "pnpm db:reset works only when APP_ENV=local or APP_ENV=test."
 *
 * This is also how a migration is "reversed" in local (ADR-029): drizzle-kit
 * does not generate down-migrations, so the documented way back to a clean
 * database is to drop and re-apply from scratch.
 */

// Must be first: populates process.env from .env.local before anything reads it.
import '../loadEnv';

import type { Sql } from '../client';
import { createDatabase } from '../client';
import { assertResetAllowed } from '../env';
import { runMigrations } from './migrate';
import { seedDatabase } from './seed';

/**
 * Drop and recreate the public schema, then re-run every migration.
 *
 * The drizzle bookkeeping table lives in its own `drizzle` schema, so that is
 * dropped too — otherwise the migrator would believe the migrations had already
 * been applied to the now-empty database.
 */
export async function resetDatabase(sql: Sql): Promise<void> {
  assertResetAllowed();
  await sql.unsafe(`
    DROP SCHEMA IF EXISTS drizzle CASCADE;
    DROP SCHEMA IF EXISTS public CASCADE;
    CREATE SCHEMA public;
    GRANT ALL ON SCHEMA public TO public;
  `);
}

async function main(): Promise<void> {
  const appEnv = assertResetAllowed();
  const skipSeed = process.argv.includes('--no-seed');

  const handle = createDatabase({ max: 1 });
  try {
    console.log(`Resetting database (APP_ENV=${appEnv})…`);
    await resetDatabase(handle.sql);
    await runMigrations(handle.db);
    console.log('Migrations re-applied.');

    if (skipSeed) {
      console.log('Skipping seed (--no-seed).');
      return;
    }
    const summary = await seedDatabase(handle.db);
    console.log('Seeded:', summary);
  } finally {
    await handle.close();
  }
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
