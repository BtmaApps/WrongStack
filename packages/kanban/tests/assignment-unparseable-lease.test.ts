import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, expect, it } from 'vitest';
import {
  addTask,
  assignTask,
  createBoard,
  heartbeatTaskAssignment,
  recoverStaleTaskAssignments,
  updateTaskAssignment,
} from './helpers/session-manager.js';

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'kanban-lease-'));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => undefined);
});

// A worker heartbeat stored a free-form `leaseExpiresAt`; staleness compared it
// as NaN, so the lease never expired and the task stayed `running` for good.
it('recovers a running assignment whose stored lease expiry is unparseable', async () => {
  const board = await createBoard(tmpDir, { title: 'Board' });
  const task = await addTask(tmpDir, board.id, { title: 'Task' });
  await assignTask(tmpDir, board.id, task!.task.id, { agentId: 'worker' });
  await updateTaskAssignment(tmpDir, board.id, task!.task.id, { status: 'running' });
  await heartbeatTaskAssignment(tmpDir, board.id, task!.task.id, {
    heartbeatAt: '2026-07-11T12:00:00.000Z',
    leaseExpiresAt: 'in 5 minutes',
  });

  const result = await recoverStaleTaskAssignments(tmpDir, board.id, {
    now: '2027-07-11T12:00:00.000Z',
  });
  expect(result?.tasks.map((t) => t.id)).toEqual([task!.task.id]);
});
