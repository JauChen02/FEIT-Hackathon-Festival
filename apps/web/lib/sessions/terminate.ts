import 'server-only';
import { AppError, type SessionStatus } from '@learnarena/core';
import { transitionSession, type SessionRecord } from '@learnarena/db';
import { db } from '../db';
import { logger } from '../logger';
import { sendSessionTerminal } from '../inngest/events';
import { releaseRecommendation } from './releaseRecommendation';

/**
 * Abandon and cancel (PLANNING.md §8.2, §15.1).
 *
 * | Situation | Rule |
 * |---|---|
 * | User taps *Abandon* | `ACTIVE → ABANDONED`. Answers and their learning
 *   events are kept and **do** update skill ratings. No points, no completion
 *   bonus, no streak credit, no recommendation credit. |
 * | User cancels before the first question is served | `CREATED → CANCELLED`.
 *   No effects. |
 *
 * Neither writes points: §10.4 awards them only on a transition to COMPLETED.
 */

export interface TerminateResult {
  status: SessionStatus;
  /** False when the session was already in the target state (idempotent call). */
  changed: boolean;
}

/** §16.2: "POST /api/sessions/:id/abandon — idempotent if already ABANDONED". */
export async function abandonSession(session: SessionRecord, at: Date): Promise<TerminateResult> {
  if (session.status === 'ABANDONED') {
    return { status: 'ABANDONED', changed: false };
  }
  if (session.status === 'COMPLETED') {
    throw new AppError('SESSION_ALREADY_COMPLETED');
  }
  if (session.status !== 'ACTIVE') {
    // §15.1 has no CREATED → ABANDONED edge. A session with nothing served is
    // cancelled instead, which is why ACTIVE_SESSION_EXISTS reports the status
    // — the client needs it to choose the right call (ADR-041).
    throw new AppError('INVALID_SESSION_STATE', {
      message:
        session.status === 'CREATED'
          ? 'Nothing has been played yet — cancel this session instead.'
          : 'This session is no longer in progress.',
      details: { status: session.status },
    });
  }

  return finish(session, 'ACTIVE', 'ABANDONED', at, 'session.abandoned');
}

/** §16.2: "POST /api/sessions/:id/cancel — only from CREATED". */
export async function cancelSession(session: SessionRecord, at: Date): Promise<TerminateResult> {
  if (session.status === 'CANCELLED') {
    return { status: 'CANCELLED', changed: false };
  }
  if (session.status === 'COMPLETED') {
    throw new AppError('SESSION_ALREADY_COMPLETED');
  }
  if (session.status !== 'CREATED') {
    throw new AppError('INVALID_SESSION_STATE', {
      message:
        session.status === 'ACTIVE'
          ? 'This session has already started — abandon it instead.'
          : 'This session is no longer in progress.',
      details: { status: session.status },
    });
  }

  return finish(session, 'CREATED', 'CANCELLED', at, 'session.cancelled');
}

async function finish(
  session: SessionRecord,
  from: SessionStatus,
  to: SessionStatus,
  at: Date,
  logEvent: string,
): Promise<TerminateResult> {
  const moved = await transitionSession(db(), session.id, from, to, {
    endedAt: at,
    lastActivityAt: at,
  });

  if (!moved) {
    // Another request got there first; report the state without claiming the
    // change, and skip the duplicate event.
    return { status: to, changed: false };
  }

  logger.info({ session_id: session.id, user_id: session.ownerId }, logEvent);

  // §18.3 names COMPLETED, ABANDONED and EXPIRED. CANCELLED is included too:
  // without it the session keeps `post_processed_at IS NULL` forever and
  // sessions/reconcile re-sends for it every hour (ADR-042).
  // §11.5: "Abandoning does not consume it." Give the recommendation back
  // so the learner can still earn today's bonus.
  await releaseRecommendation(session);
  await sendSessionTerminal(session.id, session.ownerId);

  return { status: to, changed: true };
}
