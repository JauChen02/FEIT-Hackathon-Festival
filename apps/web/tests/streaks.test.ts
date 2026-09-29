import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { FixedClock, uuidv7, type StreakState } from '@learnarena/core';
import {
  consumeFreeze,
  grantFreeze,
  loadStreakData,
  rebuildStreakSummary,
  streakDays,
  streakSummary,
  userTimezoneChanges,
} from '@learnarena/db';
import { POST as onboarding } from '@/app/api/me/onboarding/route';
import { GET, PATCH } from '@/app/api/me/route';
import { setSessionClock } from '@/lib/sessions/context';
import { setEventTransport } from '@/lib/inngest/events';
import { clearCategoryCache } from '@/lib/sessions/categories';
import { clearGameTypeCache } from '@/lib/sessions/gameTypes';
import { testClockOverride } from '@/lib/streaks/testClock';
import {
  createWebTestContext,
  jsonRequest,
  onboardingBody,
  readResponse,
  type WebTestContext,
} from './helpers/testApp';
import { complete, createSession, playAllQuestions } from './helpers/quiz';
let ctx: WebTestContext;
let clock: FixedClock;
let userId: string;
let restore: () => void;
let restoreEvents: () => void;
beforeAll(async () => {
  ctx = await createWebTestContext('streaks');
});
afterAll(async () => {
  await ctx?.teardown();
});
beforeEach(async () => {
  clearCategoryCache();
  clearGameTypeCache();
  clock = new FixedClock('2026-01-01T12:00:00Z');
  restore = setSessionClock(clock);
  restoreEvents = setEventTransport(async () => {});
  userId = uuidv7();
  ctx.signInAs(userId);
  await onboarding(
    jsonRequest('/api/me/onboarding', {
      method: 'POST',
      body: onboardingBody({
        username: `s${userId.replaceAll('-', '').slice(-16)}`,
        timezone: 'UTC',
      }),
    }),
  );
});
afterEach(() => {
  restore();
  restoreEvents();
});
async function play() {
  const created = await createSession();
  expect(created.status).toBe(200);
  await playAllQuestions(ctx.db, created.body.sessionId);
  const result = await complete(created.body.sessionId);
  expect(result.status).toBe(200);
  return { id: created.body.sessionId, result };
}
it('credits once, multiplies points, and returns read-time state', async () => {
  const first = await play();
  expect(first.result.body.streak).toMatchObject({ currentLen: 1, credited: true });
  expect(first.result.body.pointsBreakdown).toMatchObject({ multipliers: { streak: 1.02 } });
  await Promise.all(Array.from({ length: 5 }, () => complete(first.id)));
  await play();
  expect((await loadStreakData(ctx.db, userId)).days).toHaveLength(1);
  clock.advanceMs(86_400_000);
  const me = await readResponse<{ streak: StreakState }>(await GET(jsonRequest('/api/me')));
  expect(me.body.streak.displayState).toBe('AT_RISK');
  expect((await play()).result.body.streak).toMatchObject({ currentLen: 2 });
});
it('grants at seven, bridges oldest first, and rebuilds the cache', async () => {
  for (let day = 1; day <= 6; day++)
    await ctx.db
      .insert(streakDays)
      .values({ userId, localDate: `2025-12-${25 + day}`, source: 'PLAYED' });
  expect((await play()).result.body.streak).toMatchObject({
    currentLen: 7,
    freezesAvailable: 1,
    milestone: 7,
  });
  await play();
  expect((await loadStreakData(ctx.db, userId)).freezes).toHaveLength(1);
  clock.advanceMs(2 * 86_400_000);
  expect((await play()).result.body.streak).toMatchObject({ currentLen: 9, freezesAvailable: 0 });
  const data = await loadStreakData(ctx.db, userId);
  expect(data.days.find((day) => day.localDate === '2026-01-02')?.source).toBe('FROZEN');
  expect(data.freezes[0]?.status).toBe('CONSUMED');
  await expect(
    consumeFreeze(ctx.db, userId, data.freezes[0]!.id, '2026-01-02', clock.now()),
  ).rejects.toThrow();
  await ctx.db
    .update(streakSummary)
    .set({ currentLen: 999 })
    .where(eq(streakSummary.userId, userId));
  expect(await rebuildStreakSummary(ctx.db, userId, clock.now())).toMatchObject({
    currentLen: 9,
    longestLen: 9,
  });
});
it('does not spend insufficient freezes on a restart', async () => {
  await play();
  await grantFreeze(ctx.db, userId, '2026-01-01', clock.now());
  clock.advanceMs(3 * 86_400_000);
  expect((await play()).result.body.streak).toMatchObject({ currentLen: 1, freezesAvailable: 1 });
});
it('serializes timezone changes and preserves historical days', async () => {
  await play();
  const before = (await loadStreakData(ctx.db, userId)).days;
  const patch = (timezone: string) =>
    PATCH(jsonRequest('/api/me', { method: 'PATCH', body: { timezone } }));
  const changes = await Promise.all([patch('America/New_York'), patch('Australia/Melbourne')]);
  expect(changes.map((r) => r.status).sort()).toEqual([200, 409]);
  expect(
    await ctx.db.select().from(userTimezoneChanges).where(eq(userTimezoneChanges.userId, userId)),
  ).toHaveLength(1);
  expect((await loadStreakData(ctx.db, userId)).days).toEqual(before);
  clock.advanceMs(86_400_000);
  expect((await patch('Pacific/Niue')).status).toBe(200);
});
it('ignores test headers unless the isolated test switch is enabled', () => {
  for (const environment of ['production', 'preview', undefined])
    expect(testClockOverride('2026-01-01', environment, '1')).toBeNull();
  expect(testClockOverride('2026-01-01', 'test', undefined)).toBeNull();
  expect(testClockOverride('invalid', 'test', '1')).toBeNull();
  expect(testClockOverride('2026-01-01', 'test', '1')?.toISOString()).toBe(
    '2026-01-01T00:00:00.000Z',
  );
});
