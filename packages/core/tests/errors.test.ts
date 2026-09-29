import { describe, expect, it } from 'vitest';
import { AppError, ERROR_CODES, httpStatusFor, isAppError, toEnvelope } from '../src/errors';

/** §16.1: the error envelope. Clients branch on `code` only. */
describe('AppError', () => {
  it('maps every code to the HTTP status in the §16.1 table', () => {
    expect(ERROR_CODES).toEqual({
      UNAUTHORIZED: 401,
      FORBIDDEN: 403,
      ONBOARDING_REQUIRED: 403,
      INVALID_INPUT: 400,
      PAYLOAD_TOO_LARGE: 413,
      NOT_FOUND: 404,
      SESSION_NOT_FOUND: 404,
      ACTIVE_SESSION_EXISTS: 409,
      INVALID_SESSION_STATE: 409,
      SESSION_NOT_FINISHED: 409,
      SESSION_ALREADY_COMPLETED: 409,
      QUESTION_NOT_CURRENT: 409,
      QUESTION_EXPIRED: 409,
      ANSWER_ALREADY_SUBMITTED: 409,
      TIMEZONE_CHANGE_COOLDOWN: 409,
      USERNAME_TAKEN: 409,
      RATE_LIMITED: 429,
      INTERNAL_ERROR: 500,
    });
  });

  it('serialises to the documented envelope shape', () => {
    const error = new AppError('ACTIVE_SESSION_EXISTS', {
      details: { sessionId: 'abc' },
    });
    expect(error.toEnvelope()).toEqual({
      error: {
        code: 'ACTIVE_SESSION_EXISTS',
        message: expect.any(String),
        details: { sessionId: 'abc' },
      },
    });
  });

  it('carries a default human-readable message for every code', () => {
    for (const code of Object.keys(ERROR_CODES) as (keyof typeof ERROR_CODES)[]) {
      const error = new AppError(code);
      expect(error.message.length, code).toBeGreaterThan(0);
      expect(error.status, code).toBe(httpStatusFor(code));
    }
  });

  it('allows a call-site message override', () => {
    expect(new AppError('INVALID_INPUT', { message: 'Pick a timezone.' }).message).toBe(
      'Pick a timezone.',
    );
  });

  it('defaults details to an empty object so clients can always read it', () => {
    expect(new AppError('NOT_FOUND').toEnvelope().error.details).toEqual({});
  });

  it('preserves the cause for logging', () => {
    const cause = new Error('boom');
    expect(new AppError('INTERNAL_ERROR', { cause }).cause).toBe(cause);
  });

  it('is recognised by isAppError, and other errors are not', () => {
    expect(isAppError(new AppError('NOT_FOUND'))).toBe(true);
    expect(isAppError(new Error('nope'))).toBe(false);
    expect(isAppError(null)).toBe(false);
  });
});

describe('toEnvelope', () => {
  it('builds an envelope without constructing an error first', () => {
    expect(toEnvelope('UNAUTHORIZED').error.code).toBe('UNAUTHORIZED');
  });
});
