import * as fs from 'node:fs';
import * as fsp from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const spawnMocks = vi.hoisted(() => ({ spawnStream: vi.fn() }));
vi.mock('../src/_spawn-stream.js', async (original) => {
  const actual = (await original()) as Record<string, unknown>;
  return { ...actual, spawnStream: spawnMocks.spawnStream };
});

import { parsePackageReports } from '../src/languages/diagnostics.js';
import { executePackagePlan } from '../src/languages/execute.js';
import { planLanguageOperation } from '../src/languages/plan.js';
import type { CommandPlan, DetectedWorkspace } from '../src/languages/types.js';

let root: string;

beforeEach(async () => {
  root = await fsp.mkdtemp(path.join(os.tmpdir(), 'wstack-language-package-'));
  spawnMocks.spawnStream.mockReset();
});

afterEach(async () => {
  vi.restoreAllMocks();
  await fsp.rm(root, { recursive: true, force: true });
});

async function collect(
  workspace: DetectedWorkspace,
  plan: CommandPlan,
  packages: readonly string[] = [],
  signal = new AbortController().signal,
) {
  const stream = executePackagePlan({ projectRoot: root, workspace, plan, packages, signal });
  const progress = [];
  for (;;) {
    const next = await stream.next();
    if (next.done) return { outcome: next.value, progress };
    progress.push(next.value);
  }
}

function fakeSpawn(stdout: string, exitCode = 0, stderr = '', error?: string) {
  return async function* () {
    yield { type: 'partial_output', text: stdout } as const;
    return { stdout, stderr, exitCode, truncated: false, ...(error ? { error } : {}) };
  };
}

describe('executePackagePlan', () => {
  it('records manifest and lockfile snapshots and diffs them after a successful install', async () => {
    await fsp.writeFile(path.join(root, 'package.json'), JSON.stringify({ name: 'demo' }));
    await fsp.writeFile(path.join(root, 'package-lock.json'), '{}');
    spawnMocks.spawnStream.mockImplementation(async function* () {
      // Simulate the package manager mutating the lockfile during execution.
      await fsp.writeFile(path.join(root, 'package-lock.json'), '{updated:true}');
      yield { type: 'partial_output', text: 'ok' } as const;
      return { stdout: 'ok', stderr: '', exitCode: 0, truncated: false };
    });
    const planned = await planLanguageOperation({
      projectRoot: root,
      language: 'javascript',
      operation: 'package-install',
    });
    if (planned.status !== 'planned') throw new Error(JSON.stringify(planned));
    const { outcome } = await collect(planned.workspace, planned.plan);
    expect(outcome.status).toBe('passed');
    expect({
      manifestsChanged: outcome.manifestsChanged,
      lockfilesChanged: outcome.lockfilesChanged,
      sizeAfter: fs.statSync(path.join(root, 'package-lock.json')).size,
    }).toMatchObject({
      manifestsChanged: [],
      lockfilesChanged: [path.join(root, 'package-lock.json')],
    });
    expect(outcome.mutations).toEqual([]);
  });

  it('refuses to spawn internal-syntax plans as package operations', async () => {
    await fsp.writeFile(path.join(root, 'package.json'), '{}');
    const planned = await planLanguageOperation({
      projectRoot: root,
      language: 'javascript',
      operation: 'package-install',
    });
    if (planned.status !== 'planned') throw new Error(JSON.stringify(planned));
    const tampered = { ...planned.plan, kind: 'internal' } as CommandPlan;
    const { outcome } = await collect(planned.workspace, tampered);
    expect(outcome.status).toBe('unavailable');
    expect(spawnMocks.spawnStream).not.toHaveBeenCalled();
  });

  it('classifies cancellation and missing executables distinctly', async () => {
    await fsp.writeFile(path.join(root, 'Cargo.toml'), '[package]');
    spawnMocks.spawnStream.mockImplementation(fakeSpawn('', 1, '', 'spawn cargo ENOENT'));
    const planned = await planLanguageOperation({
      projectRoot: root,
      language: 'rust',
      operation: 'package-install',
    });
    if (planned.status !== 'planned') throw new Error(JSON.stringify(planned));
    const { outcome } = await collect(planned.workspace, planned.plan);
    expect(outcome.status).toBe('unavailable');
  });
});

describe('parsePackageReports', () => {
  it('parses npm audit JSON into vulnerabilities and diagnostics', () => {
    const payload = {
      vulnerabilities: {
        'lodash@4.17.20': {
          name: 'lodash',
          severity: 'high',
          title: 'Prototype pollution',
          url: 'https://example.test/lodash',
          range: '<4.17.21',
          patched_versions: '>=4.17.21',
        },
      },
    };
    const result = parsePackageReports('npm-audit', JSON.stringify(payload), '');
    expect(result.vulnerabilities).toEqual([
      expect.objectContaining({
        package: 'lodash',
        severity: 'high',
        advisory: 'Prototype pollution',
        fixedIn: '>=4.17.21',
        url: 'https://example.test/lodash',
      }),
    ]);
    expect(result.diagnostics[0]).toMatchObject({ severity: 'error', source: 'npm-audit' });
  });

  it('parses npm outdated into structured updates', () => {
    const payload = {
      react: { current: '17.0.0', wanted: '17.0.2', latest: '18.2.0', type: 'dependencies' },
    };
    const result = parsePackageReports('npm-outdated', JSON.stringify(payload), '');
    expect(result.outdated).toEqual([
      expect.objectContaining({
        name: 'react',
        previous: '17.0.0',
        resolved: '18.2.0',
        kind: 'runtime',
      }),
    ]);
  });

  it('parses Cargo audit findings', () => {
    const payload = JSON.stringify({
      vulnerabilities: {
        found: [
          {
            id: 'RUSTSEC-2024-0001',
            package: 'time',
            title: 'Local stack exhaustion',
            severity: 'medium',
            patched_versions: ['0.3.36'],
            url: { short: 'https://rustsec.test/RUSTSEC-2024-0001' },
          },
        ],
      },
    });
    const result = parsePackageReports('cargo-audit', payload, '');
    expect(result.vulnerabilities).toEqual([
      expect.objectContaining({
        package: 'time',
        advisory: 'Local stack exhaustion',
        severity: 'moderate',
        fixedIn: '0.3.36',
      }),
    ]);
  });

  // Real `cargo audit --json` is rustsec's `Report`: `vulnerabilities.found` is a
  // BOOLEAN and the findings live in `vulnerabilities.list`. Reading `found` as
  // the array parsed every real report as clean.
  it('parses the real cargo-audit report shape (vulnerabilities.list)', () => {
    const payload = JSON.stringify({
      lockfile: { 'dependency-count': 120 },
      vulnerabilities: {
        found: true,
        count: 1,
        list: [
          {
            advisory: {
              id: 'RUSTSEC-2020-0071',
              package: 'time',
              title: 'Potential segfault in the time crate',
              url: 'https://github.com/time-rs/time/issues/293',
              cvss: 'CVSS:3.1/AV:L/AC:H/PR:N/UI:N/S:U/C:N/I:N/A:H',
            },
            versions: { patched: ['>=0.2.23'], unaffected: [] },
            affected: null,
            package: { name: 'time', version: '0.1.45' },
          },
        ],
      },
      warnings: {},
    });
    const result = parsePackageReports('cargo-audit', payload, '');
    expect(result.vulnerabilities).toEqual([
      expect.objectContaining({
        package: 'time',
        advisory: 'Potential segfault in the time crate',
        fixedIn: '>=0.2.23',
        url: 'https://github.com/time-rs/time/issues/293',
      }),
    ]);
    expect(result.diagnostics[0]?.code).toBe('RUSTSEC-2020-0071');
  });

  // The Ruby profile runs `bundle audit --format=json` with parser
  // 'bundler-audit', which used to have no case at all: every finding was
  // dropped. Shape from bundler-audit's Report/UnpatchedGem/Advisory#to_h.
  it('parses bundler-audit JSON reports', () => {
    const payload = JSON.stringify({
      version: '0.9.2',
      created_at: '2026-10-06 21:00:00 +0000',
      results: [
        {
          type: 'unpatched_gem',
          gem: { name: 'rack', version: '2.0.7' },
          advisory: {
            id: 'CVE-2019-16782',
            url: 'https://github.com/rack/rack/security/advisories/GHSA-hrqr-hxpp-chr3',
            title: 'Possible information leak / session hijack vulnerability',
            cvss_v3: 6.3,
            patched_versions: ['~> 1.6.12', '>= 2.0.8'],
            criticality: 'medium',
          },
        },
        { type: 'insecure_source', source: 'http://rubygems.org/' },
      ],
    });
    const result = parsePackageReports('bundler-audit', payload, '');
    expect(result.vulnerabilities).toEqual([
      expect.objectContaining({
        package: 'rack',
        advisory: 'Possible information leak / session hijack vulnerability',
        severity: 'moderate',
        fixedIn: '~> 1.6.12',
      }),
    ]);
    expect(result.diagnostics.map((d) => d.code)).toEqual(['CVE-2019-16782', 'insecure-source']);
  });

  it('parses Composer audit JSON lines', () => {
    const lines = [
      JSON.stringify({
        package: 'vendor/lib',
        advisory: 'CVE-2024-0001',
        title: 'Composer advisory',
        severity: 'medium',
        affectedVersions: '>=1.0.0,<1.2.0',
        url: 'https://composer.test/CVE-2024-0001',
      }),
    ].join('\n');
    const result = parsePackageReports('composer-audit', lines, '');
    expect(result.vulnerabilities).toEqual([
      expect.objectContaining({
        package: 'vendor/lib',
        advisory: 'Composer advisory',
        severity: 'moderate',
        fixedIn: '>=1.0.0,<1.2.0',
      }),
    ]);
  });

  it('parses dotnet list package JSON', () => {
    const payload = JSON.stringify({
      projects: [
        {
          packages: [
            {
              name: 'Newtonsoft.Json',
              requestedVersion: '>12.0.0',
              resolvedVersion: '13.0.3',
              vulnerabilities: [
                { advisoryUrl: 'https://github.test/advisories/1', severity: 'high' },
              ],
            },
            {
              name: 'Serilog',
              requestedVersion: '>3.0.0',
              resolvedVersion: '3.0.1',
              vulnerabilities: [],
            },
          ],
        },
      ],
    });
    const result = parsePackageReports('dotnet-package', payload, '');
    expect(result.vulnerabilities).toHaveLength(1);
    expect(result.outdated).toHaveLength(1);
    expect(result.diagnostics.some((item) => item.code === 'dotnet-vulnerable')).toBe(true);
  });
});
