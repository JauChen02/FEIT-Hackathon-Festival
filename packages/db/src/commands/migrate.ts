/**
 * `pnpm db:migrate` — apply checked-in migrations (PLANNING.md §14.4).
 *
 * Migrations are generated with `drizzle-kit generate` and live in
 * `packages/db/migrations`. This runner is safe in every environment: it only
 * applies migrations that have not run yet, and is a no-op when none are
 * pending.
 */

// Must be first: populates process.env from .env.local before anything reads it.
import '../loadEnv';

import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { createDatabase, type Database } from '../client';

export const MIGRATIONS_FOLDER = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../migrations',
);

export async function runMigrations(db: Database): Promise<void> {
  await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
}

async function main(): Promise<void> {
  const handle = createDatabase({ max: 1 });
  try {
    await runMigrations(handle.db);
    console.log(`Migrations applied from ${MIGRATIONS_FOLDER}`);
  } finally {
    await handle.close();
  }
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
