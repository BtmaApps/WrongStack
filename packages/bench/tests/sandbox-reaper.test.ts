import { spawn } from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  BENCH_DAEMON_IDLE_ENV,
  reapProcessesUnder,
  sandboxRootsFor,
} from '../src/sandbox-reaper.js';

let root: string;
beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'reaper-test-'));
});
afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

describe('reapProcessesUnder', () => {
  it('kills a process whose command line names the root and spares others', async () => {
    const marker = path.join(root, 'work', 'task-a');
    const other = path.join(root, 'work', 'task-b');
    const keepAlive = 'setInterval(() => {}, 1000)';
    const target = spawn(process.execPath, ['-e', keepAlive, marker], { stdio: 'ignore' });
    const bystander = spawn(process.execPath, ['-e', keepAlive, other], { stdio: 'ignore' });
    try {
      await new Promise((r) => setTimeout(r, 300));
      const killed = await reapProcessesUnder([marker]);
      expect(killed).toBeGreaterThanOrEqual(1);
      await new Promise((r) => setTimeout(r, 500));
      expect(alive(target.pid as number)).toBe(false);
      expect(alive(bystander.pid as number)).toBe(true);
    } finally {
      target.kill();
      bystander.kill();
    }
  }, 60_000);

  it('does nothing for an empty root list', async () => {
    expect(await reapProcessesUnder([''])).toBe(0);
  });
});

describe('sandbox reaper helpers', () => {
  it('covers both the task workdir and its project home', () => {
    expect(sandboxRootsFor('a/work', 'a/home/projects/x')).toEqual([
      path.resolve('a/work'),
      path.resolve('a/home/projects/x'),
    ]);
  });

  it('gives every project daemon a short idle window', () => {
    for (const value of Object.values(BENCH_DAEMON_IDLE_ENV)) expect(Number(value)).toBe(15_000);
    expect(Object.keys(BENCH_DAEMON_IDLE_ENV)).toHaveLength(6);
  });
});
