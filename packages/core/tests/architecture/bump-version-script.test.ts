/**
 * Regression cover for scripts/bump-version.mjs prerelease corruption.
 *
 * The `set` subcommand accepts prerelease versions (`1.2.3-beta.1`) by design,
 * but the patch/minor/major arithmetic (`split('.').map(Number)`) turns such a
 * root version into a NaN component and — before the fix — silently wrote
 * `1.2.NaN...` into EVERY workspace manifest in one pass. Because the bump
 * rewrites all manifests together, the version-drift check in
 * publish-workspace.mjs cannot catch the corruption afterwards.
 *
 * bump-version.mjs is a top-level side-effecting script that derives its
 * repoRoot from its own location, so these tests copy the CURRENT production
 * script verbatim into a fixture workspace and spawn it there — the real code
 * path runs, and the real workspace is never touched.
 */
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const productionScript = join(
  import.meta.dirname,
  '..',
  '..',
  '..',
  '..',
  'scripts',
  'bump-version.mjs',
);

function makeFixture() {
  const root = mkdtempSync(join(tmpdir(), 'bump-version-regression-'));
  mkdirSync(join(root, 'scripts'), { recursive: true });
  mkdirSync(join(root, 'packages', 'alpha'), { recursive: true });
  mkdirSync(join(root, 'apps', 'desktop'), { recursive: true });

  cpSync(productionScript, join(root, 'scripts', 'bump-version.mjs'));
  expect(readFileSync(productionScript, 'utf8')).toBe(
    readFileSync(join(root, 'scripts', 'bump-version.mjs'), 'utf8'),
  );

  const manifestPaths = [
    join(root, 'package.json'),
    join(root, 'packages', 'alpha', 'package.json'),
    join(root, 'apps', 'desktop', 'package.json'),
  ];
  for (const p of manifestPaths) {
    writeFileSync(p, `${JSON.stringify({ name: 'fixture', version: '0.0.1' }, null, 2)}\n`);
  }
  return {
    root,
    manifestPaths,
    run: (args: string[]) =>
      spawnSync(process.execPath, ['scripts/bump-version.mjs', ...args], {
        cwd: root,
        encoding: 'utf8',
      }),
  };
}

type Fixture = ReturnType<typeof makeFixture>;

const manifestVersions = (fixture: Fixture): string[] =>
  fixture.manifestPaths.map((p) => JSON.parse(readFileSync(p, 'utf8')).version);

describe('bump-version script', () => {
  let fixture: Fixture | undefined;
  afterEach(() => {
    if (fixture) rmSync(fixture.root, { recursive: true, force: true });
    fixture = undefined;
  });

  it('refuses to bump a root version carrying a prerelease suffix instead of corrupting manifests', () => {
    fixture = makeFixture();
    const prerelease = '1.2.3-beta.1';

    // `set` accepts the prerelease on purpose — it is the only way to carry
    // such a version, and the refusal below points operators at it.
    expect(fixture.run(['set', prerelease]).status).toBe(0);
    expect(manifestVersions(fixture)).toEqual([prerelease, prerelease, prerelease]);

    const patchRun = fixture.run(['patch']);
    expect(patchRun.status).not.toBe(0);
    // Nothing may be written on refusal, and the error must name the culprit.
    expect(manifestVersions(fixture)).toEqual([prerelease, prerelease, prerelease]);
    expect(`${patchRun.stderr}${patchRun.stdout}`).toContain(prerelease);
    expect(`${patchRun.stderr}${patchRun.stdout}`).not.toContain('NaN');
  });

  it('also refuses minor/major bumps of suffix-carrying roots', () => {
    fixture = makeFixture();
    expect(fixture.run(['set', '2.0.0-rc.1']).status).toBe(0);
    for (const type of ['minor', 'major']) {
      const run = fixture.run([type]);
      expect(run.status, `${type} must refuse a prerelease root`).not.toBe(0);
      expect(manifestVersions(fixture)).toEqual(['2.0.0-rc.1', '2.0.0-rc.1', '2.0.0-rc.1']);
    }
  });

  it('still bumps plain X.Y.Z roots across every workspace manifest', () => {
    fixture = makeFixture();
    expect(fixture.run(['set', '9.9.9']).status).toBe(0);
    const bumpRun = fixture.run(['patch']);
    expect(bumpRun.status).toBe(0);
    expect(manifestVersions(fixture)).toEqual(['9.9.10', '9.9.10', '9.9.10']);
  });
});
