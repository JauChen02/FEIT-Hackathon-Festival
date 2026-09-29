import '@learnarena/db/loadEnv';
import { localDateFor, systemClock } from '@learnarena/core';
import {
  createDatabase,
  findDailyChallenge,
  publishDailyChallenge,
  questionVersions,
  seedIds,
} from '@learnarena/db';
import { asc, eq } from 'drizzle-orm';
if (!['local', 'test'].includes(process.env.APP_ENV ?? ''))
  throw new Error(
    'This fixture publisher is local/test only. Production challenges are curated by an admin.',
  );
const handle = createDatabase({ max: 1 });
try {
  const now = systemClock.now();
  const date = process.argv[2] ?? localDateFor('UTC', now);
  await handle.db.transaction(async (tx) => {
    if (await findDailyChallenge(tx, date)) return;
    const versions = await tx
      .select({ id: questionVersions.id })
      .from(questionVersions)
      .where(eq(questionVersions.categoryId, seedIds.category('math')))
      .orderBy(asc(questionVersions.id))
      .limit(10);
    await publishDailyChallenge(
      tx,
      date,
      versions.map((v) => v.id),
      seedIds.user('seed_reviewer'),
      now,
    );
  });
  console.log(`Daily challenge ready for ${date}`);
} finally {
  await handle.close();
}
