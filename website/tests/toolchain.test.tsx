import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const websiteRoot = process.cwd();
const manifest: { scripts: Record<string, string> } = JSON.parse(
  readFileSync(resolve(websiteRoot, 'package.json'), 'utf8'),
);

// Root typecheck:only discovers this script with --workspaces --if-present.
describe('website workspace toolchain', () => {
  it('exposes the Bun checker to workspace typechecking and reuses it for builds', () => {
    expect(manifest.scripts.typecheck).toBe('bun ../scripts/bun-typecheck.mjs');
    expect(manifest.scripts.build).toBe('bun run typecheck && bun --bun run vite build');
  });

  it('uses the repository formatter and linter without an undeclared CLI', () => {
    expect(manifest.scripts.format).toBe('bun --bun run biome format --write .');
    expect(manifest.scripts.lint).toBe('bun --bun run biome lint .');
  });
});
