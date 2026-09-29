/**
 * StreakFreezeStatus (PLANNING.md §15.6).
 *
 *   AVAILABLE -> CONSUMED   consumed during streak credit to cover a missed date
 *
 * Freezes never expire in MVP. Consumption is implemented in Phase 2.
 */

import { makeTransitionTable } from './table';

export const FREEZE_STATUSES = ['AVAILABLE', 'CONSUMED'] as const;

export type FreezeStatus = (typeof FREEZE_STATUSES)[number];

export const freezeTransitions = makeTransitionTable<FreezeStatus>(
  'streak_freeze',
  FREEZE_STATUSES,
  {
    AVAILABLE: ['CONSUMED'],
    CONSUMED: [],
  },
);

/** A user holds at most this many freezes at once (§12.1). */
export const MAX_FREEZES_HELD = 2;

/** One freeze is earned each time the streak length reaches a multiple of this (§12.1). */
export const FREEZE_EARN_INTERVAL_DAYS = 7;
