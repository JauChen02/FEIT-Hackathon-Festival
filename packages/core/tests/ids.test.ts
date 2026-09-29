import { describe, expect, it } from 'vitest';
import { Uuidv7Generator, isUuid, uuidv7, uuidv7Timestamp, uuidVersion } from '../src/ids';

/** §14.1: "IDs: UUID v7 (time-ordered), generated server-side" (ADR-028). */
describe('uuidv7', () => {
  it('produces a well-formed UUID string', () => {
    expect(isUuid(uuidv7())).toBe(true);
  });

  it('sets the version nibble to 7', () => {
    for (let i = 0; i < 100; i += 1) {
      expect(uuidVersion(uuidv7())).toBe(7);
    }
  });

  it('sets the RFC 9562 variant bits to 0b10', () => {
    for (let i = 0; i < 100; i += 1) {
      const variantNibble = Number.parseInt(uuidv7()[19]!, 16);
      // 0b10xx → 8, 9, a or b
      expect(variantNibble & 0b1100).toBe(0b1000);
    }
  });

  it('embeds the millisecond timestamp it was given', () => {
    const at = Date.UTC(2026, 8, 29, 12, 0, 0);
    expect(uuidv7Timestamp(new Uuidv7Generator().next(at))).toBe(at);
  });

  it('embeds a timestamp close to now when none is given', () => {
    const before = Date.now();
    const embedded = uuidv7Timestamp(uuidv7())!;
    expect(embedded).toBeGreaterThanOrEqual(before - 1);
    expect(embedded).toBeLessThanOrEqual(Date.now() + 1);
  });

  it('is lexicographically monotonic across a burst of 10,000 ids', () => {
    // Time-ordering is the whole point of v7: it keeps B-tree inserts local.
    // A burst within one millisecond exercises the 12-bit sequence counter.
    const ids = Array.from({ length: 10_000 }, () => uuidv7());
    for (let i = 1; i < ids.length; i += 1) {
      expect(ids[i]! > ids[i - 1]!, `${ids[i - 1]} !< ${ids[i]} at index ${i}`).toBe(true);
    }
  });

  it('produces distinct ids', () => {
    const ids = new Set(Array.from({ length: 5_000 }, () => uuidv7()));
    expect(ids.size).toBe(5_000);
  });
});

describe('Uuidv7Generator', () => {
  it('stays monotonic when the supplied clock goes backwards', () => {
    const generator = new Uuidv7Generator();
    const first = generator.next(Date.UTC(2026, 8, 29, 12, 0, 0));
    const second = generator.next(Date.UTC(2026, 8, 29, 11, 0, 0));
    expect(second > first).toBe(true);
  });

  it('keeps its sequence counter to itself', () => {
    // A seed script driving its own generator with fixed timestamps must not
    // push the application's id stream years into the future.
    const seeding = new Uuidv7Generator();
    seeding.next(Date.UTC(2099, 0, 1));
    const embedded = uuidv7Timestamp(uuidv7())!;
    expect(embedded).toBeLessThanOrEqual(Date.now() + 1);
  });

  it('is monotonic within one millisecond via the 12-bit sequence', () => {
    const generator = new Uuidv7Generator();
    const at = Date.UTC(2026, 8, 29, 12, 0, 0);
    const ids = Array.from({ length: 500 }, () => generator.next(at));
    for (let i = 1; i < ids.length; i += 1) {
      expect(ids[i]! > ids[i - 1]!).toBe(true);
      expect(uuidv7Timestamp(ids[i]!)).toBe(at);
    }
  });

  it('rolls into the next millisecond when the sequence overflows', () => {
    const generator = new Uuidv7Generator();
    const at = Date.UTC(2026, 8, 29, 12, 0, 0);
    // 4096 sequence values (0x000..0xfff) fit in one millisecond.
    const ids = Array.from({ length: 4_098 }, () => generator.next(at));
    expect(uuidv7Timestamp(ids[4_095]!)).toBe(at);
    expect(uuidv7Timestamp(ids[4_096]!)).toBe(at + 1);
    for (let i = 1; i < ids.length; i += 1) {
      expect(ids[i]! > ids[i - 1]!, `index ${i}`).toBe(true);
    }
  });
});

describe('isUuid / uuidVersion / uuidv7Timestamp', () => {
  it.each(['00000000-0000-0000-0000-000000000000', '0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b'])(
    'accepts %s',
    (value) => {
      expect(isUuid(value)).toBe(true);
    },
  );

  it.each([
    ['not-a-uuid', 'nonsense'],
    ['0199A1B2-C3D4-7E5F-8A9B-0C1D2E3F4A5B', 'uppercase — we store lowercase'],
    ['0199a1b2c3d47e5f8a9b0c1d2e3f4a5b', 'no dashes'],
    ['', 'empty'],
  ])('rejects %s (%s)', (value) => {
    expect(isUuid(value)).toBe(false);
    expect(uuidVersion(value)).toBeNull();
  });

  it('returns null for the timestamp of a non-v7 UUID', () => {
    expect(uuidv7Timestamp('0199a1b2-c3d4-4e5f-8a9b-0c1d2e3f4a5b')).toBeNull();
  });
});
