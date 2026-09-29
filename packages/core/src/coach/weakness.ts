/**
 * Weak-category and strength selection (PLANNING.md §11.4).
 *
 * - **Weak categories:** launch categories with `weakness_score > 0.40`, top 3 by score.
 * - **Strengths:** top 2 categories by `proficiency × confidence` with `confidence ≥ 0.3`.
 * - Ties are broken by category `slug` ascending.
 */

import {
  MAX_STRENGTHS,
  MAX_WEAK_CATEGORIES,
  STRENGTH_MIN_CONFIDENCE,
  STRENGTH_MIN_PROFICIENCY,
  WEAKNESS_THRESHOLD,
} from '../domain';
import type { DerivedSignals } from './derived';

/** Descending by score, then ascending by slug — the §11.4 ordering, everywhere. */
function byScoreThenSlug(
  score: (signal: DerivedSignals) => number,
): (a: DerivedSignals, b: DerivedSignals) => number {
  return (a, b) => {
    const difference = score(b) - score(a);
    if (difference !== 0) return difference;
    return a.categorySlug.localeCompare(b.categorySlug);
  };
}

/** Every category ranked by weakness, most weak first (§11.5 step 1). */
export function rankByWeakness(signals: readonly DerivedSignals[]): DerivedSignals[] {
  return [...signals].sort(byScoreThenSlug((signal) => signal.weaknessScore));
}

/**
 * The categories the Coach considers weak right now.
 *
 * The `> 0.40` threshold is strict: a category sitting exactly on it is not
 * weak. The cap of 3 is inert while there are only three launch categories
 * (ADR-002) and starts to matter when Alpha adds `memory`.
 */
export function weakCategories(signals: readonly DerivedSignals[]): DerivedSignals[] {
  return rankByWeakness(signals)
    .filter((signal) => signal.weaknessScore > WEAKNESS_THRESHOLD)
    .slice(0, MAX_WEAK_CATEGORIES);
}

export function isWeakCategory(signals: readonly DerivedSignals[], categorySlug: string): boolean {
  return weakCategories(signals).some((signal) => signal.categorySlug === categorySlug);
}

/**
 * The learner's strongest categories.
 *
 * Two gates, for two different failure modes:
 *   - `confidence ≥ 0.3` stops a lucky first session being called a strength;
 *     it takes roughly 11 events in the window to clear.
 *   - `proficiency > 50` stops a *confidently bad* category being called one
 *     (ADR-053). Confidence alone cannot do this: a learner who has played
 *     only one category clears the confidence gate and is then told their
 *     worst subject is their best.
 */
export function strengths(signals: readonly DerivedSignals[]): DerivedSignals[] {
  return [...signals]
    .filter(
      (signal) =>
        signal.confidence >= STRENGTH_MIN_CONFIDENCE &&
        signal.proficiency > STRENGTH_MIN_PROFICIENCY,
    )
    .sort(byScoreThenSlug((signal) => signal.proficiency * signal.confidence))
    .slice(0, MAX_STRENGTHS);
}
