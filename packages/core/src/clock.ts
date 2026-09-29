/**
 * Injectable clock (PLANNING.md §22.5).
 *
 * Domain logic and tests MUST NOT read wall-clock time directly. Every function
 * that needs "now" takes a Clock, so tests can pin it deterministically.
 */
export interface Clock {
  /** Current instant as a UTC Date. Server timestamps are canonical (§5.13). */
  now(): Date;
}

/** The only place in the codebase allowed to read the real clock. */
export const systemClock: Clock = {
  now: () => new Date(),
};

/** A clock frozen at one instant, or advanced manually. For tests and seeds. */
export class FixedClock implements Clock {
  private current: Date;

  constructor(instant: Date | string | number) {
    this.current = new Date(instant);
    if (Number.isNaN(this.current.getTime())) {
      throw new TypeError(`FixedClock: invalid instant ${String(instant)}`);
    }
  }

  now(): Date {
    return new Date(this.current);
  }

  /** Move the clock forward (or backward, with a negative value). */
  advanceMs(ms: number): this {
    this.current = new Date(this.current.getTime() + ms);
    return this;
  }

  advanceDays(days: number): this {
    return this.advanceMs(days * 86_400_000);
  }

  set(instant: Date | string | number): this {
    this.current = new Date(instant);
    return this;
  }
}
