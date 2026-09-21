import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { EcosystemAdapter } from '../../src/adapters/interface.js';
import { npmAdapter } from '../../src/adapters/npm.js';
import { pythonAdapter } from '../../src/adapters/python.js';
import { rustAdapter } from '../../src/adapters/rust.js';
import type { EcosystemId, Workspace } from '../../src/types.js';

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

async function run(
  ecosystem: EcosystemId,
  adapter: EcosystemAdapter,
  files: Record<string, string>,
  manifest: string,
) {
  const root = mkdtempSync(join(tmpdir(), 'techstack-transitive-'));
  roots.push(root);
  for (const [name, content] of Object.entries(files))
    writeFileSync(join(root, name), content, 'utf8');
  const workspace: Workspace = {
    id: `ws-${ecosystem}`,
    relativeRoot: '.',
    ecosystem,
    manifests: [join(root, manifest)],
    lockfiles: [],
    confidence: 1,
    coverage: 'full',
  };
  return adapter.inventory(workspace, { projectRoot: root, includeTransitive: true });
}

describe('includeTransitive', () => {
  it('adds npm lock-only packages', async () => {
    const deps = await run(
      'npm',
      npmAdapter,
      {
        'package.json': JSON.stringify({ dependencies: { direct: '^1.0.0' } }),
        'pnpm-lock.yaml':
          "lockfileVersion: '9.0'\nimporters:\n  .:\n    dependencies:\n      direct:\n        specifier: ^1.0.0\n        version: 1.1.0\npackages:\n  direct@1.1.0: {}\n  transitive@2.0.0: {}\n",
      },
      'package.json',
    );
    expect(deps.find((dep) => dep.name === 'transitive')).toMatchObject({
      direct: false,
      scope: 'transitive',
      locked: '2.0.0',
    });
  });

  it('adds Cargo.lock-only crates', async () => {
    const deps = await run(
      'rust',
      rustAdapter,
      {
        'Cargo.toml': '[dependencies]\nserde = "1"\n',
        'Cargo.lock':
          '[[package]]\nname = "serde"\nversion = "1.0.0"\n[[package]]\nname = "syn"\nversion = "2.0.0"\n',
      },
      'Cargo.toml',
    );
    expect(deps.find((dep) => dep.name === 'syn')).toMatchObject({
      direct: false,
      scope: 'transitive',
    });
  });

  it('reports every Cargo.lock instance of a multi-version crate', async () => {
    const deps = await run(
      'rust',
      rustAdapter,
      {
        'Cargo.toml': '[dependencies]\nsyn = "1.0"\n',
        // syn is direct (requirement "1.0" selects 1.0.109) and also pulled in at
        // 2.0.48; quote appears twice and is lock-only.
        'Cargo.lock': [
          '[[package]]',
          'name = "quote"',
          'version = "1.0.35"',
          '[[package]]',
          'name = "quote"',
          'version = "1.0.36"',
          '[[package]]',
          'name = "syn"',
          'version = "1.0.109"',
          '[[package]]',
          'name = "syn"',
          'version = "2.0.48"',
          '',
        ].join('\n'),
      },
      'Cargo.toml',
    );

    // The requirement-selected instance stays on the direct row…
    expect(deps.find((dep) => dep.name === 'syn' && dep.direct)).toMatchObject({
      locked: '1.0.109',
    });
    // …and the other instances are still inventoried instead of being deduped
    // away by crate name (an omitted version cannot be matched by any advisory).
    expect(
      deps
        .filter((dep) => dep.name === 'syn')
        .map((dep) => dep.locked)
        .sort(),
    ).toEqual(['1.0.109', '2.0.48']);
    expect(
      deps
        .filter((dep) => dep.name === 'quote')
        .map((dep) => dep.locked)
        .sort(),
    ).toEqual(['1.0.35', '1.0.36']);
    const purls = deps.flatMap((dep) => (dep.purl ? [dep.purl] : []));
    expect(new Set(purls).size).toBe(purls.length);
  });

  it('reports every pnpm lock instance of a multi-version package', async () => {
    const deps = await run(
      'npm',
      npmAdapter,
      {
        'package.json': JSON.stringify({ dependencies: { direct: '^1.0.0' } }),
        // pnpm writes one `name@version` key per instance; this repository's own
        // lockfile holds fs-extra at 12 versions.
        'pnpm-lock.yaml': [
          "lockfileVersion: '9.0'",
          'importers:',
          '  .:',
          '    dependencies:',
          '      direct:',
          '        specifier: ^1.0.0',
          '        version: 1.1.0',
          'packages:',
          '  direct@1.1.0: {}',
          '  fs-extra@11.2.0: {}',
          '  fs-extra@9.1.0: {}',
          '  jsonfile@6.1.0: {}',
          '',
        ].join('\n'),
      },
      'package.json',
    );

    expect(
      deps
        .filter((dep) => dep.name === 'fs-extra')
        .map((dep) => dep.locked)
        .sort(),
    ).toEqual(['11.2.0', '9.1.0']);
    // A single-instance package keeps the historical id shape.
    const jsonfile = deps.filter((dep) => dep.name === 'jsonfile');
    expect(jsonfile).toHaveLength(1);
    expect(jsonfile[0]?.id).toBe('dep-ws-npm-jsonfile');
    // The direct row stays authoritative (importer section).
    expect(deps.find((dep) => dep.direct && dep.name === 'direct')?.locked).toBe('1.1.0');
  });

  it('adds poetry.lock-only Python packages', async () => {
    const deps = await run(
      'python',
      pythonAdapter,
      {
        'pyproject.toml': '[project]\ndependencies = ["requests>=2"]\n',
        'poetry.lock':
          '[[package]]\nname = "requests"\nversion = "2.32.0"\n[[package]]\nname = "urllib3"\nversion = "2.2.2"\n',
      },
      'pyproject.toml',
    );
    expect(deps.find((dep) => dep.name === 'urllib3')).toMatchObject({
      direct: false,
      locked: '2.2.2',
    });
  });

  it('parses a 500-package pnpm lockfile within one second', async () => {
    const packages = Array.from(
      { length: 500 },
      (_, index) => `  package-${index}@1.0.${index}: {}`,
    ).join('\n');
    const started = performance.now();
    const deps = await run(
      'npm',
      npmAdapter,
      {
        'package.json': JSON.stringify({ dependencies: { direct: '^1.0.0' } }),
        'pnpm-lock.yaml': `lockfileVersion: '9.0'\nimporters:\n  .:\n    dependencies:\n      direct:\n        specifier: ^1.0.0\n        version: 1.0.0\npackages:\n  direct@1.0.0: {}\n${packages}\n`,
      },
      'package.json',
    );
    expect(deps.filter((dep) => !dep.direct)).toHaveLength(500);
    expect(performance.now() - started).toBeLessThan(1_000);
  });
});
