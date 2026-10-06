import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { PythonAdapter } from '../../src/adapters/python.js';
import type { DependencyObservation, Workspace } from '../../src/types.js';

/**
 * A PyPI package has exactly ONE canonical name, per PEP 503: runs of `-`,
 * `_` and `.` collapse to a single `-`, then lowercase (`normalizePypiName`).
 *
 * `PythonAdapter` keyed its dedupe and its purl canonically, but the observation
 * it EMITTED carried the raw manifest spelling — so `name` and `id` disagreed
 * with the dedupe key and the purl for the very same package. The transitive
 * pass was worse: it tested the RAW lockfile key against a `seen` set the
 * direct pass had filled with CANONICAL keys, so a lockfile `Django` alongside
 * a declared `django` emitted two rows for one package — an advisory
 * double-count.
 *
 * pyproject-only fixtures, deliberately: with a requirements.txt alongside,
 * `parseRequirementsTxt` re-supplies the same packages and can mask which
 * parser produced the row.
 */

const temps: string[] = [];

afterEach(async () => {
  for (const dir of temps.splice(0)) {
    await fs.rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  }
});

async function inventory(
  files: Record<string, string>,
  options: { includeTransitive?: boolean } = {},
): Promise<readonly DependencyObservation[]> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'py-canonical-'));
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
  return new PythonAdapter().inventory(workspace, options);
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

describe('python canonical package identity', () => {
  // The regression the round targeted.
  it('collapses Requests and requests to one row with the canonical name', async () => {
    const rows = await inventory({
      'pyproject.toml': pyproject(['Requests==2.32.3', 'requests==2.31.0']),
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]!.name).toBe('requests');
    expect(rows[0]!.id).toBe('dep-ws-test-requests');
  });

  it.each([
    [['Django==5.2'], 'django'],
    [['zope.interface==6.1'], 'zope-interface'],
    [['Flask_Admin==1.6'], 'flask-admin'],
    [['A__B__C==1.0'], 'a-b-c'],
  ])('normalizes %s to %s in name and id', async (deps, canonical) => {
    const rows = await inventory({ 'pyproject.toml': pyproject(deps) });

    expect(rows).toHaveLength(1);
    expect(rows[0]!.name).toBe(canonical);
    expect(rows[0]!.id).toBe(`dep-ws-test-${canonical}`);
  });

  // name must agree with the purl identity the adapter already emits.
  it('emits a name that matches the canonical purl identity', async () => {
    const rows = await inventory({ 'pyproject.toml': pyproject(['Django==5.2']) });

    expect(rows[0]!.purl).toBe('pkg:pypi/django');
    expect(rows[0]!.purl).toContain(rows[0]!.name);
  });

  // The cross-pass dedupe hole: a raw lockfile key must not resurrect a
  // package the direct pass already emitted under its canonical name.
  it('does not duplicate a direct dep that reappears raw in the lockfile', async () => {
    const rows = await inventory(
      {
        'pyproject.toml': pyproject(['django==5.2']),
        'poetry.lock': ['[[package]]', 'name = "Django"', 'version = "5.2"', ''].join('\n'),
      },
      { includeTransitive: true },
    );

    const djangoRows = rows.filter(
      (r) => r.name.toLowerCase().replace(/[-_.]+/g, '-') === 'django',
    );
    expect(djangoRows).toHaveLength(1);
  });

  // CONTROL: an already-canonical single spelling is untouched.
  it('CONTROL: an already-canonical name is unchanged', async () => {
    const rows = await inventory({ 'pyproject.toml': pyproject(['flask==3.0.3']) });

    expect(rows).toHaveLength(1);
    expect(rows[0]!.name).toBe('flask');
    expect(rows[0]!.id).toBe('dep-ws-test-flask');
    expect(rows[0]!.purl).toBe('pkg:pypi/flask');
  });
});
