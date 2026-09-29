/**
 * RecommendationStatus (PLANNING.md §15.5).
 *
 *   AVAILABLE -> IN_PROGRESS     session created from it
 *   IN_PROGRESS -> AVAILABLE     that session abandoned/expired/cancelled,
 *                                or completed non-qualifying
 *   IN_PROGRESS -> COMPLETED     that session completed and qualifying
 *   AVAILABLE | IN_PROGRESS -> EXPIRED
 *
 * The lifecycle itself is implemented in Phase 3; the table exists from Phase 0
 * so the enum and its rules have a single home (§25.4).
 */

import { makeTransitionTable } from './table';

export const RECOMMENDATION_STATUSES = [
  'AVAILABLE',
  'IN_PROGRESS',
  'COMPLETED',
  'EXPIRED',
] as const;

export type RecommendationStatus = (typeof RECOMMENDATION_STATUSES)[number];

export const recommendationTransitions = makeTransitionTable<RecommendationStatus>(
  'recommendation',
  RECOMMENDATION_STATUSES,
  {
    AVAILABLE: ['IN_PROGRESS', 'EXPIRED'],
    IN_PROGRESS: ['AVAILABLE', 'COMPLETED', 'EXPIRED'],
    COMPLETED: [],
    EXPIRED: [],
  },
);

/** A recommendation can still grant its ×1.5 bonus while in one of these states (§11.8). */
export function isBonusEligible(status: RecommendationStatus): boolean {
  return status === 'AVAILABLE' || status === 'IN_PROGRESS';
}
