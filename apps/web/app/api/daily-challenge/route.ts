import { localDateFor, type DailyChallengeResponse } from '@learnarena/core';
import { findDailyChallenge, hasDailyBonus } from '@learnarena/db';
import { requireOnboarded } from '@/lib/auth/guards';
import { ok, route } from '@/lib/api/handler';
import { db } from '@/lib/db';
import { now } from '@/lib/sessions/context';
export const GET = route({ name: 'GET /api/daily-challenge' }, async ({ request, requestId }) => {
  const { user } = await requireOnboarded(request);
  const date = localDateFor(user.timezone, now(request));
  const challenge = await findDailyChallenge(db(), date);
  return ok(
    {
      challenge:
        challenge && challenge.questions.length === 10
          ? {
              id: challenge.id,
              date,
              categorySlug: challenge.questions[0]!.categorySlug,
              questionCount: 10,
              bonusAvailable: !(await hasDailyBonus(db(), date, user.id)),
            }
          : null,
    } satisfies DailyChallengeResponse,
    requestId,
  );
});
