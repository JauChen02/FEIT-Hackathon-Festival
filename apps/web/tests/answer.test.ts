/**
 * Answer submission (PLANNING.md §8.2, §16.3).
 *
 * Acceptance criteria covered:
 *   - "Each answer is graded server-side"
 *   - "late answers beyond grace return QUESTION_EXPIRED and resolve as TIMEOUT"
 *   - "Re-submitting an identical answer returns the stored result; a different
 *      response returns ANSWER_ALREADY_SUBMITTED; answer count stays 10"
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { count, eq } from 'drizzle-orm';
import {
  ANSWER_GRACE_MS,
  FixedClock,
  SESSION_INACTIVITY_TIMEOUT_MS,
  SOLO_TIME_LIMIT_MS,
  uuidv7,
} from '@learnarena/core';
import { answers, learningEvents } from '@learnarena/db/schema';
import { POST as onboardingRoute } from '@/app/api/me/onboarding/route';
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
import { createSession, responseFor, serveNext, submitAnswer } from './helpers/quiz';

let ctx: WebTestContext;
let clock: FixedClock;
let restoreClock: () => void;
let restoreTransport: () => void;

const START = '2026-09-29T12:00:00.000Z';

async function signUpFresh(username: string): Promise<void> {
  ctx.signInAs(uuidv7());
  await onboardingRoute(
    jsonRequest('/api/me/onboarding', { method: 'POST', body: onboardingBody({ username }) }),
  );
}

/** Start a session and serve its first question. */
async function startAndServe(username: string, categorySlug = 'math') {
  await signUpFresh(username);
  const created = await createSession(categorySlug);
  const served = await serveNext(created.body.sessionId);
  return { sessionId: created.body.sessionId, served: served.body };
}

beforeAll(async () => {
  ctx = await createWebTestContext('answer');
});

afterAll(async () => {
  await ctx?.teardown();
});

beforeEach(() => {
  clearGameTypeCache();
  clearCategoryCache();
  clock = new FixedClock(START);
  restoreClock = setSessionClock(clock);
  restoreTransport = setEventTransport(async () => {});
});

afterEach(() => {
  restoreClock();
  restoreTransport();
});

describe('server-side grading (Invariant 1)', () => {
  it('scores a correct answer 1 and reveals the explanation', async () => {
    const { sessionId, served } = await startAndServe('grade_correct');

    const result = await submitAnswer(sessionId, {
      position: served.position,
      questionVersionId: served.question.id,
      response: await responseFor(ctx.db, served.question, true),
    });

    expect(result.status).toBe(200);
    expect(result.body.correct).toBe(true);
    expect(result.body.correctness).toBe(1);
    expect(result.body.explanation.length).toBeGreaterThan(10);
    expect(result.body.correctAnswer.length).toBeGreaterThan(0);
  });

  it('scores a wrong answer 0 and still reveals the right one', async () => {
    const { sessionId, served } = await startAndServe('grade_wrong');

    const result = await submitAnswer(sessionId, {
      position: served.position,
      questionVersionId: served.question.id,
      response: await responseFor(ctx.db, served.question, false),
    });

    expect(result.body.correct).toBe(false);
    expect(result.body.correctness).toBe(0);
    expect(result.body.correctAnswer.length).toBeGreaterThan(0);
    expect(result.body.explanation.length).toBeGreaterThan(10);
  });

  it('writes the answer and its learning event together (§9)', async () => {
    const { sessionId, served } = await startAndServe('grade_event');

    await submitAnswer(sessionId, {
      position: served.position,
      questionVersionId: served.question.id,
      response: await responseFor(ctx.db, served.question, true),
    });

    const answerRows = await ctx.db.select().from(answers).where(eq(answers.sessionId, sessionId));
    const eventRows = await ctx.db
      .select()
      .from(learningEvents)
      .where(eq(learningEvents.sessionId, sessionId));

    expect(answerRows).toHaveLength(1);
    expect(eventRows).toHaveLength(1);
    expect(eventRows[0]?.answerId).toBe(answerRows[0]?.id);
    expect(eventRows[0]?.sourceKey).toBe(served.question.id);
    expect(eventRows[0]?.timedOut).toBe(false);
    // §9: the rating of the item at the time it was served.
    expect(Number(eventRows[0]?.difficultyRating)).toBeGreaterThan(0);
  });

  it('computes the speed factor from server receive time (§10.1, §5.13)', async () => {
    const { sessionId, served } = await startAndServe('grade_speed');

    // Answer with exactly half the window gone.
    clock.advanceMs(SOLO_TIME_LIMIT_MS / 2);

    const result = await submitAnswer(sessionId, {
      position: served.position,
      questionVersionId: served.question.id,
      response: await responseFor(ctx.db, served.question, true),
      // A client claiming it answered instantly must not change the score.
      clientSentAt: START,
    });

    expect(result.body.speedFactor).toBe(0.75);
  });

  it('gives the 0.5 floor to an answer that lands inside the grace window', async () => {
    const { sessionId, served } = await startAndServe('grade_grace');

    clock.advanceMs(SOLO_TIME_LIMIT_MS + 500); // past the deadline, inside grace

    const result = await submitAnswer(sessionId, {
      position: served.position,
      questionVersionId: served.question.id,
      response: await responseFor(ctx.db, served.question, true),
    });

    expect(result.status).toBe(200);
    expect(result.body.speedFactor).toBe(0.5);
    expect(result.body.correct).toBe(true);
  });

  it('stores clientSentAt as a diagnostic only (§14.1)', async () => {
    const { sessionId, served } = await startAndServe('grade_client_ts');
    clock.advanceMs(5_000);

    await submitAnswer(sessionId, {
      position: served.position,
      questionVersionId: served.question.id,
      response: await responseFor(ctx.db, served.question, true),
      clientSentAt: '2020-01-01T00:00:00.000Z',
    });

    const row = (await ctx.db.select().from(answers).where(eq(answers.sessionId, sessionId)))[0]!;
    expect(row.clientSentAt?.toISOString()).toBe('2020-01-01T00:00:00.000Z');
    // The server's own timestamp is what was used.
    expect(row.serverReceivedAt.toISOString()).toBe('2026-09-29T12:00:05.000Z');
    expect(Number(row.speedFactor)).toBe(0.875);
  });
});

// §24: "late answers beyond grace return QUESTION_EXPIRED and resolve as TIMEOUT".
describe('the deadline and its grace window (§8.2)', () => {
  it('rejects an answer past deadline + 1000 ms and records a TIMEOUT', async () => {
    const { sessionId, served } = await startAndServe('late_answer');

    clock.advanceMs(SOLO_TIME_LIMIT_MS + ANSWER_GRACE_MS + 1);

    const result = await submitAnswer(sessionId, {
      position: served.position,
      questionVersionId: served.question.id,
      response: await responseFor(ctx.db, served.question, true),
    });

    expect(result.status).toBe(409);
    expect(result.code).toBe('QUESTION_EXPIRED');

    const row = (await ctx.db.select().from(answers).where(eq(answers.sessionId, sessionId)))[0]!;
    expect(row.outcome).toBe('TIMEOUT');
    expect(Number(row.correctness)).toBe(0);
    expect(row.responseJson).toBeNull();

    const event = (
      await ctx.db.select().from(learningEvents).where(eq(learningEvents.sessionId, sessionId))
    )[0]!;
    expect(event.timedOut).toBe(true);
    expect(Number(event.correctness)).toBe(0);
  });

  it('accepts an answer exactly on the grace boundary', async () => {
    const { sessionId, served } = await startAndServe('boundary_answer');
    clock.advanceMs(SOLO_TIME_LIMIT_MS + ANSWER_GRACE_MS);

    const result = await submitAnswer(sessionId, {
      position: served.position,
      questionVersionId: served.question.id,
      response: await responseFor(ctx.db, served.question, true),
    });

    expect(result.status).toBe(200);
  });

  it('resolves a lapsed question as TIMEOUT when /next is called (§8.2)', async () => {
    const { sessionId, served } = await startAndServe('lazy_timeout');

    clock.advanceMs(SOLO_TIME_LIMIT_MS + ANSWER_GRACE_MS + 1);
    const next = await serveNext(sessionId);

    // The lapsed question is resolved and the following one is served.
    expect(next.status).toBe(200);
    expect(next.body.position).toBe(served.position + 1);

    const rows = await ctx.db.select().from(answers).where(eq(answers.sessionId, sessionId));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.outcome).toBe('TIMEOUT');
  });

  it('records the timeout at the deadline, not at the moment it was noticed', async () => {
    const { sessionId } = await startAndServe('timeout_at');
    const deadline = new Date(new Date(START).getTime() + SOLO_TIME_LIMIT_MS);

    // Ten minutes later — long past the question's window, but still inside
    // the session's own 30-minute inactivity limit (§8.2).
    clock.advanceMs(10 * 60 * 1000);
    await serveNext(sessionId);

    const row = (await ctx.db.select().from(answers).where(eq(answers.sessionId, sessionId)))[0]!;
    expect(row.serverReceivedAt.toISOString()).toBe(deadline.toISOString());
  });

  it('creates no learning event when the whole session expires (§8.2)', async () => {
    // "No activity for 30 minutes → EXPIRED. … Served-but-unanswered questions
    // produce **no** learning event." An expired session is not a timed-out
    // question: the learner never engaged with it at all.
    const { sessionId } = await startAndServe('session_expiry');

    clock.advanceMs(SESSION_INACTIVITY_TIMEOUT_MS + 1);
    const next = await serveNext(sessionId);

    expect(next.status).toBe(409);
    expect(next.code).toBe('INVALID_SESSION_STATE');

    const rows = await ctx.db.select().from(answers).where(eq(answers.sessionId, sessionId));
    const events = await ctx.db
      .select()
      .from(learningEvents)
      .where(eq(learningEvents.sessionId, sessionId));
    expect(rows).toHaveLength(0);
    expect(events).toHaveLength(0);
  });
});

// §16.3 duplicate-submission semantics.
describe('duplicate submissions (§16.3)', () => {
  it('replays the stored result for an identical response', async () => {
    const { sessionId, served } = await startAndServe('dup_same');
    const response = await responseFor(ctx.db, served.question, true);

    const first = await submitAnswer(sessionId, {
      position: served.position,
      questionVersionId: served.question.id,
      response,
    });
    clock.advanceMs(3_000);
    const second = await submitAnswer(sessionId, {
      position: served.position,
      questionVersionId: served.question.id,
      response,
    });

    expect(second.status).toBe(200);
    expect(second.body.correct).toBe(first.body.correct);
    // The replay must not re-grade at the later time.
    expect(second.body.speedFactor).toBe(first.body.speedFactor);

    const [rows] = await ctx.db
      .select({ n: count() })
      .from(answers)
      .where(eq(answers.sessionId, sessionId));
    expect(rows!.n).toBe(1);
  });

  it('rejects a different response for an already-answered question', async () => {
    const { sessionId, served } = await startAndServe('dup_diff');

    await submitAnswer(sessionId, {
      position: served.position,
      questionVersionId: served.question.id,
      response: await responseFor(ctx.db, served.question, true),
    });

    const second = await submitAnswer(sessionId, {
      position: served.position,
      questionVersionId: served.question.id,
      response: await responseFor(ctx.db, served.question, false),
    });

    expect(second.status).toBe(409);
    expect(second.code).toBe('ANSWER_ALREADY_SUBMITTED');

    const [rows] = await ctx.db
      .select({ n: count() })
      .from(answers)
      .where(eq(answers.sessionId, sessionId));
    expect(rows!.n).toBe(1);
  });

  it('keeps exactly one answer and one event under concurrent identical submissions', async () => {
    const { sessionId, served } = await startAndServe('dup_concurrent');
    const response = await responseFor(ctx.db, served.question, true);
    const body = {
      position: served.position,
      questionVersionId: served.question.id,
      response,
    };

    const results = await Promise.all(
      Array.from({ length: 5 }, () => submitAnswer(sessionId, body)),
    );

    expect(results.every((r) => r.status === 200)).toBe(true);

    const [answerRows] = await ctx.db
      .select({ n: count() })
      .from(answers)
      .where(eq(answers.sessionId, sessionId));
    const [eventRows] = await ctx.db
      .select({ n: count() })
      .from(learningEvents)
      .where(eq(learningEvents.sessionId, sessionId));

    expect(answerRows!.n).toBe(1);
    expect(eventRows!.n).toBe(1);
  });
});

describe('addressing the wrong question', () => {
  it('rejects a position that is not the served one', async () => {
    const { sessionId, served } = await startAndServe('wrong_position');

    const result = await submitAnswer(sessionId, {
      position: served.position + 3,
      questionVersionId: served.question.id,
      response: { optionId: 'a' },
    });

    expect(result.status).toBe(409);
    expect(result.code).toBe('QUESTION_NOT_CURRENT');
  });

  it('rejects a questionVersionId that does not match the position', async () => {
    const { sessionId, served } = await startAndServe('wrong_version');

    const result = await submitAnswer(sessionId, {
      position: served.position,
      questionVersionId: uuidv7(),
      response: { optionId: 'a' },
    });

    expect(result.status).toBe(409);
    expect(result.code).toBe('QUESTION_NOT_CURRENT');
  });

  it('rejects a position beyond the session', async () => {
    const { sessionId, served } = await startAndServe('out_of_range');

    // Inside the schema's sanity bound, but past this session's ten questions.
    const result = await submitAnswer(sessionId, {
      position: 50,
      questionVersionId: served.question.id,
      response: { optionId: 'a' },
    });

    expect(result.code).toBe('QUESTION_NOT_CURRENT');
  });

  it('rejects an absurd position at the schema boundary', async () => {
    const { sessionId, served } = await startAndServe('absurd_position');

    const result = await submitAnswer(sessionId, {
      position: 9_999,
      questionVersionId: served.question.id,
      response: { optionId: 'a' },
    });

    expect(result.status).toBe(400);
    expect(result.code).toBe('INVALID_INPUT');
  });

  it('rejects answering before anything has been served', async () => {
    await signUpFresh('nothing_served');
    const created = await createSession('math');

    const result = await submitAnswer(created.body.sessionId, {
      position: 0,
      questionVersionId: uuidv7(),
      response: { optionId: 'a' },
    });

    expect(result.status).toBe(409);
    expect(result.code).toBe('INVALID_SESSION_STATE');
  });
});

describe('request validation', () => {
  it('rejects a response shape that does not fit the question type', async () => {
    // Find an MCQ question and send a numeric-shaped response.
    const { sessionId, served } = await startAndServe('shape_mismatch');
    const wrongShape = served.question.type === 'MCQ' ? { value: '42' } : { optionId: 'a' };

    const result = await submitAnswer(sessionId, {
      position: served.position,
      questionVersionId: served.question.id,
      response: wrongShape,
    });

    expect(result.status).toBe(400);
    expect(result.code).toBe('INVALID_INPUT');
  });

  it('grades unparseable numeric text as wrong rather than rejecting it', async () => {
    // science-halflife is NUMERIC; find any numeric question in a session.
    await signUpFresh('numeric_garbage');
    const created = await createSession('science');

    for (let i = 0; i < 10; i += 1) {
      const served = await serveNext(created.body.sessionId);
      if (served.status !== 200) break;

      if (served.body.question.type === 'NUMERIC') {
        const result = await submitAnswer(created.body.sessionId, {
          position: served.body.position,
          questionVersionId: served.body.question.id,
          response: { value: 'not a number' },
        });
        expect(result.status).toBe(200);
        expect(result.body.correct).toBe(false);
        return;
      }

      await submitAnswer(created.body.sessionId, {
        position: served.body.position,
        questionVersionId: served.body.question.id,
        response: await responseFor(ctx.db, served.body.question, true),
      });
    }
  });

  it('rejects a malformed body', async () => {
    const { sessionId } = await startAndServe('bad_body');

    const result = await submitAnswer(sessionId, { position: -1, questionVersionId: 'nope' });
    expect(result.status).toBe(400);
    expect(result.code).toBe('INVALID_INPUT');
  });
});
