// Regression for I5 (SC-SUPPLY-007): the 34 package manifests under
// packages/ carry an exclusion (a leading-bang entry) in their
// `files` block that omits the generated dist source map. The JS is
// shipped but the matching .map is not, so a consumer cannot read
// the original TypeScript sources. apps/wrongstack did not carry the
// same exclusion and so shipped maps.
//
// npm publishing is retired (every workspace package is `"private": true`),
// but the standalone binary deploy still packs each workspace
// package with `bun pm pack`, which honours the same `files` block. So this
// test enumerates every workspace member manifest directly under packages/
// and apps/ and asserts the exclusion is present.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(import.meta.dirname, '../../../..');

function findPackageJsonFiles(): string[] {
  const out: string[] = [];
  for (const top of ['packages', 'apps']) {
    const base = join(repoRoot, top);
    if (!existsSync(base)) continue;
    for (const entry of readdirSync(base, { withFileTypes: true })) {
      const manifest = join(base, entry.name, 'package.json');
      if (entry.isDirectory() && existsSync(manifest)) out.push(manifest);
    }
  }
  return out;
}

describe('I5 / workspace package manifests omit dist source maps', () => {
  it('finds the workspace packages (guards against a vacuous pass)', () => {
    expect(findPackageJsonFiles().length).toBeGreaterThan(20);
  });

  for (const pkgPath of findPackageJsonFiles()) {
    it(`${pkgPath.slice(repoRoot.length + 1).replace(/\\/g, '/')}`, () => {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as { files?: string[] };
      const files = pkg.files ?? [];
      // The 34 package manifests pin a `!dist/**/*.map` exclusion; the
      // two `apps/*` manifests were the offenders. A new workspace
      // package must follow suit.
      expect(
        files.some((f) => /dist.*\.map/.test(f) && f.startsWith('!')),
        `${pkgPath} does not exclude \`dist/**/*.map\` in its \`files\` block — the packed tarball the binary deploy consumes would ship TypeScript source maps alongside the compiled JS`,
      ).toBe(true);
    });
  }
});
