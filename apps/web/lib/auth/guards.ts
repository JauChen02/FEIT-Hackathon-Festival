import 'server-only';
import { AppError } from '@learnarena/core';
import { findUserById, type UserRecord } from '@learnarena/db';
import { db } from '../db';
import { requireSessionUser, type SessionUser } from './session';

/**
 * Authorization guards (PLANNING.md §19.1: "Authentication required for all
 * gameplay and user data routes").
 */

export interface OnboardedContext {
  session: SessionUser;
  user: UserRecord;
}

/**
 * Require a signed-in user who has completed onboarding.
 *
 * ADR-022: a `users` row exists only once onboarding completes, so its absence
 * *is* the incomplete state. Gameplay routes get `403 ONBOARDING_REQUIRED`
 * (§16.1), which the client turns into a redirect to `/onboarding`.
 */
export async function requireOnboarded(request: Request): Promise<OnboardedContext> {
  const session = await requireSessionUser(request);
  const user = await findUserById(db(), session.id);

  if (!user || user.onboardingCompletedAt === null) {
    throw new AppError('ONBOARDING_REQUIRED');
  }
  return { session, user };
}

/**
 * Look up the current user without requiring onboarding.
 *
 * `GET /api/me` uses this: §16.2 has it report onboarding state, so it must be
 * callable before there is a row.
 */
export async function loadOptionalUser(
  request: Request,
): Promise<{ session: SessionUser; user: UserRecord | undefined }> {
  const session = await requireSessionUser(request);
  return { session, user: await findUserById(db(), session.id) };
}
