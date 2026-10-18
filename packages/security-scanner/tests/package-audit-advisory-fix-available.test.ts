import { describe, expect, it } from 'vitest';
import { parsePackageAuditOutput } from '../src/package-audit.js';

describe('parsePackageAuditOutput advisory fixAvailable derivation', () => {
  it('derives fixAvailable from patched_versions or explicit fixAvailable in advisories format', () => {
    const parsed = parsePackageAuditOutput(
      JSON.stringify({
        advisories: {
          '101': {
            module_name: 'lodash',
            severity: 'high',
            vulnerable_versions: '<4.17.21',
            patched_versions: '>=4.17.21',
            title: 'Prototype Pollution',
          },
          '102': {
            module_name: 'legacy-unpatched',
            severity: 'critical',
            vulnerable_versions: '>=0.0.0',
            patched_versions: '<0.0.0',
            title: 'Unpatched RCE',
          },
          '103': {
            module_name: 'prerelease-zero',
            severity: 'moderate',
            vulnerable_versions: '*',
            patched_versions: '< 0.0.0-0',
            title: 'No patch available',
          },
        },
        metadata: {
          vulnerabilities: { critical: 1, high: 1, moderate: 1, low: 0, info: 0, total: 3 },
        },
      }),
    );

    expect(parsed).toBeDefined();
    expect(parsed?.vulnerabilities.find((v) => v.name === 'lodash')?.fixAvailable).toBe(true);
    expect(parsed?.vulnerabilities.find((v) => v.name === 'legacy-unpatched')?.fixAvailable).toBe(
      false,
    );
    expect(parsed?.vulnerabilities.find((v) => v.name === 'prerelease-zero')?.fixAvailable).toBe(
      false,
    );
  });
});
