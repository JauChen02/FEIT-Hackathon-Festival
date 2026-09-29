import { localDateFor, profileUpdateSchema, weekKeyUtc } from '@learnarena/core';
import { updateProfile, weeklyPoints } from '@learnarena/db';
import { requireOnboarded } from '@/lib/auth/guards';
import { db } from '@/lib/db';
import { now } from '@/lib/sessions/context';
import { readStreakState } from '@/lib/streaks/readState';
import type { MeResponse } from '@learnarena/core';
import { loadOptionalUser } from '@/lib/auth/guards';
import { ok, route } from '@/lib/api/handler';

export const dynamic = 'force-dynamic';

/**
 * GET /api/me (PLANNING.md §16.2).
 *
 * Returns "profile, onboarding state, streak display state, total points,
 * weekly points". It is reachable *before* onboarding, because reporting that
 * state is one of its jobs — the client uses it to decide where to send the
 * user (ADR-022).
 *
 * Email is never included (§19.4: data minimisation).
 *
 * Streak and weekly points are placeholders in Phase 0; Phases 1 and 2 fill
 * them from the point ledger and streak_days respectively.
 */
export const GET = route({ name: 'GET /api/me' }, async ({ request, requestId }) => {
  const { user } = await loadOptionalUser(request);

  if (!user) {
    return ok({ onboarded: false } satisfies MeResponse, requestId);
  }

  return ok(
    {
      onboarded: true,
      profile: {
        userId: user.id,
        username: user.username,
        displayName: user.displayName,
        timezone: user.timezone,
        totalPoints: user.totalPointsCached,
        onboardingCompletedAt: user.onboardingCompletedAt!.toISOString(),
      },
      streak: await readStreakState(db(), user.id, localDateFor(user.timezone, now(request))),
      weeklyPoints: await weeklyPoints(db(), weekKeyUtc(now(request)), user.id),
    } satisfies MeResponse,
    requestId,
  );
});

export const PATCH = route(
  { name: 'PATCH /api/me', schema: profileUpdateSchema },
  async ({ request, body, requestId }) => {
    const { user } = await requireOnboarded(request);
    const profile = await db().transaction((tx) => updateProfile(tx, user.id, body, now(request)));
    return ok({ displayName: profile!.displayName, timezone: profile!.timezone }, requestId);
  },
);
