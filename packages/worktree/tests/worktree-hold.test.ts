import { execFileSync, spawn } from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { holdManagedWorktree, WorktreeManager } from '../src/index.js';

let root: string;
const exists = (p: string) =>
  fs.stat(p).then(
    () => true,
    () => false,
  );

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'worktree-hold-'));
  const git = (...args: string[]) => execFileSync('git', args, { cwd: root });
  git('init', '-q', '-b', 'main');
  git('config', 'user.email', 't@e.com');
  git('config', 'user.name', 't');
  await fs.writeFile(path.join(root, 'a.txt'), 'a');
  git('add', '-A');
  git('commit', '-q', '-m', 'init');
});

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true }).catch(() => undefined);
});

// The handle-free sweeps could not tell a crashed run's leftover from a live
// isolated Goal's checkout, so an SDD run's stale sweep deleted a running
// Goal's workspace and its unmerged branch.
describe('managed worktree holds', () => {
  it('keeps a checkout held in this process and sweeps it once released', async () => {
    const manager = new WorktreeManager({ projectRoot: root });
    const held = await manager.allocate('goal:a', { slugHint: 'goal-a' });
    const leftover = await manager.allocate('crashed', { slugHint: 'crashed' });
    const release = await holdManagedWorktree(path.dirname(held.dir), held.dir, 'goal:a');

    await new WorktreeManager({ projectRoot: root }).cleanupAllManaged();
    expect(await exists(held.dir)).toBe(true);
    expect(await exists(leftover.dir)).toBe(false);
    expect(
      execFileSync('git', ['branch', '--list', held.branch], { cwd: root }).toString(),
    ).toContain(held.branch);
    expect(await new WorktreeManager({ projectRoot: root }).removeOne(held.dir)).toEqual({
      removed: false,
    });

    await release();
    await new WorktreeManager({ projectRoot: root }).cleanupAllManaged();
    expect(await exists(held.dir)).toBe(false);
  });

  it('honours a live holder in another process and ignores a dead one', async () => {
    const other = await new WorktreeManager({ projectRoot: root }).allocate('goal:b', {
      slugHint: 'goal-b',
    });
    const child = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 60000)'], {
      stdio: 'ignore',
    });
    await new Promise((resolve) => child.once('spawn', resolve));
    const holds = path.join(path.dirname(other.dir), '.holds');
    await fs.mkdir(holds, { recursive: true });
    await fs.writeFile(
      path.join(holds, `${path.basename(other.dir)}.json`),
      JSON.stringify({ pid: child.pid, ownerId: 'goal:b', at: '' }),
    );

    await new WorktreeManager({ projectRoot: root }).cleanupAllManaged();
    expect(await exists(other.dir)).toBe(true);

    child.kill();
    await new Promise((resolve) => child.once('exit', resolve));
    await new WorktreeManager({ projectRoot: root }).cleanupAllManaged();
    expect(await exists(other.dir)).toBe(false);
  });
});
