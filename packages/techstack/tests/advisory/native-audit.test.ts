import { execFile } from 'node:child_process';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock execFile so we can feed JSON output to the parsers without requiring
// the actual audit tools to be installed on the machine.
vi.mock('node:child_process', () => ({
  execFile: vi.fn(),
}));

// Mock existsSync for pip-audit requirements file detection
vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return { ...actual, existsSync: vi.fn(() => false) };
});

const mockedExec = vi.mocked(execFile);

function mockResult(stdout: string, status = 0, stderr = ''): void {
  mockedExec.mockImplementationOnce(((
    _command: string,
    _args: string[],
    _options: unknown,
    callback: (error: Error | null, stdout: string, stderr: string) => void,
  ) => {
    const error = status === 0 ? null : Object.assign(new Error(stderr), { code: status });
    callback(error, stdout, stderr);
    return {};
  }) as never);
}

beforeEach(() => {
  mockedExec.mockReset();
});

// ── npm audit ─────────────────────────────────────────────────────────

describe('runNpmAudit', () => {
  it('parses npm audit JSON with vulnerabilities', async () => {
    const { runNpmAudit } = await import('../../src/advisory/native-audit.js');
    mockResult(
      JSON.stringify({
        vulnerabilities: {
          lodash: {
            severity: 'high',
            via: [{ title: 'Prototype Pollution', cve: 'CVE-2019-1', url: 'https://x' }],
            fixAvailable: '4.17.21',
          },
        },
        metadata: { vulnerabilities: 1, totalDependencies: 100 },
      }),
    );
    const result = await runNpmAudit('/fake');
    expect(result.advisories).toHaveLength(1);
    expect(result.advisories[0]!.packageName).toBe('lodash');
    expect(result.advisories[0]!.severity).toBe('high');
    expect(result.advisories[0]!.summary).toBe('Prototype Pollution');
    expect(result.advisories[0]!.fixVersion).toBe('4.17.21');
    expect(result.advisories[0]!.id).toBe('CVE-2019-1');
    expect(result.advisories[0]!.aliases).toContain('CVE-2019-1');
    expect(result.evidence.kind).toBe('audit');
  });

  it('handles npm audit low and info/default severities', async () => {
    const { runNpmAudit } = await import('../../src/advisory/native-audit.js');
    mockResult(
      JSON.stringify({
        vulnerabilities: {
          pkgCrit: {
            severity: 'critical',
            via: [{ title: 'Crit vuln', cve: 'CVE-0' }],
          },
          pkgA: {
            severity: 'low',
            via: [{ title: 'Low vuln', cve: 'CVE-1' }],
          },
          pkgB: {
            severity: 'something_else',
            via: [{ title: 'Info vuln', cve: 'CVE-2' }],
          },
        },
      }),
    );
    const result = await runNpmAudit('/fake');
    expect(result.advisories[0]!.severity).toBe('critical');
    expect(result.advisories[1]!.severity).toBe('low');
    expect(result.advisories[2]!.severity).toBe('info');
  });

  it('skips string-only via entries', async () => {
    const { runNpmAudit } = await import('../../src/advisory/native-audit.js');
    mockResult(
      JSON.stringify({
        vulnerabilities: {
          pkg: { severity: 'low', via: ['some-other-pkg'] },
        },
      }),
    );
    const result = await runNpmAudit('/fake');
    expect(result.advisories).toHaveLength(0);
  });

  it('skips via objects without identifying data (bare numeric source)', async () => {
    const { runNpmAudit } = await import('../../src/advisory/native-audit.js');
    mockResult(
      JSON.stringify({
        vulnerabilities: {
          pkg: { severity: 'low', via: [{ source: 42 }] },
        },
      }),
    );
    const result = await runNpmAudit('/fake');
    expect(result.advisories).toHaveLength(0);
  });

  // Regression (round r27): the captured live `npm audit --json` payload shows
  // every real advisory via object carries a NUMERIC `source` plus
  // name/title/url (the GHSA id lives inside the url), an object
  // `fixAvailable`, and no cve/ghsa fields. The old parser skipped all of
  // them — zero advisories from a fully vulnerable tree.
  it('emits advisories from the real npm audit via shape (numeric source, GHSA in url)', async () => {
    const { runNpmAudit } = await import('../../src/advisory/native-audit.js');
    mockResult(
      JSON.stringify({
        vulnerabilities: {
          lodash: {
            severity: 'high',
            via: [
              {
                source: 1106913,
                name: 'lodash',
                title: 'Command Injection in lodash',
                url: 'https://github.com/advisories/GHSA-35jh-r3h4-6jhm',
                severity: 'high',
                range: '<4.17.21',
                cwe: ['CWE-77', 'CWE-94'],
              },
            ],
            fixAvailable: { name: 'lodash', version: '4.18.1', isSemVerMajor: false },
          },
        },
      }),
    );
    const result = await runNpmAudit('/fake');
    expect(result.advisories).toHaveLength(1);
    expect(result.advisories[0]!.id).toBe('GHSA-35jh-r3h4-6jhm');
    expect(result.advisories[0]!.packageName).toBe('lodash');
    expect(result.advisories[0]!.severity).toBe('high');
    expect(result.advisories[0]!.summary).toBe('Command Injection in lodash');
    expect(result.advisories[0]!.fixVersion).toBe('4.18.1');
    expect(result.advisories[0]!.url).toBe('https://github.com/advisories/GHSA-35jh-r3h4-6jhm');
  });

  it('handles no vulnerabilities (status 0)', async () => {
    const { runNpmAudit } = await import('../../src/advisory/native-audit.js');
    mockResult(JSON.stringify({ vulnerabilities: {} }));
    const result = await runNpmAudit('/fake');
    expect(result.advisories).toHaveLength(0);
  });

  it('handles error exit codes', async () => {
    const { runNpmAudit } = await import('../../src/advisory/native-audit.js');
    mockResult('', 2, 'error');
    const result = await runNpmAudit('/fake');
    expect(result.advisories).toHaveLength(0);
    expect(result.evidence.detail).toContain('code 2');
  });

  it('handles malformed JSON', async () => {
    const { runNpmAudit } = await import('../../src/advisory/native-audit.js');
    mockResult('not json', 0);
    const result = await runNpmAudit('/fake');
    expect(result.advisories).toHaveLength(0);
    expect(result.evidence.detail).toContain('Failed to parse');
  });
});

// ── pip-audit ─────────────────────────────────────────────────────────

describe('runPipAudit', () => {
  it('parses the real pip-audit JSON report (exit 1 when vulnerable)', async () => {
    const { runPipAudit } = await import('../../src/advisory/native-audit.js');
    // Shape of pip_audit/_format/json.py: findings nest per dependency, carry
    // no severity, and pip-audit exits 1 when it found any.
    mockResult(
      JSON.stringify({
        dependencies: [
          {
            name: 'requests',
            version: '2.25.0',
            vulns: [
              {
                id: 'PYSEC-2023-74',
                fix_versions: ['2.31.0'],
                aliases: ['CVE-2023-32681'],
                description: 'Proxy-Authorization leak',
              },
            ],
          },
          { name: 'six', version: '1.16.0', vulns: [] },
          { name: 'mylocal', skip_reason: 'Dependency not found on PyPI' },
        ],
        fixes: [],
      }),
      1,
      'Found 1 known vulnerability in 1 package',
    );
    const result = await runPipAudit('/fake');
    expect(result.advisories).toHaveLength(1);
    expect(result.advisories[0]).toMatchObject({
      id: 'PYSEC-2023-74',
      packageName: 'requests',
      severity: 'info',
      summary: 'Proxy-Authorization leak',
      fixVersion: '2.31.0',
      aliases: ['CVE-2023-32681'],
    });
  });

  it('invokes pip-audit without a bogus `audit` positional', async () => {
    const { runPipAudit } = await import('../../src/advisory/native-audit.js');
    mockResult(JSON.stringify({ dependencies: [], fixes: [] }));
    await runPipAudit('/fake');
    // pip-audit has no subcommands: `audit` would be its project_path.
    expect(mockedExec.mock.calls[0]![1]).toEqual(['--format', 'json']);
  });

  it('handles pip-audit error exit', async () => {
    const { runPipAudit } = await import('../../src/advisory/native-audit.js');
    mockResult('', 1, 'pip-audit failed');
    const result = await runPipAudit('/fake');
    expect(result.advisories).toHaveLength(0);
    expect(result.evidence.detail).toContain('code 1');
  });
});

// ── cargo audit ───────────────────────────────────────────────────────

describe('runCargoAudit', () => {
  it('parses cargo-audit JSON output', async () => {
    const { runCargoAudit } = await import('../../src/advisory/native-audit.js');
    mockResult(
      JSON.stringify({
        vulnerabilities: {
          list: [
            {
              advisory: {
                id: 'RUSTSEC-1',
                title: 'Use after free',
                cvss: 'CRITICAL/...',
                patched_versions: '>=1.2.0',
              },
              package: { name: 'openssl' },
            },
          ],
        },
      }),
    );
    const result = await runCargoAudit('/fake');
    expect(result.advisories).toHaveLength(1);
    expect(result.advisories[0]!.packageName).toBe('openssl');
    expect(result.advisories[0]!.severity).toBe('critical');
    expect(result.advisories[0]!.fixVersion).toBe('>=1.2.0');
  });

  // Real cargo-audit (rustsec Report): `advisory.cvss` is a CVSS VECTOR and the
  // patched ranges sit in `versions.patched`. Taking the vector's first `/`
  // segment ("CVSS:3.1") downgraded every advisory to `info`.
  it('scores the real cargo-audit CVSS vector and reads versions.patched', async () => {
    const { runCargoAudit } = await import('../../src/advisory/native-audit.js');
    mockResult(
      JSON.stringify({
        vulnerabilities: {
          found: true,
          count: 1,
          list: [
            {
              advisory: {
                id: 'RUSTSEC-2023-0001',
                package: 'tokio',
                title: 'reject_remote_clients configuration corruption',
                cvss: 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H',
              },
              versions: { patched: ['>=1.18.4, <1.19.0', '>=1.23.1'], unaffected: [] },
              affected: null,
              package: { name: 'tokio', version: '1.18.0' },
            },
          ],
        },
      }),
      1,
    );
    const result = await runCargoAudit('/fake');
    expect(result.advisories[0]).toMatchObject({
      id: 'RUSTSEC-2023-0001',
      packageName: 'tokio',
      severity: 'critical',
      fixVersion: '>=1.18.4, <1.19.0',
    });
  });

  it('handles cargo audit error exit', async () => {
    const { runCargoAudit } = await import('../../src/advisory/native-audit.js');
    mockResult('', 1, 'error');
    const result = await runCargoAudit('/fake');
    expect(result.advisories).toHaveLength(0);
    expect(result.evidence.detail).toContain('code 1');
  });

  it('handles cargo audit invalid JSON output', async () => {
    const { runCargoAudit } = await import('../../src/advisory/native-audit.js');
    mockResult('invalid-json', 0);
    const result = await runCargoAudit('/fake');
    expect(result.advisories).toHaveLength(0);
    expect(result.evidence.detail).toContain('Failed to parse cargo audit JSON output');
  });

  it('parses cargo audit severities (high, medium, low, info)', async () => {
    const { runCargoAudit } = await import('../../src/advisory/native-audit.js');
    mockResult(
      JSON.stringify({
        vulnerabilities: {
          list: [
            { advisory: { id: 'A1', cvss: 'HIGH' }, package: { name: 'p1' } },
            { advisory: { id: 'A2', cvss: 'MEDIUM' }, package: { name: 'p2' } },
            { advisory: { id: 'A3', cvss: 'LOW' }, package: { name: 'p3' } },
            { advisory: { id: 'A4', cvss: 'OTHER' }, package: { name: 'p4' } },
          ],
        },
      }),
    );
    const result = await runCargoAudit('/fake');
    expect(result.advisories[0]!.severity).toBe('high');
    expect(result.advisories[1]!.severity).toBe('medium');
    expect(result.advisories[2]!.severity).toBe('low');
    expect(result.advisories[3]!.severity).toBe('info');
  });
});

// ── govulncheck ───────────────────────────────────────────────────────

describe('runGoVulncheck', () => {
  it('parses govulncheck JSON output', async () => {
    const { runGoVulncheck } = await import('../../src/advisory/native-audit.js');
    // `govulncheck -json ./...` streams one object per message (real shape).
    mockResult(
      [
        { config: { scanner_name: 'govulncheck' } },
        {
          osv: {
            id: 'GO-2024-1',
            summary: 'SSH server vulnerability',
            aliases: ['CVE-2024-1'],
          },
        },
        // module-level only (no function in the trace): informational
        {
          finding: {
            osv: 'GO-2024-1',
            fixed_version: 'v0.20.0',
            trace: [{ module: 'golang.org/x/crypto', version: 'v0.1.0' }],
          },
        },
        {
          finding: {
            osv: 'GO-2024-1',
            fixed_version: 'v0.20.0',
            trace: [
              {
                module: 'golang.org/x/crypto',
                package: 'golang.org/x/crypto/ssh',
                function: 'NewServerConn',
              },
            ],
          },
        },
      ]
        .map((message) => JSON.stringify(message, null, 2))
        .join('\n'),
    );
    const result = await runGoVulncheck('/fake');
    expect(result.advisories).toHaveLength(1);
    expect(result.advisories[0]!.id).toBe('GO-2024-1');
    expect(result.advisories[0]!.aliases).toEqual(['CVE-2024-1']);
    expect(result.advisories[0]!.packageName).toBe('golang.org/x/crypto');
    expect(result.advisories[0]!.severity).toBe('high');
    expect(result.advisories[0]!.fixVersion).toBe('v0.20.0');
  });

  // govulncheck exits 1 on an error, never for "no vulnerabilities".
  it('reports status 1 as a failed scan, not a clean one', async () => {
    const { runGoVulncheck } = await import('../../src/advisory/native-audit.js');
    mockResult('', 1, 'govulncheck: loading packages: boom');
    const result = await runGoVulncheck('/fake');
    expect(result.advisories).toHaveLength(0);
    expect(result.evidence.detail).not.toContain('no vulnerabilities');
    expect(result.evidence.detail).toContain('exited with code 1');
  });
});

// ── composer audit ────────────────────────────────────────────────────

describe('runComposerAudit', () => {
  it('parses composer audit JSON output', async () => {
    const { runComposerAudit } = await import('../../src/advisory/native-audit.js');
    mockResult(
      JSON.stringify({
        advisories: {
          'vendor/pkg': [
            {
              cve: 'CVE-2024-2',
              severity: 'high',
              title: 'SQL Injection',
              link: 'https://example.com/advisory/ABC-123',
            },
          ],
        },
      }),
    );
    const result = await runComposerAudit('/fake');
    expect(result.advisories).toHaveLength(1);
    expect(result.advisories[0]!.packageName).toBe('vendor/pkg');
    expect(result.advisories[0]!.severity).toBe('high');
    // composer's report has no fixed version; `link` is the advisory URL, and
    // its last segment (`ABC-123`) used to be passed off as one.
    expect(result.advisories[0]!.fixVersion).toBeUndefined();
  });

  it('handles composer audit error exit', async () => {
    const { runComposerAudit } = await import('../../src/advisory/native-audit.js');
    mockResult('', 1, 'error');
    const result = await runComposerAudit('/fake');
    expect(result.advisories).toHaveLength(0);
  });
});

// ── dotnet package audit ──────────────────────────────────────────────

describe('runDotnetAudit', () => {
  it('parses flat vulnerabilities shape', async () => {
    const { runDotnetAudit } = await import('../../src/advisory/native-audit.js');
    mockResult(
      JSON.stringify({
        vulnerabilities: [
          {
            advisoryId: 'ADV-1',
            packageName: 'Newtonsoft.Json',
            severity: 'high',
            description: 'DoS vulnerability',
            fixedVersion: '13.0.4',
          },
        ],
      }),
    );
    const result = await runDotnetAudit('/fake');
    expect(result.advisories).toHaveLength(1);
    expect(result.advisories[0]!.packageName).toBe('Newtonsoft.Json');
    expect(result.advisories[0]!.severity).toBe('high');
    expect(result.advisories[0]!.fixVersion).toBe('13.0.4');
  });

  it('parses nested packages shape', async () => {
    const { runDotnetAudit } = await import('../../src/advisory/native-audit.js');
    mockResult(
      JSON.stringify({
        packages: {
          Serilog: [{ advisoryId: 'ADV-2', severity: 'medium', title: 'Info leak' }],
        },
      }),
    );
    const result = await runDotnetAudit('/fake');
    expect(result.advisories).toHaveLength(1);
    expect(result.advisories[0]!.packageName).toBe('Serilog');
    expect(result.advisories[0]!.severity).toBe('medium');
  });

  it('handles dotnet audit error exit', async () => {
    const { runDotnetAudit } = await import('../../src/advisory/native-audit.js');
    mockResult('', 1, 'error');
    const result = await runDotnetAudit('/fake');
    expect(result.advisories).toHaveLength(0);
  });
});

// ── runNativeAudit dispatch ───────────────────────────────────────────

describe('runNativeAudit dispatch', () => {
  it('dispatches to the correct tool for each ecosystem', async () => {
    const { runNativeAudit } = await import('../../src/advisory/native-audit.js');
    mockResult(JSON.stringify({ vulnerabilities: {} }));
    await runNativeAudit('npm', '/fake');
    expect(mockedExec).toHaveBeenCalledWith(
      'npm',
      ['audit', '--json'],
      expect.anything(),
      expect.any(Function),
    );

    mockedExec.mockClear();
    mockResult(JSON.stringify({ dependencies: [], fixes: [] }));
    await runNativeAudit('python', '/fake');
    expect(mockedExec).toHaveBeenCalledWith(
      'pip-audit',
      expect.arrayContaining(['--format', 'json']),
      expect.anything(),
      expect.any(Function),
    );

    mockedExec.mockClear();
    mockResult(JSON.stringify({ vulnerabilities: { list: [] } }));
    await runNativeAudit('rust', '/fake');
    expect(mockedExec).toHaveBeenCalledWith(
      'cargo',
      expect.arrayContaining(['audit']),
      expect.anything(),
      expect.any(Function),
    );

    mockedExec.mockClear();
    mockResult(JSON.stringify({ vulns: [] }));
    await runNativeAudit('go', '/fake');
    expect(mockedExec).toHaveBeenCalledWith(
      'govulncheck',
      expect.anything(),
      expect.anything(),
      expect.any(Function),
    );

    mockedExec.mockClear();
    mockResult(JSON.stringify({ advisories: {} }));
    await runNativeAudit('php', '/fake');
    expect(mockedExec).toHaveBeenCalledWith(
      'composer',
      expect.anything(),
      expect.anything(),
      expect.any(Function),
    );

    mockedExec.mockClear();
    mockResult(JSON.stringify({ vulnerabilities: [] }));
    await runNativeAudit('dotnet', '/fake');
    expect(mockedExec).toHaveBeenCalledWith(
      'dotnet',
      expect.anything(),
      expect.anything(),
      expect.any(Function),
    );
  });

  it('returns an empty result for unsupported ecosystems', async () => {
    const { runNativeAudit } = await import('../../src/advisory/native-audit.js');
    const result = await runNativeAudit('dart' as never, '/fake');
    expect(result.advisories).toEqual([]);
    expect(result.evidence.detail).toContain('No native audit tool');
  });
});

// ── isNativeAuditAvailable ────────────────────────────────────────────

describe('isNativeAuditAvailable', () => {
  it('returns true when the tool exits 0', async () => {
    const { isNativeAuditAvailable } = await import('../../src/advisory/native-audit.js');
    mockResult('1.0.0', 0);
    await expect(isNativeAuditAvailable('npm')).resolves.toBe(true);
  });

  it('returns false when the tool is not installed', async () => {
    const { isNativeAuditAvailable } = await import('../../src/advisory/native-audit.js');
    mockResult('', 127);
    await expect(isNativeAuditAvailable('python')).resolves.toBe(false);
  });
});
