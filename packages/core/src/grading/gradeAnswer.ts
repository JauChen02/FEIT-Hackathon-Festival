/**
 * Answer grading (PLANNING.md §8.1).
 *
 * "`mcq` (single correct option) and `numeric` (exact match after
 *  normalization: trim, strip thousands separators, parse as decimal; the
 *  version's `answer_json` may define an absolute `tolerance`)."
 *
 * Pure: the caller supplies the stored answer key, this decides correctness.
 * Invariant 1 — the client never sees any of this before grading.
 */

import { Decimal } from 'decimal.js';

export type QuestionType = 'MCQ' | 'NUMERIC';

export interface McqAnswerKey {
  correctOptionId: string;
}

export interface NumericAnswerKey {
  value: string;
  tolerance?: string;
}

export type AnswerKey = McqAnswerKey | NumericAnswerKey;

export interface McqResponse {
  optionId: string;
}

export interface NumericResponse {
  value: string;
}

export type AnswerResponse = McqResponse | NumericResponse;

export interface GradeResult {
  /** Normalised 0..1. MVP question types are all-or-nothing. */
  correctness: number;
  /** What to show the learner after grading. */
  correctAnswer: string;
}

/**
 * Thrown when the response does not fit the question's type — a client bug
 * rather than a wrong answer, so the route turns it into `400 INVALID_INPUT`.
 * An answer that is merely *wrong*, including unparseable numeric text, grades
 * 0 and is not an error.
 */
export class ResponseShapeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ResponseShapeError';
  }
}

function isMcqResponse(response: AnswerResponse): response is McqResponse {
  return typeof (response as McqResponse).optionId === 'string';
}

function isNumericResponse(response: AnswerResponse): response is NumericResponse {
  return typeof (response as NumericResponse).value === 'string';
}

/**
 * Normalise a learner's numeric input: trim, drop thousands separators and
 * spaces, and accept a leading `+`.
 *
 * Returns null when the text is not a number at all — which is a wrong answer,
 * not a malformed request.
 */
export function normaliseNumeric(raw: string): Decimal | null {
  const cleaned = raw
    .trim()
    // Thousands separators, in the two conventions a learner might type.
    .replace(/[,\s_]/g, '')
    .replace(/^\+/, '');

  if (cleaned === '' || !/^-?\d*\.?\d+$/.test(cleaned)) return null;

  try {
    const value = new Decimal(cleaned);
    return value.isFinite() ? value : null;
  } catch {
    return null;
  }
}

export function gradeAnswer(
  type: QuestionType,
  answerKey: AnswerKey,
  response: AnswerResponse,
  options?: readonly { id: string; text: string }[],
): GradeResult {
  if (type === 'MCQ') {
    if (!isMcqResponse(response)) {
      throw new ResponseShapeError('An MCQ answer must be { optionId: string }.');
    }
    const key = answerKey as McqAnswerKey;
    const correctOption = options?.find((option) => option.id === key.correctOptionId);
    return {
      correctness: response.optionId === key.correctOptionId ? 1 : 0,
      // Show the option's text where we have it; the id alone means nothing.
      correctAnswer: correctOption ? correctOption.text : key.correctOptionId,
    };
  }

  if (!isNumericResponse(response)) {
    throw new ResponseShapeError('A numeric answer must be { value: string }.');
  }

  const key = answerKey as NumericAnswerKey;
  const expected = new Decimal(key.value);
  const actual = normaliseNumeric(response.value);

  // Unparseable input is simply wrong (§8.1 normalises, it does not reject).
  if (actual === null) {
    return { correctness: 0, correctAnswer: key.value };
  }

  const tolerance = key.tolerance === undefined ? null : new Decimal(key.tolerance);
  const correct =
    tolerance === null
      ? actual.equals(expected)
      : actual.minus(expected).abs().lessThanOrEqualTo(tolerance);

  return { correctness: correct ? 1 : 0, correctAnswer: key.value };
}
