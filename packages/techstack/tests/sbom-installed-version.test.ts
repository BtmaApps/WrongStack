import { describe, expect, it } from 'vitest';
import { toCycloneDX, toSpdx } from '../src/sbom.js';
import { generateReport } from '../src/service/report-generator.js';
import type { DependencyObservation, Snapshot } from '../src/types.js';

function snapshot(versions: Partial<DependencyObservation>): Snapshot {
  return {
    id: 'snap',
    projectId: 'proj',
    targetRoot: '.',
    fingerprint: 'fixed',
    createdAt: '2026-10-07T00:00:00.000Z',
    adapterVersion: '1.0.35',
    coverage: 'full',
    workspaces: [],
    findings: [],
    dependencies: [
      {
        id: 'dep',
        workspaceId: 'ws',
        ecosystem: 'npm',
        name: 'example',
        sourceType: 'registry',
        direct: true,
        scope: 'runtime',
        status: 'current',
        evidence: [],
        ...versions,
      },
    ],
  };
}

describe('SBOM observed version contract', () => {
  it.each(['spdx', 'cyclonedx'] as const)(
    'uses the installed version instead of the manifest constraint in the %s report',
    (format) => {
      const input = snapshot({ installed: '2.4.1', requested: '^2.0.0' });
      const expected =
        format === 'spdx'
          ? { packages: [{ versionInfo: '2.4.1' }] }
          : { components: [{ version: '2.4.1' }] };
      expect(JSON.parse(generateReport(input, format))).toMatchObject(expected);
    },
  );

  it('exports an installed-only observation without losing its version', () => {
    const input = snapshot({ installed: '2.4.1' });
    expect(toSpdx(input).packages[0]?.versionInfo).toBe('2.4.1');
    expect(toCycloneDX(input).components[0]?.version).toBe('2.4.1');
  });

  it('retains lockfile priority when both exact versions are known', () => {
    const input = snapshot({ locked: '2.5.0', installed: '2.4.1', requested: '^2.0.0' });
    expect(toSpdx(input).packages[0]?.versionInfo).toBe('2.5.0');
    expect(toCycloneDX(input).components[0]?.version).toBe('2.5.0');
  });

  it.each(['^2.0.0', undefined])('preserves the requested fallback %s', (requested) => {
    const input = snapshot({ requested });
    expect(toSpdx(input).packages[0]?.versionInfo).toBe(requested);
    expect(toCycloneDX(input).components[0]?.version).toBe(requested);
  });
});
