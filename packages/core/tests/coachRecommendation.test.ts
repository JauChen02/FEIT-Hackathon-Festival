import { describe, expect, it } from 'vitest';
import { deriveSignals, type CategorySignals, type DerivedSignals } from '../src/coach/derived';
import { explorationSeed } from '../src/coach/explorationHash';
import { chooseRecommendation } from '../src/coach/recommendation';
import { EXPLORATION_PROBABILITY, LAUNCH_CATEGORY_SLUGS } from '../src/domain';

/**
 * §11.5 recommendation selection. §24 Phase 3 requires "exploration triggered/
 * not triggered for fixed seeds; target rating = rating − 147".
 */

const build = (slug: string, overrides: Partial<CategorySignals> = {}): DerivedSignals =>
  deriveSignals({
    categorySlug: slug,
    rating: 1000,
    exposureCount: 0,
    recencyDays: null,
    ...overrides,
  });

/** The three launch categories, none of them played. */
const allNeverPlayed = () => LAUNCH_CATEGORY_SLUGS.map((slug) => build(slug));

/** Find a (user, date) pair whose seed does or does not trigger exploration. */
function findSeed(wantExploration: boolean): { userId: string; localDate: string } {
  for (let i = 0; i < 5_000; i += 1) {
    const userId = `user-${i}`;
    const localDate = '2026-09-29';
    const { r } = explorationSeed(userId, localDate);
    if (r < EXPLORATION_PROBABILITY === wantExploration) return { userId, localDate };
  }
  throw new Error('no seed found');
}

describe('explorationSeed (§11.5 step 2)', () => {
  it('is uniform in [0, 1)', () => {
    for (let i = 0; i < 200; i += 1) {
      const { r } = explorationSeed(`user-${i}`, '2026-09-29');
      expect(r).toBeGreaterThanOrEqual(0);
      expect(r).toBeLessThan(1);
    }
  });

  it('is deterministic for a given user and date', () => {
    const a = explorationSeed('user-1', '2026-09-29');
    const b = explorationSeed('user-1', '2026-09-29');
    expect(a.r).toBe(b.r);
    expect(a.digest).toBe(b.digest);
  });

  it('differs across dates for the same user', () => {
    const today = explorationSeed('user-1', '2026-09-29');
    const tomorrow = explorationSeed('user-1', '2026-09-30');
    expect(today.r).not.toBe(tomorrow.r);
  });

  it('differs across users on the same date', () => {
    const a = explorationSeed('user-1', '2026-09-29');
    const b = explorationSeed('user-2', '2026-09-29');
    expect(a.r).not.toBe(b.r);
  });

  it('fires roughly 10% of the time across many users', () => {
    let fired = 0;
    const trials = 3_000;
    for (let i = 0; i < trials; i += 1) {
      if (explorationSeed(`u${i}`, '2026-09-29').r < EXPLORATION_PROBABILITY) fired += 1;
    }
    // A fair hash should land near 10%; this is wide enough not to flake but
    // narrow enough to catch a badly skewed mapping.
    expect(fired / trials).toBeGreaterThan(0.07);
    expect(fired / trials).toBeLessThan(0.13);
  });

  it('draws the uniform pick from the same digest, so it is reproducible', () => {
    const seed = explorationSeed('user-1', '2026-09-29');
    expect(seed.pick(2)).toBe(explorationSeed('user-1', '2026-09-29').pick(2));
    expect(seed.pick(3)).toBeGreaterThanOrEqual(0);
    expect(seed.pick(3)).toBeLessThan(3);
  });

  it('rejects a non-positive pick range', () => {
    expect(() => explorationSeed('u', '2026-09-29').pick(0)).toThrow(RangeError);
  });
});

describe('chooseRecommendation (§11.5)', () => {
  it('picks the weakest category', () => {
    const choice = chooseRecommendation({
      signals: [
        build('math', { rating: 1269.13, exposureCount: 40, recencyDays: 1 }), // 0.163
        build('logic', { rating: 911.88, exposureCount: 30, recencyDays: 1 }), // 0.332
        build('science', { rating: 1078.45, exposureCount: 20, recencyDays: 35 }), // 0.427
      ],
      userId: findSeed(false).userId,
      localDate: '2026-09-29',
      gameTypeSlug: 'quiz_solo',
    });

    expect(choice.categorySlug).toBe('science');
  });

  it('breaks ties by slug when several categories score the same', () => {
    const choice = chooseRecommendation({
      signals: allNeverPlayed(),
      userId: findSeed(false).userId,
      localDate: '2026-09-29',
      gameTypeSlug: 'quiz_solo',
    });

    // logic < math < science
    expect(choice.categorySlug).toBe('logic');
  });

  // §24: "target rating = rating − 147".
  it('targets the chosen category rating minus 147', () => {
    const choice = chooseRecommendation({
      signals: allNeverPlayed(),
      userId: findSeed(false).userId,
      localDate: '2026-09-29',
      gameTypeSlug: 'quiz_solo',
    });

    expect(choice.targetRating).toBe(853);
  });

  it('targets the chosen category, not the top-ranked one, when exploring', () => {
    const { userId, localDate } = findSeed(true);
    const choice = chooseRecommendation({
      signals: [
        build('logic', { rating: 900, exposureCount: 0, recencyDays: null }),
        build('math', { rating: 1200, exposureCount: 0, recencyDays: null }),
        build('science', { rating: 1269.13, exposureCount: 40, recencyDays: 1 }),
      ],
      userId,
      localDate,
      gameTypeSlug: 'quiz_solo',
    });

    const chosen = choice.reason.categories.find((c) => c.categorySlug === choice.categorySlug)!;
    expect(choice.targetRating).toBe(chosen.rating - 147);
  });

  describe('exploration (§11.5 step 2)', () => {
    it('takes the top pick when the seed is at or above 0.10', () => {
      const { userId, localDate } = findSeed(false);
      const choice = chooseRecommendation({
        signals: allNeverPlayed(),
        userId,
        localDate,
        gameTypeSlug: 'quiz_solo',
      });

      expect(choice.reason.exploration.applied).toBe(false);
      expect(choice.categorySlug).toBe(choice.reason.topCategorySlug);
    });

    it('takes a different weak category when the seed is below 0.10', () => {
      const { userId, localDate } = findSeed(true);
      const choice = chooseRecommendation({
        signals: allNeverPlayed(),
        userId,
        localDate,
        gameTypeSlug: 'quiz_solo',
      });

      expect(choice.reason.exploration.applied).toBe(true);
      expect(choice.categorySlug).not.toBe(choice.reason.topCategorySlug);
      // §11.5: it must still be a *weak* category, not an arbitrary one.
      expect(choice.reason.weakCategorySlugs).toContain(choice.categorySlug);
    });

    it('does not explore when only one category is weak', () => {
      // §11.5 requires "more than one category has weakness_score > 0.40".
      const { userId, localDate } = findSeed(true);
      const choice = chooseRecommendation({
        signals: [
          build('science', { rating: 1078.45, exposureCount: 20, recencyDays: 35 }), // 0.427
          build('logic', { rating: 911.88, exposureCount: 30, recencyDays: 1 }), // 0.332
          build('math', { rating: 1269.13, exposureCount: 40, recencyDays: 1 }), // 0.163
        ],
        userId,
        localDate,
        gameTypeSlug: 'quiz_solo',
      });

      expect(choice.reason.weakCategorySlugs).toEqual(['science']);
      expect(choice.reason.exploration.applied).toBe(false);
      expect(choice.categorySlug).toBe('science');
    });

    it('is stable for a user across the same day', () => {
      const first = chooseRecommendation({
        signals: allNeverPlayed(),
        userId: 'stable-user',
        localDate: '2026-09-29',
        gameTypeSlug: 'quiz_solo',
      });
      const second = chooseRecommendation({
        signals: allNeverPlayed(),
        userId: 'stable-user',
        localDate: '2026-09-29',
        gameTypeSlug: 'quiz_solo',
      });
      expect(second).toEqual(first);
    });
  });

  describe('reason_json (§11.5 step 5)', () => {
    it('records every category the Coach considered, ranked', () => {
      const choice = chooseRecommendation({
        signals: allNeverPlayed(),
        userId: 'reason-user',
        localDate: '2026-09-29',
        gameTypeSlug: 'quiz_solo',
      });

      expect(choice.reason.categories).toHaveLength(3);
      for (const category of choice.reason.categories) {
        expect(category).toMatchObject({
          categorySlug: expect.any(String),
          rating: expect.any(Number),
          proficiency: expect.any(Number),
          confidence: expect.any(Number),
          staleness: expect.any(Number),
          exposureCount: expect.any(Number),
          weaknessScore: expect.any(Number),
        });
      }
    });

    it('records the seed, so the choice can be replayed', () => {
      const choice = chooseRecommendation({
        signals: allNeverPlayed(),
        userId: 'reason-user',
        localDate: '2026-09-29',
        gameTypeSlug: 'quiz_solo',
      });

      const seed = explorationSeed('reason-user', '2026-09-29');
      expect(choice.reason.exploration.seed).toBe(seed.digest);
      expect(choice.reason.exploration.r).toBe(seed.r);
      expect(choice.reason.exploration.probability).toBe(0.1);
    });

    it('survives a JSON round-trip, because it is stored as jsonb', () => {
      const choice = chooseRecommendation({
        signals: allNeverPlayed(),
        userId: 'reason-user',
        localDate: '2026-09-29',
        gameTypeSlug: 'quiz_solo',
      });
      expect(JSON.parse(JSON.stringify(choice.reason))).toEqual(choice.reason);
    });
  });

  it('refuses to choose from an empty category list', () => {
    expect(() =>
      chooseRecommendation({
        signals: [],
        userId: 'u',
        localDate: '2026-09-29',
        gameTypeSlug: 'quiz_solo',
      }),
    ).toThrow(/no launch categories/);
  });
});
