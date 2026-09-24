/**
 * xxHash64 known-answer tests.
 *
 * The xxHash64 algorithm has a canonical reference implementation. Any
 * divergence between WrongStack installs (or between this code and the
 * reference) would mean a single file gets two different `content_hash`
 * values, which silently degrades the incremental indexer's hit rate.
 *
 * Vectors were verified against `xxhash-wasm@1.1.0` (the trusted WASM
 * build of the reference C implementation). The empty-input case and a
 * 1-byte case anchor the buffer boundary conditions; the 240-byte case
 * covers the multi-block path. Numbers are seed=0, lowercase hex.
 */

import { describe, expect, it } from 'vitest';
import {
  parseContentHash,
  xxhash64Hex,
  xxhash64String,
} from '../src/codebase-index/content-hash.js';

describe('xxHash64 — known-answer vectors (seed 0)', () => {
  it.each([
    // [label, input bytes as a string, expected hex]
    // Verified against xxhash-wasm@1.1.0 reference implementation.
    ['empty', '', 'ef46db3751d8e999'],
    ['one byte (\\0)', '\0', 'e934a84adb052768'],
    ['one byte (a)', 'a', 'd24ec4f1a98c6e5b'],
    ['hello', 'hello', '26c7827d889f6da3'],
    ['world', 'world', 'e778fbfe66ee51ef'],
    ['240 bytes (cycle pattern)', 'A'.repeat(240), '39e3213f48f0c087'],
  ])('hashes %s correctly', (_label, input, expected) => {
    expect(xxhash64String(input)).toBe(expected);
  });

  it('matches byte-string and UTF-8 inputs of the same byte sequence', () => {
    const text = 'héllo';
    const utf8 = new TextEncoder().encode(text);
    expect(xxhash64String(text)).toBe(xxhash64Hex(utf8));
  });

  it('produces different hashes for different inputs of the same length', () => {
    expect(xxhash64String('hello')).not.toBe(xxhash64String('world'));
  });

  it('produces the same hash for two buffers that differ only in capacity', () => {
    const a = new Uint8Array([104, 101, 108, 108, 111]); // "hello", no slack
    const b = new Uint8Array(16);
    b.set([104, 101, 108, 108, 111]);
    // Pass explicitLen so only the first 5 bytes are hashed.
    expect(xxhash64Hex(a)).toBe(xxhash64Hex(b, 5));
  });
});

describe('parseContentHash', () => {
  it('parses a valid hex string back to a 64-bit BigInt', () => {
    expect(parseContentHash('ef46db3751d8e999')).toBe(0xef46db3751d8e999n);
  });

  it('returns undefined for empty / null / undefined', () => {
    expect(parseContentHash('')).toBeUndefined();
    expect(parseContentHash(null)).toBeUndefined();
    expect(parseContentHash(undefined)).toBeUndefined();
  });

  it('returns undefined for malformed input rather than throwing', () => {
    expect(parseContentHash('not-hex')).toBeUndefined();
    expect(parseContentHash('0xef46db3751d8e999')).toBeUndefined(); // BigInt won't parse the 0x prefix here
  });
});

/**
 * Straight BigInt transcription of the spec. The production hash runs on
 * 32-bit halves for speed; this pins it to the obvious 64-bit arithmetic on
 * every tail shape (0-7 trailing bytes, 4-byte lane, full stripes).
 */
function referenceXxh64(buf: Uint8Array): string {
  const M = 0xffffffffffffffffn;
  const P1 = 0x9e3779b185ebca87n;
  const P2 = 0xc2b2ae3d27d4eb4fn;
  const P3 = 0x165667b19e3779f9n;
  const P4 = 0x85ebca77c2b2ae63n;
  const P5 = 0x27d4eb2f165667c5n;
  const rotl = (x: bigint, n: number) => ((x << BigInt(n)) | (x >> BigInt(64 - n))) & M;
  const round = (acc: bigint, lane: bigint) => (rotl((acc + lane * P2) & M, 31) * P1) & M;
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let off = 0;
  let h: bigint;
  if (buf.length >= 32) {
    const v = [(P1 + P2) & M, P2, 0n, (0n - P1) & M];
    while (off <= buf.length - 32) {
      for (let i = 0; i < 4; i++) v[i] = round(v[i]!, view.getBigUint64(off + i * 8, true));
      off += 32;
    }
    h = (rotl(v[0]!, 1) + rotl(v[1]!, 7) + rotl(v[2]!, 12) + rotl(v[3]!, 18)) & M;
    for (const lane of v) h = (((h ^ round(0n, lane)) * P1) & M) + P4;
  } else {
    h = P5;
  }
  h = (h + BigInt(buf.length)) & M;
  for (; off + 8 <= buf.length; off += 8) {
    h = (rotl(h ^ round(0n, view.getBigUint64(off, true)), 27) * P1 + P4) & M;
  }
  if (off + 4 <= buf.length) {
    h = (rotl(h ^ ((BigInt(view.getUint32(off, true)) * P1) & M), 23) * P2 + P3) & M;
    off += 4;
  }
  for (; off < buf.length; off++) h = (rotl(h ^ ((BigInt(buf[off]!) * P5) & M), 11) * P1) & M;
  h ^= h >> 33n;
  h = (h * P2) & M;
  h ^= h >> 29n;
  h = (h * P3) & M;
  h ^= h >> 32n;
  return h.toString(16).padStart(16, '0');
}

describe('xxHash64 — 32-bit implementation vs 64-bit reference', () => {
  it('agrees on every tail shape and on carry-heavy input', () => {
    let seed = 0x2545f491;
    const nextByte = () => {
      seed = (Math.imul(seed, 1103515245) + 12345) >>> 0;
      return seed >>> 24;
    };
    for (let len = 0; len <= 200; len++) {
      const random = Uint8Array.from({ length: len }, nextByte);
      expect(xxhash64Hex(random)).toBe(referenceXxh64(random));
      const saturated = new Uint8Array(len).fill(0xff);
      expect(xxhash64Hex(saturated)).toBe(referenceXxh64(saturated));
    }
  });
});
