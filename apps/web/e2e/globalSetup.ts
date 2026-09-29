import '@learnarena/db/loadEnv';
import { createDatabase, runMigrations, seedDatabase } from '@learnarena/db';

/**
 * Make sure the database the E2E server talks to is migrated and seeded.
 *
 * The suite drives the real app against the real local Supabase stack, so it
 * needs the taxonomy and the 45 published questions to exist before the Home
 * screen can show any category counts.
 */
export default async function globalSetup(): Promise<void> {
  const handle = createDatabase({ max: 1 });
  try {
    await runMigrations(handle.db);
    await seedDatabase(handle.db, { skipFixtureHistories: true });
  } finally {
    await handle.close();
  }
}
