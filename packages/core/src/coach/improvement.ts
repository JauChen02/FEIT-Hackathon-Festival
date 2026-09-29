/**
 * The improvement bonus (PLANNING.md §11.7, ADR-016).
 *
 * - Solo single-category sessions only.
 * - `session_accuracy = mean(correctness)` over all questions, timeouts = 0.
 * - Requires **at least 3 prior qualifying sessions** in the same category.
 * - `baseline = mean(session_accuracy)` of the most recent **5** prior
 *   qualifying sessions (or all, if 3 to 4).
 * - `+0.25` if `session_accuracy ≥ baseline + 0.10`.
 * - Abandoned/expired sessions are never part of the baseline and never qualify.
 *
 * ADR-016 records the deliberate omission: there is no difficulty
 * normalisation in MVP, so a learner who improves by meeting easier questions
 * is rewarded the same as one who improves at a fixed difficulty. §11.6 keeps
 * difficulty roughly stable per user, which limits the distortion.
 */

import {
  IMPROVEMENT_BASELINE_SESSIONS,
  IMPROVEMENT_BONUS,
  IMPROVEMENT_MIN_PRIOR_SESSIONS,
  IMPROVEMENT_THRESHOLD,
} from '../domain';

export interface EvaluateImprovementInput {
  /** Mean correctness of the session being scored, 0..1. */
  sessionAccuracy: number;
  /**
   * Accuracies of prior **qualifying** sessions in the same category, most
   * recent first. The caller is responsible for the filtering; this function
   * only takes the first five.
   */
  priorAccuracies: readonly number[];
}

export interface ImprovementResult {
  /** 0 or 0.25, added to the tier multiplier (§10.1). */
  bonus: number;
  /** Null when there were too few prior sessions to form one. */
  baseline: number | null;
  /** How many prior sessions actually fed the baseline. */
  baselineSessionCount: number;
  /** Why the bonus was or was not granted, for the ledger breakdown. */
  reason: 'granted' | 'insufficient_history' | 'not_enough_improvement';
}

export function evaluateImprovement(input: EvaluateImprovementInput): ImprovementResult {
  const { sessionAccuracy, priorAccuracies } = input;

  if (priorAccuracies.length < IMPROVEMENT_MIN_PRIOR_SESSIONS) {
    return {
      bonus: 0,
      baseline: null,
      baselineSessionCount: priorAccuracies.length,
      reason: 'insufficient_history',
    };
  }

  const window = priorAccuracies.slice(0, IMPROVEMENT_BASELINE_SESSIONS);
  const baseline = window.reduce((total, value) => total + value, 0) / window.length;

  // `≥` not `>`: §11.7 grants the bonus at exactly +0.10.
  const granted = sessionAccuracy >= baseline + IMPROVEMENT_THRESHOLD;

  return {
    bonus: granted ? IMPROVEMENT_BONUS : 0,
    baseline,
    baselineSessionCount: window.length,
    reason: granted ? 'granted' : 'not_enough_improvement',
  };
}
