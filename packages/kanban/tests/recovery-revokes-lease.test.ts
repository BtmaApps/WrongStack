import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  completeKanbanDispatch,
  reserveKanbanDispatch,
  startKanbanDispatch,
} from '../src/manager/dispatch.js';
import {
  addTask,
  createBoard,
  getTask,
  recoverStaleTaskAssignments,
} from './helpers/session-manager.js';

const SESSION = '2026-08-26/sess_01TESTKANBANDISPATCH00000';
const LATER = '2099-01-01T00:00:00.000Z';
let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'kanban-revoke-'));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => undefined);
});

async function startedDispatch(maxAttempts?: number) {
  const board = await createBoard(tmpDir, { title: 'Board' });
  const taskId = (await addTask(tmpDir, board.id, { title: 'Task' }))!.task.id;
  const reserved = await reserveKanbanDispatch(tmpDir, {
    boardId: board.id,
    taskId,
    sessionId: SESSION,
    leaseTtlMs: 1_000,
    ...(maxAttempts !== undefined ? { budget: { maxAttempts } } : {}),
  });
  const leaseId = reserved!.lease.leaseId;
  await startKanbanDispatch(tmpDir, { boardId: board.id, taskId, leaseId, sessionId: SESSION });
  return { boardId: board.id, taskId, leaseId };
}

// Retry and release revoked the dead worker's lease, but a recovery that
// failed the task kept it: the old worker's late completion still matched the
// fence and turned the failed task into a completed one.
describe('stale recovery revokes the lease in every mode', () => {
  it.each([
    ['fail mode', 'fail' as const, undefined],
    ['retry with an exhausted budget', 'retry' as const, 0],
  ])('fences a late completion after %s', async (_label, mode, maxAttempts) => {
    const dispatch = await startedDispatch(maxAttempts);
    await recoverStaleTaskAssignments(tmpDir, dispatch.boardId, { mode, now: LATER });

    const late = await completeKanbanDispatch(tmpDir, {
      ...dispatch,
      sessionId: SESSION,
      result: 'late result',
    });
    expect(late).toBeNull();
    expect((await getTask(tmpDir, dispatch.boardId, dispatch.taskId))?.assignment?.status).toBe(
      'failed',
    );
  });
});
