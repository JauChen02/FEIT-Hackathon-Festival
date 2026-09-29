/**
 * `pnpm db:push` — the guarded wrapper around `drizzle-kit push`.
 *
 * §14.4: "drizzle-kit push is allowed only against a local database
 * (APP_ENV=local); the command wrapper refuses otherwise."
 *
 * Push bypasses the migration history entirely, so running it anywhere else
 * would silently diverge the database from `packages/db/migrations`.
 */

// Must be first: populates process.env from .env.local before anything reads it.
import '../loadEnv';

import { spawnSync } from 'node:child_process';
import { assertPushAllowed } from '../env';

function main(): void {
  assertPushAllowed();

  const result = spawnSync('drizzle-kit', ['push', ...process.argv.slice(2)], {
    stdio: 'inherit',
    shell: false,
  });

  process.exitCode = result.status ?? 1;
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
