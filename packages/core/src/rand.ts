/**
 * Seeded randomness (PLANNING.md §21.1, §22.5).
 *
 * "Never use wall-clock time or unseeded randomness in domain logic or tests"
 * (§29). Every non-deterministic choice the domain makes — currently only the
 * §11.6 tie-break — draws from a generator seeded by something stable, so the
 * same inputs always produce the same output.
 */

import seedrandom from 'seedrandom';

export interface SeededRandom {
  /** Uniform in [0, 1). */
  next(): number;
  /** Uniform integer in [0, exclusiveMax). */
  nextInt(exclusiveMax: number): number;
}

export function seededRandom(seed: string): SeededRandom {
  const prng = seedrandom(seed);
  return {
    next: () => prng(),
    nextInt: (exclusiveMax: number) => {
      if (!Number.isInteger(exclusiveMax) || exclusiveMax <= 0) {
        throw new RangeError(
          `nextInt: exclusiveMax must be a positive integer, got ${exclusiveMax}`,
        );
      }
      return Math.floor(prng() * exclusiveMax);
    },
  };
}

/**
 * Fisher-Yates shuffle driven by a seeded generator.
 *
 * Returns a new array; the input is not mutated.
 */
export function seededShuffle<T>(items: readonly T[], random: SeededRandom): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = random.nextInt(i + 1);
    const a = result[i]!;
    const b = result[j]!;
    result[i] = b;
    result[j] = a;
  }
  return result;
}
