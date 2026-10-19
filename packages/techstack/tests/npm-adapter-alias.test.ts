/**
 * An npm alias must never become an observation of a package that is not
 * installed under that name.
 *
 * `"typescript5": "npm:typescript@5.9.3"` installs the REAL package
 * `typescript`. The adapter already handles that for the DIRECT row - its own
 * comment says the verbatim form "became `pkg:npm/typescript5@typescript%405.9.3`,
 * a package that does not exist".
 *
 * npm's lockfile installs an alias under the ALIAS name
 * (`node_modules/typescript5`, with the real package in the entry's `name`
 * field), so the lockfile-derived version map is keyed by the alias name - and
 * the TRANSITIVE pass turned that key into a registry observation:
 * `pkg:npm/typescript5@5.9.3`, a package that does not exist. The advisory
 * scan then queries OSV for it, and the inventory/SBOM reports a dependency
 * that was never installed.
 *
 * See: packages/techstack/src/adapters/npm.ts
 *       packages/techstack/src/adapters/npm-lockfile-parse.ts
 */
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { NpmAdapter } from '../src/adapters/npm.js';
import { workspaceId } from '../src/discovery/index.js';
import type { Workspace } from '../src/types.js';

const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function makeWorkspace(
  name: string,
  pkgJson: Record<string, unknown>,
  lockContent: string,
): { dir: string; workspace: Workspace } {
  const dir = join(
    tmpdir(),
    `techstack-npm-alias-${name}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  );
  dirs.push(dir);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'package.json'), JSON.stringify(pkgJson, null, 2));
  writeFileSync(join(dir, 'package-lock.json'), lockContent);
  const workspace: Workspace = {
    id: workspaceId('', 'npm'),
    relativeRoot: dir,
    ecosystem: 'npm',
    manifests: ['package.json'],
    lockfiles: ['package-lock.json'],
    confidence: 0.9,
    coverage: 'full',
  };
  return { dir, workspace };
}

function npmLock(packages: Record<string, unknown>, deps: Record<string, unknown> = {}): string {
  return JSON.stringify(
    {
      name: 'demo',
      lockfileVersion: 3,
      requires: true,
      packages: { '': { name: 'demo', dependencies: deps }, ...packages },
    },
    null,
    2,
  );
}

const ALIAS_LOCK = npmLock(
  {
    'node_modules/typescript5': {
      name: 'typescript',
      version: '5.9.3',
      resolved: 'https://registry.npmjs.org/typescript/-/typescript-5.9.3.tgz',
    },
  },
  { typescript5: 'npm:typescript@5.9.3' },
);

async function inventory(pkgJson: Record<string, unknown>, lockContent: string) {
  const { dir, workspace } = makeWorkspace('alias', pkgJson, lockContent);
  return new NpmAdapter().inventory(workspace, {
    projectRoot: dir,
    includeTransitive: true,
  });
}

describe('npm adapter · alias handling', () => {
  it('never reports a package that is not installed under that name', async () => {
    const observations = await inventory(
      { name: 'demo', dependencies: { typescript5: 'npm:typescript@5.9.3' } },
      ALIAS_LOCK,
    );

    expect(observations.filter((obs) => obs.name === 'typescript5')).toEqual([]);
    const real = observations.filter((obs) => obs.name === 'typescript');
    expect(real).toHaveLength(1);
    expect(real[0]?.locked).toBe('5.9.3');
    expect(real[0]?.purl).toBe('pkg:npm/typescript@5.9.3');
  });

  it('renames an alias that is only in the lockfile', async () => {
    // The alias is not a direct dependency here - it comes in transitively.
    const observations = await inventory({ name: 'demo' }, ALIAS_LOCK);

    expect(observations.filter((obs) => obs.name === 'typescript5')).toEqual([]);
    const real = observations.filter((obs) => obs.name === 'typescript');
    expect(real).toHaveLength(1);
    expect(real[0]?.purl).toBe('pkg:npm/typescript@5.9.3');
  });
});
