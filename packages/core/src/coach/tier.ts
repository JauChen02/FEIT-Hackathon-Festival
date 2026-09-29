/**
 * The bonus tier (PLANNING.md §11.8, §10.1).
 *
 * At session **creation** the server snapshots a tier onto the session:
 *   - `RECOMMENDED` if created from today's recommendation that is not yet COMPLETED
 *   - `WEAK` if the category is currently a weak category
 *   - `NONE` otherwise
 *
 * At **completion** `RECOMMENDED` is honoured only if the recommendation is
 * still eligible and the session is qualifying; otherwise it falls back to the
 * snapshot's `WEAK`, else `NONE`.
 *
 * The snapshot is what stops later skill changes retroactively re-pricing a
 * session someone has already played.
 */

import { TIER_MULTIPLIERS } from '../domain';

export type WeaknessTier = 'NONE' | 'WEAK' | 'RECOMMENDED';

/** 1.00 (NONE), 1.25 (WEAK), 1.50 (RECOMMENDED) — §10.1. */
export function tierMultiplier(tier: WeaknessTier): number {
  return TIER_MULTIPLIERS[tier];
}

export interface ResolveTierInput {
  /** The tier stored on the session at creation (§11.8). */
  snapshotTier: WeaknessTier;
  /**
   * Whether the category was weak **at creation time**. Recorded in
   * `weakness_snapshot_json` so the fallback does not need to recompute
   * today's weakness, which may have changed since.
   */
  wasWeakAtCreation: boolean;
  /**
   * True when the linked recommendation is still claimable: not COMPLETED,
   * not EXPIRED. Decided by the guarded UPDATE in the completion transaction.
   */
  recommendationEligible: boolean;
  /** §6: ≥ 50% of questions ANSWERED. */
  isQualifying: boolean;
}

export interface ResolvedTier {
  tier: WeaknessTier;
  multiplier: number;
  /** True when this completion consumed the recommendation's ×1.5. */
  recommendationCompleted: boolean;
}

export function resolveTier(input: ResolveTierInput): ResolvedTier {
  const { snapshotTier, wasWeakAtCreation, recommendationEligible, isQualifying } = input;

  if (snapshotTier === 'RECOMMENDED' && recommendationEligible && isQualifying) {
    return {
      tier: 'RECOMMENDED',
      multiplier: tierMultiplier('RECOMMENDED'),
      recommendationCompleted: true,
    };
  }

  // The recommendation was already spent, has expired, or this session did not
  // qualify. Fall back to what the snapshot said about the category itself.
  const fallback: WeaknessTier = wasWeakAtCreation ? 'WEAK' : 'NONE';

  // A session snapshotted WEAK keeps WEAK regardless of the recommendation.
  const tier = snapshotTier === 'WEAK' ? 'WEAK' : fallback;

  return { tier, multiplier: tierMultiplier(tier), recommendationCompleted: false };
}
