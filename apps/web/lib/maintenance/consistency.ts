import 'server-only';
import { and, eq, isNull } from 'drizzle-orm';
import { buildSummary, systemClock } from '@learnarena/core';
import {
  gameSessions,
  loadStreakData,
  lockStreakUser,
  rebuildStreakSummary,
  streakSummary,
  sumLedgerPoints,
  users,
} from '@learnarena/db';
import { db } from '../db';
import { logger } from '../logger';
import { restoreCompletedResult } from '../sessions/completeSession';
export async function runConsistencyCheck(at = systemClock.now()) {
  const profiles = await db().select({ id: users.id }).from(users);
  let totalDrift = 0,
    streakDrift = 0,
    resultsRestored = 0;
  for (const profile of profiles)
    await db().transaction(async (tx) => {
      const user = await lockStreakUser(tx, profile.id);
      if (!user) return;
      const points = await sumLedgerPoints(tx, user.id);
      if (points !== user.totalPointsCached) {
        totalDrift++;
        logger.warn({ user_id: user.id, projection: 'total_points' }, 'cache.drift_detected');
        await tx
          .update(users)
          .set({ totalPointsCached: points, updatedAt: at })
          .where(eq(users.id, user.id));
      }
      const { days, freezes } = await loadStreakData(tx, user.id);
      const expected = buildSummary(days, freezes);
      const [cached] = await tx
        .select()
        .from(streakSummary)
        .where(eq(streakSummary.userId, user.id));
      if (
        (days.length || cached) &&
        (!cached ||
          cached.currentLen !== expected.currentLen ||
          cached.longestLen !== expected.longestLen ||
          cached.lastLocalDate !== expected.lastLocalDate ||
          cached.freezesAvailable !== expected.freezesAvailable)
      ) {
        streakDrift++;
        logger.warn({ user_id: user.id, projection: 'streak_summary' }, 'cache.drift_detected');
        await rebuildStreakSummary(tx, user.id, at);
      }
    });
  const missing = await db()
    .select({ session: gameSessions })
    .from(gameSessions)
    .innerJoin(users, eq(users.id, gameSessions.ownerId))
    .where(
      and(
        eq(gameSessions.status, 'COMPLETED'),
        eq(gameSessions.mode, 'SOLO'),
        isNull(gameSessions.resultJson),
        isNull(users.deletedAt),
      ),
    );
  for (const { session } of missing) {
    try {
      await db().transaction((tx) => restoreCompletedResult(tx, session));
      resultsRestored++;
    } catch {
      logger.warn({ session_id: session.id }, 'cache.result_recovery_failed');
    }
  }
  return { usersChecked: profiles.length, totalDrift, streakDrift, resultsRestored };
}
