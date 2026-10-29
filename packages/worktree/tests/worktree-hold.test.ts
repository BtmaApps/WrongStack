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

  it('cleanupStale ignores held checkouts and removeOne cleans handle branch while refusing non-managed branches (F674)', async () => {
    const events: string[] = [];
    const manager = new WorktreeManager({
      projectRoot: root,
      events: { emit: (name: string) => events.push(name) } as never,
    });
    const held = await manager.allocate('goal:held', { slugHint: 'goal-held' });
    const release = await holdManagedWorktree(path.dirname(held.dir), held.dir, 'goal:held');
    events.length = 0;

    // When only a held worktree exists, cleanupStale must be a true no-op
    expect(await manager.cleanupStale()).toEqual({ removed: 0, detected: 0 });
    expect(events).toEqual([]);
    await release();

    // removeOne without branch argument deletes the handle's wstack/ap/* branch and frees its slug
    const unheld = await manager.allocate('goal:unheld', { slugHint: 'goal-unheld' });
    expect(await manager.removeOne(unheld.dir)).toEqual({ removed: true });
    expect(
      execFileSync('git', ['branch', '--list', unheld.branch], { cwd: root }).toString().trim(),
    ).toBe('');
    expect(manager.get('goal:unheld')).toBeUndefined();
  });

  it('rejects leading-dash or blank Git ref/SHA arguments in revertBaseTo, revertCommits, and mergeBranch (F817)', async () => {
    const calls: string[][] = [];
    const manager = new WorktreeManager({
      projectRoot: root,
      run: async (args) => {
        calls.push(args);
        return { code: 0, stdout: '', stderr: '' };
      },
    });
    const handle = {
      id: 'wt-1',
      ownerId: 'owner-1',
      ownerLabel: 'Owner 1',
      slug: 'wt-1',
      branch: 'wstack/ap/wt-1',
      baseBranch: 'main',
      dir: path.join(root, '.wstack', 'wt-1'),
      status: 'active' as const,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      insertions: 0,
      deletions: 0,
      files: 0,
    };

    expect(await manager.revertBaseTo(handle, '-q')).toBe(false);
    expect(await manager.revertBaseTo(handle, '   ')).toBe(false);
    expect(await manager.revertBaseTo({ ...handle, baseBranch: '-f' }, 'abc1234')).toBe(false);
    expect(await manager.revertCommits('main', ['--no-commit'])).toEqual({
      ok: false,
      reverted: 0,
      reason: 'invalid ref',
    });
    expect(await manager.revertCommits('-f', ['abc1234'])).toEqual({
      ok: false,
      reverted: 0,
      reason: 'invalid ref',
    });
    expect(await manager.mergeBranch(' -f', 'main')).toEqual({
      ok: false,
      reason: 'invalid ref',
    });
    expect(calls).toEqual([]);
  });
});
