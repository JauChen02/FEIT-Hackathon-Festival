/**
 * Error envelope and canonical error codes (PLANNING.md §16.1).
 *
 * Clients branch on `code` only; `message` is human-readable and may change.
 */

export const ERROR_CODES = {
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
} as const satisfies Record<string, number>;

export type ErrorCode = keyof typeof ERROR_CODES;

/** Default human-readable copy. Route handlers may override per call site. */
const DEFAULT_MESSAGES: Record<ErrorCode, string> = {
  UNAUTHORIZED: 'You need to sign in to do that.',
  FORBIDDEN: 'You do not have access to this resource.',
  ONBOARDING_REQUIRED: 'Finish setting up your profile first.',
  INVALID_INPUT: 'Some of the details you sent are not valid.',
  PAYLOAD_TOO_LARGE: 'That request was too large.',
  NOT_FOUND: 'We could not find that.',
  SESSION_NOT_FOUND: 'We could not find that session.',
  ACTIVE_SESSION_EXISTS: 'You already have a session in progress.',
  INVALID_SESSION_STATE: 'That action is not allowed for this session right now.',
  SESSION_NOT_FINISHED: 'Answer every question before finishing this session.',
  SESSION_ALREADY_COMPLETED: 'This session has already been completed.',
  QUESTION_NOT_CURRENT: 'That is not the question you are currently on.',
  QUESTION_EXPIRED: 'Time ran out on that question.',
  ANSWER_ALREADY_SUBMITTED: 'You have already answered that question.',
  TIMEZONE_CHANGE_COOLDOWN: 'You can only change your timezone once a day.',
  USERNAME_TAKEN: 'That username is already taken.',
  RATE_LIMITED: 'Too many requests. Please slow down.',
  INTERNAL_ERROR: 'Something went wrong on our side.',
};

export interface ErrorEnvelope {
  error: {
    code: ErrorCode;
    message: string;
    details: Record<string, unknown>;
  };
}

export interface AppErrorOptions {
  message?: string;
  details?: Record<string, unknown>;
  cause?: unknown;
}

/**
 * The single error type crossing the API boundary. Anything else that escapes a
 * route handler becomes INTERNAL_ERROR.
 */
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details: Record<string, unknown>;

  constructor(code: ErrorCode, options: AppErrorOptions = {}) {
    super(options.message ?? DEFAULT_MESSAGES[code], { cause: options.cause });
    this.name = 'AppError';
    this.code = code;
    this.status = ERROR_CODES[code];
    this.details = options.details ?? {};
  }

  toEnvelope(): ErrorEnvelope {
    return {
      error: { code: this.code, message: this.message, details: this.details },
    };
  }
}

export function isAppError(value: unknown): value is AppError {
  return value instanceof AppError;
}

export function httpStatusFor(code: ErrorCode): number {
  return ERROR_CODES[code];
}

export function toEnvelope(code: ErrorCode, options: AppErrorOptions = {}): ErrorEnvelope {
  return new AppError(code, options).toEnvelope();
}

/**
 * Thrown by the transition modules (§15) when an illegal state change is
 * attempted. Surfaces as INVALID_SESSION_STATE at the API boundary.
 */
export class InvalidStateTransitionError extends Error {
  readonly entity: string;
  readonly from: string;
  readonly to: string;

  constructor(entity: string, from: string, to: string) {
    super(`INVALID_STATE_TRANSITION: ${entity} cannot move from ${from} to ${to}`);
    this.name = 'InvalidStateTransitionError';
    this.entity = entity;
    this.from = from;
    this.to = to;
  }
}
