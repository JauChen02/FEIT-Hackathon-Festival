/**
 * IANA timezone handling (PLANNING.md §12.1).
 *
 * `users.timezone` stores an IANA identifier. A session's `local_date` is the
 * calendar date in the user's timezone at the moment of completion.
 */

/**
 * An IANA identifier is one or more `/`-separated segments starting with a
 * letter, e.g. `UTC`, `Australia/Melbourne`, `America/Argentina/Buenos_Aires`.
 *
 * This also rejects the ES2024 offset time zones (`+10:00`), which Intl accepts
 * but which carry no DST rules — storing one would silently break §12.1.
 */
const IANA_SHAPE = /^[A-Za-z][A-Za-z0-9_+-]*(\/[A-Za-z0-9_+-]+){0,2}$/;

/** True when `value` is an IANA timezone identifier this runtime recognises. */
export function isValidIanaTimezone(value: unknown): value is string {
  if (typeof value !== 'string' || !IANA_SHAPE.test(value)) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

/**
 * The canonical spelling of a timezone according to *this* runtime's ICU data.
 *
 * ICU versions disagree about which spelling of an alias pair is canonical
 * (`Asia/Kolkata` vs `Asia/Calcutta`, `America/Argentina/Buenos_Aires` vs
 * `America/Buenos_Aires`), and the browser and the server can be running
 * different versions. The client sends whatever its own Intl produced, so the
 * server canonicalises on the way in and stores that — one spelling per zone,
 * whichever client it came from.
 */
export function canonicalizeTimezone(value: string): string {
  if (!isValidIanaTimezone(value)) {
    throw new TypeError(`canonicalizeTimezone: invalid IANA timezone ${JSON.stringify(value)}`);
  }
  return new Intl.DateTimeFormat('en-US', { timeZone: value }).resolvedOptions().timeZone;
}

/** The list of IANA zones this runtime knows, for the onboarding picker. */
export function supportedTimezones(): readonly string[] {
  // Intl.supportedValuesOf is ES2022 and present in every runtime we target,
  // but guard anyway so a narrower environment degrades instead of throwing.
  const supported = (
    Intl as unknown as { supportedValuesOf?: (key: string) => string[] }
  ).supportedValuesOf?.('timeZone');
  if (!supported) return ['UTC'];
  // supportedValuesOf omits UTC itself, which is a perfectly good choice and a
  // sensible fallback for anyone whose browser fails to detect a zone.
  return supported.includes('UTC') ? supported : ['UTC', ...supported];
}

const DATE_PART_FORMATTERS = new Map<string, Intl.DateTimeFormat>();

function dateFormatterFor(timezone: string): Intl.DateTimeFormat {
  let formatter = DATE_PART_FORMATTERS.get(timezone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    DATE_PART_FORMATTERS.set(timezone, formatter);
  }
  return formatter;
}

/**
 * The calendar date (`YYYY-MM-DD`) at `instant` in `timezone`.
 *
 * DST-safe: it asks Intl for the wall-clock date rather than doing offset
 * arithmetic, so spring-forward and fall-back days behave correctly.
 */
export function localDateFor(timezone: string, instant: Date): string {
  if (!isValidIanaTimezone(timezone)) {
    throw new TypeError(`localDateFor: invalid IANA timezone ${JSON.stringify(timezone)}`);
  }
  if (Number.isNaN(instant.getTime())) {
    throw new TypeError('localDateFor: invalid instant');
  }
  // en-CA formats as YYYY-MM-DD.
  return dateFormatterFor(timezone).format(instant);
}

const LOCAL_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function isLocalDate(value: string): boolean {
  return LOCAL_DATE_PATTERN.test(value);
}

/**
 * Whole days from `from` to `to`, both `YYYY-MM-DD` local dates.
 *
 * Calendar arithmetic only — no timezone is involved, because both operands are
 * already local dates. Used by streak continuity (§12.1) from Phase 2 onward.
 */
export function daysBetweenLocalDates(from: string, to: string): number {
  if (!isLocalDate(from) || !isLocalDate(to)) {
    throw new TypeError(`daysBetweenLocalDates: expected YYYY-MM-DD, got ${from} / ${to}`);
  }
  const [fy, fm, fd] = from.split('-').map(Number) as [number, number, number];
  const [ty, tm, td] = to.split('-').map(Number) as [number, number, number];
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86_400_000);
}

/** Add (or subtract) whole days to a `YYYY-MM-DD` local date. */
export function addDaysToLocalDate(localDate: string, days: number): string {
  if (!isLocalDate(localDate)) {
    throw new TypeError(`addDaysToLocalDate: expected YYYY-MM-DD, got ${localDate}`);
  }
  const [y, m, d] = localDate.split('-').map(Number) as [number, number, number];
  const shifted = new Date(Date.UTC(y, m - 1, d) + days * 86_400_000);
  return [
    String(shifted.getUTCFullYear()).padStart(4, '0'),
    String(shifted.getUTCMonth() + 1).padStart(2, '0'),
    String(shifted.getUTCDate()).padStart(2, '0'),
  ].join('-');
}
