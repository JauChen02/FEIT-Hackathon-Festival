import 'server-only';
import { STARTING_USER_RATING } from '@learnarena/core';

/**
 * The learner's Elo rating in a category (PLANNING.md §11.3).
 *
 * §24 Phase 1: "question selection per §11.6 (**using default rating 1000
 * until Phase 3 writes ratings**)".
 *
 * This is the single seam Phase 3 replaces with a read of `skill_profiles`.
 * Keeping it a function rather than inlining the constant means the change is
 * one file, and every caller already threads the arguments it will need.
 */
export async function userRatingFor(_userId: string, _categoryId: string): Promise<number> {
  return STARTING_USER_RATING;
}
