import { listLaunchCategories } from '@learnarena/db';
import { requireOnboarded } from '@/lib/auth/guards';
import { db } from '@/lib/db';
import { ok, route } from '@/lib/api/handler';

export const dynamic = 'force-dynamic';

/**
 * GET /api/categories (PLANNING.md §16.2: "launch categories with live-question
 * counts").
 *
 * This is the Phase 0 gameplay route (ADR-027). It carries `requireOnboarded`,
 * so it is what demonstrates the §24 criterion "gameplay routes return
 * ONBOARDING_REQUIRED before onboarding" — the session endpoints that will
 * carry the same guard arrive in Phase 1.
 *
 * Non-launch categories exist as rows (ADR-036) but never appear here.
 */
export const GET = route({ name: 'GET /api/categories' }, async ({ request, requestId }) => {
  await requireOnboarded(request);

  const categories = await listLaunchCategories(db());
  return ok({ categories }, requestId);
});
