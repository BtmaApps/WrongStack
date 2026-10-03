import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mutateBoard } from '../src/storage.js';
import { VerificationContext } from '../src/verification/verification-context.js';
import {
  addNoteToTask,
  addTask,
  assignTask,
  createBoard,
  getBoard,
  touchKanbanPresence,
  updateTaskAssignment,
} from './helpers/session-manager.js';

const roots: string[] = [];
const baseline = {
  id: 'pre-work',
  capturedAt: '2026-10-03T12:00:00Z',
  commitHash: '',
  treeHash: 'a'.repeat(40),
};
afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'kanban-baseline-race-'));
  roots.push(root);
  const board = await createBoard(root, { title: 'Concurrent baseline' });
  const added = await addTask(root, board.id, {
    title: 'Executable work',
    expectedFileChanges: [{ path: 'work.ts', operation: 'modify' }],
    assignment: { status: 'queued', agentId: 'worker', leaseId: 'old-lease', attempt: 1 },
  });
  return { root, boardId: board.id, taskId: added!.task.id };
}

describe.each(['assign', 'update'] as const)('%s pre-work baseline concurrency', (operation) => {
  const start = ({ root, boardId, taskId }: Awaited<ReturnType<typeof fixture>>) =>
    operation === 'assign'
      ? assignTask(root, boardId, taskId, {
          agentId: 'worker',
          status: 'running',
          leaseId: 'new-lease',
          attempt: 2,
        })
      : updateTaskAssignment(root, boardId, taskId, { status: 'running' });

  it.each(['presence', 'note', 'other-task', 'board-title'] as const)(
    'permits %s while capturing and retains that write',
    async (write) => {
      const scope = await fixture();
      vi.spyOn(VerificationContext.prototype, 'captureSnapshot').mockImplementationOnce(
        async () => {
          if (write === 'presence')
            await touchKanbanPresence(scope.root, scope.boardId, {
              sessionId: 'observer',
              agentId: 'observer',
            });
          if (write === 'note')
            await addNoteToTask(scope.root, scope.boardId, scope.taskId, {
              author: 'observer',
              content: 'Concurrent note',
            });
          if (write === 'other-task')
            await addTask(scope.root, scope.boardId, { title: 'Independent work' });
          if (write === 'board-title')
            await mutateBoard(scope.root, scope.boardId, (board) => {
              board.title = 'Renamed board';
            });
          return baseline;
        },
      );
      await expect(start(scope)).resolves.toBeTruthy();
      const current = (await getBoard(scope.root, scope.boardId))!;
      const task = current.tasks.find((task) => task.id === scope.taskId)!;
      expect(task.assignment?.status).toBe('running');
      expect(task.assignment?.verificationBaseline).toEqual(baseline);
      if (write === 'presence')
        expect(current.presence?.some((entry) => entry.sessionId === 'observer')).toBe(true);
      if (write === 'note')
        expect(task.notes?.some((note) => note.content === 'Concurrent note')).toBe(true);
      if (write === 'other-task') expect(current.tasks).toHaveLength(2);
      if (write === 'board-title') expect(current.title).toBe('Renamed board');
    },
  );

  it.each(['file-contract', 'ownership', 'dependency', 'policy'] as const)(
    'rejects %s changes without publishing the captured baseline',
    async (write) => {
      const scope = await fixture();
      vi.spyOn(VerificationContext.prototype, 'captureSnapshot').mockImplementationOnce(
        async () => {
          await mutateBoard(scope.root, scope.boardId, (board) => {
            const task = board.tasks.find((task) => task.id === scope.taskId)!;
            if (write === 'file-contract')
              task.expectedFileChanges = [{ path: 'other.ts', operation: 'modify' }];
            if (write === 'ownership') task.assignment!.leaseId = 'changed-owner';
            if (write === 'dependency') task.dependsOn = ['new-dependency'];
            if (write === 'policy') board.completionGate = { enforcement: 'strict' };
          });
          return baseline;
        },
      );
      await expect(start(scope)).rejects.toThrow(/baseline/i);
      const task = (await getBoard(scope.root, scope.boardId))!.tasks.find(
        (task) => task.id === scope.taskId,
      )!;
      expect(task.assignment?.status).toBe('queued');
      expect(task.assignment?.verificationBaseline).toBeUndefined();
      if (write === 'ownership') expect(task.assignment?.leaseId).toBe('changed-owner');
    },
  );
});
