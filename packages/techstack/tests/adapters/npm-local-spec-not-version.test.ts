import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { npmAdapter } from '../../src/adapters/npm.js';
import { parseNpmLockVersions } from '../../src/adapters/npm-lockfile-parse.js';
import type { Workspace } from '../../src/types.js';

/**
 * Regression: a local (`file:`) dependency must never be recorded as a
 * resolved version, and must never become a registry observation.
 *
 * npm's `packages` entry for a `file:` dependency carries
 * `"version": "file:../local-thing"` on a `link: true` install (the npm
 * analogue of the repo's own `local-thing: file:../local-thing` fixture in
 * `npm-adapter.test.ts`, which the pnpm importer already refuses to record).
 * `parseNpmLockVersions` recorded that value verbatim — so the direct row
 * reported `locked: "file:../local-thing"` — and the v3 `dependencies` mirror
 * stripped it to the empty string, which the transitive pass then emitted as
 * the fabricated registry instance `pkg:npm/local-thing`.
 */

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

async function inventory(lock: string, dependencies: Record<string, string>) {
  const root = mkdtempSync(join(tmpdir(), 'techstack-npm-local-'));
  roots.push(root);
  const pkgPath = join(root, 'package.json');
  mkdirSync(dirname(pkgPath), { recursive: true });
  writeFileSync(pkgPath, JSON.stringify({ name: 'app', dependencies }), 'utf8');
  writeFileSync(join(root, 'package-lock.json'), lock, 'utf8');
  const workspace: Workspace = {
    id: 'ws-npm',
    relativeRoot: '.',
    ecosystem: 'npm',
    manifests: [pkgPath],
    lockfiles: [join(root, 'package-lock.json')],
    confidence: 1,
    coverage: 'full',
  };
  return npmAdapter.inventory(workspace, { projectRoot: root, includeTransitive: true });
}

const FILE_LOCK = JSON.stringify({
  lockfileVersion: 3,
  name: 'app',
  dependencies: {
    'local-thing': { version: 'file:../local-thing' },
    react: { version: '18.3.1' },
  },
  packages: {
    '': { name: 'app' },
    'node_modules/local-thing': {
      resolved: '../local-thing',
      link: true,
      version: 'file:../local-thing',
    },
    'node_modules/react': { version: '18.3.1' },
  },
});

describe('npm lockfile local specs are not versions', () => {
  it('never records a file:/link:/workspace: spec as a version', () => {
    const parsed = parseNpmLockVersions(
      JSON.stringify({
        lockfileVersion: 3,
        dependencies: {
          'file-dep': { version: 'file:../file-dep' },
          'link-dep': { version: 'link:../link-dep' },
          'ws-dep': { version: 'workspace:*' },
          ok: { version: '^2.3.4' },
        },
        packages: {
          'node_modules/file-dep': { link: true, version: 'file:../file-dep' },
          'node_modules/ok': { version: '2.3.4' },
        },
      }),
    );

    expect(parsed.versions.has('file-dep')).toBe(false);
    expect(parsed.versions.has('link-dep')).toBe(false);
    expect(parsed.versions.has('ws-dep')).toBe(false);
    // The `link: true` install is still surfaced as a link for classification…
    expect(parsed.links.has('node_modules/file-dep')).toBe(true);
    // …and a normal range is still prefix-stripped to its version.
    expect(parsed.versions.get('ok')).toEqual(['2.3.4']);
  });

  it('reports a file: dependency as a local path with no fabricated version or purl', async () => {
    const deps = await inventory(FILE_LOCK, {
      'local-thing': 'file:../local-thing',
      react: '^18.0.0',
    });

    const local = deps.filter((dep) => dep.name === 'local-thing');
    expect(local.length).toBeGreaterThan(0);
    for (const dep of local) {
      expect(dep.locked).toBeUndefined();
      expect(dep.purl).toBeUndefined();
      expect(dep.sourceType).not.toBe('registry');
    }

    // Control: the registry dependency still resolves normally.
    expect(deps.find((dep) => dep.name === 'react')).toMatchObject({
      locked: '18.3.1',
      purl: 'pkg:npm/react@18.3.1',
    });
  });

  it('keeps recording registry installs nested under another package', () => {
    const parsed = parseNpmLockVersions(
      JSON.stringify({
        lockfileVersion: 3,
        packages: {
          '': {},
          'node_modules/a': { version: '1.0.0' },
          'node_modules/a/node_modules/b': { version: '1.0.0' },
          'node_modules/b': { version: '2.0.0' },
        },
      }),
    );
    expect(parsed.versions.get('a')).toEqual(['1.0.0']);
    expect(parsed.versions.get('b')).toEqual(['1.0.0', '2.0.0']);
  });
});
