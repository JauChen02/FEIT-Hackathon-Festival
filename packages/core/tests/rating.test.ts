import { describe, expect, it } from 'vitest';
import { isDifficulty, ratingForDifficulty } from '../src/content/rating';
import { STARTING_USER_RATING, TARGET_RATING_OFFSET } from '../src/domain';

/** §11.2 / ADR-009: rating = 700 + 100 × difficulty, fixed after publishing. */
describe('ratingForDifficulty', () => {
  it.each([
    [1, 800],
    [2, 900],
    [3, 1000],
    [4, 1100],
    [5, 1200],
  ])('difficulty %i → rating %i', (difficulty, expected) => {
    expect(ratingForDifficulty(difficulty)).toBe(expected);
  });

  it('spans exactly the 800..1200 band the spec names', () => {
    expect(ratingForDifficulty(1)).toBe(800);
    expect(ratingForDifficulty(5)).toBe(1200);
  });

  it.each([0, 6, -1, 2.5, Number.NaN])('rejects difficulty %s', (difficulty) => {
    expect(() => ratingForDifficulty(difficulty)).toThrow(RangeError);
  });
});

describe('isDifficulty', () => {
  it.each([1, 2, 3, 4, 5])('accepts %i', (v) => expect(isDifficulty(v)).toBe(true));
  it.each([0, 6, 1.5, '3', null, undefined])('rejects %s', (v) =>
    expect(isDifficulty(v)).toBe(false),
  );
});

/**
 * §11.6 / ADR-010: target ~70% expected success at item_rating = user_rating − 147.
 * Phase 3 implements selection; this pins the constant the whole design rests on.
 */
describe('TARGET_RATING_OFFSET', () => {
  it('yields ~0.70 expected success under the §11.3 Elo formula', () => {
    const itemRating = STARTING_USER_RATING + TARGET_RATING_OFFSET;
    const expected = 1 / (1 + 10 ** ((itemRating - STARTING_USER_RATING) / 400));
    expect(expected).toBeCloseTo(0.7, 3);
  });

  it('sits inside the acceptable 65%..75% band (−108 to −191)', () => {
    expect(TARGET_RATING_OFFSET).toBeLessThanOrEqual(-108);
    expect(TARGET_RATING_OFFSET).toBeGreaterThanOrEqual(-191);
  });
});
