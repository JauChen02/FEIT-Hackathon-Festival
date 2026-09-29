/**
 * Combo (PLANNING.md §10.1).
 *
 * "`combo_i` — number of consecutive answers with `correctness = 1`
 *  **immediately preceding** question *i* in this session, capped at 10.
 *  Resets on any answer with correctness < 1 or timeout."
 *
 * Note the two consequences of "preceding": the first question always has
 * combo 0, and a question's own correctness never contributes to its own
 * multiplier.
 */

import { COMBO_CAP } from '../domain';

/**
 * Combo value for each question, in presentation order.
 *
 * @param correctness one entry per question, in order, 0..1
 */
export function comboSequence(correctness: readonly number[]): number[] {
  const combos: number[] = [];
  let running = 0;

  for (const value of correctness) {
    combos.push(Math.min(running, COMBO_CAP));
    running = value === 1 ? running + 1 : 0;
  }
  return combos;
}

/**
 * The combo *after* the given answers — what `/answer` reports as `comboAfter`.
 *
 * Uncapped counting internally, reported capped, so the value the user sees
 * matches the multiplier the next question will actually receive.
 */
export function comboAfter(correctness: readonly number[]): number {
  let running = 0;
  for (const value of correctness) {
    running = value === 1 ? running + 1 : 0;
  }
  return Math.min(running, COMBO_CAP);
}

/** `1 + 0.05 × combo` (§10.1), as an exact decimal string. */
export function comboMultiplier(combo: number): string {
  if (!Number.isInteger(combo) || combo < 0) {
    throw new RangeError(`comboMultiplier: combo must be a non-negative integer, got ${combo}`);
  }
  // 0.05 is not exactly representable in binary floating point, but
  // 1 + 5 * capped / 100 is exact for every integer combo in 0..10.
  const capped = Math.min(combo, COMBO_CAP);
  return ((100 + 5 * capped) / 100).toString();
}
