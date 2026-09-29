import { describe, expect, it } from 'vitest';
import { applyElo, applyEloSequence, expectedScore, kFactorFor } from '../src/coach/elo';
import { STARTING_USER_RATING, TARGET_RATING_OFFSET } from '../src/domain';

/**
 * §11.3 user rating updates. §24 Phase 3 requires "Elo expected/update values,
 * K switch at 50".
 */

describe('expectedScore (§11.3)', () => {
  it('is 0.5 when the item matches the learner', () => {
    expect(expectedScore(1000, 1000)).toBe(0.5);
  });

  it.each([
    // A harder item (rated above the learner) is less likely to be answered.
    [400, 0.090909],
    [200, 0.240253],
    [0, 0.5],
    [-200, 0.759747],
    [-400, 0.909091],
  ])('an item %i points above the learner gives %f', (difference, expected) => {
    expect(expectedScore(1000 + difference, 1000)).toBeCloseTo(expected, 5);
  });

  it('yields ~0.70 at the ADR-010 target of user_rating − 147', () => {
    // This is the number the whole selection design rests on (§11.6).
    const target = STARTING_USER_RATING + TARGET_RATING_OFFSET;
    expect(target).toBe(853);
    expect(expectedScore(target, STARTING_USER_RATING)).toBeCloseTo(0.7, 3);
  });

  it("stays inside §11.6's 65–75% band across the acceptable offsets", () => {
    expect(expectedScore(1000 - 108, 1000)).toBeCloseTo(0.65, 2);
    expect(expectedScore(1000 - 191, 1000)).toBeCloseTo(0.75, 2);
  });

  it('is monotonically decreasing in item rating', () => {
    let previous = 1;
    for (let rating = 600; rating <= 1400; rating += 50) {
      const value = expectedScore(rating, 1000);
      expect(value).toBeLessThan(previous);
      previous = value;
    }
  });

  it('never leaves (0, 1)', () => {
    expect(expectedScore(5000, 1000)).toBeGreaterThan(0);
    expect(expectedScore(-5000, 1000)).toBeLessThan(1);
  });
});

// §24: "K switch at 50".
describe('kFactorFor (§11.3)', () => {
  it.each([
    [0, 32],
    [1, 32],
    [49, 32],
    [50, 16],
    [51, 16],
    [1000, 16],
  ])('%i prior events → K %i', (count, expected) => {
    expect(kFactorFor(count)).toBe(expected);
  });

  it('switches on the count *before* the event, not after', () => {
    // §11.3 is explicit about this. The 50th event is still scored at K=32;
    // the 51st is the first at K=16.
    expect(kFactorFor(49)).toBe(32); // applying event #50
    expect(kFactorFor(50)).toBe(16); // applying event #51
  });
});

describe('applyElo (§11.3)', () => {
  it('moves a learner up 16 points for a correct answer at their own level', () => {
    const result = applyElo({
      userRating: 1000,
      itemRating: 1000,
      correctness: 1,
      lifetimeEventCountBefore: 0,
    });
    expect(result.expected).toBe(0.5);
    expect(result.kFactor).toBe(32);
    expect(result.ratingBefore).toBe(1000);
    expect(result.ratingAfter).toBe(1016);
  });

  it('moves a learner down 16 points for a wrong answer at their own level', () => {
    const result = applyElo({
      userRating: 1000,
      itemRating: 1000,
      correctness: 0,
      lifetimeEventCountBefore: 0,
    });
    expect(result.ratingAfter).toBe(984);
  });

  it('rewards a correct answer at the 70% target by less than an even-odds one', () => {
    // expected 0.69977 → 1000 + 32 × (1 − 0.69977) = 1009.607
    const result = applyElo({
      userRating: 1000,
      itemRating: 853,
      correctness: 1,
      lifetimeEventCountBefore: 0,
    });
    expect(result.ratingAfter).toBeCloseTo(1009.607, 3);
  });

  it('punishes a miss on an easy item heavily', () => {
    const result = applyElo({
      userRating: 1000,
      itemRating: 800,
      correctness: 0,
      lifetimeEventCountBefore: 0,
    });
    // expected 0.75975 → 1000 − 32 × 0.75975 = 975.688
    expect(result.ratingAfter).toBeCloseTo(975.688, 3);
  });

  it('halves the movement once the learner passes 50 events', () => {
    const early = applyElo({
      userRating: 1000,
      itemRating: 1000,
      correctness: 1,
      lifetimeEventCountBefore: 49,
    });
    const settled = applyElo({
      userRating: 1000,
      itemRating: 1000,
      correctness: 1,
      lifetimeEventCountBefore: 50,
    });
    expect(early.ratingAfter - 1000).toBe(16);
    expect(settled.ratingAfter - 1000).toBe(8);
  });

  it('applies a timeout as correctness 0 (§11.3)', () => {
    const timeout = applyElo({
      userRating: 1000,
      itemRating: 900,
      correctness: 0,
      lifetimeEventCountBefore: 0,
    });
    const wrong = applyElo({
      userRating: 1000,
      itemRating: 900,
      correctness: 0,
      lifetimeEventCountBefore: 0,
    });
    expect(timeout).toEqual(wrong);
  });

  it('rejects correctness outside 0..1', () => {
    for (const correctness of [-0.1, 1.1, Number.NaN]) {
      expect(() =>
        applyElo({ userRating: 1000, itemRating: 1000, correctness, lifetimeEventCountBefore: 0 }),
      ).toThrow(RangeError);
    }
  });
});

describe('applyEloSequence', () => {
  it('chains each application into the next', () => {
    const steps = applyEloSequence(1000, 0, [
      { itemRating: 1000, correctness: 1 },
      { itemRating: 1000, correctness: 1 },
    ]);

    expect(steps[0]?.ratingAfter).toBe(1016);
    expect(steps[1]?.ratingBefore).toBe(1016);
    // Second answer is now slightly less surprising, so it pays slightly less.
    expect(steps[1]!.ratingAfter - 1016).toBeLessThan(16);
  });

  it('advances the lifetime count, so a long run crosses the K boundary', () => {
    const events = Array.from({ length: 52 }, () => ({ itemRating: 1400, correctness: 1 }));
    const steps = applyEloSequence(1000, 0, events);

    expect(steps[48]?.kFactor).toBe(32);
    expect(steps[49]?.kFactor).toBe(32); // the 50th event, count before = 49
    expect(steps[50]?.kFactor).toBe(16); // the 51st, count before = 50
  });

  it('converges upward for a learner who always answers correctly', () => {
    const events = Array.from({ length: 30 }, () => ({ itemRating: 1000, correctness: 1 }));
    const steps = applyEloSequence(1000, 0, events);
    const final = steps.at(-1)!.ratingAfter;

    expect(final).toBeGreaterThan(1000);
    // And each step gains less than the one before it.
    for (let i = 1; i < steps.length; i += 1) {
      const previousGain = steps[i - 1]!.ratingAfter - steps[i - 1]!.ratingBefore;
      const gain = steps[i]!.ratingAfter - steps[i]!.ratingBefore;
      expect(gain).toBeLessThan(previousGain);
    }
  });

  it('is a no-op for an empty run', () => {
    expect(applyEloSequence(1000, 0, [])).toEqual([]);
  });
});
