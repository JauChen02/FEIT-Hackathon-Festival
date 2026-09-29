import 'server-only';
import { SESSION_INACTIVITY_TIMEOUT_MS, isOpenSessionStatus } from '@learnarena/core';
import { transitionSession, type SessionRecord } from '@learnarena/db';
import { db } from '../db';
import { logger } from '../logger';
import { sendSessionTerminal } from '../inngest/events';

/**
 * Lazy session expiry (PLANNING.md §8.2, §15.1).
 *
 * "No activity for 30 minutes → `ACTIVE → EXPIRED` (or `CREATED → EXPIRED`).
 *  … Expiry is applied lazily on any access and by an hourly
 *  `sessions/expire-stale` sweep."
 *
 * Doing it on access as well as on a sweep means a user who returns after an
 * hour sees the correct state immediately rather than the stale one the sweep
 * has not reached yet.
 */

export function isStale(session: SessionRecord, at: Date): boolean {
  if (!isOpenSessionStatus(session.status)) return false;
  const lastActivity = session.lastActivityAt ?? session.createdAt;
  return at.getTime() - lastActivity.getTime() >= SESSION_INACTIVITY_TIMEOUT_MS;
}

/**
 * Expire a session that has gone idle, returning the up-to-date record.
 *
 * Returns the session unchanged when it is not stale. §8.2: served-but-
 * unanswered questions produce **no** learning event on expiry, so nothing is
 * resolved here — only the status moves.
 */
export async function applyLazyExpiry(session: SessionRecord, at: Date): Promise<SessionRecord> {
  if (!isStale(session, at)) return session;

  const moved = await transitionSession(db(), session.id, session.status, 'EXPIRED', {
    endedAt: at,
  });

  if (!moved) {
    // Another request expired it first; its state is already correct.
    return { ...session, status: 'EXPIRED', endedAt: at };
  }

  logger.info({ session_id: session.id, from: session.status }, 'session.expired');
  await sendSessionTerminal(session.id);

  return { ...session, status: 'EXPIRED', endedAt: at };
}
