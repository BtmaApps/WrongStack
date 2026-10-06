import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { NpmAdapter } from '../../src/adapters/npm.js';
import type { DependencyObservation, Workspace } from '../../src/types.js';

/**
 * `parsePnpmAllVersions` must survive the real shape of a pnpm lockfile.
 *
 * The section tracker used to run its "is this a top-level key?" test on EVERY
 * line, and a blank line is not indented — so it answered "not a top-level
 * key" and CLEARED the flag. Real pnpm lockfiles put a blank line directly
 * after `packages:` and between every entry (this repo's `pnpm-lock.yaml:13-14`),
 * so the `packages:` section closed before its first entry and `allVersions`
 * came back empty.
 *
 * The visible effect: direct rows still resolved (they come from
 * `parsePnpmImporters`, which has always skipped blanks), but EVERY transitive
 * instance was dropped — so `includeTransitive: true` and `false` produced the
 * same observation set, and no transitively-installed package reached the SBOM
 * or its per-purl OSV advisory query.
 */

const temps: string[] = [];

afterEach(async () => {
  for (const dir of temps.splice(0)) {
    await fs.rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  }
});

async function inventory(lock: string): Promise<readonly DependencyObservation[]> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'pnpm-sections-'));
  temps.push(dir);
  const packageJson = path.join(dir, 'package.json');
  await fs.writeFile(
    packageJson,
    JSON.stringify({ name: 'demo', version: '1.0.0', dependencies: { minimatch: '^3.0.4' } }),
    'utf8',
  );
  await fs.writeFile(path.join(dir, 'pnpm-lock.yaml'), lock, 'utf8');
  const workspace: Workspace = {
    id: 'ws-test',
    relativeRoot: dir,
    ecosystem: 'npm',
    manifests: [packageJson], // ABSOLUTE — relative names yield [] and prove nothing
    lockfiles: [path.join(dir, 'pnpm-lock.yaml')],
    confidence: 0.9,
    coverage: 'full',
  };
  return new NpmAdapter().inventory(workspace, { includeTransitive: true });
}

// Byte-shape of a real pnpm lock: blank line after each top-level key, blank
// lines between entries.
const REAL_SHAPE = [
  "lockfileVersion: '9.0'",
  '',
  'importers:',
  '',
  '  .:',
  '    dependencies:',
  '      minimatch:',
  '        specifier: ^3.0.4',
  '        version: 3.0.4',
  '',
  'packages:',
  '',
  '  minimatch@3.0.4:',
  '    resolution: {integrity: sha512-aaa}',
  '',
  '  minimatch@5.1.6:',
  '    resolution: {integrity: sha512-bbb}',
  '',
  'snapshots:',
  '',
  '  minimatch@3.0.4: {}',
  '',
  '  minimatch@5.1.6: {}',
  '',
].join('\n');

const versionsOf = (rows: readonly DependencyObservation[], name: string) =>
  new Set(rows.filter((r) => r.name === name).map((r) => r.locked));

describe('pnpm all-versions section tracking', () => {
  it('yields a row for every lock instance of a repeated package', async () => {
    const rows = await inventory(REAL_SHAPE);

    // The direct importer entry still resolves (non-vacuity: the lock was read).
    expect(rows.some((r) => r.name === 'minimatch' && r.locked === '3.0.4')).toBe(true);
    // Both instances are distinct advisory targets (OSV is queried per purl).
    expect(versionsOf(rows, 'minimatch')).toEqual(new Set(['3.0.4', '5.1.6']));
  });

  it('emits an explicit transitive row for the non-declared instance', async () => {
    const rows = await inventory(REAL_SHAPE);

    const transitive = rows.find((r) => r.name === 'minimatch' && r.locked === '5.1.6');
    expect(transitive).toBeDefined();
    expect(transitive?.direct).toBe(false);
    expect(transitive?.scope).toBe('transitive');
    expect(transitive?.purl).toBe('pkg:npm/minimatch@5.1.6');
  });

  it('reads entries written adjacently with no blank line between them', async () => {
    const rows = await inventory(
      [
        "lockfileVersion: '9.0'",
        '',
        'importers:',
        '',
        '  .:',
        '    dependencies:',
        '      minimatch:',
        '        specifier: ^3.0.4',
        '        version: 3.0.4',
        '',
        'packages:',
        '',
        '  minimatch@3.0.4:',
        '    resolution: {integrity: sha512-aaa}',
        '  minimatch@5.1.6:',
        '    resolution: {integrity: sha512-bbb}',
        '',
      ].join('\n'),
    );

    expect(versionsOf(rows, 'minimatch')).toEqual(new Set(['3.0.4', '5.1.6']));
  });

  // CONTROL: the section must still CLOSE at the next top-level key, so the
  // blank-line guard cannot over-read past the packages section.
  it('CONTROL: closes the section at the next top-level key', async () => {
    const rows = await inventory(
      [
        "lockfileVersion: '9.0'",
        '',
        'importers:',
        '',
        '  .:',
        '    dependencies:',
        '      minimatch:',
        '        specifier: ^3.0.4',
        '        version: 3.0.4',
        '',
        'packages:',
        '',
        '  minimatch@3.0.4:',
        '    resolution: {integrity: sha512-aaa}',
        '',
        'settings:',
        '  autoInstallPeers: true',
        '',
      ].join('\n'),
    );

    expect(versionsOf(rows, 'minimatch')).toEqual(new Set(['3.0.4']));
  });

  // CONTROL: a commented-out entry is not a dependency.
  it('CONTROL: ignores commented-out package entries', async () => {
    const rows = await inventory(
      [
        "lockfileVersion: '9.0'",
        '',
        'importers:',
        '',
        '  .:',
        '    dependencies:',
        '      minimatch:',
        '        specifier: ^3.0.4',
        '        version: 3.0.4',
        '',
        'packages:',
        '',
        '  minimatch@3.0.4:',
        '    resolution: {integrity: sha512-aaa}',
        '#  minimatch@9.9.9:',
        '#    resolution: {integrity: sha512-ccc}',
        '',
      ].join('\n'),
    );

    expect(versionsOf(rows, 'minimatch')).toEqual(new Set(['3.0.4']));
  });
});
