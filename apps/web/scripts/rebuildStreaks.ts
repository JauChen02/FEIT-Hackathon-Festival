import '@learnarena/db/loadEnv';
import { systemClock } from '@learnarena/core';
import { createDatabase, lockStreakUser, rebuildStreakSummary, users } from '@learnarena/db';
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required');
const handle = createDatabase({ databaseUrl });
try {
  const index = process.argv.indexOf('--user');
  const userId = index >= 0 ? process.argv[index + 1] : undefined;
  if (index >= 0 && !userId) throw new Error('--user requires a user id');
  const ids = userId
    ? [userId]
    : (await handle.db.select({ id: users.id }).from(users)).map((row) => row.id);
  for (const id of ids)
    await handle.db.transaction(async (tx) => {
      await lockStreakUser(tx, id);
      await rebuildStreakSummary(tx, id, systemClock.now());
    });
  console.log(`Rebuilt streak summaries for ${ids.length} users.`);
} finally {
  await handle.close();
}
