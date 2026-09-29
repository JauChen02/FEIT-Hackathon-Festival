import { and, asc, eq } from 'drizzle-orm';
import { buildSummary, uuidv7, AppError } from '@learnarena/core';
import type { Database } from '../client';
import { streakDays, streakFreezes, streakSummary, users } from '../schema';
export async function lockStreakUser(db: Database, userId: string) {
  return (await db.select().from(users).where(eq(users.id, userId)).for('update'))[0];
}
export async function loadStreakData(db: Database, userId: string) {
  const days = await db
    .select()
    .from(streakDays)
    .where(eq(streakDays.userId, userId))
    .orderBy(asc(streakDays.localDate));
  const freezes = await db
    .select()
    .from(streakFreezes)
    .where(eq(streakFreezes.userId, userId))
    .orderBy(asc(streakFreezes.earnedOnLocalDate));
  return { days, freezes };
}
export async function insertStreakDay(db: Database, input: typeof streakDays.$inferInsert) {
  return db.insert(streakDays).values(input).onConflictDoNothing().returning();
}
export async function consumeFreeze(
  db: Database,
  userId: string,
  id: string,
  localDate: string,
  now: Date,
) {
  const rows = await db
    .update(streakFreezes)
    .set({ status: 'CONSUMED', consumedForLocalDate: localDate, consumedAt: now })
    .where(
      and(
        eq(streakFreezes.id, id),
        eq(streakFreezes.userId, userId),
        eq(streakFreezes.status, 'AVAILABLE'),
      ),
    )
    .returning();
  if (!rows.length) throw new AppError('INVALID_SESSION_STATE');
}
export async function grantFreeze(db: Database, userId: string, localDate: string, now: Date) {
  await db
    .insert(streakFreezes)
    .values({
      id: uuidv7(),
      userId,
      status: 'AVAILABLE',
      earnedOnLocalDate: localDate,
      createdAt: now,
    })
    .onConflictDoNothing();
}
export async function rebuildStreakSummary(db: Database, userId: string, now: Date) {
  const { days, freezes } = await loadStreakData(db, userId);
  const summary = buildSummary(days, freezes);
  await db
    .insert(streakSummary)
    .values({ userId, ...summary, updatedAt: now })
    .onConflictDoUpdate({ target: streakSummary.userId, set: { ...summary, updatedAt: now } });
  return summary;
}
