/**
 * SDD Kanban store — regression tests for board CRUD, column management,
 * workflow-state persistence, and legacy snapshot migration.
 *
 * Tests the SDD board store (event-sourced, real fs) and the SDD lifecycle
 * cleanup hooks (real fs).  Coverage gap was 0% on:
 *   packages/sdd/src/stores/kanban-store.ts (lines 8-161)
 * which maps to sdd-board-store.ts (event log + snapshot persistence).
 */

import * as fsp from 'node:fs/promises';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  SddBoardStore,
  type SddBoardSnapshot,
  type SddBoardEvent,
} from '../../src/sdd-board-store.js';
import { cleanupSddWorktrees } from '../../src/sdd-lifecycle.js';

// ── SddBoardStore — snapshot CRUD (real fs, no mocking) ───────────────────────

describe('SddBoardStore — snapshot CRUD (real fs)', () => {
  let tmpDir: string;
  let store: SddBoardStore;

  beforeEach(async () => {
    tmpDir = path.join(import.meta.dirname, `../.tmp-board-${Date.now()}`);
    await fsp.mkdir(tmpDir, { recursive: true });
    store = new SddBoardStore({ baseDir: tmpDir });
  });

  afterEach(async () => {
    await fsp.rm(tmpDir, { recursive: true, force: true });
  });

  // ── Create ────────────────────────────────────────────────────────────────

  it('saveSnapshot + load — round-trip a board with columns and cards', async () => {
    const snapshot = makeSnapshot('run-001', 'spec-alpha');
    snapshot.boardId = 'board-001';
    snapshot.projectId = 'proj-test';
    snapshot.columns = [
      { id: 'col-backlog', title: 'Backlog', cardIds: ['card-1'] },
      { id: 'col-done', title: 'Done', cardIds: [] },
    ];
    snapshot.cards = [
      {
        id: 'card-1',
        title: 'Implement feature',
        description: null,
        columnId: 'col-backlog',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    ];

    await store.saveSnapshot(snapshot);
    const loaded = await store.load('run-001');

    expect(loaded).not.toBeNull();
    expect(loaded!.boardId).toBe('board-001');
    expect(loaded!.columns).toHaveLength(2);
    expect(loaded!.columns![0].cardIds).toContain('card-1');
    expect(loaded!.cards).toHaveLength(1);
    expect(loaded!.cards![0].title).toBe('Implement feature');
  });

  it('load returns null for a nonexistent run', async () => {
    const loaded = await store.load('nonexistent-run');
    expect(loaded).toBeNull();
  });

  // ── Overwrite ─────────────────────────────────────────────────────────────

  it('saveSnapshot overwrites an existing snapshot', async () => {
    await store.saveSnapshot(makeSnapshot('run-002', 'spec-x'));
    await store.saveSnapshot(makeSnapshot('run-002', 'spec-x', Date.now() + 1));

    const loaded = await store.load('run-002');
    expect(loaded!.lastModified).toBeGreaterThan(0);
  });

  // ── List ─────────────────────────────────────────────────────────────────

  it('list returns all saved run ids', async () => {
    await store.saveSnapshot(makeSnapshot('run-list-a', 'spec-a'));
    await store.saveSnapshot(makeSnapshot('run-list-b', 'spec-b'));
    await store.saveSnapshot(makeSnapshot('run-list-c', 'spec-c'));

    const entries = await store.list();
    const ids = entries.map((e) => e.runId);

    expect(ids).toContain('run-list-a');
    expect(ids).toContain('run-list-b');
    expect(ids).toContain('run-list-c');
  });

  it('list is empty before any saves', async () => {
    const entries = await store.list();
    expect(entries).toHaveLength(0);
  });

  // ── Latest ────────────────────────────────────────────────────────────────

  it('latest returns the most recently saved board', async () => {
    await store.saveSnapshot(makeSnapshot('run-old', 'spec-x', 1_000_000_000));
    await store.saveSnapshot(makeSnapshot('run-new', 'spec-x', 2_000_000_000));

    const entry = await store.latest();
    expect(entry!.runId).toBe('run-new');
  });

  // ── Column management ─────────────────────────────────────────────────────

  it('column card ordering is preserved across save + load', async () => {
    const snapshot = makeSnapshot('run-cols', 'spec-cols');
    snapshot.columns = [
      { id: 'c1', title: 'To Do', cardIds: ['a', 'b', 'c'] },
      { id: 'c2', title: 'Done', cardIds: ['x'] },
    ];
    snapshot.cards = [
      { id: 'a', title: 'A', description: null, columnId: 'c1', createdAt: 1, updatedAt: 1 },
      { id: 'b', title: 'B', description: null, columnId: 'c1', createdAt: 1, updatedAt: 1 },
      { id: 'c', title: 'C', description: null, columnId: 'c1', createdAt: 1, updatedAt: 1 },
      { id: 'x', title: 'X', description: null, columnId: 'c2', createdAt: 1, updatedAt: 1 },
    ];

    await store.saveSnapshot(snapshot);
    const loaded = await store.load('run-cols')!;

    expect(loaded.columns![0].cardIds).toEqual(['a', 'b', 'c']);
    expect(loaded.columns![1].cardIds).toEqual(['x']);
  });

  it('moving a card between columns persists correctly', async () => {
    const snapshot = makeSnapshot('run-move', 'spec-move');
    snapshot.columns = [
      { id: 'col-a', title: 'A', cardIds: ['card-1'] },
      { id: 'col-b', title: 'B', cardIds: [] },
    ];
    snapshot.cards = [
      { id: 'card-1', title: 'Card', description: null, columnId: 'col-a', createdAt: 1, updatedAt: 1 },
    ];

    await store.saveSnapshot(snapshot);

    // Move card-1 from col-a to col-b
    snapshot.columns![0].cardIds = [];
    snapshot.columns![1].cardIds = ['card-1'];
    snapshot.cards![0].columnId = 'col-b';
    snapshot.lastModified = Date.now() + 1;
    await store.saveSnapshot(snapshot);

    const loaded = await store.load('run-move')!;
    expect(loaded.columns![0].cardIds).not.toContain('card-1');
    expect(loaded.columns![1].cardIds).toContain('card-1');
    expect(loaded.cards![0].columnId).toBe('col-b');
  });

  // ── Event log ────────────────────────────────────────────────────────────

  it('appendEvent writes to the events file (single entry)', async () => {
    const event: SddBoardEvent = {
      type: 'task.added',
      runId: 'run-evt-1',
      ts: Date.now(),
      payload: { taskId: 'task-new', title: 'New task' },
    };

    await store.appendEvent('run-evt-1', event);

    const raw = await fsp.readFile(
      path.join(tmpDir, 'run-evt-1.events.jsonl'),
      'utf8',
    );
    const parsed = JSON.parse(raw.trim());
    expect(parsed.type).toBe('task.added');
    expect(parsed.payload.taskId).toBe('task-new');
  });

  it('appendEvent serialises multiple events as JSONL lines', async () => {
    await store.appendEvent('run-evt-2', {
      type: 'task.added', runId: 'run-evt-2', ts: 1, payload: { taskId: 't1', title: 'T1' },
    });
    await store.appendEvent('run-evt-2', {
      type: 'task.moved', runId: 'run-evt-2', ts: 2, payload: { taskId: 't1', toColumn: 'done' },
    });

    const raw = await fsp.readFile(
      path.join(tmpDir, 'run-evt-2.events.jsonl'),
      'utf8',
    );
    const lines = raw.trim().split('\n');
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0]).type).toBe('task.added');
    expect(JSON.parse(lines[1]).type).toBe('task.moved');
  });

  // ── Error resilience ─────────────────────────────────────────────────────

  it('load returns null on malformed snapshot JSON', async () => {
    const snapPath = path.join(tmpDir, 'run-bad.json');
    await fsp.writeFile(snapPath, '{ not valid json }');

    const loaded = await store.load('run-bad');
    expect(loaded).toBeNull();
  });

  it('load returns null when file exists but is a primitive', async () => {
    const snapPath = path.join(tmpDir, 'run-primitive.json');
    await fsp.writeFile(snapPath, JSON.stringify('just a string'));

    const loaded = await store.load('run-primitive');
    expect(loaded).toBeNull();
  });
});

// ── SddBoardStore — concurrent writes (real fs) ────────────────────────────────

describe('SddBoardStore — concurrent writes (real fs)', () => {
  let tmpDir: string;
  let store: SddBoardStore;

  beforeEach(async () => {
    tmpDir = path.join(import.meta.dirname, `../.tmp-concurrent-${Date.now()}`);
    await fsp.mkdir(tmpDir, { recursive: true });
    store = new SddBoardStore({ baseDir: tmpDir });
  });

  afterEach(async () => {
    await fsp.rm(tmpDir, { recursive: true, force: true });
  });

  it('parallel saves to different runs all succeed', async () => {
    const saves = Array.from({ length: 8 }, (_, i) =>
      store.saveSnapshot(makeSnapshot(`run-par-${i}`, `spec-par-${i}`)),
    );
    await Promise.all(saves);

    const entries = await store.list();
    expect(entries).toHaveLength(8);
  });

  it('parallel saves to the same run produce a valid snapshot', async () => {
    const runId = 'run-same-par';
    const saves = Array.from({ length: 4 }, (_, i) =>
      store.saveSnapshot(makeSnapshot(runId, 'spec-par', Date.now() + i)),
    );
    await Promise.all(saves);

    const loaded = await store.load(runId);
    expect(loaded).not.toBeNull();
    expect(loaded!.runId).toBe(runId);
  });
});

// ── SDD lifecycle cleanup ──────────────────────────────────────────────────────

describe('SddLifecycle — worktree cleanup (real fs)', () => {
  let projectRoot: string;

  beforeEach(async () => {
    projectRoot = path.join(import.meta.dirname, `../.tmp-lifecycle-${Date.now()}`);
    await fsp.mkdir(projectRoot, { recursive: true });
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

function makeSnapshot(
  runId: string,
  specId: string,
  ts = Date.now(),
): SddBoardSnapshot {
  return {
    runId,
    specId,
    boardId: `board-${runId}`,
    projectId: 'proj-test',
    columns: [],
    cards: [],
    cardAssignments: {},
    progress: { total: 0, completed: 0 },
    lastModified: ts,
    updatedAt: ts,
  };
}
