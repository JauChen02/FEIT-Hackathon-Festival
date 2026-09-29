import { activityEvents } from '../schema';
import {
  buildSummary,
  freezesEarnedBy,
  milestoneReached,
  planStreakCredit,
  streakMultiplier,
  streakStateFor,
  uuidv7,
} from '@learnarena/core';
import type { Database } from '../client';
import {
  consumeFreeze,
  grantFreeze,
  insertStreakDay,
  loadStreakData,
  lockStreakUser,
  rebuildStreakSummary,
} from './streaks';
async function readCreditState(tx: Database, userId: string, today: string) {
  const { days, freezes } = await loadStreakData(tx, userId);
  return streakStateFor(days, freezes, today);
}
export async function creditStreak(ctx: {
  tx: Database;
  userId: string;
  sessionId: string;
  localDate: string;
  now: Date;
  isQualifying: boolean;
}) {
  const { tx, userId, localDate, now } = ctx;
  await lockStreakUser(tx, userId);
  const { days, freezes } = await loadStreakData(tx, userId);
  const before = buildSummary(days, freezes);
  const available = freezes.filter((f) => f.status === 'AVAILABLE');
  const plan = planStreakCredit({
    today: localDate,
    lastLocalDate: before.lastLocalDate,
    freezes: available,
  });
  const credited = ctx.isQualifying && plan.kind !== 'already_credited';
  let milestone: number | null = null;
  if (credited) {
    for (const day of plan.frozenDates) {
      await consumeFreeze(tx, userId, day.freezeId, day.localDate, now);
      await insertStreakDay(tx, { userId, ...day, source: 'FROZEN', createdAt: now });
    }
    await insertStreakDay(tx, {
      userId,
      localDate,
      source: 'PLAYED',
      sessionId: ctx.sessionId,
      createdAt: now,
    });
    const after =
      plan.kind === 'restart' || plan.kind === 'first'
        ? 1
        : before.currentLen + plan.frozenDates.length + 1;
    const baseline = plan.kind === 'restart' ? 0 : before.currentLen;
    if (freezesEarnedBy(baseline, after, available.length - plan.frozenDates.length))
      await grantFreeze(tx, userId, localDate, now);
    milestone = milestoneReached(baseline, after);
    await rebuildStreakSummary(tx, userId, now);
  }
  if (milestone)
    await tx
      .insert(activityEvents)
      .values({
        id: uuidv7(),
        actorId: userId,
        kind: 'STREAK',
        refId: localDate,
        message: `Reached a ${milestone}-day practice streak`,
        createdAt: now,
      })
      .onConflictDoNothing();
  const state = await readCreditState(tx, userId, localDate);
  return {
    streakMultiplier: streakMultiplier(state.currentLen),
    streak: { ...state, credited, milestone },
  };
}
