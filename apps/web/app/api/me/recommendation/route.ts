import { requireOnboarded } from '@/lib/auth/guards';
import { ok, route } from '@/lib/api/handler';
import { now } from '@/lib/sessions/context';
import { getOrCreateRecommendation, toRecommendationResponse } from '@/lib/coach/recommendation';

export const dynamic = 'force-dynamic';

/**
 * GET /api/me/recommendation (PLANNING.md §16.2, §11.5).
 *
 * "today's recommendation (lazily created); idempotent."
 *
 * Idempotent in the strong sense: the first call of a local date generates the
 * row, every later call that day returns the same one, and concurrent first
 * calls collapse onto a single row via `UNIQUE(user_id, local_date)`.
 */
export const GET = route({ name: 'GET /api/me/recommendation' }, async ({ request, requestId }) => {
  const { user } = await requireOnboarded(request);
  const context = await getOrCreateRecommendation(user, now());

  return ok(toRecommendationResponse(context), requestId);
});
