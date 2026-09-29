import 'server-only';
import { RECONCILE_GRACE_MS, SESSION_INACTIVITY_TIMEOUT_MS, systemClock } from '@learnarena/core';
import {
  listStaleOpenSessions,
  listUnprocessedTerminalSessions,
  transitionSession,
} from '@learnarena/db';
import { db } from '../../db';
import { logger } from '../../logger';
import { sendSessionTerminal } from '../events';
import { releaseRecommendation } from '../../sessions/releaseRecommendation';
import { inngest } from '../client';

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
    if (session.mode !== 'SOLO') continue;
    const moved = await transitionSession(db(), session.id, session.status, 'EXPIRED', {
      endedAt: at,
    });
    if (!moved) continue; // a request expired it first

    expired += 1;
    logger.info({ session_id: session.id, from: session.status }, 'session.expired_by_sweep');
    // §11.5: an expired session does not consume today's recommendation.
    await releaseRecommendation(session);
    // §8.2: served-but-unanswered questions produce no learning event on
    // expiry, so there is nothing to resolve — only the event to fan out.
    await sendSessionTerminal(session.id, session.ownerId);
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
    const { sessionPlayers } = await import('@learnarena/db');
    const { eq } = await import('drizzle-orm');
    const players = await db()
      .select()
      .from(sessionPlayers)
      .where(eq(sessionPlayers.sessionId, session.id));
    for (const player of players) await sendSessionTerminal(session.id, player.userId);
    if (!players.length) await sendSessionTerminal(session.id, session.ownerId);
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

/**
 * Phase 1's `sessions/mark-post-processed` lived here. It existed only so the
 * reconcile loop had a terminating condition before the Coach existed
 * (ADR-043); `coach/process-session` now stamps `post_processed_at` itself, so
 * the stub is gone.
 */
export const sessionFunctions = [expireStaleSessions, reconcileSessions];
