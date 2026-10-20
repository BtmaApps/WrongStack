import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, rm, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ORPHAN_MIN_AGE_MS, sweepOrphanedTempDirs } from '../src/lint-gate/linter-runner.js';

/**
 * #363: lint-gate cleans its temp dir in `finally`, which never runs after a
 * hard kill. The sweep reclaims those leftovers, and only those.
 */
describe('lint-gate orphaned temp dir sweep (#363)', () => {
  let root: string;
  const later = () => Date.now() + ORPHAN_MIN_AGE_MS + 60_000;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'lint-gate-sweep-test-'));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  /** A real lint-gate-shaped dir from a process killed before its `finally`. */
  async function orphanFromKilledProcess(kind: 'lint' | 'fix'): Promise<string> {
    const prefix = kind === 'fix' ? 'lint-gate-fix-' : 'lint-gate-';
    const script = `
      const fs = require('node:fs');
      const path = require('node:path');
      const dir = fs.mkdtempSync(path.join(process.argv[1], ${JSON.stringify(prefix)} + process.pid + '-'));
      fs.writeFileSync(path.join(dir, 'input.ts'), 'let x = 1');
      process.stdout.write(dir + '\\n');
      setInterval(() => {}, 1000);
    `;
    const child = spawn(process.execPath, ['-e', script, root], {
      stdio: ['ignore', 'pipe', 'inherit'],
      windowsHide: true,
    });
    const dir = await new Promise<string>((resolve, reject) => {
      let out = '';
      child.stdout.on('data', (chunk: Buffer) => {
        out += chunk.toString();
        if (out.includes('\n')) resolve(out.trim());
      });
      child.once('error', reject);
    });
    const exited = new Promise((resolve) => child.once('exit', resolve));
    child.kill('SIGKILL');
    await exited;
    return dir;
  }

  it.each(['lint', 'fix'] as const)('removes a %s dir left by a killed process', async (kind) => {
    const dir = await orphanFromKilledProcess(kind);
    expect(existsSync(dir)).toBe(true);

    const removed = await sweepOrphanedTempDirs(root, later());

    expect(removed).toEqual([dir]);
    expect(existsSync(dir)).toBe(false);
  });

  it('keeps a dir whose owner is still alive', async () => {
    const dir = join(root, `lint-gate-${process.pid}-abcdef`);
    await mkdir(dir);
    await writeFile(join(dir, 'input.ts'), 'x');
    expect(await sweepOrphanedTempDirs(root, later())).toEqual([]);
    expect(existsSync(dir)).toBe(true);
  });

  it('keeps a recent orphan, whose pid may have just been reused', async () => {
    const dir = await orphanFromKilledProcess('lint');
    expect(await sweepOrphanedTempDirs(root, Date.now())).toEqual([]);
    expect(existsSync(dir)).toBe(true);
  });

  it('keeps dirs it cannot prove are its own', async () => {
    const dir = await orphanFromKilledProcess('lint');
    await writeFile(join(dir, 'someone-elses.txt'), 'x');
    const legacy = join(root, 'lint-gate-abcdef');
    await mkdir(legacy);
    const nested = join(root, 'lint-gate-999999-abcdef');
    await mkdir(join(nested, 'sub'), { recursive: true });
    const old = new Date(Date.now() - ORPHAN_MIN_AGE_MS * 2);
    await utimes(legacy, old, old);

    expect(await sweepOrphanedTempDirs(root, later())).toEqual([]);
    expect(existsSync(dir)).toBe(true);
    expect(existsSync(legacy)).toBe(true);
    expect(existsSync(nested)).toBe(true);
  });

  it('returns nothing for a temp root that cannot be read', async () => {
    expect(await sweepOrphanedTempDirs(join(root, 'missing'), later())).toEqual([]);
  });
});
