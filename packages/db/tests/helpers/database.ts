/**
 * Integration-test harness: a real Postgres, one throwaway database per test
 * file (PLANNING.md §22.2).
 *
 * Each file gets its own database rather than sharing one, so tests can insert
 * conflicting rows, drop things and run in any order without coordinating. The
 * migrations under test are the checked-in ones, so a constraint that only
 * exists in the Drizzle DSL and never reached SQL would fail here.
 */

import '../../src/loadEnv';
import postgres from 'postgres';
import { createDatabase, type Database, type DatabaseHandle } from '../../src/client';
import { runMigrations } from '../../src/commands/migrate';
import { requireDatabaseUrl } from '../../src/env';

export interface TestDatabase {
  db: Database;
  handle: DatabaseHandle;
  databaseName: string;
  drop(): Promise<void>;
}

function adminUrl(): string {
  // Connect to the maintenance database so we can CREATE/DROP others.
  const url = new URL(requireDatabaseUrl());
  url.pathname = '/postgres';
  return url.toString();
}

function urlFor(databaseName: string): string {
  const url = new URL(requireDatabaseUrl());
  url.pathname = `/${databaseName}`;
  return url.toString();
}

/** Postgres identifiers are limited to 63 bytes. */
function sanitize(name: string): string {
  return `la_test_${name.replace(/[^a-z0-9]+/gi, '_').toLowerCase()}`.slice(0, 63);
}

/**
 * Create a fresh database, run every migration into it, and return a handle.
 * Call `drop()` in an `afterAll` hook.
 */
export async function createTestDatabase(name: string): Promise<TestDatabase> {
  const databaseName = sanitize(name);
  const admin = postgres(adminUrl(), { max: 1, onnotice: () => {} });

  try {
    await admin.unsafe(`DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`);
    await admin.unsafe(`CREATE DATABASE "${databaseName}"`);
  } finally {
    await admin.end({ timeout: 5 });
  }

  const handle = createDatabase({ databaseUrl: urlFor(databaseName), max: 2 });
  await runMigrations(handle.db);

  return {
    db: handle.db,
    handle,
    databaseName,
    drop: async () => {
      await handle.close();
      const cleanup = postgres(adminUrl(), { max: 1, onnotice: () => {} });
      try {
        await cleanup.unsafe(`DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`);
      } finally {
        await cleanup.end({ timeout: 5 });
      }
    },
  };
}

/**
 * Assert that `run` fails with a Postgres error, and return that error.
 *
 * Constraint tests need the *code* and *constraint name*, not just "it threw",
 * so this narrows to something inspectable rather than using `.rejects.toThrow`.
 */
export async function expectPgError(run: () => Promise<unknown>): Promise<{
  code: string;
  constraint?: string;
  message: string;
}> {
  try {
    await run();
  } catch (error) {
    const pg = error as { code?: string; constraint_name?: string; message?: string };
    // Drizzle wraps driver errors; the original is on `cause`.
    const cause = (error as { cause?: typeof pg }).cause;
    const source = pg.code ? pg : (cause ?? pg);
    return {
      code: source.code ?? 'UNKNOWN',
      ...(source.constraint_name ? { constraint: source.constraint_name } : {}),
      message: source.message ?? String(error),
    };
  }
  throw new Error('Expected the statement to be rejected by the database, but it succeeded.');
}
