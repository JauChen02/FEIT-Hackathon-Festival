import type { SessionResult } from '../api/session';
/**
 * Scoring types (PLANNING.md §10).
 *
 * Every intermediate value crosses this boundary as a **decimal string**, not a
 * JS number. §10.2 says rounding happens exactly once, at the very end; a
 * float would round silently at every step, and `point_ledger` stores these as
 * `numeric(12,4)`, which a float cannot round-trip exactly.
 */

/** One assessed item's contribution (§10.1). */
export interface QuestionOutcome {
  /** Normalised 0..1. Timeouts are 0. */
  correctness: number;
  /** 0.5..1.0 for timed items, 1.0 for untimed ones. */
  speedFactor: number;
}

export interface SessionMultipliers {
  /** §12.1. 1.0 until Phase 2. */
  streak: number;
  /** §12.3. Always 1.0 in solo. */
  friend: number;
  /** §11.8 tier + §11.7 improvement. 1.0 until Phase 3. */
  weakness: number;
  /** Admin event multiplier (V1). Fixed 1.0 before then. */
  event: number;
}

export interface ComputePointsInput {
  comboEnabled?: boolean;
  /** In presentation order; combo is derived from this order (§10.1). */
  questions: readonly QuestionOutcome[];
  /**
   * 50 on COMPLETED, plus mode bonuses (scenario best ending +50, match
   * outcome win +100 / draw +50). Not combo-multiplied (§10.2 step 4).
   */
  completionBonus: number;
  multipliers: SessionMultipliers;
}

/** Per-question detail, kept so the ledger row can reproduce the award. */
export interface QuestionBreakdown {
  correctness: number;
  speedFactor: string;
  /** `100 × correctness × speed_factor`, unrounded. */
  qBase: string;
  /** Consecutive fully-correct answers immediately preceding this one, cap 10. */
  combo: number;
  comboMult: string;
  /** `q_base × combo_mult`, unrounded. */
  qCombo: string;
}

/**
 * The full §10.2 trace. Stored verbatim in `point_ledger.multipliers_json` and
 * shown to the user (§10.4), so it has to be readable as well as complete.
 */
export interface PointsBreakdown {
  completionContext?: Pick<SessionResult, 'streak' | 'weakness' | 'recommendationCompleted'>;
  event?: { id: string; name: string; multiplier: number };
  perQuestion: QuestionBreakdown[];
  /** `Σ q_base + completion_bonus` — the base *before* combo (§10.2 step 3). */
  rawBasePoints: string;
  /** `Σ q_combo + completion_bonus` (§10.2 step 4). */
  comboAdjustedPoints: string;
  completionBonus: string;
  /** How much the combo added, for the "Combo +168.75" line in the UI. */
  comboContribution: string;
  multipliers: SessionMultipliers & { session: string };
  /** `combo_adjusted × session_mult` (§10.2 step 6). */
  uncappedPoints: string;
  /** `raw_base × TOTAL_MULT_CAP` (§10.2 step 7). */
  cap: string;
  capApplied: boolean;
  /** The single rounded integer (§10.2 step 8). */
  finalPoints: number;
}
