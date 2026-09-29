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
      streak: null,
      weeklyPoints: 0,
    } satisfies MeResponse,
    requestId,
  );
});
