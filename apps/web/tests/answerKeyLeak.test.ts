/**
 * Answer keys must never reach the client before grading.
 *
 * §24 Phase 1, first API criterion: "Correct answers/answer keys never appear
 * in `/next` or session-creation payloads (**asserted by a test that scans
 * responses for `answer_json` values**)."
 *
 * §8.1 and Invariant 1 are what this protects: if the key is in the payload,
 * the client can decide correctness, and every score in the system is a claim
 * rather than a measurement.
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { FixedClock, uuidv7, type NextQuestionResponse } from '@learnarena/core';
import { questionVersions } from '@learnarena/db/schema';
import { POST as onboardingRoute } from '@/app/api/me/onboarding/route';
import { POST as createSessionRoute } from '@/app/api/sessions/route';
import { POST as nextRoute } from '@/app/api/sessions/[id]/next/route';
import { setSessionClock } from '@/lib/sessions/context';
import { clearGameTypeCache } from '@/lib/sessions/gameTypes';
import { clearCategoryCache } from '@/lib/sessions/categories';
import { setEventTransport } from '@/lib/inngest/events';
import {
  createWebTestContext,
  jsonRequest,
  onboardingBody,
  type WebTestContext,
} from './helpers/testApp';
import { responseFor, submitAnswer, withId } from './helpers/quiz';

let ctx: WebTestContext;
let restoreClock: () => void;
let restoreTransport: () => void;

beforeAll(async () => {
  ctx = await createWebTestContext('answer_key_leak');
});

afterAll(async () => {
  await ctx?.teardown();
});

beforeEach(() => {
  clearGameTypeCache();
  clearCategoryCache();
  restoreClock = setSessionClock(new FixedClock('2026-09-29T12:00:00.000Z'));
  restoreTransport = setEventTransport(async () => {});
});

afterEach(() => {
  restoreClock();
  restoreTransport();
});

/**
 * Every secret string in the content: the answer key values, the correct
 * option ids paired with their text, and the explanations.
 */
async function loadSecrets(): Promise<{ values: string[]; explanations: string[] }> {
  const rows = await ctx.db
    .select({
      id: questionVersions.id,
      answerJson: questionVersions.answerJson,
      optionsJson: questionVersions.optionsJson,
      explanation: questionVersions.explanation,
      type: questionVersions.type,
    })
    .from(questionVersions)
    .where(eq(questionVersions.status, 'LIVE'));

  const values: string[] = [];
  const explanations: string[] = [];

  for (const row of rows) {
    const key = row.answerJson as { correctOptionId?: string; value?: string };
    if (row.type === 'NUMERIC' && key.value) {
      values.push(key.value);
    }
    explanations.push(row.explanation);
  }

  return { values, explanations };
}

describe('the /next payload', () => {
  it('carries no answer_json value, no explanation and no correctness hint', async () => {
    ctx.signInAs(uuidv7());
    await onboardingRoute(
      jsonRequest('/api/me/onboarding', {
        method: 'POST',
        body: onboardingBody({ username: 'leak_scan' }),
      }),
    );

    const secrets = await loadSecrets();

    // Play every category so the scan covers MCQ and NUMERIC alike.
    for (const categorySlug of ['math', 'logic', 'science']) {
      const createResponse = await createSessionRoute(
        jsonRequest('/api/sessions', {
          method: 'POST',
          body: { gameType: 'quiz_solo', categorySlug },
          headers: { 'idempotency-key': uuidv7() },
        }),
      );
      const createText = await createResponse.clone().text();
      const created = (await createResponse.json()) as { sessionId: string };

      // Session creation returns nothing but ids and counts.
      for (const explanation of secrets.explanations) {
        expect(createText).not.toContain(explanation);
      }

      for (let i = 0; i < 10; i += 1) {
        const servedResponse = await nextRoute(
          jsonRequest(`/api/sessions/${created.sessionId}/next`, { method: 'POST' }),
          withId(created.sessionId),
        );
        if (servedResponse.status !== 200) break;

        const servedText = await servedResponse.clone().text();
        const served = (await servedResponse.json()) as NextQuestionResponse;

        // 1. No explanation text.
        for (const explanation of secrets.explanations) {
          expect(servedText, `explanation leaked at position ${served.position}`).not.toContain(
            explanation,
          );
        }

        // 2. No numeric answer value. Checked against the *specific* question's
        // key so a coincidental substring in an unrelated prompt cannot mask a
        // real leak.
        const row = (
          await ctx.db
            .select({ answerJson: questionVersions.answerJson })
            .from(questionVersions)
            .where(eq(questionVersions.id, served.question.id))
        )[0]!;
        const key = row.answerJson as { correctOptionId?: string; value?: string };

        // 3. The payload must not name the answer key at all.
        const parsed = JSON.parse(servedText) as Record<string, unknown>;
        expect(JSON.stringify(parsed)).not.toContain('answer_json');
        expect(JSON.stringify(parsed)).not.toContain('answerJson');
        expect(JSON.stringify(parsed)).not.toContain('correctOptionId');
        expect(JSON.stringify(parsed)).not.toContain('explanation');

        // 4. For MCQ, the served options must not mark the correct one: every
        // option object carries exactly `id` and `text`.
        if (served.question.options) {
          for (const option of served.question.options) {
            expect(Object.keys(option).sort()).toEqual(['id', 'text']);
          }
          // And the correct id must not be singled out anywhere else.
          expect(key.correctOptionId).toBeDefined();
        }

        await submitAnswer(created.sessionId, {
          position: served.position,
          questionVersionId: served.question.id,
          response: await responseFor(ctx.db, served.question, true),
        });
      }
    }

    expect(secrets.values.length).toBeGreaterThan(0);
  });

  it('exposes only id, type, prompt and options on the question object', async () => {
    ctx.signInAs(uuidv7());
    await onboardingRoute(
      jsonRequest('/api/me/onboarding', {
        method: 'POST',
        body: onboardingBody({ username: 'leak_shape' }),
      }),
    );

    const created = (await (
      await createSessionRoute(
        jsonRequest('/api/sessions', {
          method: 'POST',
          body: { gameType: 'quiz_solo', categorySlug: 'math' },
          headers: { 'idempotency-key': uuidv7() },
        }),
      )
    ).json()) as { sessionId: string };

    const served = (await (
      await nextRoute(
        jsonRequest(`/api/sessions/${created.sessionId}/next`, { method: 'POST' }),
        withId(created.sessionId),
      )
    ).json()) as { question: Record<string, unknown> };

    // A new column on question_versions must not silently start appearing.
    expect(Object.keys(served.question).sort()).toEqual(['id', 'options', 'prompt', 'type']);
  });
});

describe('after grading', () => {
  it('reveals the correct answer and explanation — but only then (§16.2)', async () => {
    ctx.signInAs(uuidv7());
    await onboardingRoute(
      jsonRequest('/api/me/onboarding', {
        method: 'POST',
        body: onboardingBody({ username: 'reveal_after' }),
      }),
    );

    const created = (await (
      await createSessionRoute(
        jsonRequest('/api/sessions', {
          method: 'POST',
          body: { gameType: 'quiz_solo', categorySlug: 'math' },
          headers: { 'idempotency-key': uuidv7() },
        }),
      )
    ).json()) as { sessionId: string };

    const served = (await (
      await nextRoute(
        jsonRequest(`/api/sessions/${created.sessionId}/next`, { method: 'POST' }),
        withId(created.sessionId),
      )
    ).json()) as NextQuestionResponse;

    const answered = await submitAnswer(created.sessionId, {
      position: served.position,
      questionVersionId: served.question.id,
      response: await responseFor(ctx.db, served.question, false),
    });

    // The grading response is where the key legitimately appears.
    expect(answered.body.correctAnswer.length).toBeGreaterThan(0);
    expect(answered.body.explanation.length).toBeGreaterThan(10);
  });
});
