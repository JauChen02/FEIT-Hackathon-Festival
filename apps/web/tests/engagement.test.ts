import { afterAll, beforeAll, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { FixedClock, uuidv7 } from '@learnarena/core';
import {
  coachMessages,
  createEventMultiplier,
  eventMultipliers,
  notificationPreferences,
  notificationSendLog,
  pushSubscriptions,
  userRoles,
  users,
} from '@learnarena/db';
import { createWebTestContext, type WebTestContext } from './helpers/testApp';
import { runNarration } from '@/lib/inngest/functions/engagementJobs';
import { runReminders } from '@/lib/inngest/functions/privacyJobs';
let ctx: WebTestContext;
const clock = new FixedClock('2026-09-30T12:00:00Z');
const userId = uuidv7();
beforeAll(async () => {
  ctx = await createWebTestContext('engagement');
  await ctx.db
    .insert(users)
    .values({
      id: userId,
      username: 'engagement_user',
      displayName: 'Learner',
      timezone: 'UTC',
      onboardingCompletedAt: clock.now(),
    });
});
afterAll(async () => {
  await ctx?.teardown();
});
it('narration outage uses a template, records snapshot, and retries without duplication', async () => {
  const message = await runNarration(userId, null, clock.now(), async () => {
    throw new Error('offline');
  });
  expect(message?.source).toBe('TEMPLATE');
  expect(message?.message).toContain('Tip:');
  const again = await runNarration(userId, null, clock.now(), async () => {
    throw new Error('must not call');
  });
  expect(again?.id).toBe(message?.id);
  expect(
    await ctx.db.select().from(coachMessages).where(eq(coachMessages.userId, userId)),
  ).toHaveLength(1);
});
it('rejects overlapping event windows in API repository and database', async () => {
  await ctx.db.insert(userRoles).values({ userId, role: 'ADMIN' });
  await ctx.db.transaction((tx) =>
    createEventMultiplier(
      tx,
      userId,
      {
        name: 'Practice weekend',
        multiplier: 1.5,
        startsAt: clock.now(),
        endsAt: new Date(clock.now().getTime() + 3600000),
      },
      clock.now(),
    ),
  );
  await expect(
    ctx.db.transaction((tx) =>
      createEventMultiplier(
        tx,
        userId,
        {
          name: 'Overlap',
          multiplier: 2,
          startsAt: clock.now(),
          endsAt: new Date(clock.now().getTime() + 7200000),
        },
        clock.now(),
      ),
    ),
  ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
  await expect(
    ctx.db
      .insert(eventMultipliers)
      .values({
        id: uuidv7(),
        name: 'Direct overlap',
        multiplier: '1.2',
        startsAt: clock.now(),
        endsAt: new Date(clock.now().getTime() + 7200000),
        createdBy: userId,
        createdAt: clock.now(),
      }),
  ).rejects.toThrow();
});
it('respects quiet hours and concurrent reminder retries send at most once per local day', async () => {
  await ctx.db
    .insert(notificationPreferences)
    .values({ userId, pushEnabled: true, quietStart: 21, quietEnd: 8, updatedAt: clock.now() });
  await ctx.db
    .insert(pushSubscriptions)
    .values({
      id: uuidv7(),
      userId,
      endpoint: 'https://fcm.googleapis.com/test-only',
      keysJson: { p256dh: 'test', auth: 'test' },
      createdAt: clock.now(),
    });
  let delivered = 0;
  const send = async () => {
    delivered++;
  };
  await runReminders(new Date('2026-09-30T22:00:00Z'), send);
  expect(delivered).toBe(0);
  await Promise.all([runReminders(clock.now(), send), runReminders(clock.now(), send)]);
  expect(delivered).toBe(1);
  expect(
    await ctx.db.select().from(notificationSendLog).where(eq(notificationSendLog.userId, userId)),
  ).toHaveLength(1);
  clock.advanceDays(1);
  await runReminders(clock.now(), send);
  expect(delivered).toBe(2);
});
