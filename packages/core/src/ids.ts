/**
 * UUID v7 generation (PLANNING.md §14.1: "IDs: UUID v7 (time-ordered), generated
 * server-side").
 *
 * §21.1 names no UUID library, and §29 forbids adding dependencies for concerns
 * already covered, so this is implemented here rather than pulled in (ADR-028).
 *
 * Layout (RFC 9562 §5.7):
 *   0..5   48-bit big-endian Unix timestamp in milliseconds
 *   6      version nibble (0b0111) + 4 bits of rand_a
 *   7      remaining 8 bits of rand_a
 *   8      variant bits (0b10) + 6 bits of rand_b
 *   9..15  remaining rand_b
 *
 * Monotonicity: ids generated within the same millisecond increment a 12-bit
 * counter held in rand_a, so ids are strictly increasing lexicographically even
 * under burst generation. When the counter would overflow we wait for the clock
 * (conceptually) by borrowing from the next millisecond.
 */

const HEX: readonly string[] = Array.from({ length: 256 }, (_, i) =>
  i.toString(16).padStart(2, '0'),
);

const MAX_SEQUENCE = 0x0fff;

function randomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  globalThis.crypto.getRandomValues(bytes);
  return bytes;
}

/**
 * A monotonic UUID v7 stream.
 *
 * The sequence counter and last-seen timestamp are per-generator rather than
 * module-global, so a caller that drives one with explicit timestamps (a seed
 * script, a test) cannot perturb the ids the application is handing out.
 */
export class Uuidv7Generator {
  private lastTimestampMs = -1;
  private sequence = 0;

  /**
   * @param nowMs Optional explicit millisecond timestamp, so callers holding a
   *   {@link Clock} can keep id generation deterministic.
   */
  next(nowMs?: number): string {
    let timestamp = nowMs ?? Date.now();

    if (timestamp === this.lastTimestampMs) {
      this.sequence += 1;
      if (this.sequence > MAX_SEQUENCE) {
        // Sequence exhausted within this millisecond: advance into the next one.
        timestamp = this.lastTimestampMs + 1;
        this.sequence = 0;
      }
    } else if (timestamp < this.lastTimestampMs) {
      // Clock moved backwards (NTP adjustment, or an explicit nowMs). Keep the
      // stream monotonic rather than emitting an id that sorts before its
      // predecessor.
      timestamp = this.lastTimestampMs;
      this.sequence += 1;
      if (this.sequence > MAX_SEQUENCE) {
        timestamp = this.lastTimestampMs + 1;
        this.sequence = 0;
      }
    } else {
      this.sequence = 0;
    }
    this.lastTimestampMs = timestamp;

    return formatUuidv7(timestamp, this.sequence);
  }
}

function formatUuidv7(timestamp: number, sequence: number): string {
  const bytes = new Uint8Array(16);

  // 48-bit big-endian timestamp.
  bytes[0] = Math.floor(timestamp / 2 ** 40) & 0xff;
  bytes[1] = Math.floor(timestamp / 2 ** 32) & 0xff;
  bytes[2] = Math.floor(timestamp / 2 ** 24) & 0xff;
  bytes[3] = Math.floor(timestamp / 2 ** 16) & 0xff;
  bytes[4] = Math.floor(timestamp / 2 ** 8) & 0xff;
  bytes[5] = timestamp & 0xff;

  // version (7) + 12-bit monotonic sequence in rand_a.
  bytes[6] = 0x70 | ((sequence >>> 8) & 0x0f);
  bytes[7] = sequence & 0xff;

  const rand = randomBytes(8);
  // variant (0b10) + 6 random bits.
  bytes[8] = 0x80 | (rand[0]! & 0x3f);
  for (let i = 1; i < 8; i += 1) {
    bytes[8 + i] = rand[i]!;
  }

  return (
    HEX[bytes[0]!]! +
    HEX[bytes[1]!]! +
    HEX[bytes[2]!]! +
    HEX[bytes[3]!]! +
    '-' +
    HEX[bytes[4]!]! +
    HEX[bytes[5]!]! +
    '-' +
    HEX[bytes[6]!]! +
    HEX[bytes[7]!]! +
    '-' +
    HEX[bytes[8]!]! +
    HEX[bytes[9]!]! +
    '-' +
    HEX[bytes[10]!]! +
    HEX[bytes[11]!]! +
    HEX[bytes[12]!]! +
    HEX[bytes[13]!]! +
    HEX[bytes[14]!]! +
    HEX[bytes[15]!]!
  );
}

const defaultGenerator = new Uuidv7Generator();

/** Generate a UUID v7 from the application's monotonic stream. */
export function uuidv7(): string {
  return defaultGenerator.next();
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

/** Read the UUID version nibble, or null when the string is not a UUID. */
export function uuidVersion(value: string): number | null {
  if (!UUID_RE.test(value)) return null;
  return Number.parseInt(value[14]!, 16);
}

/** Extract the embedded millisecond timestamp from a UUID v7. */
export function uuidv7Timestamp(value: string): number | null {
  if (uuidVersion(value) !== 7) return null;
  const hex = value.slice(0, 8) + value.slice(9, 13);
  return Number.parseInt(hex, 16);
}
