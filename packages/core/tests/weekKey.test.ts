import { describe, expect, it } from 'vitest';
import {
  isWeekKey,
  isoWeekNumber,
  isoWeekYear,
  nextWeekStartUtc,
  weekKeyUtc,
  weekStartUtc,
} from '../src/time/weekKey';

/**
 * §12.2 / ADR-014: leaderboards use immutable ISO-8601 week keys in UTC.
 * Phase 0 acceptance criterion: "week-key function (incl. ISO year boundary
 * 2026-12-31 / 2027-01-01)".
 */
describe('weekKeyUtc', () => {
  it('formats as YYYY-Www', () => {
    expect(weekKeyUtc(new Date('2026-09-29T00:00:00Z'))).toMatch(/^\d{4}-W\d{2}$/);
  });

  describe('the 2026/2027 ISO year boundary', () => {
    // 2026-01-01 is a Thursday, so 2026 is a "long" ISO year with 53 weeks.
    // Weeks 2026-W53 runs Mon 2026-12-28 .. Sun 2027-01-03.
    it.each([
      ['2026-12-28T00:00:00Z', '2026-W53', 'Monday, first day of 2026-W53'],
      ['2026-12-31T00:00:00Z', '2026-W53', 'Thursday, still calendar year 2026'],
      ['2026-12-31T23:59:59.999Z', '2026-W53', 'last instant of calendar 2026'],
      ['2027-01-01T00:00:00Z', '2026-W53', 'calendar 2027 but ISO year 2026'],
      ['2027-01-03T23:59:59.999Z', '2026-W53', 'Sunday, last instant of 2026-W53'],
      ['2027-01-04T00:00:00Z', '2027-W01', 'Monday, first day of 2027-W01'],
    ])('%s → %s (%s)', (instant, expected) => {
      expect(weekKeyUtc(new Date(instant))).toBe(expected);
    });
  });

  describe('other boundaries', () => {
    it.each([
      // 2026-01-01 is a Thursday → belongs to 2026-W01.
      ['2026-01-01T00:00:00Z', '2026-W01'],
      // 2025-12-29 is the Monday of that same week.
      ['2025-12-29T00:00:00Z', '2026-W01'],
      // 2024-12-30 is a Monday belonging to 2025-W01.
      ['2024-12-30T00:00:00Z', '2025-W01'],
      // 2021-01-01 is a Friday belonging to 2020-W53.
      ['2021-01-01T00:00:00Z', '2020-W53'],
      // 2023-01-01 is a Sunday belonging to 2022-W52.
      ['2023-01-01T00:00:00Z', '2022-W52'],
      ['2026-09-29T12:00:00Z', '2026-W40'],
    ])('%s → %s', (instant, expected) => {
      expect(weekKeyUtc(new Date(instant))).toBe(expected);
    });
  });

  it('uses UTC, not the host timezone', () => {
    // 2027-01-03T23:30Z is still 2026-W53 even though it is already Monday in
    // Melbourne (UTC+11). Week keys are UTC by definition (ADR-014).
    expect(weekKeyUtc(new Date('2027-01-03T23:30:00Z'))).toBe('2026-W53');
  });

  it('changes exactly at Monday 00:00 UTC', () => {
    expect(weekKeyUtc(new Date('2026-09-27T23:59:59.999Z'))).toBe('2026-W39');
    expect(weekKeyUtc(new Date('2026-09-28T00:00:00.000Z'))).toBe('2026-W40');
  });

  it('rejects an invalid date', () => {
    expect(() => weekKeyUtc(new Date('not a date'))).toThrow(TypeError);
  });
});

describe('isoWeekYear / isoWeekNumber', () => {
  it('splits the boundary case into its parts', () => {
    const newYearsDay2027 = new Date('2027-01-01T00:00:00Z');
    expect(isoWeekYear(newYearsDay2027)).toBe(2026);
    expect(isoWeekNumber(newYearsDay2027)).toBe(53);
  });
});

describe('isWeekKey', () => {
  it.each(['2026-W01', '2026-W53', '0001-W01'])('accepts %s', (value) => {
    expect(isWeekKey(value)).toBe(true);
  });

  it.each(['2026-W1', '26-W01', '2026W01', '2026-w01', ''])('rejects %s', (value) => {
    expect(isWeekKey(value)).toBe(false);
  });
});

describe('weekStartUtc / nextWeekStartUtc', () => {
  it('returns the Monday 00:00 UTC of the containing week', () => {
    expect(weekStartUtc(new Date('2027-01-01T13:45:00Z')).toISOString()).toBe(
      '2026-12-28T00:00:00.000Z',
    );
  });

  it('returns the following Monday, which is the leaderboard reset target', () => {
    expect(nextWeekStartUtc(new Date('2027-01-01T13:45:00Z')).toISOString()).toBe(
      '2027-01-04T00:00:00.000Z',
    );
  });

  it('treats Sunday as the last day of the week, not the first', () => {
    expect(weekStartUtc(new Date('2026-10-04T00:00:00Z')).toISOString()).toBe(
      '2026-09-28T00:00:00.000Z',
    );
  });
});
