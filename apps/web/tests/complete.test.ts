/**
 * Session completion (PLANNING.md §18.2, §10, §16.3).
 *
 * Acceptance criteria covered:
 *   - "/complete before all questions are resolved returns SESSION_NOT_FINISHED"
 *   - "a completed session has exactly 10 answers, 10 learning_events, 1
 *      point_ledger row with a full breakdown, users.total_points_cached equals
 *      the ledger sum, status COMPLETED with result_json"
 *   - "Calling /complete repeatedly (sequentially and 5 concurrently) yields
 *      exactly one ledger row and identical responses"
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { count, eq } from 'drizzle-orm';
import {
  COMPLETION_BONUS,
  FixedClock,
  SOLO_QUESTION_COUNT,
  uuidv7,
  type PointsBreakdown,
  type ReviewItem,
} from '@learnarena/core';
import {
  answers,
  gameSessions,
  learningEvents,
  pointLedger,
  skillUpdates,
  streakDays,
  users,
} from '@learnarena/db/schema';
import { sumLedgerPoints } from '@learnarena/db';
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
import { complete, createSession, playAllQuestions, serveNext, submitAnswer } from './helpers/quiz';

let ctx: WebTestContext;
let clock: FixedClock;
let restoreClock: () => void;
let restoreTransport: () => void;
let terminalEvents: string[];
let currentUserId: string;

const START = '2026-09-29T12:00:00.000Z';

async function signUpFresh(username: string): Promise<string> {
  const authUserId = uuidv7();
  ctx.signInAs(authUserId);
  await onboardingRoute(
    jsonRequest('/api/me/onboarding', { method: 'POST', body: onboardingBody({ username }) }),
  );
  currentUserId = authUserId;
  return authUserId;
}

/** Play a whole session and complete it. */
async function playAndComplete(username: string, correctPositions?: (p: number) => boolean) {
  await signUpFresh(username);
  const created = await createSession('math');
  await playAllQuestions(
    ctx.db,
    created.body.sessionId,
    correctPositions ? { correctPositions } : {},
  );
  const completed = await complete(created.body.sessionId);
  return { sessionId: created.body.sessionId, completed };
}

beforeAll(async () => {
  ctx = await createWebTestContext('complete');
});

afterAll(async () => {
  await ctx?.teardown();
});

beforeEach(() => {
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

// §24: "/complete before all questions are resolved returns SESSION_NOT_FINISHED".
describe('refusing an unfinished session (§18.2 step 3)', () => {
  it('refuses when no question has been served', async () => {
    await signUpFresh('unfinished_1');
    const created = await createSession('math');

    // A CREATED session is not ACTIVE, so this is an illegal state change.
    const result = await complete(created.body.sessionId);
    expect(result.status).toBe(409);
    expect(result.code).toBe('INVALID_SESSION_STATE');
  });

  it('refuses while a question is still open', async () => {
    await signUpFresh('unfinished_2');
    const created = await createSession('math');
    await serveNext(created.body.sessionId);

    const result = await complete(created.body.sessionId);
    expect(result.status).toBe(409);
    expect(result.code).toBe('SESSION_NOT_FINISHED');
  });

  it('refuses when questions remain unserved', async () => {
    await signUpFresh('unfinished_3');
    const created = await createSession('math');
    await playAllQuestions(ctx.db, created.body.sessionId, {
      correctPositions: () => true,
    });
    // Contrived: answer only the first three, then try to finish.
    await signUpFresh('unfinished_4');
    const partial = await createSession('math');
    for (let i = 0; i < 3; i += 1) {
      const served = await serveNext(partial.body.sessionId);
      const { responseFor } = await import('./helpers/quiz');
      await submitAnswer(partial.body.sessionId, {
        position: served.body.position,
        questionVersionId: served.body.question.id,
        response: await responseFor(ctx.db, served.body.question, true),
      });
    }

    const result = await complete(partial.body.sessionId);
    expect(result.status).toBe(409);
    expect(result.code).toBe('SESSION_NOT_FINISHED');
    expect(
      (result.body as { error: { details: { unresolved: number; unserved: number } } }).error
        .details,
    ).toMatchObject({ unresolved: 7, unserved: 7 });
  });
});

// §24: "a completed session has exactly 10 answers, 10 learning_events, 1
// point_ledger row with a full breakdown, users.total_points_cached equals the
// ledger sum, status COMPLETED with result_json".
describe("a completed session's database state", () => {
  it('has exactly 10 answers and 10 learning events', async () => {
    const { sessionId } = await playAndComplete('db_state_1');

    const [answerRows] = await ctx.db
      .select({ n: count() })
      .from(answers)
      .where(eq(answers.sessionId, sessionId));
    const [eventRows] = await ctx.db
      .select({ n: count() })
      .from(learningEvents)
      .where(eq(learningEvents.sessionId, sessionId));

    expect(answerRows!.n).toBe(SOLO_QUESTION_COUNT);
    expect(eventRows!.n).toBe(SOLO_QUESTION_COUNT);
  });

  it('has exactly one ledger row carrying the full §10 breakdown', async () => {
    const { sessionId } = await playAndComplete('db_state_2');

    const rows = await ctx.db
      .select()
      .from(pointLedger)
      .where(eq(pointLedger.sessionId, sessionId));

    expect(rows).toHaveLength(1);
    const row = rows[0]!;
    expect(row.reason).toBe('SESSION_COMPLETION');
    expect(row.idempotencyKey).toBe(
      `session:${sessionId}:user:${currentUserId}:SESSION_COMPLETION`,
    );
    expect(row.weekKey).toBe('2026-W40');

    const breakdown = row.multipliersJson as PointsBreakdown;
    expect(breakdown.perQuestion).toHaveLength(SOLO_QUESTION_COUNT);
    expect(breakdown.rawBasePoints).toBeDefined();
    expect(breakdown.comboAdjustedPoints).toBeDefined();
    expect(breakdown.uncappedPoints).toBeDefined();
    expect(breakdown.cap).toBeDefined();
    expect(breakdown.finalPoints).toBe(row.finalPoints);
    // Phase 3 wires the weakness multiplier in. A learner's *first* session in
    // a category always carries ×1.25: a never-played category scores exactly
    // 0.50 on §11.4's weakness scale, which is above the 0.40 threshold, so it
    // is a weak category and the session is snapshotted WEAK (§11.8).
    // Streak stays 1.0 until Phase 2; friend and event are 1.0 by §10.1.
    expect(breakdown.multipliers).toMatchObject({
      streak: 1.02,
      friend: 1,
      weakness: 1.25,
      event: 1,
      session: '1.275',
    });
  });

  it('keeps users.total_points_cached equal to the ledger sum (Invariant 4)', async () => {
    const { completed } = await playAndComplete('db_state_3');

    const user = await ctx.db.query.users.findFirst({
      where: (table, { eq: equals }) => equals(table.id, currentUserId),
    });
    const ledgerSum = await sumLedgerPoints(ctx.db, currentUserId);

    expect(user?.totalPointsCached).toBe(ledgerSum);
    expect(user?.totalPointsCached).toBe(completed.body.finalPoints);
  });

  it('accumulates the cache across several sessions', async () => {
    await signUpFresh('db_state_4');

    let expected = 0;
    for (let i = 0; i < 3; i += 1) {
      const created = await createSession('math');
      await playAllQuestions(ctx.db, created.body.sessionId);
      const done = await complete(created.body.sessionId);
      expected += done.body.finalPoints as number;
    }

    const user = await ctx.db.query.users.findFirst({
      where: (table, { eq: equals }) => equals(table.id, currentUserId),
    });
    expect(user?.totalPointsCached).toBe(expected);
    expect(await sumLedgerPoints(ctx.db, currentUserId)).toBe(expected);
  });

  it('is COMPLETED with a frozen result_json, local date and qualification', async () => {
    const { sessionId } = await playAndComplete('db_state_5');

    const session = await ctx.db.query.gameSessions.findFirst({
      where: (table, { eq: equals }) => equals(table.id, sessionId),
    });

    expect(session?.status).toBe('COMPLETED');
    expect(session?.endedAt).not.toBeNull();
    expect(session?.resultJson).not.toBeNull();
    expect(session?.isQualifying).toBe(true);
    // The user's timezone is Australia/Melbourne, so 12:00 UTC is the 29th
    // locally too, but the field must be set from the user's zone (§18.2 step 4).
    expect(session?.localDate).toBe('2026-09-29');
  });

  it('writes no skill rows — those are Phase 3 (Invariant 5)', async () => {
    const { sessionId } = await playAndComplete('db_state_6');

    const [rows] = await ctx.db.select({ n: count() }).from(skillUpdates);
    expect(rows!.n).toBe(0);
    expect(sessionId).toBeDefined();
  });

  it('sends session/terminal after commit (§18.3)', async () => {
    const { sessionId } = await playAndComplete('db_state_7');
    expect(terminalEvents).toEqual([sessionId]);
  });
});

describe('the awarded points (§10)', () => {
  it('scores a perfect, instant first session at 1626 (1275 × 1.02 streak × 1.25 weak tier)', async () => {
    // Ten correct answers with the full window left → speed factor 1.0,
    // q_base 100 each, combos 0..9, plus the 50 completion bonus = 1275
    // combo-adjusted. The learner has never played math, so §11.4 scores it
    // 0.50 (weak) and §11.8 snapshots the session WEAK: 1275 × 1.25 = 1593.75,
    // rounded half-up once at the end (§10.2 step 8).
    const { completed } = await playAndComplete('points_perfect');

    const breakdown = completed.body.pointsBreakdown as PointsBreakdown;
    expect(breakdown.rawBasePoints).toBe('1050');
    expect(breakdown.comboAdjustedPoints).toBe('1275');
    expect(breakdown.multipliers.weakness).toBe(1.25);
    expect(breakdown.uncappedPoints).toBe('1625.625');
    expect(breakdown.capApplied).toBe(false);
    expect(completed.body.finalPoints).toBe(1626);
  });

  it('awards only the completion bonus when every answer is wrong', async () => {
    // 50 × 1.25 (first session in a never-played category) = 62.5 → 63.
    const { completed } = await playAndComplete('points_all_wrong', () => false);

    const breakdown = completed.body.pointsBreakdown as PointsBreakdown;
    expect(breakdown.rawBasePoints).toBe(String(COMPLETION_BONUS));
    expect(completed.body.finalPoints).toBe(64);
  });

  it('reflects the combo reset in the breakdown', async () => {
    const { completed } = await playAndComplete('points_mixed', (p) => p !== 0);

    const breakdown = completed.body.pointsBreakdown as PointsBreakdown;
    expect(breakdown.perQuestion[0]?.correctness).toBe(0);
    expect(breakdown.perQuestion.map((q) => q.combo)).toEqual([0, 0, 1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it('marks a session non-qualifying when fewer than half were answered (§6)', async () => {
    await signUpFresh('non_qualifying');
    const created = await createSession('math');

    // Answer four, let the other six lapse.
    for (let i = 0; i < 4; i += 1) {
      const served = await serveNext(created.body.sessionId);
      const { responseFor } = await import('./helpers/quiz');
      await submitAnswer(created.body.sessionId, {
        position: served.body.position,
        questionVersionId: served.body.question.id,
        response: await responseFor(ctx.db, served.body.question, true),
      });
    }
    for (let i = 0; i < 6; i += 1) {
      await serveNext(created.body.sessionId);
      clock.advanceMs(25_000); // past the deadline and its grace
    }

    const completed = await complete(created.body.sessionId);
    expect(completed.status).toBe(200);
    expect(completed.body.isQualifying).toBe(false);
    expect(
      await ctx.db.select().from(streakDays).where(eq(streakDays.userId, currentUserId)),
    ).toHaveLength(0);
    // §10.4: points are still awarded for a completed session.
    expect(completed.body.finalPoints).toBeGreaterThan(0);
  });
});

// §24: "a review of every missed question with its explanation".
describe('the missed-question review (§20 screen 6)', () => {
  it('is empty for a perfect session', async () => {
    const { completed } = await playAndComplete('review_perfect');
    expect(completed.body.review).toEqual([]);
  });

  it('lists every missed question with its explanation and the right answer', async () => {
    const { completed } = await playAndComplete('review_missed', (p) => p % 2 === 0);

    const review = completed.body.review as ReviewItem[];
    expect(review).toHaveLength(5);
    expect(review.map((item) => item.position)).toEqual([1, 3, 5, 7, 9]);

    for (const item of review) {
      expect(item.prompt.length).toBeGreaterThan(0);
      expect(item.explanation.length).toBeGreaterThan(10);
      expect(item.correctAnswer.length).toBeGreaterThan(0);
      expect(item.yourAnswer).not.toBeNull();
      expect(item.timedOut).toBe(false);
    }
  });

  it('marks timed-out questions and shows no answer for them', async () => {
    await signUpFresh('review_timeout');
    const created = await createSession('math');

    for (let i = 0; i < SOLO_QUESTION_COUNT; i += 1) {
      await serveNext(created.body.sessionId);
      clock.advanceMs(25_000);
    }

    const completed = await complete(created.body.sessionId);
    const review = completed.body.review as ReviewItem[];

    expect(review).toHaveLength(SOLO_QUESTION_COUNT);
    for (const item of review) {
      expect(item.timedOut).toBe(true);
      expect(item.yourAnswer).toBeNull();
      expect(item.explanation.length).toBeGreaterThan(10);
    }
  });

  it('includes no correctly-answered question', async () => {
    const { completed } = await playAndComplete('review_only_missed', (p) => p < 7);
    const review = completed.body.review as ReviewItem[];
    expect(review.map((item) => item.position)).toEqual([7, 8, 9]);
  });
});

// §24 / §16.3: "Calling /complete repeatedly (sequentially and 5 concurrently)
// yields exactly one ledger row and identical responses."
describe('idempotent completion (§18.1, §18.2, Invariant 2)', () => {
  it('returns the stored result on a sequential repeat, writing nothing', async () => {
    const { sessionId, completed } = await playAndComplete('idem_sequential');

    const second = await complete(sessionId);
    const third = await complete(sessionId);

    expect(second.status).toBe(200);
    expect(third.status).toBe(200);
    expect(second.body).toEqual(completed.body);
    expect(third.body).toEqual(completed.body);

    const [rows] = await ctx.db
      .select({ n: count() })
      .from(pointLedger)
      .where(eq(pointLedger.sessionId, sessionId));
    expect(rows!.n).toBe(1);
  });

  it('does not double-count the cached total on a repeat', async () => {
    const { sessionId, completed } = await playAndComplete('idem_cache');
    await complete(sessionId);
    await complete(sessionId);

    const user = await ctx.db.query.users.findFirst({
      where: (table, { eq: equals }) => equals(table.id, currentUserId),
    });
    expect(user?.totalPointsCached).toBe(completed.body.finalPoints);
  });

  it('yields exactly one ledger row under five parallel completions', async () => {
    await signUpFresh('idem_parallel');
    const created = await createSession('math');
    await playAllQuestions(ctx.db, created.body.sessionId);

    // The heart of the concurrency requirement: five simultaneous /complete
    // calls. The FOR UPDATE lock in §18.2 step 1 serialises them; the first
    // awards, the rest observe COMPLETED and replay the stored result_json.
    const results = await Promise.all(
      Array.from({ length: 5 }, () => complete(created.body.sessionId)),
    );

    expect(results.every((result) => result.status === 200)).toBe(true);

    // Identical responses.
    const [first, ...rest] = results;
    for (const result of rest) {
      expect(result.body).toEqual(first!.body);
    }

    // Exactly one award.
    const ledgerRows = await ctx.db
      .select()
      .from(pointLedger)
      .where(eq(pointLedger.sessionId, created.body.sessionId));
    expect(ledgerRows).toHaveLength(1);

    // And the cache advanced exactly once.
    const user = await ctx.db.query.users.findFirst({
      where: (table, { eq: equals }) => equals(table.id, currentUserId),
    });
    expect(user?.totalPointsCached).toBe(first!.body.finalPoints);
    expect(await sumLedgerPoints(ctx.db, currentUserId)).toBe(first!.body.finalPoints as number);
  });

  it('keeps answer and event counts at ten through parallel completions', async () => {
    await signUpFresh('idem_parallel_rows');
    const created = await createSession('math');
    await playAllQuestions(ctx.db, created.body.sessionId);

    await Promise.all(Array.from({ length: 5 }, () => complete(created.body.sessionId)));

    const [answerRows] = await ctx.db
      .select({ n: count() })
      .from(answers)
      .where(eq(answers.sessionId, created.body.sessionId));
    const [eventRows] = await ctx.db
      .select({ n: count() })
      .from(learningEvents)
      .where(eq(learningEvents.sessionId, created.body.sessionId));

    expect(answerRows!.n).toBe(SOLO_QUESTION_COUNT);
    expect(eventRows!.n).toBe(SOLO_QUESTION_COUNT);
  });

  it('sends the terminal event once, not five times', async () => {
    await signUpFresh('idem_parallel_events');
    const created = await createSession('math');
    await playAllQuestions(ctx.db, created.body.sessionId);

    await Promise.all(Array.from({ length: 5 }, () => complete(created.body.sessionId)));

    expect(terminalEvents).toEqual([created.body.sessionId]);
  });
});

describe('ownership and state', () => {
  it("refuses to complete another user's session", async () => {
    await signUpFresh('complete_owner');
    const created = await createSession('math');
    await playAllQuestions(ctx.db, created.body.sessionId);

    await signUpFresh('complete_intruder');
    const result = await complete(created.body.sessionId);

    expect(result.status).toBe(404);
    expect(result.code).toBe('SESSION_NOT_FOUND');

    const [rows] = await ctx.db
      .select({ n: count() })
      .from(pointLedger)
      .where(eq(pointLedger.sessionId, created.body.sessionId));
    expect(rows!.n).toBe(0);
  });

  it('leaves the ledger untouched when completion is refused', async () => {
    await signUpFresh('no_award');
    const created = await createSession('math');
    await serveNext(created.body.sessionId);

    await complete(created.body.sessionId); // SESSION_NOT_FINISHED

    // Scoped to this session: the shared database carries rows from the other
    // tests in this file.
    const [rows] = await ctx.db
      .select({ n: count() })
      .from(pointLedger)
      .where(eq(pointLedger.sessionId, created.body.sessionId));
    const user = await ctx.db
      .select({ total: users.totalPointsCached })
      .from(users)
      .where(eq(users.id, currentUserId));

    expect(rows!.n).toBe(0);
    expect(user[0]?.total).toBe(0);
  });

  it('never writes points for a session that ends any other way (§10.4)', async () => {
    await signUpFresh('no_points_abandon');
    const created = await createSession('math');
    await playAllQuestions(ctx.db, created.body.sessionId);

    // Force the session to a non-COMPLETED terminal state, then try again.
    await ctx.db
      .update(gameSessions)
      .set({ status: 'ABANDONED', endedAt: clock.now() })
      .where(eq(gameSessions.id, created.body.sessionId));

    const result = await complete(created.body.sessionId);
    expect(result.status).toBe(409);
    expect(result.code).toBe('INVALID_SESSION_STATE');

    const [rows] = await ctx.db
      .select({ n: count() })
      .from(pointLedger)
      .where(eq(pointLedger.sessionId, created.body.sessionId));
    expect(rows!.n).toBe(0);
  });
});

it('restores a missing result cache exactly from canonical history without re-awarding', async () => {
  const { sessionId, completed } = await playAndComplete(
    'cache_recovery',
    (position) => position <= 6,
  );
  const [before] = await ctx.db.select().from(gameSessions).where(eq(gameSessions.id, sessionId));
  const ledgerBefore = await ctx.db
    .select()
    .from(pointLedger)
    .where(eq(pointLedger.sessionId, sessionId));
  const daysBefore = await ctx.db
    .select()
    .from(streakDays)
    .where(eq(streakDays.userId, currentUserId));
  await ctx.db.update(gameSessions).set({ resultJson: null }).where(eq(gameSessions.id, sessionId));
  clock.advanceDays(3);
  const again = await complete(sessionId);
  expect(again.status).toBe(200);
  expect(again.body).toEqual(completed.body);
  const [after] = await ctx.db.select().from(gameSessions).where(eq(gameSessions.id, sessionId));
  expect(after?.resultJson).toEqual(before?.resultJson);
  expect(
    await ctx.db.select().from(pointLedger).where(eq(pointLedger.sessionId, sessionId)),
  ).toEqual(ledgerBefore);
  expect(
    await ctx.db.select().from(streakDays).where(eq(streakDays.userId, currentUserId)),
  ).toEqual(daysBefore);
});
