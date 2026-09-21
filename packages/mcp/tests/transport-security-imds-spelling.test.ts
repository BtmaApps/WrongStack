/**
 * Regression (found in bug-hunt round 6): the AWS IPv6 IMDS literal must
 * classify as `blocked` under every valid spelling of the SAME address.
 *
 * Proven red before the fix — the rule was an exact string compare, so the
 * uncompressed form fell through to ordinary ULA `private`, the one class
 * `allowPrivateNetworks` relaxes.
 *
 * The classifier's own contract (transport-security.ts): `blocked` covers
 * "link-local / IMDS (169.254/16, fe80::/10, fd00:ec2::254); never a valid MCP
 * target, regardless of opt-in." The IMDS rule is an exact string equality, so
 * the uncompressed form of that address escapes it and is reported as ordinary
 * ULA `private` — which `allowPrivateNetworks: true` then permits to be dialed.
 * `fe80::/10` beside it is a regex, so link-local has no such spelling hole.
 */
import { describe, expect, it } from 'vitest';
import {
  assertTransportAddressAllowed,
  classifyTransportAddress,
} from '../src/transport-security.js';

const IMDS_COMPRESSED = 'fd00:ec2::254';
/** The identical 128-bit address, written without zero compression. */
const IMDS_UNCOMPRESSED = 'fd00:ec2:0:0:0:0:0:254';

describe('IMDS IPv6 literal is blocked regardless of spelling', () => {
  it('classifies the canonical compressed form as blocked (control)', () => {
    expect(classifyTransportAddress(IMDS_COMPRESSED, 6)).toBe('blocked');
  });

  it('classifies the uncompressed form of the SAME address as blocked', () => {
    expect(classifyTransportAddress(IMDS_UNCOMPRESSED, 6)).toBe('blocked');
  });

  it('refuses to dial the uncompressed form even with allowPrivateNetworks', () => {
    // `blocked` must throw whatever the opt-in says; that is the whole point of
    // separating `blocked` from `private` in the classifier.
    expect(() => assertTransportAddressAllowed(IMDS_UNCOMPRESSED, 6, 'imds.example', true)).toThrow(
      /link-local\/IMDS/,
    );
  });
});
