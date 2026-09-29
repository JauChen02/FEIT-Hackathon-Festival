import { describe, expect, it } from 'vitest';
import {
  addDaysToLocalDate,
  canonicalizeTimezone,
  daysBetweenLocalDates,
  isLocalDate,
  isValidIanaTimezone,
  localDateFor,
  supportedTimezones,
} from '../src/time/timezone';

/**
 * §12.1: `users.timezone` stores an IANA identifier; a session's local_date is
 * the calendar date in that zone at completion time. Phase 0 acceptance
 * criterion: "timezone validation".
 */
describe('isValidIanaTimezone', () => {
  it.each([
    'UTC',
    'Australia/Melbourne',
    'America/New_York',
    'Europe/London',
    'Asia/Kolkata',
    'America/Argentina/Buenos_Aires',
    'Pacific/Auckland',
  ])('accepts %s', (value) => {
    expect(isValidIanaTimezone(value)).toBe(true);
  });

  it.each([
    ['Mars/Phobos', 'not a real zone'],
    ['', 'empty'],
    ['   ', 'whitespace only'],
    [' UTC', 'leading whitespace'],
    ['UTC ', 'trailing whitespace'],
    ['+10:00', 'an ES2024 offset zone — accepted by Intl, but carries no DST rules'],
    ['-05:30', 'a negative offset zone'],
    ['GMT+10', 'an offset alias'],
    ['Australia/Melbourne/Extra', 'over-qualified'],
  ])('rejects %s (%s)', (value) => {
    expect(isValidIanaTimezone(value)).toBe(false);
  });

  it.each([null, undefined, 42, {}, []])('rejects the non-string %s', (value) => {
    expect(isValidIanaTimezone(value)).toBe(false);
  });
});

/**
 * ICU versions disagree about which spelling of an alias pair is canonical, and
 * the browser and the server can be on different versions, so the server
 * normalises on the way in (see the note in src/time/timezone.ts).
 */
describe('canonicalizeTimezone', () => {
  it('is idempotent', () => {
    for (const zone of ['UTC', 'Australia/Melbourne', 'America/New_York']) {
      const once = canonicalizeTimezone(zone);
      expect(canonicalizeTimezone(once)).toBe(once);
    }
  });

  it('fixes casing, so australia/melbourne is stored canonically', () => {
    expect(canonicalizeTimezone('australia/melbourne')).toBe('Australia/Melbourne');
  });

  it('collapses alias spellings onto one stored value', () => {
    // Whichever spelling this runtime prefers, both inputs must land on it —
    // otherwise one user could hold two different strings for the same zone.
    expect(canonicalizeTimezone('Asia/Kolkata')).toBe(canonicalizeTimezone('Asia/Calcutta'));
    expect(canonicalizeTimezone('US/Eastern')).toBe(canonicalizeTimezone('America/New_York'));
  });

  it('always returns something localDateFor accepts', () => {
    for (const zone of ['Asia/Kolkata', 'US/Eastern', 'utc', 'Australia/Melbourne']) {
      const canonical = canonicalizeTimezone(zone);
      expect(isValidIanaTimezone(canonical), canonical).toBe(true);
      expect(() => localDateFor(canonical, new Date('2026-09-29T00:00:00Z'))).not.toThrow();
    }
  });

  it('rejects what isValidIanaTimezone rejects', () => {
    expect(() => canonicalizeTimezone('Mars/Phobos')).toThrow(TypeError);
    expect(() => canonicalizeTimezone('+10:00')).toThrow(TypeError);
  });
});

describe('supportedTimezones', () => {
  it('offers the onboarding picker a non-trivial list including UTC', () => {
    const zones = supportedTimezones();
    expect(zones.length).toBeGreaterThan(100);
    expect(zones).toContain('Australia/Melbourne');
  });

  it('only contains zones our own validator accepts', () => {
    // Guards against the picker offering a value the API would then reject.
    for (const zone of supportedTimezones()) {
      expect(isValidIanaTimezone(zone), zone).toBe(true);
    }
  });
});

describe('localDateFor', () => {
  it('returns the calendar date in the given zone, not UTC', () => {
    // 2026-09-29T22:00Z is already 2026-09-30 in Melbourne (UTC+10).
    const instant = new Date('2026-09-29T22:00:00Z');
    expect(localDateFor('UTC', instant)).toBe('2026-09-29');
    expect(localDateFor('Australia/Melbourne', instant)).toBe('2026-09-30');
    expect(localDateFor('America/New_York', instant)).toBe('2026-09-29');
  });

  it('is still on the previous day west of UTC just after UTC midnight', () => {
    const instant = new Date('2026-09-30T02:00:00Z');
    expect(localDateFor('UTC', instant)).toBe('2026-09-30');
    expect(localDateFor('America/New_York', instant)).toBe('2026-09-29');
  });

  it('handles the US spring-forward day (no 02:00 local hour)', () => {
    // DST starts 2026-03-08 in America/New_York.
    expect(localDateFor('America/New_York', new Date('2026-03-08T06:59:00Z'))).toBe('2026-03-08');
    expect(localDateFor('America/New_York', new Date('2026-03-08T07:00:00Z'))).toBe('2026-03-08');
  });

  it('handles the US fall-back day (02:00 local hour happens twice)', () => {
    // DST ends 2026-11-01 in America/New_York.
    expect(localDateFor('America/New_York', new Date('2026-11-01T05:30:00Z'))).toBe('2026-11-01');
    expect(localDateFor('America/New_York', new Date('2026-11-01T06:30:00Z'))).toBe('2026-11-01');
  });

  it('handles the southern-hemisphere DST boundary', () => {
    // Melbourne moves to +11 on 2026-10-04.
    expect(localDateFor('Australia/Melbourne', new Date('2026-10-03T14:00:00Z'))).toBe(
      '2026-10-04',
    );
  });

  it('pads single-digit months and days', () => {
    expect(localDateFor('UTC', new Date('2026-01-05T00:00:00Z'))).toBe('2026-01-05');
  });

  it('rejects an invalid timezone', () => {
    expect(() => localDateFor('Mars/Phobos', new Date('2026-09-29T00:00:00Z'))).toThrow(TypeError);
  });

  it('rejects an invalid instant', () => {
    expect(() => localDateFor('UTC', new Date('nope'))).toThrow(TypeError);
  });
});

describe('local date arithmetic', () => {
  it.each([
    ['2026-09-29', '2026-09-30', 1],
    ['2026-09-29', '2026-09-29', 0],
    ['2026-09-30', '2026-09-29', -1],
    ['2026-02-28', '2026-03-01', 1], // 2026 is not a leap year
    ['2028-02-28', '2028-03-01', 2], // 2028 is
    ['2026-12-31', '2027-01-01', 1],
  ])('daysBetweenLocalDates(%s, %s) === %i', (from, to, expected) => {
    expect(daysBetweenLocalDates(from, to)).toBe(expected);
  });

  it('is unaffected by DST, because both operands are already local dates', () => {
    expect(daysBetweenLocalDates('2026-03-07', '2026-03-09')).toBe(2);
    expect(daysBetweenLocalDates('2026-10-31', '2026-11-02')).toBe(2);
  });

  it.each([
    ['2026-09-29', 1, '2026-09-30'],
    ['2026-09-29', -1, '2026-09-28'],
    ['2026-12-31', 1, '2027-01-01'],
    ['2026-02-28', 1, '2026-03-01'],
  ])('addDaysToLocalDate(%s, %i) === %s', (date, days, expected) => {
    expect(addDaysToLocalDate(date, days)).toBe(expected);
  });

  it('rejects malformed local dates', () => {
    expect(() => daysBetweenLocalDates('2026-9-29', '2026-09-30')).toThrow(TypeError);
    expect(() => addDaysToLocalDate('29/09/2026', 1)).toThrow(TypeError);
  });
});

describe('isLocalDate', () => {
  it.each(['2026-09-29', '0001-01-01'])('accepts %s', (v) => expect(isLocalDate(v)).toBe(true));
  it.each(['2026-9-29', '2026/09/29', ''])('rejects %s', (v) => expect(isLocalDate(v)).toBe(false));
});
