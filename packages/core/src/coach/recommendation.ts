/**
 * Choosing the daily recommendation (PLANNING.md §11.5 steps 1-5).
 *
 * Deterministic: the same signals, user and local date always give the same
 * answer, which is what lets `reason_json` explain the choice after the fact
 * and what makes the lazy generation safe to race (§18.1).
 */

import { EXPLORATION_PROBABILITY } from '../domain';
import { targetRatingFor } from '../selection/selectQuestions';
import type { DerivedSignals } from './derived';
import { explorationSeed } from './explorationHash';
import { rankByWeakness, weakCategories } from './weakness';

export interface ChooseRecommendationInput {
  signals: readonly DerivedSignals[];
  userId: string;
  /** The user's local date, `YYYY-MM-DD` (§12.1). */
  localDate: string;
  /** Slug of the game type. MVP is always `quiz_solo` (§11.5 step 3). */
  gameTypeSlug: string;
}

/** The inputs snapshot stored verbatim in `recommendations.reason_json` (§11.5 step 5). */
export interface RecommendationReason {
  localDate: string;
  gameTypeSlug: string;
  /** Every category the Coach considered, with its full derived breakdown. */
  categories: {
    categorySlug: string;
    rating: number;
    proficiency: number;
    confidence: number;
    staleness: number;
    exposureCount: number;
    recencyDays: number | null;
    weaknessScore: number;
  }[];
  /** Slugs the Coach classed as weak (> 0.40), most weak first. */
  weakCategorySlugs: string[];
  /** The top-ranked category before exploration was considered. */
  topCategorySlug: string;
  exploration: {
    /** `hash(user_id, local_date)` mapped to [0,1). */
    r: number;
    probability: number;
    /** True when exploration actually changed the pick. */
    applied: boolean;
    seed: string;
  };
}

export interface RecommendationChoice {
  categorySlug: string;
  gameTypeSlug: string;
  /** `user_rating(category) − 147` (§11.6, ADR-010). */
  targetRating: number;
  reason: RecommendationReason;
}

export function chooseRecommendation(input: ChooseRecommendationInput): RecommendationChoice {
  const { signals, userId, localDate, gameTypeSlug } = input;

  if (signals.length === 0) {
    throw new Error('chooseRecommendation: no launch categories to choose from');
  }

  // Step 1: rank by weakness, ties by slug.
  const ranked = rankByWeakness(signals);
  const top = ranked[0]!;
  const weak = weakCategories(signals);

  // Step 2: exploration. Only meaningful when there is somewhere else to go —
  // §11.5 requires *more than one* category over the threshold, so the
  // alternative is itself a weak category rather than an arbitrary one.
  const seed = explorationSeed(userId, localDate);
  const alternatives = weak.filter((signal) => signal.categorySlug !== top.categorySlug);
  const shouldExplore = seed.r < EXPLORATION_PROBABILITY && alternatives.length > 0;

  const chosen = shouldExplore ? alternatives[seed.pick(alternatives.length)]! : top;

  const reason: RecommendationReason = {
    localDate,
    gameTypeSlug,
    categories: ranked.map((signal) => ({
      categorySlug: signal.categorySlug,
      rating: signal.rating,
      proficiency: signal.proficiency,
      confidence: signal.confidence,
      staleness: signal.staleness,
      exposureCount: signal.exposureCount,
      recencyDays: signal.recencyDays,
      weaknessScore: signal.weaknessScore,
    })),
    weakCategorySlugs: weak.map((signal) => signal.categorySlug),
    topCategorySlug: top.categorySlug,
    exploration: {
      r: seed.r,
      probability: EXPLORATION_PROBABILITY,
      applied: shouldExplore,
      seed: seed.digest,
    },
  };

  return {
    categorySlug: chosen.categorySlug,
    gameTypeSlug,
    // The target follows the *chosen* category's rating, since that is the
    // category the learner will actually play (§11.6 step 1).
    targetRating: targetRatingFor(chosen.rating),
    reason,
  };
}
