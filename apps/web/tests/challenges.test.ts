import { afterAll, beforeAll, expect, it } from 'vitest';
import { eq, asc } from 'drizzle-orm';
import { FixedClock, uuidv7, weekKeyUtc } from '@learnarena/core';
import {
  findDailyChallenge,
  publishDailyChallenge,
  questionVersions,
  seedIds,
  pointLedger,
  weeklyPoints,
} from '@learnarena/db';
import { POST as onboarding } from '@/app/api/me/onboarding/route';
import { POST as create } from '@/app/api/sessions/route';
import { GET as daily } from '@/app/api/daily-challenge/route';
import { GET as leaderboard } from '@/app/api/leaderboards/route';
import { setSessionClock } from '@/lib/sessions/context';
import { setEventTransport } from '@/lib/inngest/events';
import {
  createWebTestContext,
  jsonRequest,
  onboardingBody,
  readResponse,
  type WebTestContext,
} from './helpers/testApp';
import { complete, playAllQuestions } from './helpers/quiz';
let ctx: WebTestContext;
let restore: () => void;
let restoreEvents: () => void;
let userId: string;
const clock = new FixedClock('2026-09-30T12:00:00Z');
beforeAll(async () => {
  ctx = await createWebTestContext('challenges');
  restore = setSessionClock(clock);
  restoreEvents = setEventTransport(async () => {});
  userId = uuidv7();
  ctx.signInAs(userId);
  await onboarding(
    jsonRequest('/api/me/onboarding', {
      method: 'POST',
      body: onboardingBody({ username: 'daily_player', timezone: 'UTC' }),
    }),
  );
  const versions = await ctx.db
    .select({ id: questionVersions.id })
    .from(questionVersions)
    .where(eq(questionVersions.categoryId, seedIds.category('math')))
    .orderBy(asc(questionVersions.id))
    .limit(10);
  await ctx.db.transaction((tx) =>
    publishDailyChallenge(
      tx,
      '2026-09-30',
      versions.map((v) => v.id),
      seedIds.user('seed_reviewer'),
      clock.now(),
    ),
  );
});
afterAll(async () => {
  restore();
  restoreEvents();
  await ctx?.teardown();
});
it('awards the daily bonus once and keeps normal replay points, with a Redis outage fallback', async () => {
  const challenge = await findDailyChallenge(ctx.db, '2026-09-30');
  expect(challenge?.questions).toHaveLength(10);
  for (let run = 0; run < 2; run++) {
    const created = await readResponse<{ sessionId: string }>(
      await create(
        jsonRequest('/api/sessions', {
          method: 'POST',
          headers: { 'idempotency-key': uuidv7() },
          body: { gameType: 'quiz_solo', categorySlug: 'math', dailyChallengeId: challenge!.id },
        }),
      ),
    );
    expect(created.status).toBe(200);
    await playAllQuestions(ctx.db, created.body.sessionId);
    const result = await complete(created.body.sessionId);
    expect(result.status).toBe(200);
    expect(result.body.dailyChallengeBonus).toBe(run === 0 ? 100 : 0);
    const retries = await Promise.all(
      Array.from({ length: 5 }, () => complete(created.body.sessionId)),
    );
    for (const retry of retries) expect(retry.body).toEqual(result.body);
  }
  const rows = await ctx.db.select().from(pointLedger).where(eq(pointLedger.userId, userId));
  expect(rows.filter((row) => row.reason === 'DAILY_CHALLENGE_BONUS')).toHaveLength(1);
  expect(rows).toHaveLength(3);
  const info = await readResponse<{ challenge: { bonusAvailable: boolean } }>(
    await daily(jsonRequest('/api/daily-challenge')),
  );
  expect(info.body.challenge.bonusAvailable).toBe(false);
  const board = await readResponse<{ degraded: boolean; me: { points: number } }>(
    await leaderboard(jsonRequest('/api/leaderboards')),
  );
  expect(board.status).toBe(200);
  expect(board.body.degraded).toBe(true);
  expect(board.body.me.points).toBe(await weeklyPoints(ctx.db, weekKeyUtc(clock.now()), userId));
});
it('rejects invalid week keys and foreign challenge dates', async () => {
  expect((await leaderboard(jsonRequest('/api/leaderboards?week=2026-W99'))).status).toBe(400);
  expect(
    (
      await create(
        jsonRequest('/api/sessions', {
          method: 'POST',
          headers: { 'idempotency-key': uuidv7() },
          body: { gameType: 'quiz_solo', categorySlug: 'math', dailyChallengeId: uuidv7() },
        }),
      )
    ).status,
  ).toBe(400);
});
