import { describe, expect, it } from 'vitest';
import {
  addDaysToLocalDate,
  buildSummary,
  displayStateFor,
  freezesEarnedBy,
  localDateFor,
  milestoneReached,
  planStreakCredit,
  streakMultiplier,
  streakStateFor,
  STREAK_MILESTONES,
} from '../src';
describe('streak credit', () => {
  it('starts once and refuses same-day or backwards credit', () => {
    expect(planStreakCredit({ today: '2026-01-01', lastLocalDate: null, freezes: [] }).kind).toBe(
      'first',
    );
    for (const today of ['2026-01-01', '2025-12-31'])
      expect(planStreakCredit({ today, lastLocalDate: '2026-01-01', freezes: [] }).kind).toBe(
        'already_credited',
      );
  });
  for (const gap of [0, 1, 2, 3])
    for (const held of [0, 1, 2])
      it(`gap ${gap}, freezes ${held}`, () => {
        const plan = planStreakCredit({
          today: addDaysToLocalDate('2026-12-30', gap + 1),
          lastLocalDate: '2026-12-30',
          freezes: Array.from({ length: held }, (_, i) => ({ id: String(i) })),
        });
        expect(plan.kind).toBe(gap === 0 ? 'extend' : gap <= held ? 'bridge' : 'restart');
        expect(plan.consumeFreezeIds).toEqual(
          gap > 0 && gap <= held ? Array.from({ length: gap }, (_, i) => String(i)) : [],
        );
      });
  it('earns on crossing a multiple of seven, capped at two', () => {
    for (const [before, after, held, expected] of [
      [5, 6, 0, 0],
      [6, 7, 0, 1],
      [7, 8, 1, 0],
      [13, 14, 1, 1],
      [20, 21, 2, 0],
      [20, 21, 1, 1],
      [6, 9, 0, 1],
      [7, 7, 0, 0],
    ])
      expect(freezesEarnedBy(before!, after!, held!)).toBe(expected);
  });
  it('keeps the longest run after restart and shows broken as zero', () => {
    const days = ['2026-01-01', '2026-01-02', '2026-01-03', '2026-01-06'].map((localDate) => ({
      localDate,
    }));
    expect(buildSummary(days, [])).toMatchObject({ currentLen: 1, longestLen: 3 });
    expect(streakStateFor(days, [], '2026-01-08').currentLen).toBe(0);
  });
  it.each([
    [null, 0, 'BROKEN'],
    ['2026-01-04', 0, 'ACTIVE_TODAY'],
    ['2026-01-03', 0, 'AT_RISK'],
    ['2026-01-02', 2, 'PROTECTED'],
    ['2026-01-02', 0, 'BROKEN'],
  ] as const)('display %s', (last, held, state) =>
    expect(displayStateFor(last, '2026-01-04', held)).toBe(state),
  );
  it.each(STREAK_MILESTONES)('celebrates milestone %s only when crossed', (day) => {
    expect(milestoneReached(day - 1, day)).toBe(day);
    expect(milestoneReached(day, day)).toBeNull();
  });
  it.each([
    [0, 1],
    [1, 1.02],
    [5, 1.1],
    [30, 1.6],
    [45, 1.6],
  ])('multiplier %s', (days, expected) => expect(streakMultiplier(days!)).toBe(expected));
  it.each([
    [
      'America/New_York',
      '2026-03-08T04:30:00Z',
      '2026-03-09T04:30:00Z',
      '2026-03-07',
      '2026-03-09',
    ],
    [
      'America/New_York',
      '2026-11-01T05:30:00Z',
      '2026-11-01T06:30:00Z',
      '2026-11-01',
      '2026-11-01',
    ],
    [
      'Australia/Melbourne',
      '2026-04-04T15:30:00Z',
      '2026-04-04T16:30:00Z',
      '2026-04-05',
      '2026-04-05',
    ],
    [
      'Australia/Melbourne',
      '2026-10-03T13:59:59.999Z',
      '2026-10-03T14:00:00Z',
      '2026-10-03',
      '2026-10-04',
    ],
  ])('DST and midnight %s', (zone, a, b, da, db) => {
    expect(localDateFor(zone!, new Date(a!))).toBe(da);
    expect(localDateFor(zone!, new Date(b!))).toBe(db);
  });
  it('same instant has different local dates at the date line', () => {
    const instant = new Date('2026-01-01T12:00:00Z');
    expect(localDateFor('Pacific/Kiritimati', instant)).toBe('2026-01-02');
    expect(localDateFor('Pacific/Niue', instant)).toBe('2026-01-01');
  });
});
