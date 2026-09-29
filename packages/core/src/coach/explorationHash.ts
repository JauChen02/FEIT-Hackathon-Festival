/**
 * The exploration seed (PLANNING.md §11.5 step 2).
 *
 * "let `r = hash(user_id, local_date)` mapped to [0,1). If `r < 0.10` and more
 *  than one category has `weakness_score > 0.40`, pick uniformly (**seeded by
 *  the same hash**) among weak categories other than the top one."
 *
 * §11.5 does not name a hash, so this uses the SHA-256 already in
 * `packages/core` (ADR-030) — no new dependency, and deterministic across
 * processes, which a `Math.random`-style PRNG seeded at startup would not be.
 *
 * One digest drives both decisions, as the spec requires: the first 32 bits
 * give `r`, the next 32 give the uniform pick.
 */

import { sha256 } from '../crypto/sha256';

const TWO_POW_32 = 2 ** 32;

export interface ExplorationSeed {
  /** Uniform in [0, 1). Compared against the 0.10 exploration probability. */
  r: number;
  /** The full digest, recorded in `reason_json` so the choice is reproducible. */
  digest: string;
  /** Uniform integer in [0, n) drawn from the same digest. */
  pick(n: number): number;
}

export function explorationSeed(userId: string, localDate: string): ExplorationSeed {
  const digest = sha256(`learnarena:recommendation:${userId}:${localDate}`);

  const r = Number.parseInt(digest.slice(0, 8), 16) / TWO_POW_32;
  const secondWord = Number.parseInt(digest.slice(8, 16), 16);

  return {
    r,
    digest,
    pick: (n: number) => {
      if (!Number.isInteger(n) || n <= 0) {
        throw new RangeError(`explorationSeed.pick: n must be a positive integer, got ${n}`);
      }
      return secondWord % n;
    },
  };
}
