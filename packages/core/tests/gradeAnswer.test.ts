import { describe, expect, it } from 'vitest';
import { ResponseShapeError, gradeAnswer, normaliseNumeric } from '../src/grading/gradeAnswer';

/**
 * §8.1: "`mcq` (single correct option) and `numeric` (exact match after
 * normalization: trim, strip thousands separators, parse as decimal; the
 * version's `answer_json` may define an absolute `tolerance`)."
 */

const OPTIONS = [
  { id: 'a', text: '4/12' },
  { id: 'b', text: '7/8' },
  { id: 'c', text: '1/2' },
];

describe('MCQ grading', () => {
  it('scores the correct option 1', () => {
    const result = gradeAnswer('MCQ', { correctOptionId: 'b' }, { optionId: 'b' }, OPTIONS);
    expect(result.correctness).toBe(1);
  });

  it('scores any other option 0', () => {
    for (const optionId of ['a', 'c']) {
      expect(gradeAnswer('MCQ', { correctOptionId: 'b' }, { optionId }, OPTIONS).correctness).toBe(
        0,
      );
    }
  });

  it('scores an option id that does not exist as 0 rather than throwing', () => {
    // A stale client could send an id from a previous version.
    expect(
      gradeAnswer('MCQ', { correctOptionId: 'b' }, { optionId: 'z' }, OPTIONS).correctness,
    ).toBe(0);
  });

  it('is case-sensitive on the option id', () => {
    expect(
      gradeAnswer('MCQ', { correctOptionId: 'b' }, { optionId: 'B' }, OPTIONS).correctness,
    ).toBe(0);
  });

  it('returns the correct option text, which is what the learner needs to see', () => {
    const result = gradeAnswer('MCQ', { correctOptionId: 'b' }, { optionId: 'a' }, OPTIONS);
    expect(result.correctAnswer).toBe('7/8');
  });

  it('falls back to the option id when the options are not supplied', () => {
    expect(gradeAnswer('MCQ', { correctOptionId: 'b' }, { optionId: 'a' }).correctAnswer).toBe('b');
  });

  it('rejects a numeric-shaped response as a client bug', () => {
    expect(() => gradeAnswer('MCQ', { correctOptionId: 'b' }, { value: '7' }, OPTIONS)).toThrow(
      ResponseShapeError,
    );
  });
});

describe('NUMERIC grading', () => {
  const key = { value: '0.875' };

  it('scores an exact match 1', () => {
    expect(gradeAnswer('NUMERIC', key, { value: '0.875' }).correctness).toBe(1);
  });

  it('scores a different value 0', () => {
    expect(gradeAnswer('NUMERIC', key, { value: '0.874' }).correctness).toBe(0);
  });

  describe('normalisation (§8.1)', () => {
    it.each([
      ['  0.875  ', 'surrounding whitespace'],
      ['+0.875', 'a leading plus'],
      ['.875', 'a bare decimal point'],
      ['0.8750', 'a trailing zero'],
    ])('accepts %j (%s)', (value) => {
      expect(gradeAnswer('NUMERIC', key, { value }).correctness).toBe(1);
    });

    it.each([
      ['1,234', '1234'],
      ['1 234', '1234'],
      ['1_234', '1234'],
      ['1,234,567', '1234567'],
    ])('strips thousands separators: %j matches %s', (typed, expected) => {
      expect(gradeAnswer('NUMERIC', { value: expected }, { value: typed }).correctness).toBe(1);
    });

    it('compares as decimals, not floats', () => {
      // 0.1 + 0.2 !== 0.3 in binary floating point; as decimals it is exact.
      expect(gradeAnswer('NUMERIC', { value: '0.3' }, { value: '0.30' }).correctness).toBe(1);
      expect(
        gradeAnswer('NUMERIC', { value: '9007199254740993' }, { value: '9007199254740993' })
          .correctness,
      ).toBe(1);
    });

    it('handles negative values', () => {
      expect(gradeAnswer('NUMERIC', { value: '-5' }, { value: '-5' }).correctness).toBe(1);
      expect(gradeAnswer('NUMERIC', { value: '-5' }, { value: '5' }).correctness).toBe(0);
    });
  });

  describe('tolerance', () => {
    const tolerant = { value: '3.14159', tolerance: '0.001' };

    it.each(['3.14159', '3.1416', '3.1406', '3.14259', '3.14059'])(
      'accepts %s inside the tolerance',
      (value) => {
        expect(gradeAnswer('NUMERIC', tolerant, { value }).correctness).toBe(1);
      },
    );

    it.each(['3.143', '3.140', '3.2', '3'])('rejects %s outside the tolerance', (value) => {
      expect(gradeAnswer('NUMERIC', tolerant, { value }).correctness).toBe(0);
    });

    it('treats the tolerance as inclusive at both ends', () => {
      expect(gradeAnswer('NUMERIC', tolerant, { value: '3.14259' }).correctness).toBe(1);
      expect(gradeAnswer('NUMERIC', tolerant, { value: '3.14059' }).correctness).toBe(1);
    });

    it('demands exactness when no tolerance is given', () => {
      expect(gradeAnswer('NUMERIC', { value: '3.14159' }, { value: '3.1416' }).correctness).toBe(0);
    });
  });

  describe('unparseable input is a wrong answer, not an error', () => {
    it.each(['abc', '', '   ', '--5', '1.2.3', '5e3', 'NaN', 'Infinity', '1/2'])(
      'scores %j as 0',
      (value) => {
        const result = gradeAnswer('NUMERIC', key, { value });
        expect(result.correctness).toBe(0);
        expect(result.correctAnswer).toBe('0.875');
      },
    );
  });

  it('rejects an MCQ-shaped response as a client bug', () => {
    expect(() => gradeAnswer('NUMERIC', key, { optionId: 'a' })).toThrow(ResponseShapeError);
  });

  it('always reports the expected value as the correct answer', () => {
    expect(gradeAnswer('NUMERIC', key, { value: '0' }).correctAnswer).toBe('0.875');
  });
});

describe('normaliseNumeric', () => {
  it.each([
    ['1,234.50', '1234.5'],
    ['  42 ', '42'],
    ['+7', '7'],
    ['-0.5', '-0.5'],
  ])('normalises %j to %s', (input, expected) => {
    expect(normaliseNumeric(input)?.toString()).toBe(expected);
  });

  it.each(['', 'abc', '1.2.3', '1e5', '--1', '.', '-'])('returns null for %j', (input) => {
    expect(normaliseNumeric(input)).toBeNull();
  });
});
