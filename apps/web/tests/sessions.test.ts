/**
 * The solo quiz loop (PLANNING.md §8.1, §8.2, §16.2, §18.1).
 *
 * Acceptance criteria covered:
 *   - create → next → answer → complete
 *   - "A second open session returns ACTIVE_SESSION_EXISTS"
 *   - "Retrying session creation with the same Idempotency-Key returns the same session"
 *   - "Abandon/cancel follow §15.1; illegal actions return INVALID_SESSION_STATE"
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { count, eq } from 'drizzle-orm';
import { FixedClock, SOLO_QUESTION_COUNT, SOLO_TIME_LIMIT_MS, uuidv7 } from '@learnarena/core';
import { answers, gameSessions, questionVersions, sessionQuestions } from '@learnarena/db/schema';
import { POST as abandonRoute } from '@/app/api/sessions/[id]/abandon/route';
import { POST as cancelRoute } from '@/app/api/sessions/[id]/cancel/route';
import { GET as getSessionRoute } from '@/app/api/sessions/[id]/route';
import { setSessionClock } from '@/lib/sessions/context';
import { clearGameTypeCache } from '@/lib/sessions/gameTypes';
import { clearCategoryCache } from '@/lib/sessions/categories';
import { setEventTransport } from '@/lib/inngest/events';
import {
  createWebTestContext,
  jsonRequest,
  onboardingBody,
  readResponse,
  type WebTestContext,
} from './helpers/testApp';
import {
  complete,
  createSession,
  playAllQuestions,
  serveNext,
  submitAnswer,
  withId,
} from './helpers/quiz';
import { POST as onboardingRoute } from '@/app/api/me/onboarding/route';

let ctx: WebTestContext;
let clock: FixedClock;
let restoreClock: () => void;
let restoreTransport: () => void;
let terminalEvents: string[];

const START = '2026-09-29T12:00:00.000Z';

async function signUpFresh(username: string): Promise<string> {
  const authUserId = uuidv7();
  ctx.signInAs(authUserId);
  await onboardingRoute(
    jsonRequest('/api/me/onboarding', {
      method: 'POST',
      body: onboardingBody({ username }),
    }),
  );
  return authUserId;
}

beforeAll(async () => {
  ctx = await createWebTestContext('sessions');
});

afterAll(async () => {
  await ctx?.teardown();
});

beforeEach(async () => {
  clearGameTypeCache();
  clearCategoryCache();
  clock = new FixedClock(START);
  restoreClock = setSessionClock(clock);
  terminalEvents = [];
  restoreTransport = setEventTransport(async (sessionId) => {
    terminalEvents.push(sessionId);
  });
});

afterEach(() => {
  restoreClock();
  restoreTransport();
});

describe('POST /api/sessions', () => {
  it('creates a CREATED session with ten questions and a 20 s limit', async () => {
    await signUpFresh('creator_1');

    const created = await createSession('math');

    expect(created.status).toBe(200);
    expect(created.body).toMatchObject({
      status: 'CREATED',
      questionCount: SOLO_QUESTION_COUNT,
      timeLimitMs: SOLO_TIME_LIMIT_MS,
    });

    const [questionRows] = await ctx.db
      .select({ n: count() })
      .from(sessionQuestions)
      .where(eq(sessionQuestions.sessionId, created.body.sessionId));
    expect(questionRows!.n).toBe(SOLO_QUESTION_COUNT);
  });

  it('allocates the questions at creation, none of them served yet (§11.6 step 6)', async () => {
    await signUpFresh('creator_2');
    const created = await createSession('math');

    const rows = await ctx.db
      .select()
      .from(sessionQuestions)
      .where(eq(sessionQuestions.sessionId, created.body.sessionId))
      .orderBy(sessionQuestions.position);

    expect(rows.map((row) => row.position)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(rows.every((row) => row.servedAt === null)).toBe(true);
    expect(new Set(rows.map((row) => row.questionVersionId)).size).toBe(10);
  });

  it('presents the questions in ascending rating order — the warm-up (§11.6 step 5)', async () => {
    await signUpFresh('creator_3');
    const created = await createSession('math');

    const rows = await ctx.db
      .select({ position: sessionQuestions.position, rating: questionVersions.rating })
      .from(sessionQuestions)
      .innerJoin(questionVersions, eq(questionVersions.id, sessionQuestions.questionVersionId))
      .where(eq(sessionQuestions.sessionId, created.body.sessionId))
      .orderBy(sessionQuestions.position);

    const ratings = rows.map((row) => Number(row.rating));
    expect(ratings).toEqual([...ratings].sort((a, b) => a - b));
  });

  // §24: "A second open session returns ACTIVE_SESSION_EXISTS."
  it('refuses a second open session and names the one already open', async () => {
    await signUpFresh('one_session');
    const first = await createSession('math');

    const second = await createSession('logic');

    expect(second.status).toBe(409);
    expect(second.code).toBe('ACTIVE_SESSION_EXISTS');
    expect(
      (second.body as unknown as { error: { details: { sessionId: string; status: string } } })
        .error.details,
    ).toMatchObject({ sessionId: first.body.sessionId, status: 'CREATED' });
  });

  it('allows a new session once the previous one is terminal', async () => {
    await signUpFresh('reopen_1');
    const first = await createSession('math');
    await cancelRoute(
      jsonRequest(`/api/sessions/${first.body.sessionId}/cancel`, { method: 'POST' }),
      withId(first.body.sessionId),
    );

    const second = await createSession('logic');
    expect(second.status).toBe(200);
    expect(second.body.sessionId).not.toBe(first.body.sessionId);
  });

  // §24: "Retrying session creation with the same Idempotency-Key returns the same session."
  describe('idempotency (§18.1)', () => {
    it('returns the same session for a repeated key', async () => {
      await signUpFresh('idem_session');
      const key = uuidv7();

      const first = await createSession('math', key);
      const second = await createSession('math', key);

      expect(second.status).toBe(200);
      expect(second.body.sessionId).toBe(first.body.sessionId);

      const [rows] = await ctx.db
        .select({ n: count() })
        .from(gameSessions)
        .where(eq(gameSessions.creationIdempotencyKey, key));
      expect(rows!.n).toBe(1);
    });

    it('creates exactly one session under concurrent retries of the same key', async () => {
      await signUpFresh('idem_concurrent');
      const key = uuidv7();

      const results = await Promise.all(
        Array.from({ length: 5 }, () => createSession('math', key)),
      );

      const ids = new Set(results.filter((r) => r.status === 200).map((r) => r.body.sessionId));
      expect(ids.size).toBe(1);
    });
  });

  describe('validation', () => {
    it('requires an Idempotency-Key header', async () => {
      await signUpFresh('no_key');
      const result = await readResponse(
        await (
          await import('@/app/api/sessions/route')
        ).POST(
          jsonRequest('/api/sessions', {
            method: 'POST',
            body: { gameType: 'quiz_solo', categorySlug: 'math' },
          }),
        ),
      );

      expect(result.status).toBe(400);
      expect(result.code).toBe('INVALID_INPUT');
    });

    it('rejects a game type other than quiz_solo', async () => {
      await signUpFresh('bad_type');
      const result = await readResponse(
        await (
          await import('@/app/api/sessions/route')
        ).POST(
          jsonRequest('/api/sessions', {
            method: 'POST',
            body: { gameType: 'team_deathmatch', categorySlug: 'math' },
            headers: { 'idempotency-key': uuidv7() },
          }),
        ),
      );

      expect(result.status).toBe(400);
      expect(result.code).toBe('INVALID_INPUT');
    });

    it('returns NOT_FOUND for an unknown category', async () => {
      await signUpFresh('bad_cat');
      const result = await createSession('astrology');
      expect(result.status).toBe(404);
      expect(result.code).toBe('NOT_FOUND');
    });

    it('returns NOT_FOUND for a deferred category (ADR-036)', async () => {
      await signUpFresh('deferred_cat');
      const result = await createSession('memory');
      expect(result.status).toBe(404);
    });

    it('requires onboarding', async () => {
      ctx.signInAs(uuidv7()); // signed in, no profile
      const result = await createSession('math');
      expect(result.status).toBe(403);
      expect(result.code).toBe('ONBOARDING_REQUIRED');
    });

    it('requires a session', async () => {
      ctx.signInAs(null);
      const result = await createSession('math');
      expect(result.status).toBe(401);
    });
  });
});

describe('POST /api/sessions/:id/next', () => {
  it('serves position 0 first and moves the session to ACTIVE (§15.1)', async () => {
    await signUpFresh('next_1');
    const created = await createSession('math');

    const served = await serveNext(created.body.sessionId);

    expect(served.status).toBe(200);
    expect(served.body.position).toBe(0);
    expect(served.body.question.prompt.length).toBeGreaterThan(0);

    const session = await ctx.db.query.gameSessions.findFirst({
      where: (table, { eq: equals }) => equals(table.id, created.body.sessionId),
    });
    expect(session?.status).toBe('ACTIVE');
    expect(session?.startedAt).not.toBeNull();
  });

  it('records served_at and a deadline 20 s later (ADR-011)', async () => {
    await signUpFresh('next_2');
    const created = await createSession('math');
    const served = await serveNext(created.body.sessionId);

    const deadline = new Date(served.body.deadlineAt).getTime();
    const servedAt = new Date(served.body.servedAt).getTime();
    expect(deadline - servedAt).toBe(SOLO_TIME_LIMIT_MS);
    expect(servedAt).toBe(new Date(START).getTime());
  });

  // §18.1: "Returns the currently open question if served_at is set and it's
  // unresolved; never serves two at once."
  it('is idempotent and does not extend the deadline on a retry', async () => {
    await signUpFresh('next_idem');
    const created = await createSession('math');

    const first = await serveNext(created.body.sessionId);
    clock.advanceMs(5_000);
    const second = await serveNext(created.body.sessionId);

    expect(second.body.position).toBe(first.body.position);
    expect(second.body.question.id).toBe(first.body.question.id);
    expect(second.body.deadlineAt).toBe(first.body.deadlineAt);
  });

  it('advances only after the open question is answered', async () => {
    await signUpFresh('next_advance');
    const created = await createSession('math');
    const first = await serveNext(created.body.sessionId);

    await submitAnswer(created.body.sessionId, {
      position: first.body.position,
      questionVersionId: first.body.question.id,
      response: await import('./helpers/quiz').then((m) =>
        m.responseFor(ctx.db, first.body.question, true),
      ),
    });

    const second = await serveNext(created.body.sessionId);
    expect(second.body.position).toBe(1);
    expect(second.body.question.id).not.toBe(first.body.question.id);
  });

  it('refuses once every question is resolved', async () => {
    await signUpFresh('next_done');
    const created = await createSession('math');
    await playAllQuestions(ctx.db, created.body.sessionId);

    const served = await serveNext(created.body.sessionId);
    expect(served.status).toBe(409);
    expect(served.code).toBe('INVALID_SESSION_STATE');
    expect(
      (served.body as unknown as { error: { details: { sessionFinished: boolean } } }).error.details
        .sessionFinished,
    ).toBe(true);
  });

  it("returns SESSION_NOT_FOUND for another user's session", async () => {
    await signUpFresh('owner_a');
    const created = await createSession('math');

    await signUpFresh('owner_b');
    const served = await serveNext(created.body.sessionId);

    expect(served.status).toBe(404);
    expect(served.code).toBe('SESSION_NOT_FOUND');
  });

  it('returns NOT_FOUND for an id that is not a uuid', async () => {
    await signUpFresh('bad_id');
    const result = await readResponse(
      await (
        await import('@/app/api/sessions/[id]/next/route')
      ).POST(jsonRequest('/api/sessions/nope/next', { method: 'POST' }), withId('nope')),
    );
    expect(result.status).toBe(404);
  });
});

describe('the happy path', () => {
  it('runs create → next → answer → complete', async () => {
    await signUpFresh('happy_path');

    const created = await createSession('math');
    const results = await playAllQuestions(ctx.db, created.body.sessionId);

    expect(results).toHaveLength(SOLO_QUESTION_COUNT);
    expect(results.at(-1)?.sessionFinished).toBe(true);

    const completed = await complete(created.body.sessionId);
    expect(completed.status).toBe(200);
    expect(completed.body.finalPoints).toBeGreaterThan(0);
  });

  it('reports a rising combo as the learner keeps answering correctly', async () => {
    await signUpFresh('combo_path');
    const created = await createSession('math');
    const results = await playAllQuestions(ctx.db, created.body.sessionId);

    expect(results.map((r) => r.comboAfter)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it('resets the combo after a wrong answer', async () => {
    await signUpFresh('combo_reset');
    const created = await createSession('math');
    const results = await playAllQuestions(ctx.db, created.body.sessionId, {
      correctPositions: (position) => position !== 2,
    });

    expect(results.map((r) => r.comboAfter)).toEqual([1, 2, 0, 1, 2, 3, 4, 5, 6, 7]);
  });
});

describe('GET /api/sessions/:id', () => {
  it('reports the live state of an in-progress session', async () => {
    await signUpFresh('state_1');
    const created = await createSession('math');
    await serveNext(created.body.sessionId);

    const state = await readResponse<{
      session: { status: string; resolvedCount: number; categorySlug: string };
      result: unknown;
      skillDeltas: unknown;
    }>(
      await getSessionRoute(
        jsonRequest(`/api/sessions/${created.body.sessionId}`),
        withId(created.body.sessionId),
      ),
    );

    expect(state.body.session.status).toBe('ACTIVE');
    expect(state.body.session.categorySlug).toBe('math');
    expect(state.body.session.resolvedCount).toBe(0);
    expect(state.body.result).toBeNull();
    // Phase 3 populates this (§18.3).
    expect(state.body.skillDeltas).toBeNull();
  });

  it('carries the frozen result once completed', async () => {
    await signUpFresh('state_2');
    const created = await createSession('math');
    await playAllQuestions(ctx.db, created.body.sessionId);
    await complete(created.body.sessionId);

    const state = await readResponse<{ result: { finalPoints: number } | null }>(
      await getSessionRoute(
        jsonRequest(`/api/sessions/${created.body.sessionId}`),
        withId(created.body.sessionId),
      ),
    );

    expect(state.body.result?.finalPoints).toBeGreaterThan(0);
  });
});

// §24: "Abandon/cancel follow §15.1; illegal actions return INVALID_SESSION_STATE."
describe('abandon and cancel (§8.2, §15.1)', () => {
  const abandon = async (sessionId: string) =>
    readResponse(
      await abandonRoute(
        jsonRequest(`/api/sessions/${sessionId}/abandon`, { method: 'POST' }),
        withId(sessionId),
      ),
    );

  const cancel = async (sessionId: string) =>
    readResponse(
      await cancelRoute(
        jsonRequest(`/api/sessions/${sessionId}/cancel`, { method: 'POST' }),
        withId(sessionId),
      ),
    );

  it('cancels a CREATED session', async () => {
    await signUpFresh('cancel_1');
    const created = await createSession('math');

    const result = await cancel(created.body.sessionId);

    expect(result.status).toBe(200);
    expect((result.body as { status: string }).status).toBe('CANCELLED');
  });

  it('is idempotent on a second cancel', async () => {
    await signUpFresh('cancel_2');
    const created = await createSession('math');
    await cancel(created.body.sessionId);

    const again = await cancel(created.body.sessionId);
    expect(again.status).toBe(200);
  });

  it('refuses to cancel an ACTIVE session', async () => {
    await signUpFresh('cancel_active');
    const created = await createSession('math');
    await serveNext(created.body.sessionId);

    const result = await cancel(created.body.sessionId);
    expect(result.status).toBe(409);
    expect(result.code).toBe('INVALID_SESSION_STATE');
  });

  it('abandons an ACTIVE session and keeps its answers (§8.2)', async () => {
    await signUpFresh('abandon_1');
    const created = await createSession('math');
    await playAllQuestions(ctx.db, created.body.sessionId, {
      correctPositions: () => true,
    });

    // Play only part of it this time.
    await signUpFresh('abandon_2');
    const partial = await createSession('math');
    const served = await serveNext(partial.body.sessionId);
    const { responseFor } = await import('./helpers/quiz');
    await submitAnswer(partial.body.sessionId, {
      position: served.body.position,
      questionVersionId: served.body.question.id,
      response: await responseFor(ctx.db, served.body.question, true),
    });

    const result = await abandon(partial.body.sessionId);
    expect(result.status).toBe(200);
    expect((result.body as { status: string }).status).toBe('ABANDONED');

    // §8.2: "Submitted answers and their learning events are kept."
    const [rows] = await ctx.db
      .select({ n: count() })
      .from(answers)
      .where(eq(answers.sessionId, partial.body.sessionId));
    expect(rows!.n).toBe(1);
  });

  it('awards no points for an abandoned session (§10.4)', async () => {
    await signUpFresh('abandon_points');
    const created = await createSession('math');
    await serveNext(created.body.sessionId);
    await abandon(created.body.sessionId);

    const completed = await complete(created.body.sessionId);
    expect(completed.status).toBe(409);
    expect(completed.code).toBe('INVALID_SESSION_STATE');
  });

  it('is idempotent on a second abandon', async () => {
    await signUpFresh('abandon_idem');
    const created = await createSession('math');
    await serveNext(created.body.sessionId);
    await abandon(created.body.sessionId);

    const again = await abandon(created.body.sessionId);
    expect(again.status).toBe(200);
  });

  it('refuses to abandon a CREATED session, directing the client to cancel', async () => {
    await signUpFresh('abandon_created');
    const created = await createSession('math');

    const result = await abandon(created.body.sessionId);
    expect(result.status).toBe(409);
    expect(result.code).toBe('INVALID_SESSION_STATE');
  });

  it('refuses to abandon or cancel a COMPLETED session', async () => {
    await signUpFresh('terminal_completed');
    const created = await createSession('math');
    await playAllQuestions(ctx.db, created.body.sessionId);
    await complete(created.body.sessionId);

    expect((await abandon(created.body.sessionId)).code).toBe('SESSION_ALREADY_COMPLETED');
    expect((await cancel(created.body.sessionId)).code).toBe('SESSION_ALREADY_COMPLETED');
  });

  it('sends session/terminal for both (§18.3, ADR-042)', async () => {
    await signUpFresh('terminal_events');

    const toCancel = await createSession('math');
    await cancel(toCancel.body.sessionId);

    await signUpFresh('terminal_events_2');
    const toAbandon = await createSession('math');
    await serveNext(toAbandon.body.sessionId);
    await abandon(toAbandon.body.sessionId);

    expect(terminalEvents).toContain(toCancel.body.sessionId);
    expect(terminalEvents).toContain(toAbandon.body.sessionId);
  });
});
