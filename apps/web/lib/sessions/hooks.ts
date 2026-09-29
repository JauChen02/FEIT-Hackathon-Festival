import 'server-only';
import {
  IMPROVEMENT_BASELINE_SESSIONS,
  evaluateImprovement,
  resolveTier,
  type WeaknessTier,
} from '@learnarena/core';
import {
  claimForCompletion,
  findSessionById,
  listPriorQualifyingAccuracies,
  lockRecommendation,
  releaseToAvailable,
  type Database,
} from '@learnarena/db';
import { logger } from '../logger';

/**
 * Steps 5 to 7 of the completion transaction (PLANNING.md §18.2).
 *
 * Phase 1 shipped these as no-op interfaces so the transaction already called
 * them in the right order, inside the right transaction, with the arguments
 * they would need. Phase 3 fills in steps 6 and 7.
 *
 * **Step 5 (streak credit) is still a no-op**: Phase 2 owns it (§12.1), and it
 * has not been built. `streak_mult` therefore remains 1.0 in every ledger row.
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
  weaknessTierSnapshot: WeaknessTier;
  now: Date;
}

/** §18.2 step 5 — streak credit. **Phase 2 (§12.1). Not yet implemented.** */
export interface StreakStep {
  apply(context: CompletionStepContext): Promise<{
    /** `1 + 0.02 × min(streak_len, 30)` (§10.1). */
    streakMultiplier: number;
    /** What the results screen shows. Null until Phase 2. */
    streak: null;
  }>;
}

/** §18.2 step 6 — recommendation resolution and final tier (§11.5, §11.8). */
export interface RecommendationStep {
  resolve(context: CompletionStepContext): Promise<{
    /** 1.00 NONE, 1.25 WEAK, 1.50 RECOMMENDED (§10.1). */
    tierMultiplier: number;
    resolvedTier: WeaknessTier;
    recommendationCompleted: boolean;
  }>;
}

/** §18.2 step 7 — improvement bonus (§11.7, ADR-016). */
export interface ImprovementStep {
  evaluate(context: CompletionStepContext): Promise<{
    /** 0 or 0.25, added to the tier multiplier (§10.1). */
    improvementBonus: number;
    baseline: number | null;
    reason: string;
  }>;
}

export interface CompletionSteps {
  streak: StreakStep;
  recommendation: RecommendationStep;
  improvement: ImprovementStep;
}

/**
 * Phase 2's step. Until streaks exist there is no streak length to multiply
 * by, so the neutral 1.0 is the honest value rather than a placeholder.
 */
const NO_OP_STREAK_STEP: StreakStep = {
  apply: async () => ({ streakMultiplier: 1, streak: null }),
};

/**
 * §18.2 step 6 and §11.8.
 *
 * This is the **only** place the ×1.5 recommendation bonus is granted. Three
 * layers keep it to once:
 *
 *   1. the session row lock the surrounding transaction already holds, which
 *      serialises retries of the *same* session;
 *   2. `SELECT … FOR UPDATE` on the recommendation, which serialises two
 *      *different* sessions created from the same recommendation;
 *   3. the guarded `UPDATE … WHERE status IN ('AVAILABLE','IN_PROGRESS')`
 *      (§18.1), backed by `completed_session_id UNIQUE`.
 */
const RECOMMENDATION_STEP: RecommendationStep = {
  async resolve(context) {
    const session = await findSessionById(context.tx, context.sessionId);
    const recommendationId = session?.recommendationId ?? null;

    // Whether the category was weak when the session was created. Read from
    // the snapshot rather than recomputed, so later skill changes cannot
    // re-price a session the learner has already played (§11.8).
    const snapshot = session?.weaknessSnapshotJson as { wasWeak?: boolean } | null;
    const wasWeakAtCreation = snapshot?.wasWeak === true;

    if (!recommendationId) {
      const resolved = resolveTier({
        snapshotTier: context.weaknessTierSnapshot,
        wasWeakAtCreation,
        recommendationEligible: false,
        isQualifying: context.isQualifying,
      });
      return {
        tierMultiplier: resolved.multiplier,
        resolvedTier: resolved.tier,
        recommendationCompleted: false,
      };
    }

    const recommendation = await lockRecommendation(context.tx, recommendationId);

    // §11.8: RECOMMENDED is honoured only if the recommendation is still
    // claimable *and* the session qualifies.
    const claimable =
      recommendation !== undefined &&
      (recommendation.status === 'AVAILABLE' || recommendation.status === 'IN_PROGRESS');

    let claimed = false;
    if (claimable && context.isQualifying) {
      claimed = await claimForCompletion(
        context.tx,
        recommendationId,
        context.sessionId,
        context.now,
      );
    } else if (claimable && !context.isQualifying) {
      // §15.5: "IN_PROGRESS → AVAILABLE … completed non-qualifying." The
      // learner can still earn the bonus later today.
      await releaseToAvailable(context.tx, recommendationId);
      logger.info(
        { session_id: context.sessionId, recommendation_id: recommendationId },
        'coach.recommendation_released_non_qualifying',
      );
    }

    const resolved = resolveTier({
      snapshotTier: context.weaknessTierSnapshot,
      wasWeakAtCreation,
      recommendationEligible: claimed,
      isQualifying: context.isQualifying,
    });

    if (claimed) {
      logger.info(
        { session_id: context.sessionId, recommendation_id: recommendationId },
        'coach.recommendation_completed',
      );
    }

    return {
      tierMultiplier: resolved.multiplier,
      resolvedTier: resolved.tier,
      recommendationCompleted: resolved.recommendationCompleted,
    };
  },
};

/** §18.2 step 7 and §11.7. */
const IMPROVEMENT_STEP: ImprovementStep = {
  async evaluate(context) {
    // §11.7: "Applies to solo single-category sessions only."
    if (!context.categoryId) {
      return { improvementBonus: 0, baseline: null, reason: 'not_single_category' };
    }

    const priorAccuracies = await listPriorQualifyingAccuracies(
      context.tx,
      context.userId,
      context.categoryId,
      context.now,
      IMPROVEMENT_BASELINE_SESSIONS,
    );

    const result = evaluateImprovement({
      sessionAccuracy: context.sessionAccuracy,
      priorAccuracies,
    });

    return {
      improvementBonus: result.bonus,
      baseline: result.baseline,
      reason: result.reason,
    };
  },
};

/** The steps the completion transaction runs in production. */
export const COMPLETION_STEPS: CompletionSteps = {
  streak: NO_OP_STREAK_STEP,
  recommendation: RECOMMENDATION_STEP,
  improvement: IMPROVEMENT_STEP,
};

/** Neutral steps, for tests that want to score a session in isolation. */
export const NO_OP_COMPLETION_STEPS: CompletionSteps = {
  streak: NO_OP_STREAK_STEP,
  recommendation: {
    resolve: async () => ({
      tierMultiplier: 1,
      resolvedTier: 'NONE',
      recommendationCompleted: false,
    }),
  },
  improvement: {
    evaluate: async () => ({ improvementBonus: 0, baseline: null, reason: 'disabled' }),
  },
};
