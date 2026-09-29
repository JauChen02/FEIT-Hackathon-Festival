import '@learnarena/db/loadEnv';
import { and, eq, isNull, lt, sql } from 'drizzle-orm';
import { systemClock, weekKeyUtc } from '@learnarena/core';
import { coachMessages, gameSessions, getDatabase, sessionPlayers, users } from '@learnarena/db';
import { runDrainPendingSessions } from '../lib/inngest/functions/coachJobs';
import { runNarration, runAchievements } from '../lib/inngest/functions/engagementJobs';
import { runReminders, runAuthDeletionRetries } from '../lib/inngest/functions/privacyJobs';
import { rebuildWeek } from '../lib/leaderboards/service';
import { runConsistencyCheck } from '../lib/maintenance/consistency';
import { runExpireStaleSessions } from '../lib/inngest/functions/sessionJobs';
const handle = getDatabase();
let stopping = false;
let tickCount = 0;
for (const signal of ['SIGINT', 'SIGTERM'] as const)
  process.once(signal, () => {
    stopping = true;
  });
console.log('LearnArena background worker started.');
while (!stopping) {
  const at = systemClock.now();
  try {
    await runDrainPendingSessions(at);
    const pending = await handle.db
      .select({ sessionId: gameSessions.id, userId: sessionPlayers.userId })
      .from(gameSessions)
      .innerJoin(sessionPlayers, eq(sessionPlayers.sessionId, gameSessions.id))
      .innerJoin(users, eq(users.id, sessionPlayers.userId))
      .leftJoin(
        coachMessages,
        and(
          eq(coachMessages.sessionId, gameSessions.id),
          eq(coachMessages.userId, sessionPlayers.userId),
          eq(coachMessages.kind, 'SESSION'),
        ),
      )
      .where(
        and(
          eq(gameSessions.status, 'COMPLETED'),
          isNull(users.deletedAt),
          isNull(coachMessages.id),
        ),
      )
      .orderBy(gameSessions.endedAt)
      .limit(20);
    for (const row of pending) {
      if (stopping) break;
      await runNarration(row.userId, row.sessionId, at);
      await runAchievements(row.userId, at);
    }
    if (tickCount % 6 === 0) {
      await rebuildWeek(weekKeyUtc(at)).catch(() => {});
      await runReminders(at);
      await runAuthDeletionRetries(at);
    }
    if (tickCount % 360 === 0) {
      await runExpireStaleSessions(at);
      await runConsistencyCheck(at);
      await handle.db
        .update(coachMessages)
        .set({ inputSnapshotJson: null })
        .where(lt(coachMessages.createdAt, new Date(at.getTime() - 90 * 86400000)));
      const profiles = await handle.db
        .select({ id: users.id })
        .from(users)
        .where(and(isNull(users.deletedAt), sql`${users.onboardingCompletedAt} is not null`));
      for (const profile of profiles) {
        if (stopping) break;
        await runNarration(profile.id, null, at);
        await runAchievements(profile.id, at);
      }
    }
  } catch (error) {
    console.error(
      JSON.stringify({
        event: 'job.failed',
        type: error instanceof Error ? error.name : 'UnknownError',
      }),
    );
  }
  tickCount++;
  for (let i = 0; i < 10 && !stopping; i++)
    await new Promise((resolve) => setTimeout(resolve, 1000));
}
await handle.close();
