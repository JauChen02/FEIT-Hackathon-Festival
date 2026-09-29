import 'server-only';
import type { Database } from '@learnarena/db';

/**
 * The three completion steps later phases own (PLANNING.md §18.2 steps 5-7).
 *
 * §24 Phase 1: "Implement the completion transaction (§18.2) with streak,
 * recommendation and improvement steps as no-op interfaces."
 *
 * They are interfaces rather than inline `// TODO` comments so that the
 * completion transaction already calls them in the right order, inside the
 * right transaction, with the arguments they will need. Phase 2 and Phase 3
 * replace the bodies and nothing around them moves.
 */

export interface CompletionStepContext {
  /** The open transaction. Everything these steps write must join it. */
  tx: Database;
  sessionId: string;
  userId: string;
  categoryId: string | null;
  /** The user's local date at completion (§18.2 step 4). */
  localDate: string;
  /** ≥ 50% of questions ANSWERED (§6). */
  isQualifying: boolean;
  /** Mean correctness over every question, timeouts counted as 0 (§11.7). */
  sessionAccuracy: number;
  /** The tier snapshotted at session creation (§11.8). */
  weaknessTierSnapshot: 'NONE' | 'WEAK' | 'RECOMMENDED';
  now: Date;
}

/** §18.2 step 5 — streak credit. Phase 2 (§12.1). */
export interface StreakStep {
  apply(context: CompletionStepContext): Promise<{
    /** `1 + 0.02 × min(streak_len, 30)` (§10.1). */
    streakMultiplier: number;
    /** What the results screen shows. Null until Phase 2. */
    streak: null;
  }>;
}

/** §18.2 step 6 — recommendation resolution and final tier. Phase 3 (§11.5, §11.8). */
export interface RecommendationStep {
  resolve(context: CompletionStepContext): Promise<{
    /** 1.00 NONE, 1.25 WEAK, 1.50 RECOMMENDED (§10.1). */
    tierMultiplier: number;
    recommendationCompleted: boolean;
  }>;
}

/** §18.2 step 7 — improvement bonus. Phase 3 (§11.7, ADR-016). */
export interface ImprovementStep {
  evaluate(context: CompletionStepContext): Promise<{
    /** 0 or 0.25, added to the tier multiplier (§10.1). */
    improvementBonus: number;
  }>;
}

export interface CompletionSteps {
  streak: StreakStep;
  recommendation: RecommendationStep;
  improvement: ImprovementStep;
}

/**
 * Phase 1's implementations: no writes, and every multiplier neutral, which is
 * exactly what §24 Phase 1 specifies ("multipliers fixed at 1.0").
 */
export const NO_OP_COMPLETION_STEPS: CompletionSteps = {
  streak: {
    apply: async () => ({ streakMultiplier: 1, streak: null }),
  },
  recommendation: {
    resolve: async () => ({ tierMultiplier: 1, recommendationCompleted: false }),
  },
  improvement: {
    evaluate: async () => ({ improvementBonus: 0 }),
  },
};
