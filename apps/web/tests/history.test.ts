/**
 * GET /api/me/history (PLANNING.md §16.2, §20 screen 8).
 *
 * §24 Phase 1 user-visible criterion: "history lists the session".
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { FixedClock, uuidv7, type HistoryResponse } from '@learnarena/core';
import { GET as historyRoute } from '@/app/api/me/history/route';
import { POST as onboardingRoute } from '@/app/api/me/onboarding/route';
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
import { complete, createSession, playAllQuestions, serveNext, withId } from './helpers/quiz';

let ctx: WebTestContext;
let restoreClock: () => void;
let restoreTransport: () => void;

async function signUpFresh(username: string): Promise<void> {
  ctx.signInAs(uuidv7());
  await onboardingRoute(
    jsonRequest('/api/me/onboarding', { method: 'POST', body: onboardingBody({ username }) }),
  );
}

const fetchHistory = async (cursor?: string) =>
  readResponse<HistoryResponse>(
    await historyRoute(jsonRequest(`/api/me/history${cursor ? `?cursor=${cursor}` : ''}`)),
  );

/** Play and complete one session, returning its id. */
async function playOne(categorySlug = 'math'): Promise<string> {
  const created = await createSession(categorySlug);
  await playAllQuestions(ctx.db, created.body.sessionId);
  await complete(created.body.sessionId);
  return created.body.sessionId;
}

beforeAll(async () => {
  ctx = await createWebTestContext('history');
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

describe('GET /api/me/history', () => {
  it('is empty for a user who has played nothing', async () => {
    await signUpFresh('history_empty');

    const result = await fetchHistory();

    expect(result.status).toBe(200);
    expect(result.body.sessions).toEqual([]);
    expect(result.body.nextCursor).toBeNull();
  });

  it('lists a completed session with its points and accuracy', async () => {
    await signUpFresh('history_one');
    const sessionId = await playOne('math');

    const result = await fetchHistory();

    expect(result.body.sessions).toHaveLength(1);
    expect(result.body.sessions[0]).toMatchObject({
      sessionId,
      categorySlug: 'math',
      correctCount: 10,
      questionCount: 10,
      accuracy: 1,
    });
    expect(result.body.sessions[0]?.finalPoints).toBeGreaterThan(0);
    expect(result.body.sessions[0]?.endedAt).not.toBeNull();
  });

  it('lists the newest session first', async () => {
    await signUpFresh('history_order');
    const first = await playOne('math');
    const second = await playOne('logic');
    const third = await playOne('science');

    const result = await fetchHistory();

    expect(result.body.sessions.map((session) => session.sessionId)).toEqual([
      third,
      second,
      first,
    ]);
  });

  it('omits sessions that never completed', async () => {
    await signUpFresh('history_incomplete');
    const completed = await playOne('math');

    // An abandoned session earns no points and does not belong in history.
    const abandoned = await createSession('logic');
    await serveNext(abandoned.body.sessionId);
    const { POST: abandonRoute } = await import('@/app/api/sessions/[id]/abandon/route');
    await abandonRoute(
      jsonRequest(`/api/sessions/${abandoned.body.sessionId}/abandon`, { method: 'POST' }),
      withId(abandoned.body.sessionId),
    );

    const result = await fetchHistory();
    expect(result.body.sessions.map((session) => session.sessionId)).toEqual([completed]);
  });

  it("shows only the caller's own sessions", async () => {
    await signUpFresh('history_mine');
    const mine = await playOne('math');

    await signUpFresh('history_theirs');
    await playOne('logic');

    await signUpFresh('history_mine_again');
    const result = await fetchHistory();
    expect(result.body.sessions).toEqual([]);

    expect(mine).toBeDefined();
  });

  it('pages with a cursor, newest first and no repeats', async () => {
    await signUpFresh('history_paging');

    const ids: string[] = [];
    for (let i = 0; i < 22; i += 1) {
      ids.push(await playOne('math'));
    }
    ids.reverse(); // newest first

    const firstPage = await fetchHistory();
    expect(firstPage.body.sessions).toHaveLength(20);
    expect(firstPage.body.nextCursor).toBe(ids[19]);

    const secondPage = await fetchHistory(firstPage.body.nextCursor!);
    expect(secondPage.body.sessions).toHaveLength(2);
    expect(secondPage.body.nextCursor).toBeNull();

    const seen = [
      ...firstPage.body.sessions.map((s) => s.sessionId),
      ...secondPage.body.sessions.map((s) => s.sessionId),
    ];
    expect(seen).toEqual(ids);
    expect(new Set(seen).size).toBe(22);
  });

  it('rejects a cursor that is not a session id', async () => {
    await signUpFresh('history_bad_cursor');
    const result = await fetchHistory('not-a-uuid');

    expect(result.status).toBe(400);
    expect(result.code).toBe('INVALID_INPUT');
  });

  it('requires onboarding', async () => {
    ctx.signInAs(uuidv7());
    const result = await fetchHistory();
    expect(result.status).toBe(403);
    expect(result.code).toBe('ONBOARDING_REQUIRED');
  });

  it('requires a session', async () => {
    ctx.signInAs(null);
    const result = await fetchHistory();
    expect(result.status).toBe(401);
  });
});
