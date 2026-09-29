import { describe, expect, it } from 'vitest';
import {
  InsufficientQuestionsError,
  selectQuestions,
  targetRatingFor,
  type QuestionCandidate,
} from '../src/selection/selectQuestions';
import { STARTING_USER_RATING } from '../src/domain';

/**
 * §11.6 question selection. §24 Phase 1 requires "question selection ordering
 * and seeded tie-breaks".
 */

/** The seeded content shape: 3 questions at each difficulty 1..5 per category. */
function seedLikePool(): QuestionCandidate[] {
  const pool: QuestionCandidate[] = [];
  for (const rating of [800, 900, 1000, 1100, 1200]) {
    for (let copy = 0; copy < 3; copy += 1) {
      pool.push({ questionVersionId: `v-${rating}-${copy}`, rating });
    }
  }
  return pool;
}

describe('targetRatingFor (ADR-010)', () => {
  it('is user rating − 147', () => {
    expect(targetRatingFor(1000)).toBe(853);
    expect(targetRatingFor(1200)).toBe(1053);
  });
});

describe('selection against the seeded pool', () => {
  const pool = seedLikePool();

  it('targets 853 for a default-rated user', () => {
    const result = selectQuestions({
      candidates: pool,
      userRating: STARTING_USER_RATING,
      sessionId: 's1',
    });
    expect(result.targetRating).toBe(853);
  });

  it('picks the ten items nearest the target', () => {
    // Distances from 853: 900→47, 800→53, 1000→147, 1100→247, 1200→347.
    // Ten slots: all three 900s, all three 800s, all three 1000s, one 1100.
    const result = selectQuestions({ candidates: pool, userRating: 1000, sessionId: 's1' });
    const ratings = result.selected.map((item) => item.rating);

    expect(ratings).toHaveLength(10);
    expect(ratings.filter((r) => r === 900)).toHaveLength(3);
    expect(ratings.filter((r) => r === 800)).toHaveLength(3);
    expect(ratings.filter((r) => r === 1000)).toHaveLength(3);
    expect(ratings.filter((r) => r === 1100)).toHaveLength(1);
    expect(ratings.filter((r) => r === 1200)).toHaveLength(0);
  });

  it('presents them sorted by rating ascending — the warm-up effect (§11.6 step 5)', () => {
    const result = selectQuestions({ candidates: pool, userRating: 1000, sessionId: 's1' });
    const ratings = result.selected.map((item) => item.rating);

    expect(ratings).toEqual([...ratings].sort((a, b) => a - b));
    expect(ratings[0]).toBe(800);
    expect(ratings.at(-1)).toBe(1100);
  });

  it('never repeats a version within one session', () => {
    const result = selectQuestions({ candidates: pool, userRating: 1000, sessionId: 's1' });
    const ids = result.selected.map((item) => item.questionVersionId);
    expect(new Set(ids).size).toBe(10);
  });
});

describe('seeded tie-breaks (§11.6 step 4)', () => {
  const pool = seedLikePool();

  it('is deterministic for a given session id', () => {
    const first = selectQuestions({ candidates: pool, userRating: 1000, sessionId: 'session-a' });
    const second = selectQuestions({ candidates: pool, userRating: 1000, sessionId: 'session-a' });
    expect(first.selected).toEqual(second.selected);
  });

  it('breaks the 1100 tie differently for different session ids', () => {
    // Exactly one of the three 1100s takes the last slot; which one must vary
    // with the seed, or every user would always see the same question.
    const picks = new Set<string>();
    for (let i = 0; i < 40; i += 1) {
      const result = selectQuestions({
        candidates: pool,
        userRating: 1000,
        sessionId: `session-${i}`,
      });
      const chosen1100 = result.selected.find((item) => item.rating === 1100);
      picks.add(chosen1100!.questionVersionId);
    }
    expect(picks.size).toBeGreaterThan(1);
  });

  it('does not depend on the order the candidates arrive in', () => {
    const forwards = selectQuestions({ candidates: pool, userRating: 1000, sessionId: 'x' });
    const backwards = selectQuestions({
      candidates: [...pool].reverse(),
      userRating: 1000,
      sessionId: 'x',
    });
    // The same ten ratings, since the ranking is by distance alone.
    expect(forwards.selected.map((i) => i.rating)).toEqual(backwards.selected.map((i) => i.rating));
  });
});

describe('recently-answered exclusion (§11.6 step 3)', () => {
  it('avoids versions the user saw in the window when there is room', () => {
    // 20 candidates, 5 excluded → 15 remain, comfortably above 10.
    const pool: QuestionCandidate[] = Array.from({ length: 20 }, (_, i) => ({
      questionVersionId: `v${i}`,
      rating: 850 + i,
    }));
    const recent = ['v0', 'v1', 'v2', 'v3', 'v4'];

    const result = selectQuestions({
      candidates: pool,
      userRating: 1000,
      recentlyAnsweredVersionIds: recent,
      sessionId: 's',
    });

    expect(result.exclusionRelaxed).toBe(false);
    for (const id of recent) {
      expect(result.selected.map((i) => i.questionVersionId)).not.toContain(id);
    }
  });

  it('relaxes the exclusion rather than serving fewer than ten questions', () => {
    // §11.6: "unless fewer than 10 candidates would remain".
    const pool = seedLikePool(); // 15 items
    const recent = pool.slice(0, 10).map((item) => item.questionVersionId); // leaves 5

    const result = selectQuestions({
      candidates: pool,
      userRating: 1000,
      recentlyAnsweredVersionIds: recent,
      sessionId: 's',
    });

    expect(result.exclusionRelaxed).toBe(true);
    expect(result.selected).toHaveLength(10);
  });

  it('keeps the exclusion when exactly ten candidates would remain', () => {
    const pool = seedLikePool(); // 15
    const recent = pool.slice(0, 5).map((item) => item.questionVersionId); // leaves 10

    const result = selectQuestions({
      candidates: pool,
      userRating: 1000,
      recentlyAnsweredVersionIds: recent,
      sessionId: 's',
    });

    expect(result.exclusionRelaxed).toBe(false);
    for (const id of recent) {
      expect(result.selected.map((i) => i.questionVersionId)).not.toContain(id);
    }
  });
});

describe('insufficient content', () => {
  it('throws rather than building a short session', () => {
    const pool: QuestionCandidate[] = Array.from({ length: 9 }, (_, i) => ({
      questionVersionId: `v${i}`,
      rating: 900,
    }));

    expect(() => selectQuestions({ candidates: pool, userRating: 1000, sessionId: 's' })).toThrow(
      InsufficientQuestionsError,
    );
  });

  it('reports how many were available', () => {
    try {
      selectQuestions({ candidates: [], userRating: 1000, sessionId: 's' });
      expect.unreachable('should have thrown');
    } catch (error) {
      const typed = error as InsufficientQuestionsError;
      expect(typed.available).toBe(0);
      expect(typed.required).toBe(10);
    }
  });
});

/** §11.3 Elo expectation, used to check what the selection actually delivers. */
const expectedSuccess = (itemRating: number, userRating: number) =>
  1 / (1 + 10 ** ((itemRating - userRating) / 400));

const meanExpectedSuccess = (items: readonly QuestionCandidate[], userRating: number) =>
  items.reduce((total, item) => total + expectedSuccess(item.rating, userRating), 0) / items.length;

describe('expected success at the target (ADR-010)', () => {
  it('always takes the nearest available items — nothing unchosen beats a chosen one', () => {
    // This is what the algorithm guarantees regardless of what content exists.
    const pool = seedLikePool();
    const { selected, targetRating } = selectQuestions({
      candidates: pool,
      userRating: 1000,
      sessionId: 's',
    });

    const chosenIds = new Set(selected.map((item) => item.questionVersionId));
    const worstChosen = Math.max(...selected.map((item) => Math.abs(item.rating - targetRating)));
    const unchosen = pool.filter((item) => !chosenIds.has(item.questionVersionId));

    for (const item of unchosen) {
      expect(Math.abs(item.rating - targetRating)).toBeGreaterThanOrEqual(worstChosen);
    }
  });

  it('lands inside the 65–75% band when the content is fine-grained enough', () => {
    // A pool with items every 10 rating points, as §13.6's launch target of
    // ≥150 questions per category (≥30 per difficulty) would produce.
    const fine: QuestionCandidate[] = Array.from({ length: 60 }, (_, i) => ({
      questionVersionId: `f${i}`,
      rating: 700 + i * 10,
    }));

    const { selected } = selectQuestions({ candidates: fine, userRating: 1000, sessionId: 's' });
    expect(meanExpectedSuccess(selected, 1000)).toBeGreaterThan(0.65);
    expect(meanExpectedSuccess(selected, 1000)).toBeLessThan(0.75);
  });

  it('is harder than the target against the thin dev seed, which is a content limit', () => {
    // 15 items at five 100-point steps cannot fill ten slots near 853: the set
    // is forced out to three 1000s and a 1100, pulling expected success down
    // to ~0.61. The algorithm is doing the right thing with the wrong pool —
    // the fix is more content per difficulty (§13.6), not a different rule.
    const pool = seedLikePool();
    const { selected } = selectQuestions({ candidates: pool, userRating: 1000, sessionId: 's' });

    expect(meanExpectedSuccess(selected, 1000)).toBeCloseTo(0.606, 2);
  });
});
