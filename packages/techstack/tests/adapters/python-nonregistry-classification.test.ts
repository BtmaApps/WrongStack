import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { PythonAdapter } from '../../src/adapters/python.js';
import type { DependencyObservation, Workspace } from '../../src/types.js';

/**
 * A PEP 508 direct reference (`name @ <target>`) is NOT a registry package.
 *
 * `PythonAdapter` classified "is this PyPI?" from two duplicated predicates
 * that disagreed: the requirements.txt collector tested `NON_REGISTRY_REQUIREMENT`
 * against the raw line, while the classifier knew only `file:` / `git+` / `-e`.
 * `parsePep508` then DISCARDED the reference target, so the classifier read
 * `constraint: undefined` as "no constraint" and emitted
 * `sourceType: 'registry'` with a `pkg:pypi/…` purl — an identity PyPI never
 * resolves and an OSV query that can never match, for a VCS checkout.
 *
 * Both the collector and the classifier now derive from one
 * `isNonRegistryRequirement` predicate.
 */

const temps: string[] = [];

afterEach(async () => {
  for (const dir of temps.splice(0)) {
    await fs.rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  }
});

async function inventory(files: Record<string, string>): Promise<readonly DependencyObservation[]> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'py-nonregistry-'));
  temps.push(dir);
  for (const [name, content] of Object.entries(files)) {
    await fs.writeFile(path.join(dir, name), content, 'utf8');
  }
  const workspace: Workspace = {
    id: 'ws-test',
    relativeRoot: dir,
    ecosystem: 'python',
    manifests: Object.keys(files),
    lockfiles: [],
    confidence: 0.9,
    coverage: 'full',
  };
  return new PythonAdapter().inventory(workspace, {});
}

const pyproject = (deps: readonly string[]): string =>
  [
    '[project]',
    'name = "demo"',
    'version = "0.1.0"',
    'dependencies = [',
    ...deps.map((d) => `  "${d}",`),
    ']',
    '',
  ].join('\n');

const find = (rows: readonly DependencyObservation[], name: string) =>
  rows.find((r) => r.name === name);

describe('python non-registry classification', () => {
  // The regression: a VCS direct reference must not be inventoried as PyPI.
  it.each([
    ['git+https://github.com/psf/requests.git'],
    ['hg+https://hg.example/requests'],
    ['svn+https://svn.example/requests'],
    ['https://example.invalid/requests-2.32.3.tar.gz'],
  ])('classifies a %s direct reference as non-registry', async (target) => {
    const rows = await inventory({ 'pyproject.toml': pyproject([`requests @ ${target}`]) });

    const row = find(rows, 'requests');
    expect(row).toBeDefined();
    expect(row?.sourceType).not.toBe('registry');
    expect(row?.purl).toBeUndefined();
  });

  it('records the direct-reference target as the requested value', async () => {
    const rows = await inventory({
      'pyproject.toml': pyproject(['requests @ git+https://github.com/psf/requests.git']),
    });

    const row = find(rows, 'requests');
    expect(row?.requested).toBe('git+https://github.com/psf/requests.git');
    expect(row?.status).toBe('git_dependency');
  });

  it('CONTROL: a plain pinned requirement is still a registry dep with a pypi purl', async () => {
    const rows = await inventory({ 'pyproject.toml': pyproject(['requests==2.32.3']) });

    const row = find(rows, 'requests');
    expect(row).toBeDefined();
    expect(row?.sourceType).toBe('registry');
    expect(row?.purl?.startsWith('pkg:pypi/')).toBe(true);
    expect(row?.status).toBe('current');
  });

  // The already-correct collector path must not be disturbed by the unification.
  it('CONTROL: a bare VCS url line in requirements.txt is still excluded', async () => {
    const rows = await inventory({
      'requirements.txt': ['git+https://github.com/psf/requests.git', 'flask==3.0.3', ''].join(
        '\n',
      ),
    });

    expect(find(rows, 'requests')).toBeUndefined();
    expect(find(rows, 'flask')).toBeDefined();
  });

  it('keeps file: and -e references classified as local paths', async () => {
    const rows = await inventory({
      'pyproject.toml': pyproject(['requests @ file:./vendor/requests', 'flask @ ../flask']),
    });

    expect(find(rows, 'requests')?.status).toBe('local_path');
    expect(find(rows, 'flask')?.status).toBe('local_path');
  });
});
