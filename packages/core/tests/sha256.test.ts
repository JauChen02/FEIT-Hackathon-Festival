import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { sha256, sha256Bytes } from '../src/crypto/sha256';

/**
 * We ship our own SHA-256 so packages/core stays importable from the browser
 * (see the note in src/crypto/sha256.ts). That makes verifying it non-optional:
 * the published FIPS 180-4 vectors below, plus a differential check against
 * node:crypto across every message length that exercises the padding paths.
 */
describe('sha256', () => {
  it.each([
    ['', 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'],
    ['abc', 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'],
    [
      'abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq',
      '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1',
    ],
    [
      'abcdefghbcdefghicdefghijdefghijkefghijklfghijklmghijklmnhijklmnoijklmnopjklmnopqklmnopqrlmnopqrsmnopqrstnopqrstu',
      'cf5b16a778af8380036ce59e7b0492370b249b11e8f07a51afac45037afee9d1',
    ],
  ])('matches the FIPS 180-4 vector for %j', (input, expected) => {
    expect(sha256(input)).toBe(expected);
  });

  it('matches the long FIPS vector (one million "a")', () => {
    expect(sha256('a'.repeat(1_000_000))).toBe(
      'cdc76e5c9914fb9281a1c7e284d73e67f1809a48a497200e046d39ccc7112cd0',
    );
  });

  it('agrees with node:crypto for every length from 0 to 200 bytes', () => {
    // Covers both padding branches: messages of length ≡ 56..63 (mod 64) need
    // an extra block, everything else does not.
    for (let length = 0; length <= 200; length += 1) {
      const bytes = new Uint8Array(length);
      for (let i = 0; i < length; i += 1) {
        bytes[i] = (i * 31 + 7) % 256;
      }
      const expected = createHash('sha256').update(bytes).digest('hex');
      expect(sha256Bytes(bytes), `length ${length}`).toBe(expected);
    }
  });

  it('is UTF-8 aware', () => {
    expect(sha256('é')).toBe(sha256Bytes(new Uint8Array([0xc3, 0xa9])));
    expect(sha256('🙂')).toBe(createHash('sha256').update('🙂', 'utf8').digest('hex'));
  });

  it('always returns 64 lowercase hex characters', () => {
    for (const input of ['', 'a', 'hello world', '🙂']) {
      expect(sha256(input)).toMatch(/^[0-9a-f]{64}$/);
    }
  });
});
