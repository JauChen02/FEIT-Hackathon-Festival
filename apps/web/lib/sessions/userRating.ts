import 'server-only';
import { STARTING_USER_RATING } from '@learnarena/core';
import { findSkillProfile } from '@learnarena/db';
import { db } from '../db';

/**
 * The learner's Elo rating in a category (PLANNING.md §11.3).
 *
 * Phase 1 returned the constant 1000 because nothing wrote ratings yet. Phase 3
 * fills the seam: `coach/process-session` now maintains `skill_profiles`, and
 * §11.6 selects questions against this number.
 *
 * A category with no profile row still uses the §11.3 starting rating, so a
 * learner's first session in a category targets 853 exactly as before.
 */
export async function userRatingFor(userId: string, categoryId: string): Promise<number> {
  const profile = await findSkillProfile(db(), userId, categoryId);
  return profile?.rating ?? STARTING_USER_RATING;
}
