/**
 * Derived Coach values (PLANNING.md §11.4).
 *
 * "computed at read time, **never stored as canonical**" — Invariant 5. The
 * only canonical number is `skill_profiles.rating`; everything here is a view
 * of it plus the learning-event history.
 *
 * ```
 * proficiency     = clamp((rating − 600) / 8, 0, 100)
 * exposure_count  = learning events in category, last 60 days
 * confidence      = 1 − exp(−exposure_count / 30)
 * recency_days    = days since last event in category (∞ if never)
 * staleness       = min(recency_days / 14, 1)
 *
 * skill_gap       = 1 − proficiency / 100
 * exposure_gap    = 1 − confidence
 *
 * weakness_score  = 0.50 × skill_gap × confidence
 *                 + 0.35 × exposure_gap
 *                 + 0.15 × staleness
 * ```
 */

import {
  CONFIDENCE_SCALE,
  PROFICIENCY_DIVISOR,
  PROFICIENCY_FLOOR_RATING,
  STALENESS_SATURATION_DAYS,
  WEAKNESS_EXPOSURE_WEIGHT,
  WEAKNESS_SKILL_WEIGHT,
  WEAKNESS_STALENESS_WEIGHT,
} from '../domain';

/** What the Coach knows about one (user, category) pair. Read from learning_events. */
export interface CategorySignals {
  categorySlug: string;
  /** Canonical Elo rating; 1000 for a category with no profile yet (§11.3). */
  rating: number;
  /** Learning events in this category within the 60-day window (§11.4). */
  exposureCount: number;
  /** Days since the last event, or null when the category was never played. */
  recencyDays: number | null;
}

export interface DerivedSignals extends CategorySignals {
  proficiency: number;
  confidence: number;
  staleness: number;
  skillGap: number;
  exposureGap: number;
  weaknessScore: number;
  /** True when the learner has no events at all in this category. */
  neverPlayed: boolean;
}

/** Display value 0..100 (§11.4). */
export function proficiency(rating: number): number {
  const raw = (rating - PROFICIENCY_FLOOR_RATING) / PROFICIENCY_DIVISOR;
  return Math.min(100, Math.max(0, raw));
}

/**
 * How much the rating can be trusted, 0..1.
 *
 * Approaches but never reaches 1: more evidence always helps a little, and a
 * confidence of exactly 1 would zero out the exposure term for good.
 */
export function confidence(exposureCount: number): number {
  if (exposureCount <= 0) return 0;
  return 1 - Math.exp(-exposureCount / CONFIDENCE_SCALE);
}

/** 0 when just played, saturating at 1 after 14 days (§11.4). */
export function staleness(recencyDays: number | null): number {
  // Never played is maximally stale — there is no recency at all.
  if (recencyDays === null) return 1;
  return Math.min(Math.max(recencyDays, 0) / STALENESS_SATURATION_DAYS, 1);
}

/**
 * The composite 0..1 score the Coach ranks by.
 *
 * Note the shape of the first term: `skill_gap` is multiplied by `confidence`,
 * so a low rating only counts as weakness once there is evidence for it. A
 * never-played category therefore scores exactly
 * `0 + 0.35×1 + 0.15×1 = 0.50` — "weak due to lack of games", which §11.4
 * says is intended.
 */
export function deriveSignals(signals: CategorySignals): DerivedSignals {
  const prof = proficiency(signals.rating);
  const conf = confidence(signals.exposureCount);
  const stale = staleness(signals.recencyDays);

  const skillGap = 1 - prof / 100;
  const exposureGap = 1 - conf;

  const weaknessScore =
    WEAKNESS_SKILL_WEIGHT * skillGap * conf +
    WEAKNESS_EXPOSURE_WEIGHT * exposureGap +
    WEAKNESS_STALENESS_WEIGHT * stale;

  return {
    ...signals,
    proficiency: prof,
    confidence: conf,
    staleness: stale,
    skillGap,
    exposureGap,
    weaknessScore,
    neverPlayed: signals.exposureCount === 0 && signals.recencyDays === null,
  };
}

export function deriveAll(signals: readonly CategorySignals[]): DerivedSignals[] {
  return signals.map(deriveSignals);
}
