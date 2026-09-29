import { addDaysToLocalDate, daysBetweenLocalDates } from '../time/timezone';
import { FREEZE_EARN_INTERVAL_DAYS, MAX_FREEZES_HELD } from '../transitions/freeze';
export const STREAK_MULT_STEP = 0.02;
export const STREAK_MULT_CAP_DAYS = 30;
export const STREAK_MILESTONES = [3, 7, 14, 30, 50, 100, 365] as const;
export interface StreakState {
  currentLen: number;
  longestLen: number;
  lastLocalDate: string | null;
  freezesAvailable: number;
  displayState: 'ACTIVE_TODAY' | 'AT_RISK' | 'PROTECTED' | 'BROKEN';
  credited?: boolean;
  milestone?: number | null;
}
export function buildSummary(
  days: readonly { localDate: string }[],
  freezes: readonly { status: string }[],
) {
  const dates = [...new Set(days.map((day) => day.localDate))].sort();
  let currentLen = 0;
  let longestLen = 0;
  let lastLocalDate: string | null = null;
  for (const date of dates) {
    currentLen =
      lastLocalDate && daysBetweenLocalDates(lastLocalDate, date) === 1 ? currentLen + 1 : 1;
    longestLen = Math.max(longestLen, currentLen);
    lastLocalDate = date;
  }
  return {
    currentLen,
    longestLen,
    lastLocalDate,
    freezesAvailable: freezes.filter((f) => f.status === 'AVAILABLE').length,
  };
}
export function displayStateFor(
  last: string | null,
  today: string,
  freezes: number,
): StreakState['displayState'] {
  if (!last) return 'BROKEN';
  const distance = daysBetweenLocalDates(last, today);
  if (distance <= 0) return 'ACTIVE_TODAY';
  if (distance === 1) return 'AT_RISK';
  return distance - 1 <= freezes ? 'PROTECTED' : 'BROKEN';
}
export function streakStateFor(
  days: readonly { localDate: string }[],
  freezes: readonly { status: string }[],
  today: string,
): StreakState {
  const summary = buildSummary(days, freezes);
  const displayState = displayStateFor(summary.lastLocalDate, today, summary.freezesAvailable);
  return {
    ...summary,
    displayState,
    currentLen: displayState === 'BROKEN' ? 0 : summary.currentLen,
  };
}
export function streakMultiplier(length: number): number {
  return 1 + STREAK_MULT_STEP * Math.min(Math.max(0, length), STREAK_MULT_CAP_DAYS);
}
export function freezesEarnedBy(before: number, after: number, held: number): number {
  return held < MAX_FREEZES_HELD &&
    Math.floor(after / FREEZE_EARN_INTERVAL_DAYS) > Math.floor(before / FREEZE_EARN_INTERVAL_DAYS)
    ? 1
    : 0;
}
export function milestoneReached(before: number, after: number): number | null {
  return [...STREAK_MILESTONES].reverse().find((day) => before < day && after >= day) ?? null;
}
export function planStreakCredit(input: {
  today: string;
  lastLocalDate: string | null;
  freezes: readonly { id: string }[];
}) {
  const { today, lastLocalDate: last, freezes } = input;
  const gap = last ? daysBetweenLocalDates(last, today) - 1 : 0;
  const kind = !last
    ? 'first'
    : gap < 0
      ? 'already_credited'
      : gap === 0
        ? 'extend'
        : gap <= freezes.length
          ? 'bridge'
          : 'restart';
  const frozenDates =
    kind === 'bridge'
      ? freezes
          .slice(0, gap)
          .map((freeze, i) => ({
            localDate: addDaysToLocalDate(last!, i + 1),
            freezeId: freeze.id,
          }))
      : [];
  return { kind, frozenDates, consumeFreezeIds: frozenDates.map((day) => day.freezeId) };
}
