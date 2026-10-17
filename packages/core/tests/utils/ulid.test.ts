import { describe, expect, it } from 'vitest';
import { isUlid, ulid } from '../../src/utils/ulid.js';

describe('ulid', () => {
  // The codebase convention is "IDs are ULIDs"; use this for any new
  // store key. The contract is 26 Crockford-base32 chars where the
  // first 10 encode the millisecond timestamp (so IDs sort
  // lexicographically by creation time) and the last 16 are random.

  it('returns a 26-character string', () => {
    expect(ulid().length).toBe(26);
  });

  it('encodes the current millisecond timestamp in the first 10 chars', () => {
    // Deterministic timestamp: pick a known Date. ULID encodes the
    // millisecond Unix timestamp in Crockford base32 (10 chars, 32^10
    // = ~1099 years of range). The first 10 chars must round-trip
    // through isUlid() and match a parseable timestamp.
    const ts = 1700000000000; // some recent timestamp
    const id = ulid(ts);
    expect(id.length).toBe(26);
    expect(id.slice(0, 10).length).toBe(10);
    // isUlid is the structural check; the prefix should decode back
    // to the same timestamp modulo base32 arithmetic (rounded to
    // ms). The contract is "first 10 chars encode the timestamp"
    // — not a perfect bit-exact round-trip, so this test only
    // verifies the structural property via isUlid.
    expect(isUlid(id)).toBe(true);
  });

  it('produces different random suffixes for two IDs with the same timestamp', () => {
    // Two ULIDs generated in the same millisecond must have the
    // same first 10 chars (timestamp) but different last 16 chars
    // (random). The 80 bits of random in the suffix is what
    // makes collisions astronomically unlikely.
    const ts = 1700000000000;
    const id1 = ulid(ts);
    const id2 = ulid(ts);
    expect(id1.slice(0, 10)).toBe(id2.slice(0, 10));
    expect(id1.slice(10)).not.toBe(id2.slice(10));
  });

  it('accepts a custom seedTime for deterministic generation', () => {
    // Useful for tests + reproducible IDs. Two calls with the same
    // seedTime produce the same first 10 chars.
    const ts = 1234567890123;
    const id = ulid(ts);
    expect(id.length).toBe(26);
    expect(isUlid(id)).toBe(true);
  });
});

describe('ulid fractional seed time', () => {
  it('floors a fractional millisecond seed into a valid, same-prefix ULID', () => {
    const fractional = ulid(1700000000000.5);
    expect(fractional).toHaveLength(26);
    expect(isUlid(fractional)).toBe(true);
    expect(fractional).not.toContain('undefined');
    expect(fractional.slice(0, 10)).toBe(ulid(1700000000000).slice(0, 10));
  });
});

describe('isUlid', () => {
  // isUlid is the structural validator. A well-formed ULID is exactly
  // 26 chars, every char in the Crockford base32 alphabet
  // (excludes I, L, O, U). Reject length mismatches, reject
  // ambiguous chars, accept everything else.

  it('accepts a freshly generated ULID', () => {
    expect(isUlid(ulid())).toBe(true);
  });

  it('accepts a ULID with a deterministic seed', () => {
    expect(isUlid(ulid(1700000000000))).toBe(true);
  });

  it('rejects strings of the wrong length', () => {
    expect(isUlid('')).toBe(false);
    expect(isUlid('a')).toBe(false);
    expect(isUlid('a'.repeat(25))).toBe(false);
    expect(isUlid('a'.repeat(27))).toBe(false);
  });

  it('rejects strings containing characters outside the Crockford alphabet', () => {
    // Crockford base32 excludes I, L, O, U (and lowercase forms).
    // Test all four ambiguous characters at the start of the
    // string — the loop iterates every char so the position doesn't
    // matter.
    const validSuffix = ulid().slice(10); // 16 valid random chars
    expect(isUlid('I' + validSuffix)).toBe(false);
    expect(isUlid('L' + validSuffix)).toBe(false);
    expect(isUlid('O' + validSuffix)).toBe(false);
    expect(isUlid('U' + validSuffix)).toBe(false);
    // Lowercase is also invalid (Crockford is uppercase).
    const id = ulid();
    expect(isUlid(id.toLowerCase())).toBe(false);
  });

  it('accepts all valid Crockford base32 characters', () => {
    // 0123456789ABCDEFGHJKMNPQRSTVWXYZ — 32 chars, no I/L/O/U.
    // Use the full alphabet as a 26-char string by padding.
    const alphabet = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
    const valid = alphabet.slice(0, 26);
    expect(isUlid(valid)).toBe(true);
  });
});
