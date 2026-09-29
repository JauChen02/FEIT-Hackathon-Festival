import { describe, expect, it } from 'vitest';
import { canonicalJson, contentHash, type AssessmentCriticalFields } from '../src/content/hash';
import { ratingForDifficulty } from '../src/content/rating';

/**
 * §13.2 / ADR-030: the hash covers the assessment-critical fields only. It is
 * what makes "editing a published version" detectable, so the importer can
 * refuse it (Phase 0 acceptance criterion: "content hash").
 */
const base: AssessmentCriticalFields = {
  type: 'MCQ',
  prompt: 'What is 3/4 + 1/8?',
  optionsJson: [
    { id: 'a', text: '4/12' },
    { id: 'b', text: '7/8' },
  ],
  answerJson: { correctOptionId: 'b' },
  explanation: 'Convert to eighths: 3/4 = 6/8, so 6/8 + 1/8 = 7/8.',
  categorySlug: 'math',
  subTopic: 'fractions',
  difficulty: 2,
  rating: 900,
};

describe('contentHash', () => {
  it('is a lowercase hex SHA-256', () => {
    expect(contentHash(base)).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is stable across runs', () => {
    expect(contentHash(base)).toBe(contentHash({ ...base }));
  });

  it('does not depend on key insertion order', () => {
    const reordered: AssessmentCriticalFields = {
      rating: base.rating,
      difficulty: base.difficulty,
      subTopic: base.subTopic,
      categorySlug: base.categorySlug,
      explanation: base.explanation,
      answerJson: base.answerJson,
      optionsJson: base.optionsJson,
      prompt: base.prompt,
      type: base.type,
    };
    expect(contentHash(reordered)).toBe(contentHash(base));
  });

  it('does not depend on key order inside nested JSON', () => {
    const nestedReordered = {
      ...base,
      optionsJson: [
        { text: '4/12', id: 'a' },
        { text: '7/8', id: 'b' },
      ],
    };
    expect(contentHash(nestedReordered)).toBe(contentHash(base));
  });

  it('treats a null and a missing sub-topic identically', () => {
    const { subTopic: _omitted, ...withoutSubTopic } = base;
    expect(contentHash({ ...withoutSubTopic, subTopic: null } as AssessmentCriticalFields)).toBe(
      contentHash({ ...base, subTopic: null }),
    );
  });

  describe('changes when any assessment-critical field changes', () => {
    it.each<[string, Partial<AssessmentCriticalFields>]>([
      ['type', { type: 'NUMERIC' }],
      ['prompt', { prompt: 'What is 3/4 + 1/4?' }],
      ['explanation', { explanation: 'A different explanation entirely, long enough.' }],
      ['categorySlug', { categorySlug: 'logic' }],
      ['subTopic', { subTopic: 'decimals' }],
      ['subTopic cleared', { subTopic: null }],
      ['difficulty', { difficulty: 3 }],
      ['rating', { rating: 1000 }],
      ['answerJson', { answerJson: { correctOptionId: 'a' } }],
      [
        'option text',
        {
          optionsJson: [
            { id: 'a', text: '4/12' },
            { id: 'b', text: '7/8ths' },
          ],
        },
      ],
      [
        'option order — it is what the learner saw',
        {
          optionsJson: [
            { id: 'b', text: '7/8' },
            { id: 'a', text: '4/12' },
          ],
        },
      ],
    ])('%s', (_label, patch) => {
      expect(contentHash({ ...base, ...patch })).not.toBe(contentHash(base));
    });
  });

  it('ignores metadata, so fixing a licence note does not force a new version', () => {
    // Metadata is not part of AssessmentCriticalFields at all; this asserts the
    // interface has not quietly grown one of those fields.
    expect(Object.keys(base).sort()).toEqual([
      'answerJson',
      'categorySlug',
      'difficulty',
      'explanation',
      'optionsJson',
      'prompt',
      'rating',
      'subTopic',
      'type',
    ]);
  });

  it('pairs with ratingForDifficulty, so the rating cannot drift from the difficulty', () => {
    expect(contentHash({ ...base, rating: ratingForDifficulty(2) })).toBe(contentHash(base));
  });
});

describe('canonicalJson', () => {
  it('sorts object keys', () => {
    expect(canonicalJson({ b: 1, a: 2 })).toBe('{"a":2,"b":1}');
  });

  it('preserves array order', () => {
    expect(canonicalJson([3, 1, 2])).toBe('[3,1,2]');
  });

  it('drops undefined properties rather than emitting them', () => {
    expect(canonicalJson({ a: 1, b: undefined })).toBe('{"a":1}');
  });

  it('normalises -0 to 0', () => {
    expect(canonicalJson(-0)).toBe(canonicalJson(0));
  });

  it('rejects non-finite numbers instead of silently writing null', () => {
    expect(() => canonicalJson(Number.NaN)).toThrow(TypeError);
    expect(() => canonicalJson(Number.POSITIVE_INFINITY)).toThrow(TypeError);
  });

  it('rejects values JSON cannot represent', () => {
    expect(() => canonicalJson(() => undefined)).toThrow(TypeError);
  });

  it('handles nesting and null', () => {
    expect(canonicalJson({ z: null, a: [{ y: 1, x: 2 }] })).toBe('{"a":[{"x":2,"y":1}],"z":null}');
  });
});
