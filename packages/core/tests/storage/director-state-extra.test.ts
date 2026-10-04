import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DirectorStateCheckpoint, loadDirectorState } from '../../src/storage/director-state.js';
import * as atomic from '../../src/utils/atomic-write.js';

// Covers the load-missing-file branch, the recordTaskAssigned update branch,
// the natural debounce-timer fire, the persist failure warning, and the
// persist writing-guard that the main director-state.test.ts does not reach.

let dir: string;
beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'wstack-dstate-extra-'));
});
afterEach(async () => {
  vi.restoreAllMocks();
  await fs.rm(dir, { recursive: true, force: true });
});

describe('director-state — extra coverage', () => {
  it('loadDirectorState returns null when the file does not exist', async () => {
    expect(await loadDirectorState(path.join(dir, 'missing.json'))).toBeNull();
  });

  it('recordTaskAssigned updates an existing task in place', async () => {
    const file = path.join(dir, 's.json');
    const cp = new DirectorStateCheckpoint(
      file,
      { directorRunId: 'r', spawnDepth: 0, maxSpawnDepth: 2 },
      10,
    );
    cp.recordTaskAssigned({
      taskId: 't1',
      subagentId: 'a',
      description: 'first',
      status: 'running',
    });
    cp.recordTaskAssigned({
      taskId: 't1',
      subagentId: 'b',
      description: 'second',
      status: 'running',
    });
    await cp.flush();
    const loaded = await loadDirectorState(file);
    expect(loaded?.tasks).toHaveLength(1);
    expect(loaded?.tasks[0]?.subagentId).toBe('b');
  });

  it('persists via the debounce timer without an explicit flush', async () => {
    const file = path.join(dir, 'timer.json');
    const cp = new DirectorStateCheckpoint(
      file,
      { directorRunId: 'r', spawnDepth: 0, maxSpawnDepth: 2 },
      10,
    );
    cp.recordSpawn({ id: 's1', spawnedAt: new Date().toISOString() }, 1);
    await vi.waitFor(
      async () => {
        const loaded = await loadDirectorState(file);
        expect(loaded?.spawnCount).toBe(1);
      },
      { timeout: 2000 },
    );
  });

  it('warns but does not throw when persist cannot write the checkpoint', async () => {
    const fileAsDir = path.join(dir, 'asdir.json');
    await fs.mkdir(fileAsDir, { recursive: true });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const cp = new DirectorStateCheckpoint(
      fileAsDir,
      { directorRunId: 'r', spawnDepth: 0, maxSpawnDepth: 2 },
      10,
    );
    cp.recordSpawn({ id: 's1', spawnedAt: new Date().toISOString() }, 1);
    await cp.flush();
    expect(warn).toHaveBeenCalled();
  });

  it('overlapping flushes wait for file I/O and persist mutations during the follow-up write', async () => {
    const file = path.join(dir, 'guard.json');
    const cp = new DirectorStateCheckpoint(
      file,
      { directorRunId: 'r', spawnDepth: 0, maxSpawnDepth: 2 },
      10,
    );
    const started = [Promise.withResolvers<void>(), Promise.withResolvers<void>()];
    const releases = [Promise.withResolvers<void>(), Promise.withResolvers<void>()];
    const original = atomic.atomicWrite;
    let active = 0;
    let maxActive = 0;
    const write = vi.spyOn(atomic, 'atomicWrite').mockImplementation(async (...args) => {
      const index = write.mock.calls.length - 1;
      active++;
      maxActive = Math.max(maxActive, active);
      started[index]?.resolve();
      try {
        if (releases[index]) await releases[index].promise;
        await original(...args);
      } finally {
        active--;
      }
    });
    cp.setUsage({ totalCost: 1 });
    await started[0]?.promise;
    cp.setUsage({ totalCost: 2 });
    const firstFlush = cp.flush();
    const secondFlush = cp.flush();
    let finished = false;
    void firstFlush.then(() => {
      finished = true;
    });
    try {
      // A real macrotask must run even while shutdown is awaiting the first write.
      await new Promise<void>((resolve) => setImmediate(resolve));
      expect(finished).toBe(false);
      releases[0]?.resolve();
      await started[1]?.promise;
      cp.setUsage({ totalCost: 3 });
      expect(finished).toBe(false);
      releases[1]?.resolve();
      await Promise.all([firstFlush, secondFlush]);
      expect((await loadDirectorState(file))?.usage).toEqual({ totalCost: 3 });
      expect(write).toHaveBeenCalledTimes(3);
      expect(maxActive).toBe(1);
      await new Promise((resolve) => setTimeout(resolve, 30));
      expect(write).toHaveBeenCalledTimes(3);
    } finally {
      for (const release of releases) release.resolve();
      await Promise.all([firstFlush, secondFlush]);
    }
  });

  it('reconcileCrashedState transitions running tasks and allocated worktrees to failed', async () => {
    const file = path.join(dir, 'reconcile.json');
    const cp = new DirectorStateCheckpoint(
      file,
      { directorRunId: 'r', spawnDepth: 0, maxSpawnDepth: 2 },
      10,
    );
    cp.recordTaskAssigned({
      taskId: 't-crashed',
      subagentId: 'sub-1',
      description: 'work in flight',
      status: 'running',
      worktree: {
        taskId: 't-crashed',
        subagentId: 'sub-1',
        handleId: 'h-1',
        dir: '/tmp/wt-1',
        branch: 'feat/t-1',
        baseBranch: 'main',
        status: 'allocated',
      },
    });
    cp.recordTaskAssigned({
      taskId: 't-done',
      subagentId: 'sub-2',
      description: 'finished work',
      status: 'completed',
    });

    const repaired = cp.reconcileCrashedState();
    expect(repaired).toEqual(['t-crashed']);
    const current = cp.current();
    expect(current.tasks[0]?.status).toBe('failed');
    expect(current.tasks[0]?.error).toContain('Director crashed');
    expect(current.tasks[0]?.worktree?.status).toBe('failed');
    expect(current.tasks[1]?.status).toBe('completed');
  });
});
