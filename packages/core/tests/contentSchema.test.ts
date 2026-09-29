import { describe, expect, it } from 'vitest';
import { contentFileSchema, expectedContentFileName } from '../src/schemas/content';
import { ratingForDifficulty } from '../src/content/rating';

/** §13.4 / ADR-025: the shape of a `content/**` file. */
const validMcq = {
  externalId: 'math-fractions-0001',
  versionNumber: 1,
  category: 'math',
  subTopic: 'fractions',
  type: 'MCQ' as const,
  difficulty: 2,
  prompt: 'What is 3/4 + 1/8?',
  options: [
    { id: 'a', text: '4/12' },
    { id: 'b', text: '7/8' },
    { id: 'c', text: '1/2' },
    { id: 'd', text: '4/8' },
  ],
  answer: { correctOptionId: 'b' },
  explanation: 'Convert to eighths: 3/4 = 6/8, so 6/8 + 1/8 = 7/8.',
  origin: 'DEV_SEED' as const,
  source: 'Authored for the LearnArena dev seed',
  license: 'internal',
  authorUsername: 'seed_author',
  reviewedByUsername: 'seed_reviewer',
  reviewedAt: '2026-09-20T00:00:00Z',
};

const validNumeric = {
  ...validMcq,
  externalId: 'math-decimals-0001',
  subTopic: 'decimals',
  type: 'NUMERIC' as const,
  options: undefined,
  prompt: 'What is 7 divided by 8, as a decimal?',
  answer: { value: '0.875' },
  explanation: '7 ÷ 8 = 0.875. Dividing by 8 is the same as halving three times.',
};

describe('contentFileSchema', () => {
  it('accepts a well-formed MCQ file', () => {
    expect(contentFileSchema.safeParse(validMcq).success).toBe(true);
  });

  it('accepts a well-formed NUMERIC file', () => {
    expect(contentFileSchema.safeParse(validNumeric).success).toBe(true);
  });

  it('accepts a NUMERIC file with a tolerance (§8.1)', () => {
    expect(
      contentFileSchema.safeParse({
        ...validNumeric,
        answer: { value: '3.14159', tolerance: '0.001' },
      }).success,
    ).toBe(true);
  });

  it('accepts a null sub-topic', () => {
    expect(contentFileSchema.safeParse({ ...validMcq, subTopic: null }).success).toBe(true);
  });

  it('has no rating field — the importer derives it from difficulty (ADR-009)', () => {
    const parsed = contentFileSchema.parse({ ...validMcq, rating: 9999 });
    expect(parsed).not.toHaveProperty('rating');
    expect(ratingForDifficulty(parsed.difficulty)).toBe(900);
  });

  describe('rejects', () => {
    it('a reviewer who is also the author (§13.1)', () => {
      const result = contentFileSchema.safeParse({
        ...validMcq,
        reviewedByUsername: 'seed_author',
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toMatch(/authored/);
      }
    });

    it('a correctOptionId that is not among the options', () => {
      const result = contentFileSchema.safeParse({
        ...validMcq,
        answer: { correctOptionId: 'z' },
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toMatch(/not one of the options/);
      }
    });

    it('duplicate option ids', () => {
      expect(
        contentFileSchema.safeParse({
          ...validMcq,
          options: [
            { id: 'a', text: 'one' },
            { id: 'a', text: 'two' },
          ],
          answer: { correctOptionId: 'a' },
        }).success,
      ).toBe(false);
    });

    it('an MCQ with fewer than 2 options', () => {
      expect(
        contentFileSchema.safeParse({
          ...validMcq,
          options: [{ id: 'a', text: 'only one' }],
          answer: { correctOptionId: 'a' },
        }).success,
      ).toBe(false);
    });

    it.each([0, 6, 2.5, -1])('difficulty %s (must be an integer 1..5)', (difficulty) => {
      expect(contentFileSchema.safeParse({ ...validMcq, difficulty }).success).toBe(false);
    });

    it('a placeholder explanation (§13.6 forbids filler)', () => {
      expect(contentFileSchema.safeParse({ ...validMcq, explanation: 'TODO' }).success).toBe(false);
    });

    it('a version number below 1', () => {
      expect(contentFileSchema.safeParse({ ...validMcq, versionNumber: 0 }).success).toBe(false);
    });

    it.each(['Math-Fractions', 'ma', 'math fractions', 'math_fractions'])(
      'the externalId %s',
      (externalId) => {
        expect(contentFileSchema.safeParse({ ...validMcq, externalId }).success).toBe(false);
      },
    );

    it('a non-UTC reviewedAt', () => {
      expect(
        contentFileSchema.safeParse({ ...validMcq, reviewedAt: '2026-09-20T00:00:00+10:00' })
          .success,
      ).toBe(false);
    });

    it('an unknown origin', () => {
      expect(contentFileSchema.safeParse({ ...validMcq, origin: 'SCRAPED' }).success).toBe(false);
    });

    it('a numeric answer that is not a plain decimal string', () => {
      expect(
        contentFileSchema.safeParse({ ...validNumeric, answer: { value: '1/2' } }).success,
      ).toBe(false);
      expect(
        contentFileSchema.safeParse({ ...validNumeric, answer: { value: '1e5' } }).success,
      ).toBe(false);
    });

    it('a missing source or licence (§13.5 requires both)', () => {
      const { source: _s, ...noSource } = validMcq;
      expect(contentFileSchema.safeParse(noSource).success).toBe(false);
      const { license: _l, ...noLicense } = validMcq;
      expect(contentFileSchema.safeParse(noLicense).success).toBe(false);
    });
  });
});

describe('expectedContentFileName', () => {
  it('derives the filename from the contents, so the two cannot drift', () => {
    expect(expectedContentFileName(validMcq)).toBe('math-fractions-0001.v1.json');
    expect(expectedContentFileName({ ...validMcq, versionNumber: 12 })).toBe(
      'math-fractions-0001.v12.json',
    );
  });
});
