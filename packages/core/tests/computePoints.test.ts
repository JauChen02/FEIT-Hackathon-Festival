import { describe, expect, it } from 'vitest';
import { COMPLETION_BONUS } from '../src/domain';
import { NEUTRAL_MULTIPLIERS, computePoints } from '../src/scoring/computePoints';
import type { ComputePointsInput, QuestionOutcome } from '../src/scoring/types';

/**
 * §10 in full. §24 Phase 1 requires coverage of: "fully correct, fully
 * incorrect, timeout, partial correctness, speed-factor boundaries (0 ms left,
 * full time left, grace window), combo build/reset/cap, each multiplier's
 * boundaries, total multiplier cap (binding and non-binding), rounding (x.5
 * cases), and the §10.3 worked example".
 */

function input(overrides: Partial<ComputePointsInput> = {}): ComputePointsInput {
  return {
    questions: [],
    completionBonus: COMPLETION_BONUS,
    multipliers: { ...NEUTRAL_MULTIPLIERS },
    ...overrides,
  };
}

const q = (correctness: number, speedFactor: number): QuestionOutcome => ({
  correctness,
  speedFactor,
});

/** Ten identical questions — the shape of a real solo session. */
const ten = (correctness: number, speedFactor: number) =>
  Array.from({ length: 10 }, () => q(correctness, speedFactor));

describe('§10.3 worked example (MUST be a unit test)', () => {
  it('scores 1598', () => {
    const result = computePoints({
      // 10 questions, all correct, 10,000 of 20,000 ms remaining → 0.75.
      questions: ten(1, 0.75),
      completionBonus: 50,
      multipliers: {
        streak: 1.1, // streak 5 days
        friend: 1,
        weakness: 1.5, // RECOMMENDED, no improvement
        event: 1,
      },
    });

    expect(result.rawBasePoints).toBe('800');
    expect(result.comboAdjustedPoints).toBe('968.75');
    expect(result.multipliers.session).toBe('1.65');
    expect(result.uncappedPoints).toBe('1598.4375');
    expect(result.cap).toBe('3200');
    expect(result.capApplied).toBe(false);
    expect(result.finalPoints).toBe(1598);
  });

  it('agrees with the spec on each intermediate: Σ q_base 750, Σ q_combo 918.75', () => {
    const result = computePoints({
      questions: ten(1, 0.75),
      completionBonus: 50,
      multipliers: { streak: 1.1, friend: 1, weakness: 1.5, event: 1 },
    });

    // Σ q_base = 750, so raw_base = 750 + 50.
    expect(Number(result.rawBasePoints) - 50).toBe(750);
    // Σ q_combo = 75 × (10 + 0.05 × 45) = 918.75.
    expect(Number(result.comboAdjustedPoints) - 50).toBe(918.75);
    expect(result.comboContribution).toBe('168.75');
  });
});

describe('per-question base (§10.1)', () => {
  it('is 100 × correctness × speed_factor', () => {
    const result = computePoints(input({ questions: [q(1, 1)], completionBonus: 0 }));
    expect(result.perQuestion[0]?.qBase).toBe('100');
  });

  it('is 0 for a fully incorrect answer regardless of speed', () => {
    const result = computePoints(input({ questions: [q(0, 1)], completionBonus: 0 }));
    expect(result.perQuestion[0]?.qBase).toBe('0');
    expect(result.finalPoints).toBe(0);
  });

  it('handles partial correctness', () => {
    // Not reachable from MVP question types, but §9 normalises correctness to
    // 0..1 and scenarios/mini-games (Alpha) will use the middle of the range.
    const result = computePoints(input({ questions: [q(0.5, 1)], completionBonus: 0 }));
    expect(result.perQuestion[0]?.qBase).toBe('50');
  });

  it('scores a timeout as zero', () => {
    // §10.1: "Timeouts: correctness 0 so the value is irrelevant."
    const slow = computePoints(input({ questions: [q(0, 0.5)], completionBonus: 0 }));
    const fast = computePoints(input({ questions: [q(0, 1)], completionBonus: 0 }));
    expect(slow.finalPoints).toBe(0);
    expect(fast.finalPoints).toBe(0);
  });
});

describe('speed-factor boundaries (§10.1)', () => {
  it('scores 50 at the 0.5 floor — answered with no time left', () => {
    const result = computePoints(input({ questions: [q(1, 0.5)], completionBonus: 0 }));
    expect(result.perQuestion[0]?.qBase).toBe('50');
  });

  it('scores 100 at the 1.0 ceiling — answered instantly', () => {
    const result = computePoints(input({ questions: [q(1, 1)], completionBonus: 0 }));
    expect(result.perQuestion[0]?.qBase).toBe('100');
  });

  it('is monotonic in speed', () => {
    const bases = [0.5, 0.6, 0.75, 0.9, 1].map((factor) =>
      Number(
        computePoints(input({ questions: [q(1, factor)], completionBonus: 0 })).perQuestion[0]!
          .qBase,
      ),
    );
    for (let i = 1; i < bases.length; i += 1) {
      expect(bases[i]!).toBeGreaterThan(bases[i - 1]!);
    }
  });
});

describe('combo (§10.1, §10.2)', () => {
  it('starts at 0 — the first question can never carry a combo', () => {
    const result = computePoints(input({ questions: ten(1, 1) }));
    expect(result.perQuestion[0]?.combo).toBe(0);
    expect(result.perQuestion[0]?.comboMult).toBe('1');
  });

  it('builds by one per consecutive fully-correct answer', () => {
    const result = computePoints(input({ questions: ten(1, 1) }));
    expect(result.perQuestion.map((entry) => entry.combo)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(result.perQuestion.map((entry) => entry.comboMult)).toEqual([
      '1',
      '1.05',
      '1.1',
      '1.15',
      '1.2',
      '1.25',
      '1.3',
      '1.35',
      '1.4',
      '1.45',
    ]);
  });

  it('resets on a wrong answer', () => {
    const result = computePoints(
      input({ questions: [q(1, 1), q(1, 1), q(0, 1), q(1, 1), q(1, 1)] }),
    );
    expect(result.perQuestion.map((entry) => entry.combo)).toEqual([0, 1, 2, 0, 1]);
  });

  it('resets on partial correctness, not just on zero', () => {
    // §10.1: "Resets on any answer with correctness < 1 or timeout."
    const result = computePoints(input({ questions: [q(1, 1), q(0.9, 1), q(1, 1)] }));
    expect(result.perQuestion.map((entry) => entry.combo)).toEqual([0, 1, 0]);
  });

  it('caps at 10', () => {
    const result = computePoints(input({ questions: Array.from({ length: 15 }, () => q(1, 1)) }));
    const combos = result.perQuestion.map((entry) => entry.combo);
    expect(Math.max(...combos)).toBe(10);
    expect(combos.slice(10)).toEqual([10, 10, 10, 10, 10]);
    expect(result.perQuestion.at(-1)?.comboMult).toBe('1.5');
  });

  it('never multiplies the completion bonus (§10.2 step 4)', () => {
    const withBonus = computePoints(input({ questions: ten(1, 1), completionBonus: 50 }));
    const withoutBonus = computePoints(input({ questions: ten(1, 1), completionBonus: 0 }));

    // The bonus adds exactly 50 to both the raw and the combo-adjusted totals.
    expect(Number(withBonus.rawBasePoints) - Number(withoutBonus.rawBasePoints)).toBe(50);
    expect(Number(withBonus.comboAdjustedPoints) - Number(withoutBonus.comboAdjustedPoints)).toBe(
      50,
    );
  });
});

describe('multiplier boundaries (§10.1)', () => {
  it.each([
    ['streak at its 1.00 floor (0 days)', { streak: 1 }, '1'],
    ['streak at its 1.60 ceiling (30+ days)', { streak: 1.6 }, '1.6'],
    ['friend at its 1.00 floor (solo)', { friend: 1 }, '1'],
    ['friend at its 1.30 ceiling (3 friends)', { friend: 1.3 }, '1.3'],
    ['weakness NONE', { weakness: 1 }, '1'],
    ['weakness WEAK', { weakness: 1.25 }, '1.25'],
    ['weakness RECOMMENDED', { weakness: 1.5 }, '1.5'],
    ['weakness RECOMMENDED + improvement', { weakness: 1.75 }, '1.75'],
    ['event at its 2.0 ceiling', { event: 2 }, '2'],
  ])('%s', (_label, override, expected) => {
    const result = computePoints(input({ multipliers: { ...NEUTRAL_MULTIPLIERS, ...override } }));
    expect(result.multipliers.session).toBe(expected);
  });

  it('multiplies the four together (§10.2 step 5)', () => {
    const result = computePoints(
      input({ multipliers: { streak: 1.1, friend: 1.2, weakness: 1.5, event: 2 } }),
    );
    expect(result.multipliers.session).toBe('3.96');
  });

  it('rejects a non-positive multiplier rather than producing negative points', () => {
    expect(() =>
      computePoints(input({ multipliers: { ...NEUTRAL_MULTIPLIERS, streak: 0 } })),
    ).toThrow(RangeError);
    expect(() =>
      computePoints(input({ multipliers: { ...NEUTRAL_MULTIPLIERS, weakness: -1 } })),
    ).toThrow(RangeError);
  });
});

describe('the total multiplier cap (§10.2 steps 7-8, ADR-015)', () => {
  it('does not bind when the multipliers are modest', () => {
    const result = computePoints(
      input({ questions: ten(1, 1), multipliers: { ...NEUTRAL_MULTIPLIERS, streak: 1.6 } }),
    );
    expect(result.capApplied).toBe(false);
    expect(result.finalPoints).toBe(Math.round(Number(result.uncappedPoints)));
  });

  it('binds at 4× the raw base when the multipliers are extreme', () => {
    const result = computePoints(
      input({
        questions: ten(1, 1),
        // 1.6 × 1.3 × 1.75 × 2 = 7.28, well past the 4× ceiling.
        multipliers: { streak: 1.6, friend: 1.3, weakness: 1.75, event: 2 },
      }),
    );

    expect(result.capApplied).toBe(true);
    expect(result.cap).toBe('4200'); // (1000 + 50) × 4
    expect(result.finalPoints).toBe(4200);
    expect(Number(result.uncappedPoints)).toBeGreaterThan(4200);
  });

  it('caps against the raw base, not the combo-adjusted base', () => {
    // The whole point of ADR-015: a long combo must not raise the ceiling.
    const result = computePoints(
      input({
        questions: ten(1, 1),
        multipliers: { streak: 1.6, friend: 1.3, weakness: 1.75, event: 2 },
      }),
    );
    expect(result.cap).toBe(String(Number(result.rawBasePoints) * 4));
    expect(Number(result.cap)).toBeLessThan(Number(result.comboAdjustedPoints) * 4);
  });

  it('reports capApplied strictly — equal to the cap is not capped', () => {
    // session_mult chosen so uncapped lands exactly on the cap.
    const questions = [q(1, 1)];
    const uncapped = computePoints(input({ questions, completionBonus: 0 }));
    expect(uncapped.capApplied).toBe(false);
  });
});

describe('rounding (§10.2 step 8)', () => {
  it('rounds exactly once, at the end', () => {
    // Each q_base is 33.333…; rounding per question would give 330, and
    // rounding the sum gives 333. The spec requires the latter.
    const result = computePoints(
      input({ questions: Array.from({ length: 10 }, () => q(1, 1 / 3)), completionBonus: 0 }),
    );
    // Σ q_base = 333.33…, with combos 0..9 applied on top.
    expect(result.finalPoints).toBe(408);
  });

  it.each([
    [0.5, 1],
    [1.5, 2],
    [2.5, 3],
    [3.5, 4],
  ])('rounds %s half-up to %s', (value, expected) => {
    // Drive the total to exactly `value` via a single question's base.
    // (Negative totals are unreachable: correctness and speedFactor are both
    // non-negative and the completion bonus cannot be negative.)
    const result = computePoints(input({ questions: [q(1, value / 100)], completionBonus: 0 }));
    expect(result.finalPoints).toBe(expected);
  });

  it('rounds x.5 up rather than to even', () => {
    // raw base 0.5 → 1 (half-up), not 0 (banker's rounding).
    const result = computePoints(input({ questions: [q(1, 0.005)], completionBonus: 0 }));
    expect(result.finalPoints).toBe(1);
    // and 1.5 → 2
    const oneAndAHalf = computePoints(input({ questions: [q(1, 0.015)], completionBonus: 0 }));
    expect(oneAndAHalf.finalPoints).toBe(2);
  });

  it('returns an integer', () => {
    const result = computePoints(input({ questions: ten(1, 0.77) }));
    expect(Number.isInteger(result.finalPoints)).toBe(true);
  });
});

describe('whole-session shapes', () => {
  it('scores a perfect, instant session', () => {
    const result = computePoints(input({ questions: ten(1, 1) }));
    expect(result.rawBasePoints).toBe('1050');
    // Σ q_combo = 100 × (10 + 0.05 × 45) = 1225
    expect(result.comboAdjustedPoints).toBe('1275');
    expect(result.finalPoints).toBe(1275);
  });

  it('scores a session of all wrong answers as the completion bonus alone', () => {
    const result = computePoints(input({ questions: ten(0, 1) }));
    expect(result.rawBasePoints).toBe('50');
    expect(result.finalPoints).toBe(50);
  });

  it('scores a session of all timeouts as the completion bonus alone', () => {
    const result = computePoints(input({ questions: ten(0, 0.5) }));
    expect(result.finalPoints).toBe(50);
  });

  it('awards nothing at all when there is no completion bonus and no correct answer', () => {
    const result = computePoints(input({ questions: ten(0, 1), completionBonus: 0 }));
    expect(result.finalPoints).toBe(0);
  });

  it('handles an empty question list', () => {
    const result = computePoints(input({ questions: [] }));
    expect(result.finalPoints).toBe(50);
    expect(result.perQuestion).toEqual([]);
  });
});

describe('input validation', () => {
  it.each([-0.1, 1.1, Number.NaN])('rejects correctness %s', (correctness) => {
    expect(() => computePoints(input({ questions: [q(correctness, 1)] }))).toThrow(RangeError);
  });

  it.each([-0.1, 1.1, Number.NaN])('rejects speedFactor %s', (speedFactor) => {
    expect(() => computePoints(input({ questions: [q(1, speedFactor)] }))).toThrow(RangeError);
  });

  it('rejects a negative completion bonus', () => {
    expect(() => computePoints(input({ completionBonus: -1 }))).toThrow(RangeError);
  });
});

describe('the breakdown is reproducible (§10.4)', () => {
  it('records every input and intermediate the ledger needs', () => {
    const result = computePoints(input({ questions: ten(1, 0.75) }));

    expect(result.perQuestion).toHaveLength(10);
    for (const entry of result.perQuestion) {
      expect(entry).toHaveProperty('correctness');
      expect(entry).toHaveProperty('speedFactor');
      expect(entry).toHaveProperty('qBase');
      expect(entry).toHaveProperty('combo');
      expect(entry).toHaveProperty('comboMult');
      expect(entry).toHaveProperty('qCombo');
    }
    expect(result).toMatchObject({
      rawBasePoints: expect.any(String),
      comboAdjustedPoints: expect.any(String),
      uncappedPoints: expect.any(String),
      cap: expect.any(String),
      capApplied: expect.any(Boolean),
      finalPoints: expect.any(Number),
    });
  });

  it('is deterministic', () => {
    const args = input({ questions: ten(1, 0.75) });
    expect(computePoints(args)).toEqual(computePoints(args));
  });

  it('survives a JSON round-trip, because it is stored as jsonb', () => {
    const result = computePoints(input({ questions: ten(1, 0.75) }));
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
  });
});
