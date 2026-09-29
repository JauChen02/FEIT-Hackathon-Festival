import 'server-only';
import { AppError, systemClock, type Clock } from '@learnarena/core';
import { findSessionById, type SessionRecord, type UserRecord } from '@learnarena/db';
import { requireOnboarded } from '../auth/guards';
import { db } from '../db';
import { applyLazyExpiry } from './expiry';

/**
 * Shared entry point for every `/api/sessions/:id/*` route.
 *
 * Does the three things each of them needs, in the order §16 and §15.1
 * require: authenticate and require onboarding, resolve the session with an
 * ownership check, then apply lazy expiry before anyone looks at the status.
 */

/**
 * The clock the session routes read.
 *
 * §22.5 forbids depending on wall-clock time in tests, and §5.13 makes server
 * time canonical, so every timestamp in this phase comes from here and tests
 * swap in a `FixedClock`.
 */
let clock: Clock = systemClock;

export function setSessionClock(next: Clock): () => void {
  const previous = clock;
  clock = next;
  return () => {
    clock = previous;
  };
}

export function sessionClock(): Clock {
  return clock;
}

export function now(): Date {
  return clock.now();
}

export interface SessionContext {
  user: UserRecord;
  session: SessionRecord;
  now: Date;
}

/**
 * Load a session the caller is allowed to act on.
 *
 * A session owned by someone else returns `404 SESSION_NOT_FOUND`, not `403`:
 * §16.1 defines 404 as "missing **or not visible to user**", so we do not
 * confirm that an id exists to someone who cannot see it.
 */
export async function loadSessionContext(
  request: Request,
  sessionId: string,
): Promise<SessionContext> {
  const { user } = await requireOnboarded(request);
  const at = now();

  const found = await findSessionById(db(), sessionId);
  if (!found || found.ownerId !== user.id) {
    throw new AppError('SESSION_NOT_FOUND');
  }

  // §15.1: "Expiry is applied lazily on any access."
  const session = await applyLazyExpiry(found, at);

  return { user, session, now: at };
}
