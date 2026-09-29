/**
 * Speed factor (PLANNING.md §10.1).
 *
 * `0.5 + 0.5 × (time_left_ms / time_limit_ms)`, with `time_left_ms` clamped to
 * `[0, time_limit_ms]`. Server-measured: §8.2 defines
 * `time_left = max(0, deadline_at − server_received_at)`, so an answer inside
 * the 1 s grace window scores the floor of 0.5 rather than going negative.
 */

import { Decimal } from 'decimal.js';

export const MIN_SPEED_FACTOR = 0.5;
export const MAX_SPEED_FACTOR = 1.0;

/** Speed factor as an exact decimal string. */
export function speedFactor(timeLeftMs: number, timeLimitMs: number): string {
  if (!Number.isFinite(timeLeftMs) || !Number.isFinite(timeLimitMs)) {
    throw new TypeError('speedFactor: arguments must be finite numbers');
  }
  if (timeLimitMs <= 0) {
    throw new RangeError(`speedFactor: timeLimitMs must be positive, got ${timeLimitMs}`);
  }

  const clamped = new Decimal(timeLeftMs).clamp(0, timeLimitMs);
  return new Decimal(0.5).plus(clamped.div(timeLimitMs).times(0.5)).toString();
}

/**
 * Milliseconds remaining at the moment the server received the answer.
 *
 * Never negative: an answer arriving inside the grace window counts as zero
 * time left, not as time owed (§8.2).
 */
export function timeLeftMs(deadlineAt: Date, serverReceivedAt: Date): number {
  return Math.max(0, deadlineAt.getTime() - serverReceivedAt.getTime());
}

/** Untimed items score the maximum (§10.1: "Untimed items: 1.0"). */
export const UNTIMED_SPEED_FACTOR = '1';
