import { describe, expect, it } from 'vitest';
import { FixedClock, systemClock } from '../src/clock';

/** §22.5: "Tests MUST NOT depend on wall-clock time; use an injectable Clock." */
describe('FixedClock', () => {
  it('stays frozen until advanced', () => {
    const clock = new FixedClock('2026-09-29T00:00:00Z');
    const first = clock.now();
    const second = clock.now();
    expect(first.toISOString()).toBe('2026-09-29T00:00:00.000Z');
    expect(second.getTime()).toBe(first.getTime());
  });

  it('returns a fresh Date each call, so callers cannot mutate it', () => {
    const clock = new FixedClock('2026-09-29T00:00:00Z');
    const first = clock.now();
    first.setUTCFullYear(1999);
    expect(clock.now().toISOString()).toBe('2026-09-29T00:00:00.000Z');
  });

  it('advances by milliseconds and by days', () => {
    const clock = new FixedClock('2026-09-29T00:00:00Z');
    expect(clock.advanceMs(1_500).now().toISOString()).toBe('2026-09-29T00:00:01.500Z');
    expect(clock.advanceDays(1).now().toISOString()).toBe('2026-09-30T00:00:01.500Z');
    expect(clock.advanceDays(-1).now().toISOString()).toBe('2026-09-29T00:00:01.500Z');
  });

  it('can be reset to a new instant', () => {
    const clock = new FixedClock('2026-09-29T00:00:00Z');
    expect(clock.set('2027-01-01T00:00:00Z').now().toISOString()).toBe('2027-01-01T00:00:00.000Z');
  });

  it('accepts a Date and an epoch millisecond value', () => {
    expect(new FixedClock(new Date('2026-09-29T00:00:00Z')).now().toISOString()).toBe(
      '2026-09-29T00:00:00.000Z',
    );
    expect(new FixedClock(0).now().toISOString()).toBe('1970-01-01T00:00:00.000Z');
  });

  it('rejects an invalid instant at construction rather than producing NaN dates', () => {
    expect(() => new FixedClock('not a date')).toThrow(TypeError);
  });
});

describe('systemClock', () => {
  it('returns the current instant', () => {
    const before = Date.now();
    const now = systemClock.now().getTime();
    expect(now).toBeGreaterThanOrEqual(before);
    expect(now).toBeLessThanOrEqual(Date.now());
  });
});
