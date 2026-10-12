import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, expect, it } from 'vitest';
import { RubyAdapter } from '../../src/adapters/ruby.js';
import type { Workspace } from '../../src/types.js';

const tempRoot = fileURLToPath(new URL('../../../../.temp_files/', import.meta.url));
const ownedRoots: string[] = [];
afterEach(() => {
  for (const root of ownedRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function fixture() {
  mkdirSync(tempRoot, { recursive: true });
  const projectRoot = mkdtempSync(join(tempRoot, 'ruby-paths-'));
  ownedRoots.push(projectRoot);
  const relativeRoot = 'apps/service café';
  const root = join(projectRoot, relativeRoot);
  mkdirSync(root, { recursive: true });
  writeFileSync(join(root, 'Gemfile'), "source 'https://rubygems.org'\ngem 'rack', '~> 2.2'\n");
  writeFileSync(
    join(root, 'Gemfile.lock'),
    'GEM\n  remote: https://rubygems.org/\n  specs:\n    rack (2.2.9)\n\nDEPENDENCIES\n  rack (~> 2.2)\n',
  );
  const workspace: Workspace = {
    id: 'ws',
    ecosystem: 'ruby',
    packageManager: 'bundler',
    relativeRoot,
    manifests: ['Gemfile'],
    lockfiles: ['Gemfile.lock'],
    confidence: 1,
    coverage: 'partial',
  };
  return { root, projectRoot, workspace };
}

it.each([
  ['relative manifest and lock', false, false],
  ['absolute manifest and relative lock', true, false],
  ['relative manifest and absolute lock', false, true],
  ['absolute-path control', true, true],
] as const)(
  'resolves %s under the target workspace',
  async (_label, absoluteManifest, absoluteLock) => {
    const { root, projectRoot, workspace } = fixture();
    const rows = await new RubyAdapter().inventory(
      {
        ...workspace,
        manifests: [absoluteManifest ? join(root, 'Gemfile') : 'Gemfile'],
        lockfiles: [absoluteLock ? join(root, 'Gemfile.lock') : 'Gemfile.lock'],
      },
      { projectRoot },
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      name: 'rack',
      requested: '~> 2.2',
      locked: '2.2.9',
      purl: 'pkg:gem/rack@2.2.9',
    });
    expect(rows[0]?.evidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'manifest', source: join(root, 'Gemfile') }),
        expect.objectContaining({ kind: 'lockfile', source: join(root, 'Gemfile.lock') }),
      ]),
    );
  },
);

it('keeps legacy absolute paths working without projectRoot', async () => {
  const { root, workspace } = fixture();
  const rows = await new RubyAdapter().inventory(
    {
      ...workspace,
      manifests: [join(root, 'Gemfile')],
      lockfiles: [join(root, 'Gemfile.lock')],
    },
    {},
  );
  expect(rows[0]?.locked).toBe('2.2.9');
});

it('reads a relative Gemfile without inventing a missing lock version', async () => {
  const { projectRoot, workspace } = fixture();
  const rows = await new RubyAdapter().inventory({ ...workspace, lockfiles: [] }, { projectRoot });
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ name: 'rack', requested: '~> 2.2', purl: 'pkg:gem/rack' });
  expect(rows[0]?.locked).toBeUndefined();
  expect(rows[0]?.evidence.map((entry) => entry.kind)).toEqual(['manifest']);
});

it('preserves missing-manifest empty inventory', async () => {
  const { root, projectRoot, workspace } = fixture();
  expect(
    await new RubyAdapter().inventory(
      {
        ...workspace,
        manifests: [join(root, 'missing', 'Gemfile')],
      },
      { projectRoot },
    ),
  ).toEqual([]);
});
