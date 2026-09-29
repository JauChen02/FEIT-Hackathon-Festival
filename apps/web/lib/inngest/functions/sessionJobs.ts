import 'server-only';
import { RECONCILE_GRACE_MS, SESSION_INACTIVITY_TIMEOUT_MS, systemClock } from '@learnarena/core';
import {
  listStaleOpenSessions,
  listUnprocessedTerminalSessions,
  markPostProcessed,
  transitionSession,
} from '@learnarena/db';
import { db } from '../../db';
import { logger } from '../../logger';
import { sendSessionTerminal } from '../events';
import { SESSION_TERMINAL_EVENT, inngest, type SessionTerminalEvent } from '../client';

/**
 * Session background jobs (PLANNING.md §15.1, §18.3).
 *
 * Each job body is an exported plain function so the integration tests can
 * call it directly against a real database, without an Inngest dev server
 * (§22.2). The `createFunction` wrappers below add only scheduling and retries.
 */

// ---------------------------------------------------------------------------
// sessions/expire-stale
// ---------------------------------------------------------------------------

/**
 * §15.1: "Expiry is applied lazily on any access **and by an hourly
 * `sessions/expire-stale` sweep**."
 *
 * The sweep exists for sessions nobody comes back to: without it an abandoned
 * tab would hold the user's one open-solo-session slot forever (ADR-012).
 */
export async function runExpireStaleSessions(at: Date = systemClock.now()): Promise<{
  scanned: number;
  expired: number;
}> {
  const cutoff = new Date(at.getTime() - SESSION_INACTIVITY_TIMEOUT_MS);
  const stale = await listStaleOpenSessions(db(), cutoff);

  let expired = 0;
  for (const session of stale) {
    const moved = await transitionSession(db(), session.id, session.status, 'EXPIRED', {
      endedAt: at,
    });
    if (!moved) continue; // a request expired it first

    expired += 1;
    logger.info({ session_id: session.id, from: session.status }, 'session.expired_by_sweep');
    // §8.2: served-but-unanswered questions produce no learning event on
    // expiry, so there is nothing to resolve — only the event to fan out.
    await sendSessionTerminal(session.id);
  }

  return { scanned: stale.length, expired };
}

export const expireStaleSessions = inngest.createFunction(
  {
    id: 'sessions-expire-stale',
    name: 'sessions/expire-stale',
    triggers: [{ cron: '0 * * * *' }],
  },
  async ({ step }) => step.run('expire', () => runExpireStaleSessions()),
);

// ---------------------------------------------------------------------------
// sessions/reconcile
// ---------------------------------------------------------------------------

/**
 * §18.3: "the hourly `sessions/reconcile` job finds terminal sessions with
 * `post_processed_at IS NULL` older than 10 minutes and re-sends
 * `session/terminal`. This covers a failed send after commit."
 *
 * Re-sending is safe because the event id is deterministic (§18.1): a delivery
 * that did land is deduplicated rather than processed twice.
 */
export async function runReconcileSessions(at: Date = systemClock.now()): Promise<{
  resent: number;
}> {
  const cutoff = new Date(at.getTime() - RECONCILE_GRACE_MS);
  const pending = await listUnprocessedTerminalSessions(db(), cutoff);

  for (const session of pending) {
    logger.warn({ session_id: session.id }, 'session.post_processing_missing — re-sending');
    await sendSessionTerminal(session.id);
  }

  return { resent: pending.length };
}

export const reconcileSessions = inngest.createFunction(
  {
    id: 'sessions-reconcile',
    name: 'sessions/reconcile',
    // Offset from the expiry sweep so a session expired on the hour is not
    // immediately chased by a reconcile in the same minute.
    triggers: [{ cron: '30 * * * *' }],
  },
  async ({ step }) => step.run('reconcile', () => runReconcileSessions()),
);

// ---------------------------------------------------------------------------
// sessions/mark-post-processed
// ---------------------------------------------------------------------------

/**
 * Consumes `session/terminal` and stamps `post_processed_at`.
 *
 * Without a consumer, nothing clears the condition `sessions/reconcile` looks
 * for, and it would re-send for every terminal session every hour, forever.
 * This job does none of the Coach's work — Phase 3's `coach/process-session`
 * is what applies Elo updates (§18.3).
 *
 * Phase 3 can safely re-process anything this marked: its idempotency guard is
 * `skill_updates.learning_event_id UNIQUE` (§18.1), not this column (ADR-043).
 */
export async function runMarkPostProcessed(
  sessionId: string,
  at: Date = systemClock.now(),
): Promise<void> {
  await markPostProcessed(db(), sessionId, at);
  logger.debug({ session_id: sessionId }, 'session.post_processed');
}

export const markSessionPostProcessed = inngest.createFunction(
  {
    id: 'sessions-mark-post-processed',
    name: 'sessions/mark-post-processed',
    retries: 3,
    triggers: [{ event: SESSION_TERMINAL_EVENT }],
  },
  async ({ event, step }) => {
    const { sessionId } = event.data as SessionTerminalEvent['data'];
    return step.run('mark', () => runMarkPostProcessed(sessionId));
  },
);

export const sessionFunctions = [expireStaleSessions, reconcileSessions, markSessionPostProcessed];
