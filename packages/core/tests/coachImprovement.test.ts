import { describe, expect, it } from 'vitest';
import { evaluateImprovement } from '../src/coach/improvement';
import { resolveTier, tierMultiplier } from '../src/coach/tier';

/**
 * §11.7 improvement bonus and §11.8 tier resolution. §24 Phase 3 requires
 * "improvement bonus disabled below 3 sessions, triggered at exactly +0.10,
 * not at +0.09; tier fallback rules".
 */

describe('evaluateImprovement (§11.7)', () => {
  describe('history requirement', () => {
    it.each([0, 1, 2])('is disabled with %i prior qualifying sessions', (count) => {
      const result = evaluateImprovement({
        sessionAccuracy: 1,
        priorAccuracies: Array.from({ length: count }, () => 0),
      });

      expect(result.bonus).toBe(0);
      expect(result.baseline).toBeNull();
      expect(result.reason).toBe('insufficient_history');
    });

    it('is enabled from exactly 3 prior sessions', () => {
      const result = evaluateImprovement({
        sessionAccuracy: 1,
        priorAccuracies: [0.5, 0.5, 0.5],
      });

      expect(result.reason).toBe('granted');
      expect(result.baseline).toBe(0.5);
      expect(result.baselineSessionCount).toBe(3);
    });
  });

  describe('the +0.10 threshold', () => {
    const priors = [0.5, 0.5, 0.5];

    it('grants at exactly +0.10', () => {
      // §11.7 says "≥ baseline + 0.10", so the boundary is inclusive.
      const result = evaluateImprovement({ sessionAccuracy: 0.6, priorAccuracies: priors });
      expect(result.bonus).toBe(0.25);
      expect(result.reason).toBe('granted');
    });

    it('does not grant at +0.09', () => {
      const result = evaluateImprovement({ sessionAccuracy: 0.59, priorAccuracies: priors });
      expect(result.bonus).toBe(0);
      expect(result.reason).toBe('not_enough_improvement');
    });

    it('grants comfortably above the threshold', () => {
      expect(evaluateImprovement({ sessionAccuracy: 0.9, priorAccuracies: priors }).bonus).toBe(
        0.25,
      );
    });

    it('does not grant for a session that got worse', () => {
      expect(evaluateImprovement({ sessionAccuracy: 0.2, priorAccuracies: priors }).bonus).toBe(0);
    });

    it('does not grant for flat performance', () => {
      expect(evaluateImprovement({ sessionAccuracy: 0.5, priorAccuracies: priors }).bonus).toBe(0);
    });
  });

  describe('the baseline window', () => {
    it('averages all priors when there are 3 or 4', () => {
      const three = evaluateImprovement({
        sessionAccuracy: 1,
        priorAccuracies: [0.9, 0.6, 0.3],
      });
      expect(three.baseline).toBeCloseTo(0.6, 10);
      expect(three.baselineSessionCount).toBe(3);

      const four = evaluateImprovement({
        sessionAccuracy: 1,
        priorAccuracies: [0.8, 0.6, 0.4, 0.2],
      });
      expect(four.baseline).toBeCloseTo(0.5, 10);
      expect(four.baselineSessionCount).toBe(4);
    });

    it('takes only the most recent 5 when more exist', () => {
      // Caller passes most-recent-first. The five 1.0s should win; the older
      // 0.0s must not drag the baseline down.
      const result = evaluateImprovement({
        sessionAccuracy: 1,
        priorAccuracies: [1, 1, 1, 1, 1, 0, 0, 0, 0, 0],
      });

      expect(result.baseline).toBe(1);
      expect(result.baselineSessionCount).toBe(5);
      // Already at the ceiling, so no improvement is possible.
      expect(result.bonus).toBe(0);
    });

    it('rewards a genuine recovery after a slump', () => {
      // Three recent poor sessions, then a good one.
      const result = evaluateImprovement({
        sessionAccuracy: 0.7,
        priorAccuracies: [0.4, 0.3, 0.3],
      });
      expect(result.baseline).toBeCloseTo(0.3333, 4);
      expect(result.bonus).toBe(0.25);
    });
  });

  it('is deterministic', () => {
    const input = { sessionAccuracy: 0.7, priorAccuracies: [0.5, 0.5, 0.5] };
    expect(evaluateImprovement(input)).toEqual(evaluateImprovement(input));
  });
});

describe('tierMultiplier (§10.1)', () => {
  it.each([
    ['NONE', 1],
    ['WEAK', 1.25],
    ['RECOMMENDED', 1.5],
  ] as const)('%s → %f', (tier, expected) => {
    expect(tierMultiplier(tier)).toBe(expected);
  });
});

describe('resolveTier (§11.8)', () => {
  it('honours RECOMMENDED when the recommendation is claimable and the session qualifies', () => {
    const result = resolveTier({
      snapshotTier: 'RECOMMENDED',
      wasWeakAtCreation: true,
      recommendationEligible: true,
      isQualifying: true,
    });

    expect(result.tier).toBe('RECOMMENDED');
    expect(result.multiplier).toBe(1.5);
    expect(result.recommendationCompleted).toBe(true);
  });

  it('falls back to WEAK when the recommendation was already spent', () => {
    const result = resolveTier({
      snapshotTier: 'RECOMMENDED',
      wasWeakAtCreation: true,
      recommendationEligible: false,
      isQualifying: true,
    });

    expect(result.tier).toBe('WEAK');
    expect(result.multiplier).toBe(1.25);
    expect(result.recommendationCompleted).toBe(false);
  });

  it('falls back to NONE when the category was not weak at creation', () => {
    const result = resolveTier({
      snapshotTier: 'RECOMMENDED',
      wasWeakAtCreation: false,
      recommendationEligible: false,
      isQualifying: true,
    });

    expect(result.tier).toBe('NONE');
    expect(result.multiplier).toBe(1);
  });

  it('falls back when the session does not qualify, even if the recommendation is free', () => {
    // §11.8: RECOMMENDED needs *both* an eligible recommendation and a
    // qualifying session.
    const result = resolveTier({
      snapshotTier: 'RECOMMENDED',
      wasWeakAtCreation: true,
      recommendationEligible: true,
      isQualifying: false,
    });

    expect(result.tier).toBe('WEAK');
    expect(result.recommendationCompleted).toBe(false);
  });

  it('keeps WEAK regardless of the recommendation', () => {
    for (const eligible of [true, false]) {
      const result = resolveTier({
        snapshotTier: 'WEAK',
        wasWeakAtCreation: true,
        recommendationEligible: eligible,
        isQualifying: true,
      });
      expect(result.tier).toBe('WEAK');
      expect(result.recommendationCompleted).toBe(false);
    }
  });

  it('keeps NONE regardless of what the category looks like now', () => {
    // The snapshot is the point: later skill changes must not re-price a
    // session the learner has already played (§11.8).
    const result = resolveTier({
      snapshotTier: 'NONE',
      wasWeakAtCreation: false,
      recommendationEligible: true,
      isQualifying: true,
    });
    expect(result.tier).toBe('NONE');
    expect(result.multiplier).toBe(1);
  });
});

describe('the composed weakness multiplier (§10.1)', () => {
  it.each([
    ['NONE', 0, 1],
    ['NONE', 0.25, 1.25],
    ['WEAK', 0, 1.25],
    ['WEAK', 0.25, 1.5],
    ['RECOMMENDED', 0, 1.5],
    ['RECOMMENDED', 0.25, 1.75],
  ] as const)('%s + improvement %f → weakness_mult %f', (tier, improvement, expected) => {
    // §10.1: "weakness_mult = tier_mult + improvement_bonus", range 1.00..1.75.
    expect(tierMultiplier(tier) + improvement).toBeCloseTo(expected, 10);
  });

  it('never exceeds the 1.75 ceiling §10.1 declares', () => {
    expect(tierMultiplier('RECOMMENDED') + 0.25).toBe(1.75);
  });
});
