/**
 * The Phase 1 background jobs (PLANNING.md §15.1, §18.3).
 *
 * Acceptance criteria covered:
 *   - "expiry sweep moves stale sessions to EXPIRED"
 *   - "reconcile re-sends missing post-processing events"
 *
 * The job bodies are plain exported functions, so these run against a real
 * database without needing an Inngest dev server (§22.2).
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import {
  FixedClock,
  RECONCILE_GRACE_MS,
  SESSION_INACTIVITY_TIMEOUT_MS,
  uuidv7,
} from '@learnarena/core';
import { answers, gameSessions, learningEvents } from '@learnarena/db/schema';
import { POST as onboardingRoute } from '@/app/api/me/onboarding/route';
import { runExpireStaleSessions, runReconcileSessions } from '@/lib/inngest/functions/sessionJobs';
// Phase 3 replaced `sessions/mark-post-processed` with the Coach job, which
// stamps `post_processed_at` itself (ADR-043, ADR-051).
import { runProcessSession } from '@/lib/inngest/functions/coachJobs';
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
import { complete, createSession, playAllQuestions, serveNext } from './helpers/quiz';

let ctx: WebTestContext;
let clock: FixedClock;
let restoreClock: () => void;
let restoreTransport: () => void;
let terminalEvents: string[];
let currentUserId: string;

const START = '2026-09-29T12:00:00.000Z';

async function signUpFresh(username: string): Promise<void> {
  currentUserId = uuidv7();
  ctx.signInAs(currentUserId);
  await onboardingRoute(
    jsonRequest('/api/me/onboarding', { method: 'POST', body: onboardingBody({ username }) }),
  );
}

async function statusOf(sessionId: string): Promise<string | undefined> {
  const row = await ctx.db.query.gameSessions.findFirst({
    where: (table, { eq: equals }) => equals(table.id, sessionId),
  });
  return row?.status;
}

beforeAll(async () => {
  ctx = await createWebTestContext('jobs');
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

// §24: "expiry sweep moves stale sessions to EXPIRED".
describe('sessions/expire-stale (§15.1)', () => {
  it('expires an open session idle for 30 minutes', async () => {
    await signUpFresh('sweep_1');
    const created = await createSession('math');
    await serveNext(created.body.sessionId);

    const later = new Date(new Date(START).getTime() + SESSION_INACTIVITY_TIMEOUT_MS + 1_000);
    const result = await runExpireStaleSessions(later);

    expect(result.expired).toBeGreaterThanOrEqual(1);
    expect(await statusOf(created.body.sessionId)).toBe('EXPIRED');
  });

  it('expires a CREATED session that was never played', async () => {
    await signUpFresh('sweep_created');
    const created = await createSession('math');

    const later = new Date(new Date(START).getTime() + SESSION_INACTIVITY_TIMEOUT_MS + 1_000);
    await runExpireStaleSessions(later);

    expect(await statusOf(created.body.sessionId)).toBe('EXPIRED');
  });

  it('leaves a session that is still inside the window alone', async () => {
    await signUpFresh('sweep_fresh');
    const created = await createSession('math');
    await serveNext(created.body.sessionId);

    const soon = new Date(new Date(START).getTime() + SESSION_INACTIVITY_TIMEOUT_MS - 1_000);
    await runExpireStaleSessions(soon);

    expect(await statusOf(created.body.sessionId)).toBe('ACTIVE');
  });

  it('never touches a session that already reached a terminal state', async () => {
    await signUpFresh('sweep_terminal');
    const created = await createSession('math');
    await playAllQuestions(ctx.db, created.body.sessionId);
    await complete(created.body.sessionId);

    const later = new Date(new Date(START).getTime() + 86_400_000);
    await runExpireStaleSessions(later);

    expect(await statusOf(created.body.sessionId)).toBe('COMPLETED');
  });

  it('creates no learning events for served-but-unanswered questions (§8.2)', async () => {
    await signUpFresh('sweep_no_events');
    const created = await createSession('math');
    await serveNext(created.body.sessionId);

    const later = new Date(new Date(START).getTime() + SESSION_INACTIVITY_TIMEOUT_MS + 1_000);
    await runExpireStaleSessions(later);

    const answerRows = await ctx.db
      .select()
      .from(answers)
      .where(eq(answers.sessionId, created.body.sessionId));
    const eventRows = await ctx.db
      .select()
      .from(learningEvents)
      .where(eq(learningEvents.sessionId, created.body.sessionId));

    expect(answerRows).toHaveLength(0);
    expect(eventRows).toHaveLength(0);
  });

  it('sends session/terminal for each session it expires (§18.3)', async () => {
    await signUpFresh('sweep_events');
    const created = await createSession('math');
    await serveNext(created.body.sessionId);

    const later = new Date(new Date(START).getTime() + SESSION_INACTIVITY_TIMEOUT_MS + 1_000);
    await runExpireStaleSessions(later);

    expect(terminalEvents).toContain(created.body.sessionId);
  });

  it('frees the one-open-session slot so the learner can start again (ADR-012)', async () => {
    await signUpFresh('sweep_frees_slot');
    const created = await createSession('math');
    await serveNext(created.body.sessionId);

    // Blocked while the old session is open.
    expect((await createSession('logic')).code).toBe('ACTIVE_SESSION_EXISTS');

    clock.advanceMs(SESSION_INACTIVITY_TIMEOUT_MS + 1_000);
    await runExpireStaleSessions(clock.now());

    const second = await createSession('logic');
    expect(second.status).toBe(200);
  });

  it('is a no-op when nothing is stale', async () => {
    const result = await runExpireStaleSessions(new Date(START));
    expect(result.expired).toBe(0);
  });
});

// §24: "reconcile re-sends missing post-processing events".
describe('sessions/reconcile (§18.3)', () => {
  it('re-sends for a terminal session still unprocessed after 10 minutes', async () => {
    await signUpFresh('reconcile_1');
    const created = await createSession('math');
    await playAllQuestions(ctx.db, created.body.sessionId);
    await complete(created.body.sessionId);

    // Simulate the §23.4 failure mode: the post-commit send never landed, so
    // nothing marked the session processed.
    terminalEvents = [];

    const later = new Date(new Date(START).getTime() + RECONCILE_GRACE_MS + 1_000);
    const result = await runReconcileSessions(later);

    expect(result.resent).toBeGreaterThanOrEqual(1);
    expect(terminalEvents).toContain(created.body.sessionId);
  });

  it('leaves a session alone inside the 10-minute grace window', async () => {
    await signUpFresh('reconcile_grace');
    const created = await createSession('math');
    await playAllQuestions(ctx.db, created.body.sessionId);
    await complete(created.body.sessionId);
    terminalEvents = [];

    const soon = new Date(new Date(START).getTime() + RECONCILE_GRACE_MS - 1_000);
    await runReconcileSessions(soon);

    expect(terminalEvents).not.toContain(created.body.sessionId);
  });

  it('stops re-sending once the session is marked processed', async () => {
    await signUpFresh('reconcile_marked');
    const created = await createSession('math');
    await playAllQuestions(ctx.db, created.body.sessionId);
    await complete(created.body.sessionId);

    // This is what the session/terminal consumer does.
    await runProcessSession(created.body.sessionId, currentUserId, clock.now());
    terminalEvents = [];

    const later = new Date(new Date(START).getTime() + RECONCILE_GRACE_MS + 1_000);
    await runReconcileSessions(later);

    expect(terminalEvents).not.toContain(created.body.sessionId);
  });

  it('covers abandoned, expired and cancelled sessions too (ADR-042)', async () => {
    // Without this, a cancelled session keeps post_processed_at NULL forever
    // and reconcile chases it every hour.
    await signUpFresh('reconcile_cancelled');
    const created = await createSession('math');
    const { POST: cancelRoute } = await import('@/app/api/sessions/[id]/cancel/route');
    const { withId } = await import('./helpers/quiz');
    await cancelRoute(
      jsonRequest(`/api/sessions/${created.body.sessionId}/cancel`, { method: 'POST' }),
      withId(created.body.sessionId),
    );
    terminalEvents = [];

    const later = new Date(new Date(START).getTime() + RECONCILE_GRACE_MS + 1_000);
    await runReconcileSessions(later);
    expect(terminalEvents).toContain(created.body.sessionId);

    // And once marked, it stops.
    await runProcessSession(created.body.sessionId, currentUserId, later);
    terminalEvents = [];
    await runReconcileSessions(later);
    expect(terminalEvents).not.toContain(created.body.sessionId);
  });
});

describe('coach/process-session stamps post_processed_at (ADR-051)', () => {
  it('stamps post_processed_at', async () => {
    await signUpFresh('mark_1');
    const created = await createSession('math');
    await playAllQuestions(ctx.db, created.body.sessionId);
    await complete(created.body.sessionId);

    await runProcessSession(created.body.sessionId, currentUserId, clock.now());

    const row = await ctx.db.query.gameSessions.findFirst({
      where: (table, { eq: equals }) => equals(table.id, created.body.sessionId),
    });
    expect(row?.postProcessedAt).not.toBeNull();
  });

  it('is idempotent and keeps the first timestamp', async () => {
    await signUpFresh('mark_idem');
    const created = await createSession('math');
    await playAllQuestions(ctx.db, created.body.sessionId);
    await complete(created.body.sessionId);

    const first = clock.now();
    await runProcessSession(created.body.sessionId, currentUserId, first);
    await runProcessSession(
      created.body.sessionId,
      currentUserId,
      new Date(first.getTime() + 60_000),
    );

    const row = await ctx.db.query.gameSessions.findFirst({
      where: (table, { eq: equals }) => equals(table.id, created.body.sessionId),
    });
    expect(row?.postProcessedAt?.toISOString()).toBe(first.toISOString());
  });
});

describe('a failing event transport (§23.4)', () => {
  it('does not fail the request that triggered it', async () => {
    // "Inngest send fails after commit → sessions/reconcile re-sends within an
    // hour." The award is already durable; losing the response would be worse.
    restoreTransport();
    restoreTransport = setEventTransport(async () => {
      throw new Error('inngest unavailable');
    });

    await signUpFresh('transport_fails');
    const created = await createSession('math');
    await playAllQuestions(ctx.db, created.body.sessionId);

    const completed = await complete(created.body.sessionId);

    expect(completed.status).toBe(200);
    expect(completed.body.finalPoints).toBeGreaterThan(0);

    // The session is committed and will be picked up by reconcile.
    const row = await ctx.db.query.gameSessions.findFirst({
      where: (table, { eq: equals }) => equals(table.id, created.body.sessionId),
    });
    expect(row?.status).toBe('COMPLETED');
    expect(row?.postProcessedAt).toBeNull();
  });
});

describe('lazy expiry on access (§15.1)', () => {
  it('expires a stale session the moment it is touched, before the sweep runs', async () => {
    await signUpFresh('lazy_expiry');
    const created = await createSession('math');
    await serveNext(created.body.sessionId);

    clock.advanceMs(SESSION_INACTIVITY_TIMEOUT_MS + 1_000);

    const served = await serveNext(created.body.sessionId);
    expect(served.status).toBe(409);
    expect(served.code).toBe('INVALID_SESSION_STATE');
    expect(await statusOf(created.body.sessionId)).toBe('EXPIRED');
  });

  it('awards no points for an expired session (§10.4)', async () => {
    await signUpFresh('lazy_expiry_points');
    const created = await createSession('math');
    await playAllQuestions(ctx.db, created.body.sessionId);

    clock.advanceMs(SESSION_INACTIVITY_TIMEOUT_MS + 1_000);

    const completed = await complete(created.body.sessionId);
    expect(completed.status).toBe(409);
    expect(completed.code).toBe('INVALID_SESSION_STATE');

    const rows = await ctx.db
      .select()
      .from(gameSessions)
      .where(eq(gameSessions.id, created.body.sessionId));
    expect(rows[0]?.status).toBe('EXPIRED');
  });
});
