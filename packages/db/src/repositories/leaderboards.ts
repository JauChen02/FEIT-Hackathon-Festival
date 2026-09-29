import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import { rankLeaderboard } from '@learnarena/core';
import type { Database } from '../client';
import { pointLedger, users } from '../schema';
export async function weeklyLeaderboard(db: Database, week: string, userIds?: readonly string[]) {
  if (userIds?.length === 0) return [];
  const rows = await db
    .select({
      userId: users.id,
      username: users.username,
      displayName: users.displayName,
      points: sql<number>`sum(${pointLedger.finalPoints})::int`,
    })
    .from(pointLedger)
    .innerJoin(users, eq(users.id, pointLedger.userId))
    .where(
      and(
        eq(pointLedger.weekKey, week),
        isNull(users.deletedAt),
        userIds ? inArray(users.id, [...userIds]) : undefined,
      ),
    )
    .groupBy(users.id, users.username, users.displayName);
  return rankLeaderboard(rows);
}
export async function weeklyPoints(db: Database, week: string, userId: string) {
  const [row] = await db
    .select({ points: sql<number>`coalesce(sum(${pointLedger.finalPoints}),0)::int` })
    .from(pointLedger)
    .where(and(eq(pointLedger.weekKey, week), eq(pointLedger.userId, userId)));
  return row?.points ?? 0;
}
