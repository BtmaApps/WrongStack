import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { getBoard } from '@wrongstack/kanban';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { removeProjectFixtureDirectory } from '../../core/tests/helpers/project-server-harness.js';
import {
  ensureSessionKanbanBoard,
  settleSessionKanbanBackgroundWork,
  todoListToSerializedGraph,
} from '../src/session-kanban.js';
import { queueLatestMirror } from '../src/session-kanban-mirror-queue.js';

const TEST_CONTEXT_SESSION_ID = '2026-08-26/sess_01TESTTOOLSCONTEXT0000000';

describe('session board retention policy', () => {
  let tmpRoot: string;
  const ENV = 'WRONGSTACK_KANBAN_ARCHIVE_PURGE_DAYS';
  const saved = process.env[ENV];

  beforeEach(async () => {
    tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'session-kanban-retention-'));
  });

  afterEach(async () => {
    if (saved === undefined) delete process.env[ENV];
    else process.env[ENV] = saved;
    await removeProjectFixtureDirectory(tmpRoot, { maxRetries: 5, retryDelay: 25 });
  });

  it('archives after a week and keeps the archive when no purge window is set', async () => {
    delete process.env[ENV];
    const board = await ensureSessionKanbanBoard(tmpRoot, TEST_CONTEXT_SESSION_ID);
    expect(board?.retention).toMatchObject({
      mode: 'archive_after_ttl',
      ttlMs: 7 * 24 * 60 * 60 * 1000,
    });
    expect(board?.retention?.purgeAfterArchiveMs).toBeUndefined();
  });

  it('puts the configured purge window on the board so prune can act on it later', async () => {
    process.env[ENV] = '30';
    const board = await ensureSessionKanbanBoard(tmpRoot, TEST_CONTEXT_SESSION_ID);
    expect(board?.retention?.purgeAfterArchiveMs).toBe(30 * 24 * 60 * 60 * 1000);
  });

  it('ignores a zero or unparseable purge window rather than deleting immediately', async () => {
    for (const value of ['0', '-5', 'soon', '']) {
      process.env[ENV] = value;
      const root = await fs.mkdtemp(path.join(os.tmpdir(), 'session-kanban-retention-bad-'));
      try {
        const board = await ensureSessionKanbanBoard(root, TEST_CONTEXT_SESSION_ID);
        expect(
          board?.retention?.purgeAfterArchiveMs,
          `value ${JSON.stringify(value)}`,
        ).toBeUndefined();
      } finally {
        await removeProjectFixtureDirectory(root, { maxRetries: 5, retryDelay: 25 });
      }
    }
  });

  it('preserves completed tasks across turns when todo list prunes them (F505)', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'session-kanban-f505-'));
    try {
      const sessionId = 'sess-f505';
      const graph1 = todoListToSerializedGraph(
        [
          { id: 't-done', content: 'Done item', status: 'completed' },
          { id: 't-todo', content: 'Todo item', status: 'pending' },
        ],
        sessionId,
      );

      queueLatestMirror(root, sessionId, graph1, 'session-todo');
      await settleSessionKanbanBackgroundWork();

      const board1 = await ensureSessionKanbanBoard(root, sessionId);
      expect(board1).toBeDefined();
      const fresh1 = await getBoard(root, board1!.id);
      expect(fresh1?.tasks.find((task) => task.title === 'Done item')?.status).toBe('completed');

      const graph2 = todoListToSerializedGraph(
        [{ id: 't-todo', content: 'Todo item', status: 'in_progress' }],
        sessionId,
      );

      queueLatestMirror(root, sessionId, graph2, 'session-todo');
      await settleSessionKanbanBackgroundWork();

      const fresh2 = await getBoard(root, board1!.id);
      expect(fresh2?.tasks.find((task) => task.title === 'Done item')?.status).toBe('completed');
    } finally {
      await removeProjectFixtureDirectory(root, { maxRetries: 5, retryDelay: 25 });
    }
  });
});
