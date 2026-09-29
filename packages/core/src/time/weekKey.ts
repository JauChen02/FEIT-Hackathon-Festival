/**
 * ISO-8601 week keys in UTC (PLANNING.md §12.2, ADR-014).
 *
 * Format `YYYY-Www`. Weeks start Monday 00:00 UTC. The week-numbering year is
 * the ISO year, which can differ from the calendar year around 1 January:
 * 2027-01-01 belongs to 2026-W53.
 */

const MS_PER_DAY = 86_400_000;

/** ISO day of week, Monday = 1 .. Sunday = 7. */
function isoDayOfWeek(date: Date): number {
  const day = date.getUTCDay();
  return day === 0 ? 7 : day;
}

/** The Thursday of the ISO week containing `date`. Its calendar year is the ISO year. */
function isoWeekThursday(date: Date): Date {
  const utcMidnight = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  return new Date(utcMidnight + (4 - isoDayOfWeek(date)) * MS_PER_DAY);
}

/** The ISO week-numbering year for an instant, in UTC. */
export function isoWeekYear(date: Date): number {
  return isoWeekThursday(date).getUTCFullYear();
}

/** The ISO week number (1..53) for an instant, in UTC. */
export function isoWeekNumber(date: Date): number {
  const thursday = isoWeekThursday(date);
  const jan1 = Date.UTC(thursday.getUTCFullYear(), 0, 1);
  return Math.floor((thursday.getTime() - jan1) / (7 * MS_PER_DAY)) + 1;
}

/**
 * Immutable week key for an instant, e.g. `2026-W40`.
 *
 * Every `point_ledger` row stores this, computed from its UTC `created_at`.
 */
export function weekKeyUtc(date: Date): string {
  if (Number.isNaN(date.getTime())) {
    throw new TypeError('weekKeyUtc: invalid date');
  }
  const year = isoWeekYear(date);
  const week = isoWeekNumber(date);
  return `${String(year).padStart(4, '0')}-W${String(week).padStart(2, '0')}`;
}

export const WEEK_KEY_PATTERN = /^\d{4}-W\d{2}$/;

export function isWeekKey(value: string): boolean {
  return WEEK_KEY_PATTERN.test(value);
}

/** Start instant (Monday 00:00:00.000 UTC) of the week containing `date`. */
export function weekStartUtc(date: Date): Date {
  const utcMidnight = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  return new Date(utcMidnight - (isoDayOfWeek(date) - 1) * MS_PER_DAY);
}

/** Start instant of the week *after* the one containing `date` — the reset countdown target. */
export function nextWeekStartUtc(date: Date): Date {
  return new Date(weekStartUtc(date).getTime() + 7 * MS_PER_DAY);
}
