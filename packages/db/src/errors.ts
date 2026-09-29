/**
 * Recognising Postgres constraint violations.
 *
 * Route handlers translate these into the §16.1 error codes — e.g. a unique
 * violation on `users_username_unique` becomes `409 USERNAME_TAKEN` — so the
 * database stays the single arbiter of uniqueness and we never race a
 * check-then-insert.
 */

export const PG_ERROR_CODES = {
  UNIQUE_VIOLATION: '23505',
  FOREIGN_KEY_VIOLATION: '23503',
  CHECK_VIOLATION: '23514',
  NOT_NULL_VIOLATION: '23502',
  /** Raised by the point_ledger append-only trigger (§14.2). */
  RESTRICT_VIOLATION: '23001',
  SERIALIZATION_FAILURE: '40001',
} as const;

export interface PostgresErrorLike {
  code: string;
  constraint_name?: string;
  constraint?: string;
  table_name?: string;
  table?: string;
  detail?: string;
  message: string;
}

function hasStringCode(value: unknown): value is PostgresErrorLike {
  return (
    typeof value === 'object' &&
    value !== null &&
    'code' in value &&
    typeof (value as { code: unknown }).code === 'string'
  );
}

/**
 * Find the driver error inside whatever was thrown.
 *
 * Drizzle wraps driver failures in a `DrizzleQueryError` and puts the original
 * on `cause`, so checking the top-level object alone would silently miss every
 * constraint violation and turn an expected `409` into a `500`.
 */
export function isPostgresError(error: unknown): error is PostgresErrorLike {
  return postgresErrorOf(error) !== undefined;
}

export function postgresErrorOf(error: unknown): PostgresErrorLike | undefined {
  let current: unknown = error;
  // Bounded walk: a wrapper chain is short, and this must not loop on a cycle.
  for (let depth = 0; depth < 5 && current !== undefined && current !== null; depth += 1) {
    if (hasStringCode(current)) return current;
    current = (current as { cause?: unknown }).cause;
  }
  return undefined;
}

export function constraintNameOf(error: unknown): string | undefined {
  const pg = postgresErrorOf(error);
  return pg?.constraint_name ?? pg?.constraint;
}

/** True when `error` is a unique violation, optionally on a named constraint. */
export function isUniqueViolation(error: unknown, constraint?: string): boolean {
  const pg = postgresErrorOf(error);
  if (pg?.code !== PG_ERROR_CODES.UNIQUE_VIOLATION) return false;
  return constraint === undefined || constraintNameOf(error) === constraint;
}

export function isCheckViolation(error: unknown, constraint?: string): boolean {
  const pg = postgresErrorOf(error);
  if (pg?.code !== PG_ERROR_CODES.CHECK_VIOLATION) return false;
  return constraint === undefined || constraintNameOf(error) === constraint;
}
