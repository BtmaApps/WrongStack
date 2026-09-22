/**
 * SDD board store — regression tests for snapshot CRUD, column ordering,
 * the JSONL event log, index listing, and lifecycle worktree cleanup.
 *
 * Exercises SddBoardStore (snapshot + event-log persistence) and the SDD
 * lifecycle cleanup hook against the real filesystem — no mocking.
 */

import * as fsp from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { SddBoardSnapshot, SddBoardTask } from '../../src/board-types.js';
import { SddBoardStore } from '../../src/sdd-board-store.js';
import { cleanupSddWorktrees } from '../../src/sdd-lifecycle.js';

async function makeTmpDir(prefix: string): Promise<string> {
  return fsp.mkdtemp(path.join(os.tmpdir(), `wstack-sdd-${prefix}-`));
}

async function loadOrFail(store: SddBoardStore, runId: string): Promise<SddBoardSnapshot> {
  const loaded = await store.load(runId);
  if (!loaded) throw new Error(`expected a snapshot for ${runId}`);
  return loaded;
}

// ── SddBoardStore — snapshot CRUD (real fs, no mocking) ───────────────────────

describe('SddBoardStore — snapshot CRUD (real fs)', () => {
  let tmpDir: string;
  let store: SddBoardStore;

  beforeEach(async () => {
    tmpDir = await makeTmpDir('board');
    store = new SddBoardStore({ baseDir: tmpDir });
  });

  afterEach(async () => {
    await fsp.rm(tmpDir, { recursive: true, force: true });
  });

  it('saveSnapshot + load — round-trip a board with columns and tasks', async () => {
    const snapshot = makeSnapshot('run-001', 'spec-alpha');
    snapshot.columns = [
      { label: 'Backlog', taskIds: ['t01'] },
      { label: 'Done', taskIds: [] },
    ];
    snapshot.tasks = [makeTask('t01', 'Implement feature')];

    await store.saveSnapshot(snapshot);
    const loaded = await loadOrFail(store, 'run-001');

    expect(loaded.graphId).toBe('graph-run-001');
    expect(loaded.columns).toHaveLength(2);
    expect(loaded.columns[0]?.taskIds).toContain('t01');
    expect(loaded.tasks).toHaveLength(1);
    expect(loaded.tasks[0]?.title).toBe('Implement feature');
  });

  it('load returns null for a nonexistent run', async () => {
    expect(await store.load('nonexistent-run')).toBeNull();
  });

  // ── Overwrite ─────────────────────────────────────────────────────────────

  it('saveSnapshot overwrites an existing snapshot', async () => {
    await store.saveSnapshot(makeSnapshot('run-002', 'spec-x', 1_000));
    await store.saveSnapshot(makeSnapshot('run-002', 'spec-x', 2_000));

    const loaded = await loadOrFail(store, 'run-002');
    expect(loaded.updatedAt).toBe(2_000);
    expect(await store.list()).toHaveLength(1);
  });

  // ── List ─────────────────────────────────────────────────────────────────

  it('list returns all saved run ids', async () => {
    await store.saveSnapshot(makeSnapshot('run-list-a', 'spec-a'));
    await store.saveSnapshot(makeSnapshot('run-list-b', 'spec-b'));
    await store.saveSnapshot(makeSnapshot('run-list-c', 'spec-c'));

    const ids = (await store.list()).map((e) => e.runId);

    expect(ids).toContain('run-list-a');
    expect(ids).toContain('run-list-b');
    expect(ids).toContain('run-list-c');
  });

  it('list is empty before any saves', async () => {
    expect(await store.list()).toHaveLength(0);
  });

  // ── Latest ────────────────────────────────────────────────────────────────

  it('latest returns the most recently updated board', async () => {
    await store.saveSnapshot(makeSnapshot('run-old', 'spec-x', 1_000_000_000));
    await store.saveSnapshot(makeSnapshot('run-new', 'spec-x', 2_000_000_000));

    const entry = await store.latest();
    expect(entry?.runId).toBe('run-new');
  });

  // ── Column management ─────────────────────────────────────────────────────

  it('column task ordering is preserved across save + load', async () => {
    const snapshot = makeSnapshot('run-cols', 'spec-cols');
    snapshot.columns = [
      { label: 'To Do', taskIds: ['a', 'b', 'c'] },
      { label: 'Done', taskIds: ['x'] },
    ];
    snapshot.tasks = [
      makeTask('a', 'A'),
      makeTask('b', 'B'),
      makeTask('c', 'C'),
      makeTask('x', 'X'),
    ];

    await store.saveSnapshot(snapshot);
    const loaded = await loadOrFail(store, 'run-cols');

    expect(loaded.columns[0]?.taskIds).toEqual(['a', 'b', 'c']);
    expect(loaded.columns[1]?.taskIds).toEqual(['x']);
  });

  it('moving a task between columns persists correctly', async () => {
    const snapshot = makeSnapshot('run-move', 'spec-move', 1_000);
    snapshot.columns = [
      { label: 'A', taskIds: ['t01'] },
      { label: 'B', taskIds: [] },
    ];
    snapshot.tasks = [makeTask('t01', 'Task')];

    await store.saveSnapshot(snapshot);

    const moved: SddBoardSnapshot = {
      ...snapshot,
      columns: [
        { label: 'A', taskIds: [] },
        { label: 'B', taskIds: ['t01'] },
      ],
      updatedAt: 2_000,
    };
    await store.saveSnapshot(moved);

    const loaded = await loadOrFail(store, 'run-move');
    expect(loaded.columns[0]?.taskIds).not.toContain('t01');
    expect(loaded.columns[1]?.taskIds).toContain('t01');
    expect(loaded.updatedAt).toBe(2_000);
  });

  // ── Event log ────────────────────────────────────────────────────────────

  it('appendEvent writes to the events file (single entry)', async () => {
    await store.appendEvent('run-evt-1', {
      type: 'task.added',
      ts: Date.now(),
      payload: { taskId: 'task-new', title: 'New task' },
    });

    const raw = await fsp.readFile(store.eventsPath('run-evt-1'), 'utf8');
    const parsed = JSON.parse(raw.trim());
    expect(parsed.type).toBe('task.added');
    expect(parsed.payload.taskId).toBe('task-new');
  });

  it('appendEvent serialises multiple events as JSONL lines', async () => {
    await store.appendEvent('run-evt-2', {
      type: 'task.added',
      ts: 1,
      payload: { taskId: 't1', title: 'T1' },
    });
    await store.appendEvent('run-evt-2', {
      type: 'task.moved',
      ts: 2,
      payload: { taskId: 't1', toColumn: 'done' },
    });

    const raw = await fsp.readFile(store.eventsPath('run-evt-2'), 'utf8');
    const lines = raw.trim().split('\n');
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0] ?? '').type).toBe('task.added');
    expect(JSON.parse(lines[1] ?? '').type).toBe('task.moved');
  });

  // ── Error resilience ─────────────────────────────────────────────────────

  it('load returns null on malformed snapshot JSON', async () => {
    await fsp.writeFile(store.snapshotPath('run-bad'), '{ not valid json }');
    expect(await store.load('run-bad')).toBeNull();
  });

  it('load returns null when file exists but is a primitive', async () => {
    await fsp.writeFile(store.snapshotPath('run-primitive'), JSON.stringify('just a string'));
    expect(await store.load('run-primitive')).toBeNull();
  });
});

// ── SddBoardStore — concurrent writes (real fs) ────────────────────────────────

describe('SddBoardStore — concurrent writes (real fs)', () => {
  let tmpDir: string;
  let store: SddBoardStore;

  beforeEach(async () => {
    tmpDir = await makeTmpDir('concurrent');
    store = new SddBoardStore({ baseDir: tmpDir });
  });

  afterEach(async () => {
    await fsp.rm(tmpDir, { recursive: true, force: true });
  });

  it('parallel saves to different runs all succeed', async () => {
    await Promise.all(
      Array.from({ length: 8 }, (_, i) =>
        store.saveSnapshot(makeSnapshot(`run-par-${i}`, `spec-par-${i}`)),
      ),
    );

    expect(await store.list()).toHaveLength(8);
  });

  it('parallel saves to the same run produce a valid snapshot', async () => {
    const runId = 'run-same-par';
    await Promise.all(
      Array.from({ length: 4 }, (_, i) =>
        store.saveSnapshot(makeSnapshot(runId, 'spec-par', Date.now() + i)),
      ),
    );

    const loaded = await loadOrFail(store, runId);
    expect(loaded.runId).toBe(runId);
  });
});

// ── SDD lifecycle cleanup ──────────────────────────────────────────────────────

describe('SddLifecycle — worktree cleanup (real fs)', () => {
  let projectRoot: string;

  beforeEach(async () => {
    projectRoot = await makeTmpDir('lifecycle');
    // Create a minimal .git/worktrees dir so the scanner finds the root
    await fsp.mkdir(path.join(projectRoot, '.git', 'worktrees'), { recursive: true });
  });

  afterEach(async () => {
    await fsp.rm(projectRoot, { recursive: true, force: true });
  });

  it('cleanupSddWorktrees returns removed=0 when no worktrees exist', async () => {
    const result = await cleanupSddWorktrees(projectRoot);
    expect(result.removed).toBe(0);
  });
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeSnapshot(runId: string, specId: string, ts = Date.now()): SddBoardSnapshot {
  return {
    runId,
    specId,
    graphId: `graph-${runId}`,
    title: `Board ${runId}`,
    status: 'running',
    startedAt: ts,
    updatedAt: ts,
    progress: {
      total: 0,
      pending: 0,
      inProgress: 0,
      blocked: 0,
      failed: 0,
      review: 0,
      completed: 0,
      percentComplete: 0,
      estimatedHours: 0,
      actualHours: 0,
    },
    wave: 0,
    tasks: [],
    columns: [],
  };
}

function makeTask(shortId: string, title: string): SddBoardTask {
  return {
    id: `task-${shortId}`,
    shortId,
    title,
    description: '',
    status: 'pending',
    displayStatus: 'pending',
    priority: 'medium',
    type: 'feature',
    deps: [],
    retries: 0,
  };
}
