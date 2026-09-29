import { describe, expect, it } from 'vitest';
import { SOLO_TIME_LIMIT_MS } from '../src/domain';
import { comboAfter, comboMultiplier, comboSequence } from '../src/scoring/combo';
import { speedFactor, timeLeftMs } from '../src/scoring/speedFactor';

/** §10.1 speed factor and combo helpers. */
describe('speedFactor', () => {
  it.each([
    [20_000, '1'], // answered instantly
    [15_000, '0.875'],
    [10_000, '0.75'], // the §10.3 example
    [5_000, '0.625'],
    [0, '0.5'], // answered as the clock hit zero
  ])('%i ms left of 20,000 → %s', (left, expected) => {
    expect(speedFactor(left, SOLO_TIME_LIMIT_MS)).toBe(expected);
  });

  it('clamps below zero to the 0.5 floor — an answer inside the grace window', () => {
    expect(speedFactor(-500, SOLO_TIME_LIMIT_MS)).toBe('0.5');
    expect(speedFactor(-100_000, SOLO_TIME_LIMIT_MS)).toBe('0.5');
  });

  it('clamps above the limit to the 1.0 ceiling', () => {
    expect(speedFactor(999_999, SOLO_TIME_LIMIT_MS)).toBe('1');
  });

  it('never leaves the 0.5..1.0 band', () => {
    for (let left = -5_000; left <= 25_000; left += 250) {
      const value = Number(speedFactor(left, SOLO_TIME_LIMIT_MS));
      expect(value).toBeGreaterThanOrEqual(0.5);
      expect(value).toBeLessThanOrEqual(1);
    }
  });

  it('rejects a non-positive time limit', () => {
    expect(() => speedFactor(100, 0)).toThrow(RangeError);
    expect(() => speedFactor(100, -1)).toThrow(RangeError);
  });

  it('rejects non-finite arguments', () => {
    expect(() => speedFactor(Number.NaN, 20_000)).toThrow(TypeError);
  });
});

describe('timeLeftMs', () => {
  const deadline = new Date('2026-09-29T12:00:20.000Z');

  it('is the gap to the deadline', () => {
    expect(timeLeftMs(deadline, new Date('2026-09-29T12:00:10.000Z'))).toBe(10_000);
  });

  it('is zero exactly on the deadline', () => {
    expect(timeLeftMs(deadline, deadline)).toBe(0);
  });

  it('is zero, not negative, inside the grace window (§8.2)', () => {
    expect(timeLeftMs(deadline, new Date('2026-09-29T12:00:20.900Z'))).toBe(0);
  });
});

describe('comboSequence', () => {
  it('is zero for the first question', () => {
    expect(comboSequence([1, 1, 1])[0]).toBe(0);
  });

  it('counts only the immediately preceding run', () => {
    expect(comboSequence([1, 1, 0, 1, 1, 1])).toEqual([0, 1, 2, 0, 1, 2]);
  });

  it('resets on partial correctness', () => {
    expect(comboSequence([1, 1, 0.5, 1])).toEqual([0, 1, 2, 0]);
  });

  it('caps at 10', () => {
    const combos = comboSequence(Array.from({ length: 14 }, () => 1));
    expect(combos.slice(-3)).toEqual([10, 10, 10]);
  });

  it('handles an empty session', () => {
    expect(comboSequence([])).toEqual([]);
  });
});

describe('comboAfter', () => {
  it('reports the run ending at the last answer', () => {
    expect(comboAfter([])).toBe(0);
    expect(comboAfter([1])).toBe(1);
    expect(comboAfter([1, 1, 1])).toBe(3);
    expect(comboAfter([1, 1, 0])).toBe(0);
    expect(comboAfter([0, 1, 1])).toBe(2);
  });

  it('caps at 10 so the display matches the multiplier', () => {
    expect(comboAfter(Array.from({ length: 14 }, () => 1))).toBe(10);
  });
});

describe('comboMultiplier', () => {
  it.each([
    [0, '1'],
    [1, '1.05'],
    [5, '1.25'],
    [9, '1.45'],
    [10, '1.5'],
    [11, '1.5'], // capped
  ])('combo %i → %s', (combo, expected) => {
    expect(comboMultiplier(combo)).toBe(expected);
  });

  it('rejects a negative combo', () => {
    expect(() => comboMultiplier(-1)).toThrow(RangeError);
  });
});
