import { describe, expect, it } from 'vitest';
import { decodeGovernanceServiceRequest, GOVERNANCE_SERVICE_PROTOCOL_VERSION } from '../src/index.js';

/**
 * The decoder sits on the untrusted side of the IPC boundary, so its resource
 * ceilings are security limits, not ergonomics: an array of exactly
 * MAX_ARRAY_ITEMS is legal, and anyting beyond must be rejected without
 * walking the entries.
 */
describe('protocol decode resource ceilings', () => {
  it('rejects an array one item above the item limit without walking it', () => {
    const decoded = decodeGovernanceServiceRequest({
      protocolVersion: GOVERNANCE_SERVICE_PROTOCOL_VERSION,
      requestId: 'request-boundary-array',
      type: 'issue_capability_grant',
      clientId: 'model-reader',
      capabilities: Array.from({ length: 10_001 }, () => 'not-a-capability'),
      ttlMs: 30_000,
    });

    expect(decoded.decoded).toBe(false);
    if (decoded.decoded) return;
    expect(decoded.issues).toEqual([
      expect.objectContaining({ code: 'resource_limit', path: '$.capabilities' }),
    ]);
  });
});
