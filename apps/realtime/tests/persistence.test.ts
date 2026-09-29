import { afterAll, beforeAll, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { FixedClock, uuidv7 } from '@learnarena/core';
import {
  createLobby,
  joinLobby,
  lobbies,
  transitionLobby,
  users,
  gameSessions,
  pointLedger,
  answers,
  learningEvents,
  matchResults,
  signRealtimeToken,
  verifyRealtimeToken,
} from '@learnarena/db';
import { createTestDatabase, type TestDatabase } from '../../../packages/db/tests/helpers/database';
import { seedDatabase } from '../../../packages/db/src/commands/seed';
import { startMatch, finalizeMatch, abortMatch } from '../src/persistence';
let ctx: TestDatabase;
const clock = new FixedClock('2026-09-30T12:00:00Z');
const ids = [uuidv7(), uuidv7(), uuidv7(), uuidv7()];
beforeAll(async () => {
  ctx = await createTestDatabase('realtime');
  await seedDatabase(ctx.db);
  for (let i = 0; i < ids.length; i++)
    await ctx.db
      .insert(users)
      .values({
        id: ids[i]!,
        username: `match_user_${i}`,
        displayName: `Player ${i}`,
        timezone: 'UTC',
        onboardingCompletedAt: clock.now(),
        ageConfirmedAt: clock.now(),
      });
});
afterAll(async () => {
  await ctx?.drop();
});
it('co-op results commit once under concurrent finalization with individual events', async () => {
  const lobby = await ctx.db.transaction((tx) =>
    createLobby(tx, ids[0]!, 'quiz_coop', 'ABCDEF123456', clock.now()),
  );
  await ctx.db.transaction((tx) => joinLobby(tx, lobby.code, ids[1]!, clock.now()));
  await transitionLobby(ctx.db, lobby.id, 'OPEN', 'STARTING', clock.now());
  const match = await startMatch(ctx.db, lobby.id, clock.now());
  for (const q of match.questions) {
    for (const userId of ids.slice(0, 2)) {
      const response =
        q.type === 'MCQ'
          ? {
              optionId:
                userId === ids[0]
                  ? (q.answer as { correctOptionId: string }).correctOptionId
                  : 'wrong',
            }
          : { value: userId === ids[0] ? (q.answer as { value: string }).value : '-999999' };
      if (q.type === 'MCQ' && userId === ids[1])
        response.optionId = q.options!.find(
          (o) => o.id !== (q.answer as { correctOptionId: string }).correctOptionId,
        )!.id;
      expect(
        match.submit(
          userId,
          'vote',
          { clientEventId: uuidv7(), questionId: q.id, response },
          clock.now().getTime() + 100,
        ).accepted,
      ).toBe(true);
    }
    clock.advanceMs(1000);
    match.resolve(clock.now().getTime());
  }
  const results = await Promise.all([
    finalizeMatch(ctx.db, lobby.id, match, clock.now()),
    finalizeMatch(ctx.db, lobby.id, match, clock.now()),
  ]);
  expect(results[0]).toEqual(results[1]);
  expect(results[0]![0]!.finalPoints).toBe(results[0]![1]!.finalPoints);
  expect(
    await ctx.db.select().from(pointLedger).where(eq(pointLedger.sessionId, match.id)),
  ).toHaveLength(2);
  expect(await ctx.db.select().from(answers).where(eq(answers.sessionId, match.id))).toHaveLength(
    20,
  );
  expect(
    await ctx.db
      .select()
      .from(learningEvents)
      .where(and(eq(learningEvents.sessionId, match.id), eq(learningEvents.userId, ids[1]!))),
  ).toHaveLength(10);
  expect(
    await ctx.db.select().from(matchResults).where(eq(matchResults.sessionId, match.id)),
  ).toHaveLength(1);
});
it('aborting leaves no rewards, answers or learning events', async () => {
  const lobby = await ctx.db.transaction((tx) =>
    createLobby(tx, ids[2]!, 'quiz_coop', 'FEDCBA654321', clock.now()),
  );
  await ctx.db.transaction((tx) => joinLobby(tx, lobby.code, ids[3]!, clock.now()));
  await transitionLobby(ctx.db, lobby.id, 'OPEN', 'STARTING', clock.now());
  const match = await startMatch(ctx.db, lobby.id, clock.now());
  await abortMatch(ctx.db, lobby.id, match.id, clock.now());
  expect(
    (await ctx.db.select().from(gameSessions).where(eq(gameSessions.id, match.id)))[0]!.status,
  ).toBe('CANCELLED');
  expect(
    await ctx.db.select().from(pointLedger).where(eq(pointLedger.sessionId, match.id)),
  ).toHaveLength(0);
  expect(
    await ctx.db.select().from(learningEvents).where(eq(learningEvents.sessionId, match.id)),
  ).toHaveLength(0);
  expect((await ctx.db.select().from(lobbies).where(eq(lobbies.id, lobby.id)))[0]!.status).toBe(
    'CLOSED',
  );
});
it('signed handshake rejects tampering and exact expiry', () => {
  process.env.REALTIME_TOKEN_SECRET = 'test-only-secret-that-is-longer-than-32-characters';
  const token = signRealtimeToken({
    userId: ids[0]!,
    lobbyId: uuidv7(),
    kind: 'handshake',
    exp: clock.now().getTime() + 120000,
  });
  expect(verifyRealtimeToken(token, clock.now()).userId).toBe(ids[0]);
  expect(() => verifyRealtimeToken(token + 'x', clock.now())).toThrow();
  expect(() => verifyRealtimeToken(token, new Date(clock.now().getTime() + 120000))).toThrow();
});
it('deathmatch ends with simultaneous HP resolution and a mandatory team review', async () => {
  const lobby = await ctx.db.transaction((tx) =>
    createLobby(tx, ids[0]!, 'team_deathmatch', 'AABBCC112233', clock.now()),
  );
  for (const id of ids.slice(1))
    await ctx.db.transaction((tx) => joinLobby(tx, lobby.code, id, clock.now()));
  await transitionLobby(ctx.db, lobby.id, 'OPEN', 'STARTING', clock.now());
  const match = await startMatch(ctx.db, lobby.id, clock.now());
  while (match.status === 'IN_PROGRESS') {
    const q = match.questions[match.roundIndex]!;
    for (const player of match.players) {
      const correct = player.team === 'A';
      const response =
        q.type === 'MCQ'
          ? {
              optionId: correct
                ? (q.answer as { correctOptionId: string }).correctOptionId
                : q.options!.find(
                    (o) => o.id !== (q.answer as { correctOptionId: string }).correctOptionId,
                  )!.id,
            }
          : { value: correct ? (q.answer as { value: string }).value : '-999999' };
      expect(
        match.submit(
          player.userId,
          'submit_answer',
          { clientEventId: uuidv7(), roundId: match.roundId, response },
          clock.now().getTime() + 100,
        ).accepted,
      ).toBe(true);
    }
    clock.advanceMs(1000);
    match.resolve(clock.now().getTime());
  }
  expect(match.rounds.length).toBeLessThanOrEqual(15);
  expect(match.hp.B).toBeLessThanOrEqual(0);
  const result = await finalizeMatch(ctx.db, lobby.id, match, clock.now());
  expect(result.find((p) => p.userId === ids[0])?.outcome).toBe('WIN');
  expect(result.find((p) => p.userId === ids[1])?.review.length).toBe(match.rounds.length);
  expect(
    await ctx.db.select().from(pointLedger).where(eq(pointLedger.sessionId, match.id)),
  ).toHaveLength(4);
});
