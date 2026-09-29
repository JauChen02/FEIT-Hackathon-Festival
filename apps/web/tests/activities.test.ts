import { afterAll, beforeAll, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { FixedClock, uuidv7, type ModeQuestion, type ModeAnswerResult } from '@learnarena/core';
import { activityAssessments, activityVersions, learningEvents, pointLedger } from '@learnarena/db';
import { POST as onboarding } from '@/app/api/me/onboarding/route';
import { POST as create } from '@/app/api/sessions/route';
import { POST as next } from '@/app/api/sessions/[id]/next/route';
import { POST as answer } from '@/app/api/sessions/[id]/answer/route';
import { setSessionClock } from '@/lib/sessions/context';
import { setEventTransport } from '@/lib/inngest/events';
import {
  createWebTestContext,
  jsonRequest,
  onboardingBody,
  readResponse,
  type WebTestContext,
} from './helpers/testApp';
import { complete, withId } from './helpers/quiz';
let ctx: WebTestContext;
let restore: () => void;
let events: () => void;
const clock = new FixedClock('2026-09-30T12:00:00Z');
beforeAll(async () => {
  ctx = await createWebTestContext('activities');
  restore = setSessionClock(clock);
  events = setEventTransport(async () => {});
});
afterAll(async () => {
  restore();
  events();
  await ctx?.teardown();
});
it.each(['speed_math', 'memory_match', 'dialogue_scenario'] as const)(
  '%s grades on the server and completes through the same ledger transaction',
  async (kind) => {
    const userId = uuidv7();
    ctx.signInAs(userId);
    await onboarding(
      jsonRequest('/api/me/onboarding', {
        method: 'POST',
        body: onboardingBody({
          username: `a${userId.replaceAll('-', '').slice(-15)}`,
          timezone: 'UTC',
        }),
      }),
    );
    const [version] = await ctx.db
      .select()
      .from(activityVersions)
      .where(eq(activityVersions.kind, kind));
    const created = await readResponse<{ sessionId: string }>(
      await create(
        jsonRequest('/api/sessions', {
          method: 'POST',
          headers: { 'idempotency-key': uuidv7() },
          body: {
            gameType: kind,
            categorySlug: kind === 'memory_match' ? 'memory' : 'math',
            activityVersionId: version!.id,
          },
        }),
      ),
    );
    expect(created.status).toBe(200);
    const id = created.body.sessionId;
    let done = false;
    let count = 0;
    while (!done && count < 10) {
      const served = await readResponse<ModeQuestion>(
        await next(jsonRequest(`/api/sessions/${id}/next`, { method: 'POST' }), withId(id)),
      );
      expect(served.status).toBe(200);
      expect(served.body).not.toHaveProperty('answerJson');
      const [stored] = await ctx.db
        .select()
        .from(activityAssessments)
        .where(eq(activityAssessments.id, served.body.id));
      clock.advanceMs(10000);
      const response =
        kind === 'dialogue_scenario'
          ? { optionId: served.body.options![0]!.id }
          : { value: (stored!.answerJson as { value: string }).value };
      const request = () =>
        answer(
          jsonRequest(`/api/sessions/${id}/answer`, {
            method: 'POST',
            body: { position: served.body.position, questionVersionId: served.body.id, response },
          }),
          withId(id),
        );
      const resolved = await readResponse<ModeAnswerResult>(await request());
      expect(resolved.status).toBe(200);
      expect((await readResponse(await request())).body).toEqual(resolved.body);
      count++;
      if (kind === 'speed_math') {
        clock.advanceMs(60000);
        done = true;
      } else done = resolved.body.sessionFinished;
    }
    const completed = await complete(id);
    expect(completed.status).toBe(200);
    expect(completed.body.finalPoints).toBeGreaterThan(0);
    expect((await complete(id)).body).toEqual(completed.body);
    expect(
      await ctx.db.select().from(learningEvents).where(eq(learningEvents.sessionId, id)),
    ).toHaveLength(count);
    expect(
      await ctx.db.select().from(pointLedger).where(eq(pointLedger.sessionId, id)),
    ).toHaveLength(1);
  },
);
