import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveBunExecutable } from '../../../../scripts/lib/bun-executable.mjs';

describe('plugin projections under Bun', () => {
  it('formats with the local Biome binary when Bun provides npm_execpath', () => {
    const root = resolve(import.meta.dirname, '../../../..');
    // The real Bun binary, not `process.execPath`: under `bun --bun` on Windows
    // that is Bun's node.exe shim, which cannot run Bun subcommands.
    const bun = resolveBunExecutable();
    const result = spawnSync(bun, ['scripts/generate-plugin-projections.mjs'], {
      cwd: root,
      env: { ...process.env, npm_execpath: bun },
      encoding: 'utf8',
      timeout: 20_000,
    });
    expect(result.error).toBeUndefined();
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain('Plugin projections match the typed manifest.');
  }, 25_000);
});
