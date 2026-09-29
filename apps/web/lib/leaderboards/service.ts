import 'server-only';
import { Redis } from '@upstash/redis';
import { rankLeaderboard, type LeaderboardResponse } from '@learnarena/core';
import { blockedUserIds, weeklyLeaderboard, weeklyPoints } from '@learnarena/db';
import { db } from '../db';
import { logger } from '../logger';
export function redisClient(): Redis | null {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? new Redis({ url, token, retry: { retries: 0 } }) : null;
}
export const leaderboardKey = (week: string) => `leaderboard:${week}:global`;
export async function projectUser(week: string, userId: string) {
  const redis = redisClient();
  if (!redis) throw new Error('Redis is not configured');
  // Keep recomputation and publication ordered per user, including manual rebuilds.
  await db().transaction(async (tx) => {
    const { lockStreakUser } = await import('@learnarena/db');
    await lockStreakUser(tx, userId);
    const score = await weeklyPoints(tx, week, userId);
    await redis.zadd(leaderboardKey(week), { score, member: userId });
    await redis.expire(leaderboardKey(week), 8 * 7 * 86400);
  });
}
export async function rebuildWeek(week: string) {
  const rows = await weeklyLeaderboard(db(), week);
  for (const row of rows) await projectUser(week, row.userId);
  return rows.length;
}
export async function readLeaderboard(
  week: string,
  userId: string,
  at: Date,
  ids?: readonly string[],
): Promise<LeaderboardResponse> {
  // SQL supplies canonical membership and names. A projection is used only when complete and current.
  const hidden = new Set(await blockedUserIds(db(), userId));
  let entries = rankLeaderboard(
    (await weeklyLeaderboard(db(), week, ids)).filter((row) => !hidden.has(row.userId)),
  );
  let degraded = true;
  const redis = redisClient();
  if (redis && entries.length)
    try {
      const scores = await redis.zmscore(
        leaderboardKey(week),
        entries.map((row) => row.userId),
      );
      if (
        scores &&
        scores.every((score, i) => score !== null && Number(score) === entries[i]!.points)
      ) {
        entries = rankLeaderboard(entries.map((row, i) => ({ ...row, points: Number(scores[i]) })));
        degraded = false;
      }
    } catch {
      logger.warn({ week }, 'leaderboard.update_failed');
    }
  const next = new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate()));
  next.setUTCDate(next.getUTCDate() + (8 - (at.getUTCDay() || 7)));
  return {
    week,
    entries: entries.slice(0, 100),
    me: entries.find((row) => row.userId === userId) ?? null,
    degraded,
    nextWeekAt: next.toISOString(),
  };
}
