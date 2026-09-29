import {
  proficiency,
  strengths as selectStrengths,
  weakCategories,
  type CategorySkill,
  type RatingHistory,
  type SkillsResponse,
} from '@learnarena/core';
import { findRecommendationForDate, loadRatingHistory } from '@learnarena/db';
import { localDateFor } from '@learnarena/core';
import { requireOnboarded } from '@/lib/auth/guards';
import { ok, route } from '@/lib/api/handler';
import { db } from '@/lib/db';
import { now } from '@/lib/sessions/context';
import { loadCoachSignals } from '@/lib/coach/signals';

export const dynamic = 'force-dynamic';

/**
 * GET /api/me/skills (PLANNING.md §16.2, §20 screen 7).
 *
 * "per-category rating, derived proficiency/confidence/weakness, strengths,
 *  weaknesses."
 *
 * Only `rating` is stored; everything else is computed here, on every read
 * (§11.4, Invariant 5). Reading this endpoint never writes — in particular it
 * does **not** generate a recommendation, so opening the Skills page cannot
 * consume a learner's daily pick.
 */
export const GET = route({ name: 'GET /api/me/skills' }, async ({ request, requestId }) => {
  const { user } = await requireOnboarded(request);
  const at = now();

  const signals = await loadCoachSignals(db(), user.id, at);
  const weak = new Set(weakCategories(signals.derived).map((s) => s.categorySlug));
  const strong = selectStrengths(signals.derived).map((s) => s.categorySlug);

  // Shown only if one already exists for today; never created here.
  const recommendation = await findRecommendationForDate(
    db(),
    user.id,
    localDateFor(user.timezone, at),
  );
  const recommendedSlug = recommendation
    ? (signals.categoryById.get(recommendation.categoryId)?.slug ?? null)
    : null;

  const categories: CategorySkill[] = signals.categories.map((category) => {
    const derived = signals.bySlug.get(category.slug)!;
    return {
      categorySlug: category.slug,
      categoryName: category.name,
      rating: derived.rating,
      proficiency: derived.proficiency,
      confidence: derived.confidence,
      weaknessScore: derived.weaknessScore,
      staleness: derived.staleness,
      exposureCount: derived.exposureCount,
      recencyDays: derived.recencyDays,
      lifetimeEventCount: signals.lifetimeEventCounts.get(category.id) ?? 0,
      neverPlayed: derived.neverPlayed,
      // §11.8: what a session started now would be worth.
      tier:
        category.slug === recommendedSlug && recommendation?.status !== 'COMPLETED'
          ? 'RECOMMENDED'
          : weak.has(category.slug)
            ? 'WEAK'
            : 'NONE',
    };
  });

  // §20 screen 7: per-category rating history, read from the §11.3 audit trail.
  const historyRows = await loadRatingHistory(
    db(),
    user.id,
    signals.categories.map((category) => category.id),
  );

  const histories: RatingHistory[] = signals.categories.map((category) => ({
    categorySlug: category.slug,
    points: historyRows
      .filter((row) => row.categoryId === category.id)
      .map((row) => ({
        at: row.at.toISOString(),
        ratingAfter: row.ratingAfter,
        proficiency: proficiency(row.ratingAfter),
      })),
  }));

  const response: SkillsResponse = {
    categories,
    strengths: strong,
    weaknesses: [...weak],
    recommendedCategorySlug: recommendedSlug,
    histories,
  };

  return ok(response, requestId);
});
