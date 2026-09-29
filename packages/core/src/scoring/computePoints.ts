/**
 * `computePoints` — the canonical scoring function (PLANNING.md §10).
 *
 * "All scoring is a **pure function** `computePoints(input): PointsBreakdown`
 *  … executed server-side only, using **`decimal.js`** for arithmetic. The
 *  ledger stores the full breakdown so any award can be reproduced."
 *
 * The order of operations in §10.2 is followed exactly, and **rounding happens
 * exactly once**, at step 8. Every intermediate stays an unrounded Decimal, so
 * the result does not depend on how the caller grouped the arithmetic.
 *
 * Invariant 1: clients never compute this. Invariant 3: its output is what the
 * ledger row records.
 */

import { Decimal } from 'decimal.js';
import { TOTAL_MULT_CAP } from '../domain';
import { comboMultiplier, comboSequence } from './combo';
import type { ComputePointsInput, PointsBreakdown, QuestionBreakdown } from './types';

/**
 * decimal.js defaults to ROUND_HALF_UP, but the §10.2 rounding rule is
 * explicit enough to be worth pinning locally rather than trusting a global.
 */
const ROUND_HALF_UP = Decimal.ROUND_HALF_UP;

function assertMultiplier(name: string, value: number): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`computePoints: ${name} multiplier must be positive, got ${value}`);
  }
}

export function computePoints(input: ComputePointsInput): PointsBreakdown {
  const { questions, completionBonus, multipliers } = input;

  if (!Number.isFinite(completionBonus) || completionBonus < 0) {
    throw new RangeError(
      `computePoints: completionBonus must be a non-negative number, got ${completionBonus}`,
    );
  }
  assertMultiplier('streak', multipliers.streak);
  assertMultiplier('friend', multipliers.friend);
  assertMultiplier('weakness', multipliers.weakness);
  assertMultiplier('event', multipliers.event);

  for (const [index, question] of questions.entries()) {
    if (
      !Number.isFinite(question.correctness) ||
      question.correctness < 0 ||
      question.correctness > 1
    ) {
      throw new RangeError(
        `computePoints: question ${index} correctness must be 0..1, got ${question.correctness}`,
      );
    }
    if (
      !Number.isFinite(question.speedFactor) ||
      question.speedFactor < 0 ||
      question.speedFactor > 1
    ) {
      throw new RangeError(
        `computePoints: question ${index} speedFactor must be 0..1, got ${question.speedFactor}`,
      );
    }
  }

  const combos = comboSequence(questions.map((question) => question.correctness));

  // Step 1 and 2: per-question base and combo-adjusted base, both unrounded.
  const perQuestion: QuestionBreakdown[] = [];
  let sumBase = new Decimal(0);
  let sumCombo = new Decimal(0);

  for (const [index, question] of questions.entries()) {
    const combo = combos[index]!;
    const comboMult = new Decimal(comboMultiplier(combo));

    const qBase = new Decimal(100).times(question.correctness).times(question.speedFactor);
    const qCombo = qBase.times(comboMult);

    sumBase = sumBase.plus(qBase);
    sumCombo = sumCombo.plus(qCombo);

    perQuestion.push({
      correctness: question.correctness,
      speedFactor: new Decimal(question.speedFactor).toString(),
      qBase: qBase.toString(),
      combo,
      comboMult: comboMult.toString(),
      qCombo: qCombo.toString(),
    });
  }

  const bonus = new Decimal(completionBonus);

  // Step 3 and 4: bonuses are added after the combo, never multiplied by it.
  const rawBase = sumBase.plus(bonus);
  const comboAdjusted = sumCombo.plus(bonus);

  // Step 5.
  const sessionMult = new Decimal(multipliers.streak)
    .times(multipliers.friend)
    .times(multipliers.weakness)
    .times(multipliers.event);

  // Step 6 and 7.
  const uncapped = comboAdjusted.times(sessionMult);
  const cap = rawBase.times(TOTAL_MULT_CAP);

  // §10.2 cap semantics: the cap bounds final points to 4× the raw base
  // *before* combo, so a long combo cannot push a session past 4× on its own.
  const capApplied = uncapped.greaterThan(cap);

  // Step 8: the one and only rounding.
  const finalPoints = Decimal.min(uncapped, cap).toDecimalPlaces(0, ROUND_HALF_UP).toNumber();

  return {
    perQuestion,
    rawBasePoints: rawBase.toString(),
    comboAdjustedPoints: comboAdjusted.toString(),
    completionBonus: bonus.toString(),
    comboContribution: sumCombo.minus(sumBase).toString(),
    multipliers: { ...multipliers, session: sessionMult.toString() },
    uncappedPoints: uncapped.toString(),
    cap: cap.toString(),
    capApplied,
    finalPoints,
  };
}

/**
 * Multipliers for a phase that has not built the systems behind them.
 *
 * §24 Phase 1: "computePoints() per §10 with streak/friend/weakness/event
 * multipliers fixed at 1.0". Phase 2 supplies `streak`, Phase 3 `weakness`.
 */
export const NEUTRAL_MULTIPLIERS = {
  streak: 1,
  friend: 1,
  weakness: 1,
  event: 1,
} as const;
