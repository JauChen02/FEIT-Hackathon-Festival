/**
 * The deterministic Coach (PLANNING.md §11, §15.5, §18.2 steps 6-7, §18.3).
 *
 * §24 Phase 3 acceptance criteria covered here:
 *   - "GET /api/me/recommendation returns the same recommendation all day and
 *      a new one the next local date"
 *   - "sessions created with recommendationId get tier RECOMMENDED; the first
 *      qualifying completion shows recommendationCompleted: true and ×1.5;
 *      later sessions don't"
 *   - "each learning event of a terminal session has exactly one skill_updates
 *      row; skill_profiles.rating equals the last rating_after;
 *      recommendations.reason_json contains the full input snapshot and seed"
 *   - "re-running coach/process-session for the same session changes nothing;
 *      concurrent GET /api/me/recommendation calls create one row; the
 *      recommendation bonus can't be granted twice"
 *   - "abandoned sessions update skills but give no points; expired
 *      recommendation falls back to WEAK/NONE"
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { count, eq } from 'drizzle-orm';
import {
  FixedClock,
  uuidv7,
  type PointsBreakdown,
  type RecommendationResponse,
  type SessionStateResponse,
  type SkillsResponse,
} from '@learnarena/core';
import { pointLedger, skillProfiles, skillUpdates, learningEvents } from '@learnarena/db/schema';
import { GET as recommendationRoute } from '@/app/api/me/recommendation/route';
import { GET as skillsRoute } from '@/app/api/me/skills/route';
import { GET as sessionRoute } from '@/app/api/sessions/[id]/route';
import { POST as onboardingRoute } from '@/app/api/me/onboarding/route';
import { POST as createSessionRoute } from '@/app/api/sessions/route';
import { POST as abandonRoute } from '@/app/api/sessions/[id]/abandon/route';
import { runProcessSession } from '@/lib/inngest/functions/coachJobs';
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
import { complete, playAllQuestions, serveNext, withId } from './helpers/quiz';

let ctx: WebTestContext;
let clock: FixedClock;
let restoreClock: () => void;
let restoreTransport: () => void;
let currentUserId: string;
/** Sessions whose terminal event fired, so tests can drive the Coach job. */
let terminalEvents: { sessionId: string; userId: string }[];

const START = '2026-09-29T12:00:00.000Z';

async function signUpFresh(username: string, timezone = 'Australia/Melbourne'): Promise<string> {
  currentUserId = uuidv7();
  ctx.signInAs(currentUserId);
  await onboardingRoute(
    jsonRequest('/api/me/onboarding', {
      method: 'POST',
      body: onboardingBody({ username, timezone }),
    }),
  );
  return currentUserId;
}

const getRecommendation = async () =>
  readResponse<RecommendationResponse>(
    await recommendationRoute(jsonRequest('/api/me/recommendation')),
  );

const getSkills = async () =>
  readResponse<SkillsResponse>(await skillsRoute(jsonRequest('/api/me/skills')));

/** Create a session, optionally linked to today's recommendation (§11.8). */
async function createSession(categorySlug: string, recommendationId?: string) {
  return readResponse<{ sessionId: string }>(
    await createSessionRoute(
      jsonRequest('/api/sessions', {
        method: 'POST',
        body: {
          gameType: 'quiz_solo',
          categorySlug,
          ...(recommendationId ? { recommendationId } : {}),
        },
        headers: { 'idempotency-key': uuidv7() },
      }),
    ),
  );
}

/** Play a whole session and run the Coach job, as the real fan-out would. */
async function playCompleteAndProcess(categorySlug: string, recommendationId?: string) {
  const created = await createSession(categorySlug, recommendationId);
  await playAllQuestions(ctx.db, created.body.sessionId);
  const completed = await complete(created.body.sessionId);
  await runProcessSession(created.body.sessionId, currentUserId, clock.now());
  return { sessionId: created.body.sessionId, completed };
}

beforeAll(async () => {
  ctx = await createWebTestContext('coach');
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
  restoreTransport = setEventTransport(async (sessionId, userId) => {
    terminalEvents.push({ sessionId, userId });
  });
});

afterEach(() => {
  restoreClock();
  restoreTransport();
});

// ---------------------------------------------------------------------------
// coach/process-session (§11.3, §18.3)
// ---------------------------------------------------------------------------

describe('coach/process-session (§11.3)', () => {
  it('writes exactly one skill_updates row per learning event', async () => {
    await signUpFresh('elo_one_each');
    const { sessionId } = await playCompleteAndProcess('math');

    const [events] = await ctx.db
      .select({ n: count() })
      .from(learningEvents)
      .where(eq(learningEvents.sessionId, sessionId));
    const [updates] = await ctx.db
      .select({ n: count() })
      .from(skillUpdates)
      .where(eq(skillUpdates.userId, currentUserId));

    expect(events!.n).toBe(10);
    expect(updates!.n).toBe(10);
  });

  it('leaves skill_profiles.rating equal to the last rating_after', async () => {
    await signUpFresh('elo_profile');
    await playCompleteAndProcess('math');

    const updates = await ctx.db
      .select()
      .from(skillUpdates)
      .where(eq(skillUpdates.userId, currentUserId))
      .orderBy(skillUpdates.createdAt, skillUpdates.id);

    const profile = await ctx.db.query.skillProfiles.findFirst({
      where: (table, { eq: equals }) => equals(table.userId, currentUserId),
    });

    expect(Number(profile!.rating)).toBeCloseTo(Number(updates.at(-1)!.ratingAfter), 2);
    expect(profile!.lifetimeEventCount).toBe(10);
  });

  it('chains each update into the next, in occurred_at order', async () => {
    await signUpFresh('elo_chain');
    await playCompleteAndProcess('math');

    const updates = await ctx.db
      .select()
      .from(skillUpdates)
      .where(eq(skillUpdates.userId, currentUserId))
      .orderBy(skillUpdates.createdAt, skillUpdates.id);

    for (let i = 1; i < updates.length; i += 1) {
      expect(Number(updates[i]!.ratingBefore)).toBeCloseTo(Number(updates[i - 1]!.ratingAfter), 2);
    }
    expect(Number(updates[0]!.ratingBefore)).toBe(1000); // §11.3 starting rating
  });

  it('raises the rating for a learner who answers everything correctly', async () => {
    await signUpFresh('elo_up');
    await playCompleteAndProcess('math');

    const profile = await ctx.db.query.skillProfiles.findFirst({
      where: (table, { eq: equals }) => equals(table.userId, currentUserId),
    });
    expect(Number(profile!.rating)).toBeGreaterThan(1000);
  });

  it('lowers the rating for a learner who gets everything wrong', async () => {
    await signUpFresh('elo_down');
    const created = await createSession('math');
    await playAllQuestions(ctx.db, created.body.sessionId, { correctPositions: () => false });
    await complete(created.body.sessionId);
    await runProcessSession(created.body.sessionId, currentUserId, clock.now());

    const profile = await ctx.db.query.skillProfiles.findFirst({
      where: (table, { eq: equals }) => equals(table.userId, currentUserId),
    });
    expect(Number(profile!.rating)).toBeLessThan(1000);
  });

  it('records K = 32 while the learner is below 50 events (§11.3)', async () => {
    await signUpFresh('elo_k');
    await playCompleteAndProcess('math');

    const updates = await ctx.db
      .select()
      .from(skillUpdates)
      .where(eq(skillUpdates.userId, currentUserId));

    expect(updates.every((update) => update.kFactor === 32)).toBe(true);
  });

  // §24: "re-running coach/process-session for the same session changes nothing".
  it('is idempotent', async () => {
    await signUpFresh('elo_idempotent');
    const { sessionId } = await playCompleteAndProcess('math');

    const before = await ctx.db.query.skillProfiles.findFirst({
      where: (table, { eq: equals }) => equals(table.userId, currentUserId),
    });

    const second = await runProcessSession(sessionId, currentUserId, clock.now());
    const third = await runProcessSession(sessionId, currentUserId, clock.now());

    expect(second.eventsApplied).toBe(0);
    expect(third.eventsApplied).toBe(0);

    const after = await ctx.db.query.skillProfiles.findFirst({
      where: (table, { eq: equals }) => equals(table.userId, currentUserId),
    });
    const [updates] = await ctx.db
      .select({ n: count() })
      .from(skillUpdates)
      .where(eq(skillUpdates.userId, currentUserId));

    expect(after!.rating).toBe(before!.rating);
    expect(updates!.n).toBe(10);
  });

  it('stamps post_processed_at even for a session with no events (ADR-042)', async () => {
    await signUpFresh('elo_no_events');
    const created = await createSession('math');

    await runProcessSession(created.body.sessionId, currentUserId, clock.now());

    const session = await ctx.db.query.gameSessions.findFirst({
      where: (table, { eq: equals }) => equals(table.id, created.body.sessionId),
    });
    expect(session?.postProcessedAt).not.toBeNull();
  });

  // §24: "abandoned sessions update skills but give no points".
  it('updates skills for an abandoned session but writes no ledger row', async () => {
    await signUpFresh('elo_abandoned');
    const created = await createSession('math');

    const served = await serveNext(created.body.sessionId);
    const { responseFor, submitAnswer } = await import('./helpers/quiz');
    await submitAnswer(created.body.sessionId, {
      position: served.body.position,
      questionVersionId: served.body.question.id,
      response: await responseFor(ctx.db, served.body.question, true),
    });

    await abandonRoute(
      jsonRequest(`/api/sessions/${created.body.sessionId}/abandon`, { method: 'POST' }),
      withId(created.body.sessionId),
    );
    await runProcessSession(created.body.sessionId, currentUserId, clock.now());

    const [updates] = await ctx.db
      .select({ n: count() })
      .from(skillUpdates)
      .where(eq(skillUpdates.userId, currentUserId));
    const [ledger] = await ctx.db
      .select({ n: count() })
      .from(pointLedger)
      .where(eq(pointLedger.sessionId, created.body.sessionId));

    expect(updates!.n).toBe(1);
    expect(ledger!.n).toBe(0);
  });

  it('only reads learning_events, so a session with events in one category touches one profile', async () => {
    await signUpFresh('elo_single_category');
    await playCompleteAndProcess('logic');

    const profiles = await ctx.db
      .select()
      .from(skillProfiles)
      .where(eq(skillProfiles.userId, currentUserId));

    expect(profiles).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// GET /api/me/recommendation (§11.5, §15.5)
// ---------------------------------------------------------------------------

describe('GET /api/me/recommendation (§11.5)', () => {
  it('generates one lazily on the first read of a local date', async () => {
    await signUpFresh('rec_lazy');

    const result = await getRecommendation();

    expect(result.status).toBe(200);
    expect(result.body.status).toBe('AVAILABLE');
    expect(result.body.claimable).toBe(true);
    expect(result.body.bonusMultiplier).toBe(1.5);
    expect(result.body.localDate).toBe('2026-09-29');

    // A learner who has played nothing scores 0.50 in every category, so the
    // slug tie-break ranks logic first (§11.4). Exploration fires for about
    // one user in ten (§11.5 step 2) and then picks a *different* weak
    // category, so the assertion follows the recorded decision rather than
    // assuming the common branch.
    const { findRecommendationById } = await import('@learnarena/db');
    const record = await findRecommendationById(ctx.db, result.body.recommendationId);
    const reason = record!.reasonJson as {
      topCategorySlug: string;
      weakCategorySlugs: string[];
      exploration: { applied: boolean };
    };

    expect(reason.topCategorySlug).toBe('logic');
    if (reason.exploration.applied) {
      expect(result.body.categorySlug).not.toBe('logic');
      expect(reason.weakCategorySlugs).toContain(result.body.categorySlug);
    } else {
      expect(result.body.categorySlug).toBe('logic');
    }
  });

  it('returns the same recommendation all day', async () => {
    await signUpFresh('rec_same_day');
    const first = await getRecommendation();

    // 12:00Z is 22:00 in Melbourne, so a 1-hour hop stays on 2026-09-29 local.
    clock.advanceMs(60 * 60 * 1000);
    const second = await getRecommendation();

    expect(second.body.recommendationId).toBe(first.body.recommendationId);
    expect(second.body.categorySlug).toBe(first.body.categorySlug);
  });

  it('generates a new one on the next local date and expires the old one', async () => {
    await signUpFresh('rec_next_day');
    const first = await getRecommendation();

    clock.advanceDays(1);
    const second = await getRecommendation();

    expect(second.body.recommendationId).not.toBe(first.body.recommendationId);
    expect(second.body.localDate).toBe('2026-09-30');

    const { listRecommendations } = await import('@learnarena/db');
    const all = await listRecommendations(ctx.db, currentUserId);
    const yesterday = all.find((r) => r.id === first.body.recommendationId)!;
    // §15.5: applied lazily on the next read.
    expect(yesterday.status).toBe('EXPIRED');
  });

  it('uses the learner local date, not UTC', async () => {
    // 2026-09-29T20:00Z is already the 30th in Melbourne (UTC+10).
    await signUpFresh('rec_timezone', 'Australia/Melbourne');
    clock.set('2026-09-29T20:00:00.000Z');

    const result = await getRecommendation();
    expect(result.body.localDate).toBe('2026-09-30');
  });

  // §24: "concurrent GET /api/me/recommendation calls create one row".
  it('creates exactly one row under five concurrent first reads', async () => {
    await signUpFresh('rec_concurrent');

    const results = await Promise.all(Array.from({ length: 5 }, () => getRecommendation()));

    expect(results.every((r) => r.status === 200)).toBe(true);
    const ids = new Set(results.map((r) => r.body.recommendationId));
    expect(ids.size).toBe(1);

    const { listRecommendations } = await import('@learnarena/db');
    expect(await listRecommendations(ctx.db, currentUserId)).toHaveLength(1);
  });

  // §24: "recommendations.reason_json contains the full input snapshot and seed".
  it('stores the full input snapshot and the seed in reason_json', async () => {
    await signUpFresh('rec_reason');
    const result = await getRecommendation();

    const { findRecommendationById } = await import('@learnarena/db');
    const record = await findRecommendationById(ctx.db, result.body.recommendationId);
    const reason = record!.reasonJson as {
      categories: { categorySlug: string; weaknessScore: number; rating: number }[];
      weakCategorySlugs: string[];
      topCategorySlug: string;
      exploration: { r: number; probability: number; applied: boolean; seed: string };
    };

    expect(reason.categories).toHaveLength(3);
    expect(reason.categories[0]).toMatchObject({
      categorySlug: expect.any(String),
      weaknessScore: expect.any(Number),
      rating: expect.any(Number),
      proficiency: expect.any(Number),
      confidence: expect.any(Number),
    });
    expect(reason.weakCategorySlugs.length).toBeGreaterThan(0);
    expect(reason.topCategorySlug).toBeDefined();
    expect(reason.exploration.seed).toMatch(/^[0-9a-f]{64}$/);
    expect(reason.exploration.probability).toBe(0.1);
  });

  it('targets the chosen category rating minus 147 (ADR-010)', async () => {
    await signUpFresh('rec_target');
    const result = await getRecommendation();
    expect(result.body.targetRating).toBe(853);
  });

  it('follows the learner as their weakest category changes', async () => {
    await signUpFresh('rec_follows');
    await getRecommendation();

    // Play logic well, so it stops being the weakest.
    await playCompleteAndProcess('logic');

    clock.advanceDays(1);
    const second = await getRecommendation();

    // logic now has exposure and zero staleness, so it ranks below the two
    // still-untouched categories whatever the exploration branch does.
    const { findRecommendationById } = await import('@learnarena/db');
    const record = await findRecommendationById(ctx.db, second.body.recommendationId);
    const reason = record!.reasonJson as {
      topCategorySlug: string;
      categories: { categorySlug: string; weaknessScore: number }[];
    };

    expect(reason.topCategorySlug).toBe('math'); // math < science by slug
    expect(second.body.categorySlug).not.toBe('logic');

    const logic = reason.categories.find((c) => c.categorySlug === 'logic')!;
    const math = reason.categories.find((c) => c.categorySlug === 'math')!;
    expect(logic.weaknessScore).toBeLessThan(math.weaknessScore);
  });

  it('requires onboarding', async () => {
    ctx.signInAs(uuidv7());
    expect((await getRecommendation()).code).toBe('ONBOARDING_REQUIRED');
  });
});

// ---------------------------------------------------------------------------
// The tier snapshot and the bonus (§11.8, §18.2 step 6)
// ---------------------------------------------------------------------------

describe('the recommendation bonus (§11.5, §11.8)', () => {
  it("snapshots RECOMMENDED on a session started from today's recommendation", async () => {
    await signUpFresh('tier_recommended');
    const recommendation = await getRecommendation();

    const created = await createSession(
      recommendation.body.categorySlug,
      recommendation.body.recommendationId,
    );

    const session = await ctx.db.query.gameSessions.findFirst({
      where: (table, { eq: equals }) => equals(table.id, created.body.sessionId),
    });

    expect(session?.weaknessTier).toBe('RECOMMENDED');
    expect(session?.recommendationId).toBe(recommendation.body.recommendationId);
  });

  it('moves the recommendation to IN_PROGRESS when the session starts (§15.5)', async () => {
    await signUpFresh('tier_in_progress');
    const recommendation = await getRecommendation();
    await createSession(recommendation.body.categorySlug, recommendation.body.recommendationId);

    const { findRecommendationById } = await import('@learnarena/db');
    const record = await findRecommendationById(ctx.db, recommendation.body.recommendationId);
    expect(record?.status).toBe('IN_PROGRESS');
  });

  it('snapshots WEAK for a weak category played without the recommendation', async () => {
    await signUpFresh('tier_weak');
    // Never played, so every category is weak (0.50 > 0.40).
    const created = await createSession('science');

    const session = await ctx.db.query.gameSessions.findFirst({
      where: (table, { eq: equals }) => equals(table.id, created.body.sessionId),
    });
    expect(session?.weaknessTier).toBe('WEAK');
  });

  // §24: "the first qualifying completion shows recommendationCompleted: true and ×1.5".
  it('grants ×1.5 on the first qualifying completion', async () => {
    await signUpFresh('bonus_first');
    const recommendation = await getRecommendation();

    const { completed } = await playCompleteAndProcess(
      recommendation.body.categorySlug,
      recommendation.body.recommendationId,
    );

    expect(completed.body.recommendationCompleted).toBe(true);
    const breakdown = completed.body.pointsBreakdown as PointsBreakdown;
    expect(breakdown.multipliers.weakness).toBe(1.5);

    const { findRecommendationById } = await import('@learnarena/db');
    const record = await findRecommendationById(ctx.db, recommendation.body.recommendationId);
    expect(record?.status).toBe('COMPLETED');
    expect(record?.completedSessionId).toBeDefined();
  });

  // §24: "later sessions don't".
  it('gives a later session in the same category WEAK, not RECOMMENDED', async () => {
    await signUpFresh('bonus_later');
    const recommendation = await getRecommendation();
    await playCompleteAndProcess(
      recommendation.body.categorySlug,
      recommendation.body.recommendationId,
    );

    // Same category, same day, same (now spent) recommendation.
    const second = await playCompleteAndProcess(
      recommendation.body.categorySlug,
      recommendation.body.recommendationId,
    );

    expect(second.completed.body.recommendationCompleted).toBe(false);
    const breakdown = second.completed.body.pointsBreakdown as PointsBreakdown;
    expect(breakdown.multipliers.weakness).toBeLessThan(1.5);
  });

  it('marks the recommendation done but keeps it visible (§11.5)', async () => {
    await signUpFresh('bonus_visible');
    const recommendation = await getRecommendation();
    await playCompleteAndProcess(
      recommendation.body.categorySlug,
      recommendation.body.recommendationId,
    );

    const after = await getRecommendation();
    expect(after.body.status).toBe('COMPLETED');
    expect(after.body.claimable).toBe(false);
    expect(after.body.bonusMultiplier).toBe(1);
    expect(after.body.recommendationId).toBe(recommendation.body.recommendationId);
  });

  // §24: "the recommendation bonus can't be granted twice (sequential and
  // concurrent completions of two sessions from the same recommendation →
  // exactly one RECOMMENDED award)".
  it('grants the bonus once across two sessions completed sequentially', async () => {
    await signUpFresh('bonus_seq');
    const recommendation = await getRecommendation();

    const first = await playCompleteAndProcess(
      recommendation.body.categorySlug,
      recommendation.body.recommendationId,
    );
    const second = await playCompleteAndProcess(
      recommendation.body.categorySlug,
      recommendation.body.recommendationId,
    );

    const awards = [first, second].map(
      (s) => (s.completed.body.pointsBreakdown as PointsBreakdown).multipliers.weakness,
    );
    expect(awards.filter((weakness) => weakness === 1.5)).toHaveLength(1);
  });

  it('grants the bonus to exactly one of two concurrent claims', async () => {
    await signUpFresh('bonus_concurrent');
    const recommendation = await getRecommendation();
    const recommendationId = recommendation.body.recommendationId;

    // Two *completable* sessions from one recommendation cannot coexist
    // through the API: ADR-012 allows one open solo session per user, so the
    // first must reach a terminal state before the second can be created — and
    // a completed first session has already spent the recommendation.
    //
    // The guard still has to hold under a genuine race, so this drives
    // `claimForCompletion` directly from two parallel transactions. That is
    // the §18.1 mechanism the API path relies on.
    const created = await createSession(recommendation.body.categorySlug, recommendationId);
    const sessionId = created.body.sessionId;

    const { claimForCompletion } = await import('@learnarena/db');
    const claims = await Promise.all([
      ctx.db.transaction((tx) => claimForCompletion(tx, recommendationId, sessionId, clock.now())),
      ctx.db.transaction((tx) => claimForCompletion(tx, recommendationId, sessionId, clock.now())),
    ]);

    expect(claims.filter(Boolean)).toHaveLength(1);

    const { findRecommendationById } = await import('@learnarena/db');
    const record = await findRecommendationById(ctx.db, recommendationId);
    expect(record?.status).toBe('COMPLETED');
    expect(record?.completedSessionId).not.toBeNull();
  });

  it('refuses a second claim once the recommendation is COMPLETED', async () => {
    await signUpFresh('bonus_second_claim');
    const recommendation = await getRecommendation();
    const recommendationId = recommendation.body.recommendationId;
    const created = await createSession(recommendation.body.categorySlug, recommendationId);
    const sessionId = created.body.sessionId;

    const { claimForCompletion } = await import('@learnarena/db');
    const first = await ctx.db.transaction((tx) =>
      claimForCompletion(tx, recommendationId, sessionId, clock.now()),
    );
    const second = await ctx.db.transaction((tx) =>
      claimForCompletion(tx, recommendationId, sessionId, clock.now()),
    );

    expect(first).toBe(true);
    expect(second).toBe(false);
  });

  // §11.5: "Abandoning does not consume it."
  it('does not consume the recommendation when the session is abandoned', async () => {
    await signUpFresh('bonus_abandon');
    const recommendation = await getRecommendation();

    const created = await createSession(
      recommendation.body.categorySlug,
      recommendation.body.recommendationId,
    );
    await serveNext(created.body.sessionId);
    await abandonRoute(
      jsonRequest(`/api/sessions/${created.body.sessionId}/abandon`, { method: 'POST' }),
      withId(created.body.sessionId),
    );

    const { findRecommendationById } = await import('@learnarena/db');
    const record = await findRecommendationById(ctx.db, recommendation.body.recommendationId);
    expect(record?.status).toBe('AVAILABLE');

    // And a fresh session can still earn the bonus.
    const retry = await playCompleteAndProcess(
      recommendation.body.categorySlug,
      recommendation.body.recommendationId,
    );
    expect(retry.completed.body.recommendationCompleted).toBe(true);
  });

  it('does not consume the recommendation on a non-qualifying completion (§15.5)', async () => {
    await signUpFresh('bonus_non_qualifying');
    const recommendation = await getRecommendation();

    const created = await createSession(
      recommendation.body.categorySlug,
      recommendation.body.recommendationId,
    );

    // Answer four, let six lapse → 40% answered, below the §6 threshold.
    const { responseFor, submitAnswer } = await import('./helpers/quiz');
    for (let i = 0; i < 4; i += 1) {
      const served = await serveNext(created.body.sessionId);
      await submitAnswer(created.body.sessionId, {
        position: served.body.position,
        questionVersionId: served.body.question.id,
        response: await responseFor(ctx.db, served.body.question, true),
      });
    }
    for (let i = 0; i < 6; i += 1) {
      await serveNext(created.body.sessionId);
      clock.advanceMs(25_000);
    }

    const completed = await complete(created.body.sessionId);
    expect(completed.body.isQualifying).toBe(false);
    expect(completed.body.recommendationCompleted).toBe(false);

    const { findRecommendationById } = await import('@learnarena/db');
    const record = await findRecommendationById(ctx.db, recommendation.body.recommendationId);
    expect(record?.status).toBe('AVAILABLE');
  });

  // §24: "expired recommendation falls back to WEAK/NONE".
  it('falls back when the recommendation expired before the session finished', async () => {
    await signUpFresh('bonus_expired');
    const recommendation = await getRecommendation();

    const created = await createSession(
      recommendation.body.categorySlug,
      recommendation.body.recommendationId,
    );
    await playAllQuestions(ctx.db, created.body.sessionId);

    // Expire it out from under the session, as a day rollover would.
    const { expirePastRecommendations } = await import('@learnarena/db');
    await expirePastRecommendations(ctx.db, currentUserId, '2026-12-31', clock.now());

    const completed = await complete(created.body.sessionId);

    expect(completed.body.recommendationCompleted).toBe(false);
    const breakdown = completed.body.pointsBreakdown as PointsBreakdown;
    // The snapshot said the category was weak, so it falls back to WEAK.
    expect(breakdown.multipliers.weakness).toBe(1.25);
  });

  it('ignores a recommendationId belonging to someone else', async () => {
    await signUpFresh('bonus_other_owner');
    const theirs = await getRecommendation();

    await signUpFresh('bonus_mine');
    const created = await createSession('math', theirs.body.recommendationId);

    const session = await ctx.db.query.gameSessions.findFirst({
      where: (table, { eq: equals }) => equals(table.id, created.body.sessionId),
    });
    expect(session?.weaknessTier).not.toBe('RECOMMENDED');
    expect(session?.recommendationId).toBeNull();
  });

  it('ignores a recommendationId for a different category', async () => {
    await signUpFresh('bonus_wrong_category');
    const recommendation = await getRecommendation();
    const other = recommendation.body.categorySlug === 'math' ? 'science' : 'math';

    const created = await createSession(other, recommendation.body.recommendationId);

    const session = await ctx.db.query.gameSessions.findFirst({
      where: (table, { eq: equals }) => equals(table.id, created.body.sessionId),
    });
    expect(session?.weaknessTier).not.toBe('RECOMMENDED');
  });
});

// ---------------------------------------------------------------------------
// GET /api/me/skills (§16.2, §20 screen 7)
// ---------------------------------------------------------------------------

describe('GET /api/me/skills (§11.4)', () => {
  it('reports three launch categories at the starting rating for a new learner', async () => {
    await signUpFresh('skills_new');
    const result = await getSkills();

    expect(result.status).toBe(200);
    expect(result.body.categories.map((c) => c.categorySlug)).toEqual(['logic', 'math', 'science']);
    for (const category of result.body.categories) {
      expect(category.rating).toBe(1000);
      expect(category.proficiency).toBe(50);
      expect(category.confidence).toBe(0);
      expect(category.weaknessScore).toBeCloseTo(0.5, 10);
      expect(category.neverPlayed).toBe(true);
    }
  });

  it('lists every never-played category as a weakness and no strengths', async () => {
    await signUpFresh('skills_weak');
    const result = await getSkills();

    expect([...result.body.weaknesses].sort()).toEqual(['logic', 'math', 'science']);
    expect(result.body.strengths).toEqual([]);
  });

  it('reflects a played category after the Coach job runs', async () => {
    await signUpFresh('skills_played');
    await playCompleteAndProcess('math');

    const result = await getSkills();
    const math = result.body.categories.find((c) => c.categorySlug === 'math')!;

    expect(math.rating).toBeGreaterThan(1000);
    expect(math.exposureCount).toBe(10);
    expect(math.lifetimeEventCount).toBe(10);
    expect(math.neverPlayed).toBe(false);
    expect(math.recencyDays).toBe(0);
  });

  it('does not create a recommendation as a side effect', async () => {
    await signUpFresh('skills_no_side_effect');
    await getSkills();

    const { listRecommendations } = await import('@learnarena/db');
    expect(await listRecommendations(ctx.db, currentUserId)).toHaveLength(0);
  });

  it('marks the recommended category once one exists', async () => {
    await signUpFresh('skills_tier');
    const recommendation = await getRecommendation();

    const result = await getSkills();
    const recommended = result.body.categories.find(
      (c) => c.categorySlug === recommendation.body.categorySlug,
    )!;

    expect(recommended.tier).toBe('RECOMMENDED');
    expect(result.body.recommendedCategorySlug).toBe(recommendation.body.categorySlug);
  });

  it('requires onboarding', async () => {
    ctx.signInAs(uuidv7());
    expect((await getSkills()).code).toBe('ONBOARDING_REQUIRED');
  });
});

// ---------------------------------------------------------------------------
// Skill deltas on the results screen (§20 screen 6)
// ---------------------------------------------------------------------------

describe('skill deltas (§20 screen 6)', () => {
  const sessionState = async (sessionId: string) =>
    readResponse<SessionStateResponse>(
      await sessionRoute(jsonRequest(`/api/sessions/${sessionId}`), withId(sessionId)),
    );

  it('is null before the Coach job runs — the pending state', async () => {
    await signUpFresh('delta_pending');
    const created = await createSession('math');
    await playAllQuestions(ctx.db, created.body.sessionId);
    await complete(created.body.sessionId);

    const state = await sessionState(created.body.sessionId);
    expect(state.body.skillDeltas).toBeNull();
  });

  it('is populated once the Coach job has run', async () => {
    await signUpFresh('delta_ready');
    const { sessionId } = await playCompleteAndProcess('math');

    const state = await sessionState(sessionId);
    const deltas = state.body.skillDeltas!;

    expect(deltas).toHaveLength(1);
    expect(deltas[0]).toMatchObject({
      categorySlug: 'math',
      eventCount: 10,
    });
    expect(deltas[0]!.ratingBefore).toBe(1000);
    expect(deltas[0]!.delta).toBeCloseTo(deltas[0]!.ratingAfter - deltas[0]!.ratingBefore, 6);
    expect(deltas[0]!.proficiencyAfter).toBeGreaterThan(deltas[0]!.proficiencyBefore);
  });
});

// ---------------------------------------------------------------------------
// The improvement bonus end to end (§11.7)
// ---------------------------------------------------------------------------

describe('the improvement bonus (§11.7)', () => {
  it('is not granted before three prior qualifying sessions', async () => {
    await signUpFresh('improve_too_few');

    for (let i = 0; i < 2; i += 1) {
      const { completed } = await playCompleteAndProcess('math');
      const result = completed.body as { weakness: { improvementBonus: number } };
      expect(result.weakness.improvementBonus).toBe(0);
    }
  });

  it('is granted when accuracy beats the baseline by 0.10 or more', async () => {
    await signUpFresh('improve_granted');

    // Three weak sessions: 40% each.
    for (let i = 0; i < 3; i += 1) {
      const created = await createSession('math');
      await playAllQuestions(ctx.db, created.body.sessionId, {
        correctPositions: (position) => position < 4,
      });
      await complete(created.body.sessionId);
      await runProcessSession(created.body.sessionId, currentUserId, clock.now());
      clock.advanceMs(60_000);
    }

    // Then a perfect one.
    const created = await createSession('math');
    await playAllQuestions(ctx.db, created.body.sessionId);
    const completed = await complete(created.body.sessionId);

    const result = completed.body as {
      weakness: { improvementBonus: number; improvementBaseline: number | null };
    };
    expect(result.weakness.improvementBaseline).toBeCloseTo(0.4, 6);
    expect(result.weakness.improvementBonus).toBe(0.25);

    // And it lands in the multiplier. The tier is NONE by this point, not
    // WEAK: after three recent sessions math has plenty of exposure and zero
    // staleness, so its weakness score has fallen below the 0.40 threshold.
    // §10.1 composes `tier_mult + improvement_bonus` = 1.00 + 0.25.
    const breakdown = completed.body.pointsBreakdown as PointsBreakdown;
    const weakness = completed.body as { weakness: { resolvedTier: string } };
    expect(weakness.weakness.resolvedTier).toBe('NONE');
    expect(breakdown.multipliers.weakness).toBeCloseTo(1.25, 10);
  });

  it('is not granted when the session merely matches the baseline', async () => {
    await signUpFresh('improve_flat');

    for (let i = 0; i < 4; i += 1) {
      const created = await createSession('math');
      await playAllQuestions(ctx.db, created.body.sessionId, {
        correctPositions: (position) => position < 5,
      });
      const completed = await complete(created.body.sessionId);
      await runProcessSession(created.body.sessionId, currentUserId, clock.now());
      clock.advanceMs(60_000);

      if (i === 3) {
        const result = completed.body as { weakness: { improvementBonus: number } };
        expect(result.weakness.improvementBonus).toBe(0);
      }
    }
  });
});
