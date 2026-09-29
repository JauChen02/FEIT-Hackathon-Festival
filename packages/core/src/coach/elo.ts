/**
 * User rating updates (PLANNING.md §11.3).
 *
 * ```
 * expected   = 1 / (1 + 10^((item_rating − user_rating) / 400))
 * K          = 32 if lifetime_event_count < 50 else 16      # count before this event
 * new_rating = user_rating + K × (correctness − expected)
 * ```
 *
 * Pure. The job in apps/web applies these one at a time in `occurred_at`
 * order, writing a `skill_updates` row per application (§11.3) — that row is
 * both the audit trail (Invariant 5) and the idempotency guard (§18.1).
 */

import { K_FACTOR_HIGH, K_FACTOR_LOW, K_FACTOR_SWITCH_AT } from '../domain';

/** Probability the learner answers an item of `itemRating` correctly. */
export function expectedScore(itemRating: number, userRating: number): number {
  return 1 / (1 + 10 ** ((itemRating - userRating) / 400));
}

/**
 * §11.3: "K = 32 if lifetime_event_count < 50 else 16 — **count before this
 * event**." New learners move faster; the rating settles as evidence builds.
 */
export function kFactorFor(lifetimeEventCountBefore: number): number {
  return lifetimeEventCountBefore < K_FACTOR_SWITCH_AT ? K_FACTOR_LOW : K_FACTOR_HIGH;
}

export interface EloApplication {
  expected: number;
  kFactor: number;
  ratingBefore: number;
  ratingAfter: number;
}

export interface ApplyEloInput {
  userRating: number;
  itemRating: number;
  /** 0..1. Timeouts are applied with 0 (§11.3). */
  correctness: number;
  /** Events already applied in this category, before this one. */
  lifetimeEventCountBefore: number;
}

export function applyElo(input: ApplyEloInput): EloApplication {
  const { userRating, itemRating, correctness, lifetimeEventCountBefore } = input;

  if (!Number.isFinite(correctness) || correctness < 0 || correctness > 1) {
    throw new RangeError(`applyElo: correctness must be 0..1, got ${correctness}`);
  }

  const expected = expectedScore(itemRating, userRating);
  const kFactor = kFactorFor(lifetimeEventCountBefore);

  return {
    expected,
    kFactor,
    ratingBefore: userRating,
    ratingAfter: userRating + kFactor * (correctness - expected),
  };
}

/**
 * Apply a whole ordered run of events, returning each step.
 *
 * Used by the job and by the dev seed, so both derive the same chain from the
 * same formula rather than encoding it twice.
 */
export interface EloEvent {
  itemRating: number;
  correctness: number;
}

export function applyEloSequence(
  startingRating: number,
  startingLifetimeCount: number,
  events: readonly EloEvent[],
): EloApplication[] {
  let rating = startingRating;
  let count = startingLifetimeCount;

  return events.map((event) => {
    const application = applyElo({
      userRating: rating,
      itemRating: event.itemRating,
      correctness: event.correctness,
      lifetimeEventCountBefore: count,
    });
    rating = application.ratingAfter;
    count += 1;
    return application;
  });
}
