import { afterAll, beforeAll, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { computePoints, FixedClock, uuidv7 } from '@learnarena/core';
import {
  anonymizeUser,
  exportUserData,
  insertLedgerRow,
  pointLedger,
  users,
  deletionRequests,
  coachMessages,
} from '@learnarena/db';
import { createWebTestContext, type WebTestContext } from './helpers/testApp';
let ctx: WebTestContext;
const userId = uuidv7();
const at = new FixedClock('2026-09-30T12:00:00Z').now();
beforeAll(async () => {
  ctx = await createWebTestContext('privacy');
  await ctx.db
    .insert(users)
    .values({
      id: userId,
      username: 'privacy_user',
      displayName: 'Private Learner',
      timezone: 'Australia/Melbourne',
      onboardingCompletedAt: at,
      ageConfirmedAt: at,
    });
  await insertLedgerRow(ctx.db, {
    userId,
    sessionId: null,
    reason: 'ACHIEVEMENT',
    breakdown: computePoints({
      questions: [],
      completionBonus: 100,
      multipliers: { streak: 1, friend: 1, weakness: 1, event: 1 },
    }),
    idempotencyKey: 'privacy-test-credit',
    now: at,
  });
  await ctx.db
    .insert(coachMessages)
    .values({
      id: uuidv7(),
      userId,
      kind: 'WEEKLY',
      refKey: '2026-W40',
      message: 'Private Learner',
      source: 'TEMPLATE',
      inputSnapshotJson: { display_name: 'Private Learner' },
      createdAt: at,
    });
});
afterAll(async () => {
  await ctx?.teardown();
});
it('exports canonical data consistently without leaking other users', async () => {
  const data = await exportUserData(ctx.db, userId, at);
  expect(data.profile.username).toBe('privacy_user');
  expect(data.pointLedger).toHaveLength(1);
  expect(data.coachMessages).toHaveLength(1);
  expect(data.pointLedger.every((row) => row.userId === userId)).toBe(true);
  expect(await exportUserData(ctx.db, userId, at)).toEqual(data);
});
it('anonymizes idempotently while retaining immutable points', async () => {
  const before = await ctx.db.select().from(pointLedger).where(eq(pointLedger.userId, userId));
  await Promise.all([anonymizeUser(ctx.db, userId, at), anonymizeUser(ctx.db, userId, at)]);
  const [user] = await ctx.db.select().from(users).where(eq(users.id, userId));
  expect(user?.username).toMatch(/^deleted_/);
  expect(user?.displayName).toBe('');
  expect(user?.timezone).toBe('UTC');
  expect(user?.deletedAt).toEqual(at);
  expect(await ctx.db.select().from(pointLedger).where(eq(pointLedger.userId, userId))).toEqual(
    before,
  );
  expect(
    await ctx.db.select().from(coachMessages).where(eq(coachMessages.userId, userId)),
  ).toHaveLength(0);
  expect(
    await ctx.db.select().from(deletionRequests).where(eq(deletionRequests.userId, userId)),
  ).toHaveLength(1);
});
