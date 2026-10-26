import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

// The operator's write is injected after the supervisor read the board and
// before the gate sweep acts on that read. Everything else is the real
// in-process Kanban domain.
let afterReconcile: (() => Promise<void>) | undefined;
vi.mock('@wrongstack/kanban', async (importOriginal) => {
  const real = await importOriginal<typeof import('@wrongstack/kanban')>();
  return {
    ...real,
    reconcileKanbanBoard: async (...args: Parameters<typeof real.reconcileKanbanBoard>) => {
      const result = await real.reconcileKanbanBoard(...args);
      await afterReconcile?.();
      return result;
    },
  };
});

const { createKanbanSupervisor } = await import('../src/server/kanban-supervisor.js');
const kanban = await import('@wrongstack/kanban/test-support');

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'kanban-sweep-reopen-'));
});

afterEach(async () => {
  afterReconcile = undefined;
  await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => undefined);
});

// The sweep picked cards from an earlier read and finalized them without
// re-checking: a review card reopened for another worker in between was
// marked completed while that worker was still running it.
it('the gate sweep leaves a card reopened for another worker alone', async () => {
  const board = await kanban.createBoard(tmpDir, {
    title: 'Board',
    completionGate: { enforcement: 'strict' },
  });
  const reviewCard = async (title: string) => {
    const taskId = (await kanban.addTask(tmpDir, board.id, { title }))!.task.id;
    await kanban.addCheckToTask(tmpDir, board.id, taskId, {
      description: 'Confirmed',
      type: 'manual',
      status: 'passed',
    });
    await kanban.assignTask(tmpDir, board.id, taskId, { agentId: 'worker-a' });
    await kanban.updateTaskAssignment(tmpDir, board.id, taskId, { status: 'completed' });
    return taskId;
  };
  const untouched = await reviewCard('Untouched');
  const reopened = await reviewCard('Reopened');
  afterReconcile = async () => {
    afterReconcile = undefined;
    await kanban.assignTask(tmpDir, board.id, reopened, { agentId: 'worker-b' });
    await kanban.updateTaskAssignment(tmpDir, board.id, reopened, { status: 'running' });
    await kanban.heartbeatTaskAssignment(tmpDir, board.id, reopened, {
      heartbeatAt: new Date().toISOString(),
      leaseExpiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    });
  };

  const supervisor = createKanbanSupervisor({ projectRoot: tmpDir, broadcast: () => {} });
  try {
    await supervisor.auditNow(board.id);
  } finally {
    supervisor.dispose();
  }

  const tasks = (await kanban.getBoard(tmpDir, board.id))!.tasks;
  expect(tasks.find((task) => task.id === untouched)?.status).toBe('completed');
  const card = tasks.find((task) => task.id === reopened);
  expect(card?.status).toBe('in_progress');
  expect(card?.assignment).toMatchObject({ agentId: 'worker-b', status: 'running' });
});
