import { AppError, onboardingRequestSchema, systemClock, type UserProfile } from '@learnarena/core';
import { findUserById, insertOnboardedUser, isUniqueViolation } from '@learnarena/db';
import { requireSessionUser } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { ok, route } from '@/lib/api/handler';

export const dynamic = 'force-dynamic';

/**
 * POST /api/me/onboarding (PLANNING.md §16.2, §20 screen 2).
 *
 * `{username, displayName, timezone, ageConfirmed:true}` → the created profile.
 * §16.2 marks this endpoint **idempotent**, which here means:
 *
 *   - the insert is `ON CONFLICT (id) DO NOTHING`, so a retry writes nothing;
 *   - the row is then read back, so a retry (or a concurrent request that won
 *     the race) returns the same body with `200`;
 *   - a body that differs from the stored profile is *not* applied. The stored
 *     profile is returned unchanged (ADR-023); edits belong to
 *     `PATCH /api/me`, which arrives in Phase 2 with the timezone cooldown
 *     (ADR-024).
 *
 * A duplicate username is a genuine conflict and surfaces as `409
 * USERNAME_TAKEN`. That decision is made by the database's unique index rather
 * than a prior SELECT, so two simultaneous signups cannot both succeed.
 */
export const POST = route(
  { name: 'POST /api/me/onboarding', schema: onboardingRequestSchema },
  async ({ request, requestId, body, log }) => {
    const session = await requireSessionUser(request);

    const existing = await findUserById(db(), session.id);
    if (existing) {
      log.info({ user_id: session.id }, 'onboarding replay — profile already exists');
      return ok({ profile: toProfile(existing), created: false }, requestId);
    }

    try {
      await insertOnboardedUser(db(), {
        id: session.id,
        username: body.username,
        displayName: body.displayName,
        timezone: body.timezone,
        now: systemClock.now(),
      });
    } catch (error) {
      if (isUniqueViolation(error, 'users_username_unique')) {
        throw new AppError('USERNAME_TAKEN', { details: { field: 'username' } });
      }
      throw error;
    }

    // Read back rather than trusting the insert: a concurrent request for the
    // same auth id may have won, and its values are the ones that count.
    const user = await findUserById(db(), session.id);
    if (!user) {
      throw new AppError('INTERNAL_ERROR', {
        message: 'Onboarding completed but the profile could not be read back.',
      });
    }

    log.info({ user_id: user.id }, 'onboarding completed');
    return ok({ profile: toProfile(user), created: true }, requestId);
  },
);

function toProfile(user: {
  id: string;
  username: string;
  displayName: string;
  timezone: string;
  totalPointsCached: number;
  onboardingCompletedAt: Date | null;
}): UserProfile {
  return {
    userId: user.id,
    username: user.username,
    displayName: user.displayName,
    timezone: user.timezone,
    totalPoints: user.totalPointsCached,
    onboardingCompletedAt: (user.onboardingCompletedAt ?? new Date(0)).toISOString(),
  };
}
