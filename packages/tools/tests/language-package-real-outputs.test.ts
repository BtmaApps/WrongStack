import * as fs from 'node:fs';
import * as fsp from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { subjectForToolInput } from '@wrongstack/core/utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const spawnMocks = vi.hoisted(() => ({ spawnStream: vi.fn() }));
vi.mock('../src/_spawn-stream.js', async (original) => {
  const actual = (await original()) as Record<string, unknown>;
  return { ...actual, spawnStream: spawnMocks.spawnStream };
});

import { parsePackageReports } from '../src/languages/diagnostics.js';
import { executePackagePlan } from '../src/languages/execute.js';
import { languagePackageTool } from '../src/languages/package-tool.js';
import { planLanguageOperation } from '../src/languages/plan.js';
import type { LanguageOperation, LanguageOperationOptions } from '../src/languages/types.js';

// Every fixture below is UNEDITED stdout captured from the real tool (versions
// in the file name). They pin the output shapes the parsers must keep reading:
// the `npm-audit`/`npm-outdated` parsers are shared by npm, pnpm, yarn and bun.
const fixture = (name: string) =>
  fs.readFileSync(path.join(import.meta.dirname, 'fixtures', 'package-reports', name), 'utf8');

let root: string;

beforeEach(async () => {
  root = await fsp.mkdtemp(path.join(os.tmpdir(), 'wstack-pkg-real-'));
  spawnMocks.spawnStream.mockReset();
});

afterEach(async () => {
  vi.restoreAllMocks();
  await fsp.rm(root, { recursive: true, force: true });
});

const byPackage = (items: readonly { package: string }[]) =>
  items.reduce<Record<string, number>>((acc, item) => {
    acc[item.package] = (acc[item.package] ?? 0) + 1;
    return acc;
  }, {});

describe('audit reports (real output)', () => {
  it('bun 1.4.2: package → advisory-array map (no vulnerabilities/advisories key)', () => {
    const { vulnerabilities } = parsePackageReports(
      'npm-audit',
      fixture('bun-1.4.2-audit.json.txt'),
      '',
    );
    expect(byPackage(vulnerabilities)).toEqual({ lodash: 6, minimist: 2 });
    expect(vulnerabilities).toContainEqual(
      expect.objectContaining({
        package: 'lodash',
        advisory: 'Command Injection in lodash',
        severity: 'high',
        url: 'https://github.com/advisories/GHSA-35jh-r3h4-6jhm',
      }),
    );
  });

  it('bun: an empty report `{}` has no findings', () => {
    expect(parsePackageReports('npm-audit', '{}\n', '').vulnerabilities).toEqual([]);
  });

  it('yarn 1.22.22: NDJSON, one auditAdvisory line per path, deduped by advisory id', () => {
    const text = fixture('yarn-1.22.22-audit.ndjson.txt');
    // minimist reached directly AND via optimist: 4 advisory lines, 2 advisories.
    expect(text.split('\n').filter((line) => line.includes('"auditAdvisory"'))).toHaveLength(4);
    const { vulnerabilities } = parsePackageReports('npm-audit', text, '');
    expect(vulnerabilities.map((v) => `${v.package}:${v.severity}`).sort()).toEqual([
      'minimist:critical',
      'minimist:moderate',
    ]);
  });

  it('yarn 4.5.3 `npm audit --json`: one advisory is ONE valid JSON document', () => {
    const { vulnerabilities } = parsePackageReports(
      'npm-audit',
      fixture('yarn-4.5.3-npm-audit-single.ndjson.txt'),
      '',
    );
    expect(vulnerabilities).toEqual([
      expect.objectContaining({
        package: '@babel/traverse',
        severity: 'critical',
        url: 'https://github.com/advisories/GHSA-67hx-6x53-jw92',
        advisory: expect.stringContaining('Babel vulnerable to arbitrary code execution'),
      }),
    ]);
  });

  it('yarn 4.5.3 `npm audit --json`: several advisories are NDJSON {value, children}', () => {
    const { vulnerabilities } = parsePackageReports(
      'npm-audit',
      fixture('yarn-4.5.3-npm-audit-multi.ndjson.txt'),
      '',
    );
    expect(vulnerabilities.map((v) => `${v.package}:${v.severity}`).sort()).toEqual([
      '@babel/traverse:critical',
      'minimist:critical',
      'minimist:moderate',
    ]);
  });
});

describe('outdated reports (real output)', () => {
  it('bun 1.4.2 ignores --json and prints a table; rows and (dev) labels are read', () => {
    const { outdated } = parsePackageReports('npm-outdated', fixture('bun-1.4.2-outdated.txt'), '');
    expect(outdated).toEqual([
      { name: 'minimist', previous: '0.0.8', resolved: '1.2.8', kind: 'runtime' },
      { name: 'is-number', previous: '6.0.0', resolved: '7.0.0', kind: 'development' },
    ]);
  });

  it('bun 1.4.2 table: (optional) label', () => {
    const { outdated } = parsePackageReports(
      'npm-outdated',
      fixture('bun-1.4.2-outdated-optional.txt'),
      '',
    );
    expect(outdated).toEqual([
      { name: 'minimist', previous: '0.0.8', resolved: '1.2.8', kind: 'optional' },
    ]);
  });

  it('pnpm 12.3.4 names the manifest section `dependencyType`', () => {
    const { outdated } = parsePackageReports(
      'npm-outdated',
      fixture('pnpm-12.3.4-outdated.json.txt'),
      '',
    );
    expect(Object.fromEntries(outdated.map((entry) => [entry.name, entry.kind]))).toEqual({
      'is-number': 'development',
      minimist: 'runtime',
    });
  });
});

describe('report commands exit non-zero when they have findings', () => {
  async function runAudit(manifest: Record<string, unknown>, lockfile: string) {
    await fsp.writeFile(path.join(root, 'package.json'), JSON.stringify(manifest));
    await fsp.writeFile(path.join(root, lockfile), '');
    const planned = await planLanguageOperation({
      projectRoot: root,
      language: 'javascript',
      operation: 'package-audit',
    });
    if (planned.status !== 'planned') throw new Error(JSON.stringify(planned));
    const stream = executePackagePlan({
      projectRoot: root,
      workspace: planned.workspace,
      plan: planned.plan,
      packages: [],
      signal: new AbortController().signal,
    });
    for (;;) {
      const next = await stream.next();
      if (next.done) return next.value;
    }
  }

  it('keeps bun audit findings from an exit-1 run (real bun exits 1 with findings)', async () => {
    const stdout = fixture('bun-1.4.2-audit.json.txt');
    spawnMocks.spawnStream.mockImplementation(async function* () {
      yield { type: 'partial_output', text: stdout } as const;
      return { stdout, stderr: '', exitCode: 1, truncated: false };
    });
    const outcome = await runAudit({ name: 'x' }, 'bun.lock');
    expect(outcome.status).toBe('passed');
    expect(outcome.vulnerabilities).toHaveLength(8);
  });

  it('keeps yarn 1 findings from its bitmask exit code (real yarn exits 20 here)', async () => {
    const stdout = fixture('yarn-1.22.22-audit.ndjson.txt');
    spawnMocks.spawnStream.mockImplementation(async function* () {
      yield { type: 'partial_output', text: stdout } as const;
      return { stdout, stderr: '', exitCode: 20, truncated: false };
    });
    const outcome = await runAudit({ name: 'x', packageManager: 'yarn@1.22.22' }, 'yarn.lock');
    expect(outcome.status).toBe('passed');
    expect(outcome.vulnerabilities).toHaveLength(2);
  });

  it('still fails a non-zero run that produced no report', async () => {
    spawnMocks.spawnStream.mockImplementation(async function* () {
      yield { type: 'partial_output', text: '' } as const;
      return {
        stdout:
          '{"error":{"code":"ENOLOCK","summary":"This command requires an existing lockfile."}}',
        stderr: '',
        exitCode: 1,
        truncated: false,
      };
    });
    const outcome = await runAudit({ name: 'x' }, 'package-lock.json');
    expect(outcome.status).toBe('failed');
    expect(outcome.vulnerabilities).toEqual([]);
  });
});

async function planArgs(
  files: Record<string, string>,
  operation: LanguageOperation,
  operationOptions?: LanguageOperationOptions,
  language: 'javascript' | 'php' = 'javascript',
) {
  for (const [name, content] of Object.entries(files)) {
    await fsp.writeFile(path.join(root, name), content);
  }
  const planned = await planLanguageOperation({
    projectRoot: root,
    language,
    operation,
    ...(operationOptions ? { operationOptions } : {}),
  });
  if (planned.status !== 'planned') throw new Error(JSON.stringify(planned));
  return planned.plan;
}

// Real yarn 4.5.3 rejects `--ignore-scripts` ("Unsupported option name") and
// has no `audit` command ("Couldn't find a script named "audit"").
describe('yarn 2+ plans', () => {
  const berry = { 'package.json': '{"packageManager":"yarn@4.5.3"}', 'yarn.lock': '' };

  it('restores with --mode=skip-build', async () => {
    expect((await planArgs(berry, 'package-install')).args).toEqual([
      'install',
      '--mode=skip-build',
    ]);
  });

  it('adds and removes with --mode=skip-build', async () => {
    expect((await planArgs(berry, 'package-add', { packages: ['is-odd'] })).args).toEqual([
      'add',
      '--mode=skip-build',
      'is-odd',
    ]);
    expect((await planArgs(berry, 'package-remove', { packages: ['is-odd'] })).args).toEqual([
      'remove',
      '--mode=skip-build',
      'is-odd',
    ]);
  });

  it('audits with `yarn npm audit --json`', async () => {
    expect((await planArgs(berry, 'package-audit')).args).toEqual(['npm', 'audit', '--json']);
  });

  it('recognises Berry from .yarnrc.yml alone', async () => {
    const plan = await planArgs(
      { 'package.json': '{}', 'yarn.lock': '', '.yarnrc.yml': 'nodeLinker: node-modules\n' },
      'package-install',
    );
    expect(plan.args).toEqual(['install', '--mode=skip-build']);
  });

  it('leaves a declared yarn@1 project on the classic flags', async () => {
    const classic = { 'package.json': '{"packageManager":"yarn@1.22.22"}', 'yarn.lock': '' };
    expect((await planArgs(classic, 'package-install')).args).toEqual([
      'install',
      '--ignore-scripts',
    ]);
    expect((await planArgs(classic, 'package-audit')).args).toEqual(['audit', '--json']);
  });
});

describe('allowScripts', () => {
  const npm = { 'package.json': '{"name":"x"}', 'package-lock.json': '{}' };

  it('keeps lifecycle scripts off by default and says so', async () => {
    const plan = await planArgs(npm, 'package-install');
    expect(plan.args).toEqual(['install', '--ignore-scripts']);
    expect(plan.executesProjectCode).toBe(false);
    expect(plan.reason).toMatch(/lifecycle scripts disabled/);
  });

  it('drops the opt-out and marks the plan as executing package code when opted in', async () => {
    const plan = await planArgs(npm, 'package-add', { packages: ['esbuild'], allowScripts: true });
    expect(plan.args).toEqual(['install', 'esbuild']);
    expect(plan.executesProjectCode).toBe(true);
    expect(plan.reason).toMatch(/lifecycle scripts ENABLED/);
  });

  it('drops the Yarn 2+ opt-out too', async () => {
    const plan = await planArgs(
      { 'package.json': '{"packageManager":"yarn@4.5.3"}', 'yarn.lock': '' },
      'package-install',
      { allowScripts: true },
    );
    expect(plan.args).toEqual(['install']);
  });

  it('drops Composer --no-scripts only when opted in', async () => {
    const composer = { 'composer.json': '{"require":{}}' };
    expect((await planArgs(composer, 'package-install', undefined, 'php')).args).toEqual([
      'install',
      '--no-interaction',
      '--no-scripts',
    ]);
    expect(
      (await planArgs(composer, 'package-install', { allowScripts: true }, 'php')).args,
    ).toEqual(['install', '--no-interaction']);
  });

  it('gives an opted-in call its own permission subject', () => {
    const subject = (input: Record<string, unknown>) =>
      subjectForToolInput(
        languagePackageTool.name,
        input,
        languagePackageTool.subjectKey,
        languagePackageTool.subjectFields,
      );
    expect(subject({ operation: 'install' })).toBe('install');
    expect(subject({ operation: 'install', allowScripts: false })).toBe('install');
    expect(subject({ operation: 'install', allowScripts: true })).toBe('install allowScripts=true');
  });
});
