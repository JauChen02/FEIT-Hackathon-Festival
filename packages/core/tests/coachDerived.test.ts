import { describe, expect, it } from 'vitest';
import {
  confidence,
  deriveSignals,
  proficiency,
  staleness,
  type CategorySignals,
} from '../src/coach/derived';
import { strengths, weakCategories, rankByWeakness } from '../src/coach/weakness';

/**
 * §11.4 derived values. §24 Phase 3 requires: "proficiency clamp at both ends;
 * confidence at 0/30/100 events; weakness score for fixture profiles
 * (never-played = 0.50, strong-and-recent, weak-and-frequent, stale);
 * weak/strength selection and slug tie-breaks".
 *
 * Every value here is computed at read time and never stored (Invariant 5).
 */

const signals = (overrides: Partial<CategorySignals> = {}): CategorySignals => ({
  categorySlug: 'math',
  rating: 1000,
  exposureCount: 0,
  recencyDays: null,
  ...overrides,
});

describe('proficiency (§11.4)', () => {
  it.each([
    [600, 0],
    [800, 25],
    [1000, 50],
    [1200, 75],
    [1400, 100],
  ])('rating %i → proficiency %i', (rating, expected) => {
    expect(proficiency(rating)).toBe(expected);
  });

  it('clamps at both ends', () => {
    expect(proficiency(400)).toBe(0);
    expect(proficiency(0)).toBe(0);
    expect(proficiency(1600)).toBe(100);
    expect(proficiency(99_999)).toBe(100);
  });
});

describe('confidence (§11.4)', () => {
  it.each([
    [0, 0],
    [30, 0.632121],
    [60, 0.864665],
    [100, 0.964326],
  ])('%i events → confidence %f', (events, expected) => {
    expect(confidence(events)).toBeCloseTo(expected, 5);
  });

  it('is monotonic and never reaches 1', () => {
    let previous = -1;
    for (const events of [0, 1, 5, 30, 100, 1000]) {
      const value = confidence(events);
      expect(value).toBeGreaterThan(previous);
      expect(value).toBeLessThan(1);
      previous = value;
    }
  });

  it('treats a negative count as no evidence', () => {
    expect(confidence(-5)).toBe(0);
  });
});

describe('staleness (§11.4)', () => {
  it.each([
    [0, 0],
    [7, 0.5],
    [14, 1],
    [35, 1],
  ])('%i days since the last event → staleness %f', (days, expected) => {
    expect(staleness(days)).toBe(expected);
  });

  it('treats never-played as maximally stale', () => {
    expect(staleness(null)).toBe(1);
  });

  it('saturates rather than growing without bound', () => {
    expect(staleness(365)).toBe(1);
  });
});

describe('weaknessScore (§11.4)', () => {
  // §24 names this one explicitly.
  it('is exactly 0.50 for a never-played category', () => {
    const derived = deriveSignals(signals());

    // 0.50 × 0.5 × 0 + 0.35 × 1 + 0.15 × 1
    expect(derived.confidence).toBe(0);
    expect(derived.staleness).toBe(1);
    expect(derived.weaknessScore).toBeCloseTo(0.5, 10);
    expect(derived.neverPlayed).toBe(true);
  });

  it('scores a strong, recent, well-evidenced category low', () => {
    // The fx_strong fixture: math rating 1269.13, 40 events, played yesterday.
    const derived = deriveSignals(
      signals({ categorySlug: 'math', rating: 1269.13, exposureCount: 40, recencyDays: 1 }),
    );

    expect(derived.proficiency).toBeCloseTo(83.641, 3);
    expect(derived.confidence).toBeCloseTo(0.7364, 4);
    expect(derived.weaknessScore).toBeCloseTo(0.163206, 6);
  });

  it('scores a weak-but-frequently-played category in the middle', () => {
    // fx_weak: logic rating 911.88, 30 events, played yesterday.
    const derived = deriveSignals(
      signals({ categorySlug: 'logic', rating: 911.88, exposureCount: 30, recencyDays: 1 }),
    );

    expect(derived.proficiency).toBeCloseTo(38.985, 3);
    expect(derived.weaknessScore).toBeCloseTo(0.332316, 6);
  });

  it('scores a stale category high, driven by the staleness term', () => {
    // fx_stale: science rating 1078.45, 20 events, 35 days ago.
    const derived = deriveSignals(
      signals({ categorySlug: 'science', rating: 1078.45, exposureCount: 20, recencyDays: 35 }),
    );

    expect(derived.staleness).toBe(1);
    expect(derived.weaknessScore).toBeCloseTo(0.427484, 6);
  });

  it('never leaves 0..1', () => {
    for (const rating of [400, 1000, 1600]) {
      for (const exposureCount of [0, 1, 30, 500]) {
        for (const recencyDays of [null, 0, 7, 100]) {
          const { weaknessScore } = deriveSignals(signals({ rating, exposureCount, recencyDays }));
          expect(weaknessScore).toBeGreaterThanOrEqual(0);
          expect(weaknessScore).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  it('counts a low rating as weakness only once there is evidence for it', () => {
    // The skill term is multiplied by confidence, so one bad session does not
    // brand a category weak on skill — it is the exposure term that dominates.
    const noEvidence = deriveSignals(signals({ rating: 650, exposureCount: 1, recencyDays: 0 }));
    const evidence = deriveSignals(signals({ rating: 650, exposureCount: 60, recencyDays: 0 }));

    expect(evidence.skillGap).toBeCloseTo(noEvidence.skillGap, 10);
    // Same skill gap, but the well-evidenced one attributes more of its score
    // to skill rather than to not knowing.
    expect(evidence.weaknessScore).toBeGreaterThan(
      0.5 * evidence.skillGap * evidence.confidence - 0.001,
    );
    expect(noEvidence.exposureGap).toBeGreaterThan(evidence.exposureGap);
  });
});

describe('weakCategories (§11.4)', () => {
  const never = (slug: string) => deriveSignals(signals({ categorySlug: slug }));
  const played = (slug: string, rating: number, exposureCount: number, recencyDays: number) =>
    deriveSignals(signals({ categorySlug: slug, rating, exposureCount, recencyDays }));

  it('selects only categories strictly above 0.40', () => {
    const stale = played('science', 1078.45, 20, 35); // 0.4275
    const weakish = played('logic', 911.88, 30, 1); // 0.3324
    const strong = played('math', 1269.13, 40, 1); // 0.1632

    expect(weakCategories([stale, weakish, strong]).map((s) => s.categorySlug)).toEqual([
      'science',
    ]);
  });

  it('orders by score descending', () => {
    const ranked = rankByWeakness([
      played('math', 1269.13, 40, 1),
      never('logic'),
      played('science', 1078.45, 20, 35),
    ]);
    expect(ranked.map((s) => s.categorySlug)).toEqual(['logic', 'science', 'math']);
  });

  it('breaks ties by slug ascending', () => {
    // Three never-played categories all score exactly 0.50.
    const ranked = rankByWeakness([never('science'), never('math'), never('logic')]);
    expect(ranked.map((s) => s.categorySlug)).toEqual(['logic', 'math', 'science']);
  });

  it('caps at three', () => {
    const many = ['a', 'b', 'c', 'd', 'e'].map(never);
    expect(weakCategories(many)).toHaveLength(3);
  });

  it('returns nothing when every category is strong', () => {
    const strong = ['math', 'logic', 'science'].map((slug) => played(slug, 1350, 60, 0));
    expect(weakCategories(strong)).toEqual([]);
  });
});

describe('strengths (§11.4)', () => {
  const build = (slug: string, rating: number, exposureCount: number) =>
    deriveSignals(signals({ categorySlug: slug, rating, exposureCount, recencyDays: 1 }));

  it('takes the top two by proficiency × confidence', () => {
    const result = strengths([
      build('math', 1300, 60),
      build('logic', 1100, 60),
      build('science', 900, 60),
    ]);
    expect(result.map((s) => s.categorySlug)).toEqual(['math', 'logic']);
  });

  it('excludes categories below 0.3 confidence', () => {
    // 10 events gives confidence 0.283 — just under the gate.
    const barelyPlayed = build('math', 1400, 10);
    expect(barelyPlayed.confidence).toBeLessThan(0.3);
    expect(strengths([barelyPlayed])).toEqual([]);
  });

  it('includes a category exactly at the 0.3 gate', () => {
    // ~10.7 events reaches 0.3; 11 clears it.
    const eleven = build('math', 1400, 11);
    expect(eleven.confidence).toBeGreaterThanOrEqual(0.3);
    expect(strengths([eleven]).map((s) => s.categorySlug)).toEqual(['math']);
  });

  it('breaks ties by slug ascending', () => {
    const result = strengths([
      build('science', 1200, 60),
      build('logic', 1200, 60),
      build('math', 1200, 60),
    ]);
    expect(result.map((s) => s.categorySlug)).toEqual(['logic', 'math']);
  });

  it('is empty for a learner who has played nothing', () => {
    expect(
      strengths(
        ['math', 'logic', 'science'].map((slug) => deriveSignals(signals({ categorySlug: slug }))),
      ),
    ).toEqual([]);
  });

  it('excludes a confidently bad category (ADR-053)', () => {
    // The `fx_weak` shape: plenty of exposure, rating well below the start.
    // Confidence alone would call this a strength, which is the bug ADR-053
    // fixes — a learner must not be told their worst subject is their best.
    const confidentlyBad = build('logic', 912, 30);
    expect(confidentlyBad.confidence).toBeGreaterThan(0.3);
    expect(confidentlyBad.proficiency).toBeLessThan(50);
    expect(strengths([confidentlyBad])).toEqual([]);
  });

  it('excludes a category sitting exactly at the starting rating', () => {
    // 1000 → proficiency exactly 50. Nothing has been demonstrated yet.
    const neutral = build('math', 1000, 60);
    expect(neutral.proficiency).toBe(50);
    expect(strengths([neutral])).toEqual([]);
  });

  it('includes a category just above the starting rating', () => {
    const justAbove = build('math', 1008, 60);
    expect(justAbove.proficiency).toBeGreaterThan(50);
    expect(strengths([justAbove]).map((s) => s.categorySlug)).toEqual(['math']);
  });
});
