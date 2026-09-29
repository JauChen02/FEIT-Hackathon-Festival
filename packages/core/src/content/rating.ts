/**
 * Difficulty → canonical Elo rating (PLANNING.md §11.2, ADR-009).
 *
 * `difficulty` is editorial metadata (1..5); `rating` is the Coach's canonical
 * difficulty estimate. In MVP the rating is fixed at publish time and lives on
 * the immutable question version. Automatic calibration is deferred (§26).
 */

export const MIN_DIFFICULTY = 1;
export const MAX_DIFFICULTY = 5;

export type Difficulty = 1 | 2 | 3 | 4 | 5;

export function isDifficulty(value: unknown): value is Difficulty {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= MIN_DIFFICULTY &&
    value <= MAX_DIFFICULTY
  );
}

/** difficulty 1..5 → rating 800, 900, 1000, 1100, 1200. */
export function ratingForDifficulty(difficulty: number): number {
  if (!isDifficulty(difficulty)) {
    throw new RangeError(
      `ratingForDifficulty: difficulty must be an integer ${MIN_DIFFICULTY}..${MAX_DIFFICULTY}, got ${String(difficulty)}`,
    );
  }
  return 700 + 100 * difficulty;
}
