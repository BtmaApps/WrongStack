import type { KanbanBoard } from '@wrongstack/kanban';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createKanbanSupervisor,
  type KanbanSupervisorDispatchOptions,
} from '../src/server/kanban-supervisor.js';

const state = vi.hoisted(() => ({ board: null as KanbanBoard | null }));
vi.mock('@wrongstack/kanban', () => ({
  getBoard: vi.fn(async () => state.board),
  listBoards: vi.fn(async () => (state.board ? [state.board] : [])),
  reconcileKanbanBoard: vi.fn(async () => ({ board: state.board, tasks: [] })),
  resolveGateEnforcement: () => 'off',
  getKanbanQueueHealth: vi.fn(async () => ({
    counts: { running: 0, startable: 1, review: 0, blocked: 0, failed: 0 },
    staleAssignments: { count: 0 },
    dependencyBlocked: { count: 0 },
  })),
  kanbanQueueAnomalyCount: () => 0,
  recoverStaleTaskAssignments: vi.fn(),
  finalizeTaskCompletion: vi.fn(),
  claimBoardManagement: vi.fn(async () => true),
  renewBoardManagement: vi.fn(async () => true),
  finishBoardManagement: vi.fn(async (_root, _boardId, _token, result) => {
    if (state.board)
      state.board.management = {
        status: result.status,
        summary: result.result,
        error: result.error,
      };
    return true;
  }),
}));
vi.mock('../src/server/kanban-broadcast.js', () => ({ publishKanbanBoard: vi.fn() }));

beforeEach(() => {
  vi.useFakeTimers();
  state.board = {
    id: 'b',
    title: 'Leader work',
    version: 1,
    createdAt: '',
    updatedAt: '',
    columns: [],
    tasks: [
      {
        id: 't',
        title: 'Implement search',
        status: 'pending',
        columnId: 'todo',
        order: 0,
        priority: 'medium',
        createdAt: '',
        updatedAt: '',
      },
    ],
  };
});
afterEach(() => vi.useRealTimers());

function setup() {
  const dispatch = vi.fn(
    async (_prompt: string, _opts?: KanbanSupervisorDispatchOptions) => 'spawned',
  );
  const supervisor = createKanbanSupervisor({
    projectRoot: '/project',
    broadcast: vi.fn(),
    dispatchTask: dispatch,
  });
  return { dispatch, supervisor };
}

describe('background Kanban management', () => {
  it('uses the durable completion verdict when claimed success has missing card reviews', async () => {
    const { finishBoardManagement } = await import('@wrongstack/kanban');
    vi.mocked(finishBoardManagement).mockResolvedValueOnce(true);
    const { dispatch, supervisor } = setup();
    try {
      await supervisor.auditNow('b');
      state.board!.management = { status: 'failed', error: 'Missing card reviews: t' };
      await dispatch.mock.calls[0]![1]!.onDone!({ status: 'completed', result: 'Looks good' });
      expect(supervisor.getSnapshot('b')?.status).toBe('error');
      await supervisor.auditNow('b');
      expect(supervisor.getSnapshot('b')?.error).toBe('Missing card reviews: t');
      vi.setSystemTime(Date.now() + 600_000);
      await supervisor.auditNow('b');
      expect(dispatch).toHaveBeenCalledTimes(2);
    } finally {
      supervisor.dispose();
    }
  });
  it('aborts a manager when its ownership lease is lost', async () => {
    const { renewBoardManagement } = await import('@wrongstack/kanban');
    vi.mocked(renewBoardManagement).mockResolvedValueOnce(false);
    const { dispatch, supervisor } = setup();
    try {
      await supervisor.auditNow('b');
      const signal = dispatch.mock.calls[0]![1]!.signal!;
      expect(signal.aborted).toBe(false);
      await vi.advanceTimersByTimeAsync(30_000);
      expect(signal.aborted).toBe(true);
      expect(dispatch).toHaveBeenCalledTimes(1);
      // Even a host that never calls onDone must not wedge this board forever.
      expect(supervisor.getStats().runningAgents).toBe(0);
      vi.setSystemTime(Date.now() + 600_000);
      await supervisor.auditNow('b');
      expect(dispatch).toHaveBeenCalledTimes(2);
    } finally {
      supervisor.dispose();
    }
  });

  it('cancels the previous project manager without clearing the new project run', async () => {
    let root = '/first';
    const dispatch = vi.fn(
      async (_prompt: string, _opts?: KanbanSupervisorDispatchOptions) => 'spawned',
    );
    const supervisor = createKanbanSupervisor({
      projectRoot: () => root,
      broadcast: vi.fn(),
      dispatchTask: dispatch,
    });
    try {
      await supervisor.auditNow('b');
      const first = dispatch.mock.calls[0]![1]!;
      root = '/second';
      await supervisor.auditNow('b');
      expect(first.signal!.aborted).toBe(true);
      expect(dispatch).toHaveBeenCalledTimes(2);
      await first.onDone!({ status: 'completed', result: 'Old project' });
      expect(supervisor.getStats().runningAgents).toBe(1);
    } finally {
      supervisor.dispose();
    }
  });
  it('reviews healthy todo cards automatically, then stays quiet until meaningful work changes', async () => {
    const { dispatch, supervisor } = setup();
    try {
      await supervisor.auditNow('b');
      expect(dispatch).toHaveBeenCalledTimes(1);
      expect(dispatch.mock.calls[0]![0]).toContain('acceptance criteria');
      expect(dispatch.mock.calls[0]![0]).toContain('never fabricate');
      await dispatch.mock.calls[0]![1]!.onDone!({ status: 'completed' });
      vi.setSystemTime(Date.now() + 600_000);
      state.board!.updatedAt = 'transport-only-change';
      await supervisor.auditNow('b');
      expect(dispatch).toHaveBeenCalledTimes(1);
      state.board!.tasks[0]!.title = 'Implement search and pagination';
      await supervisor.auditNow('b');
      expect(dispatch).toHaveBeenCalledTimes(2);
    } finally {
      supervisor.dispose();
    }
  });

  it('honors explicit deterministic supervision and completed boards', async () => {
    const { dispatch, supervisor } = setup();
    try {
      state.board!.supervisor = { enabled: true, mode: 'deterministic' };
      await supervisor.auditNow('b');
      expect(dispatch).not.toHaveBeenCalled();
      delete state.board!.supervisor;
      state.board!.completedAt = 'done';
      await supervisor.auditNow('b');
      expect(dispatch).not.toHaveBeenCalled();
    } finally {
      supervisor.dispose();
    }
  });

  it('does not launch a second manager while the first is running and retries failure after cooldown', async () => {
    const { dispatch, supervisor } = setup();
    try {
      await Promise.all([supervisor.auditNow('b'), supervisor.auditNow('b')]);
      expect(dispatch).toHaveBeenCalledTimes(1);
      await dispatch.mock.calls[0]![1]!.onDone!({
        status: 'failed',
        error: 'provider unavailable',
      });
      await supervisor.auditNow('b');
      expect(dispatch).toHaveBeenCalledTimes(1);
      vi.setSystemTime(Date.now() + 600_000);
      await supervisor.auditNow('b');
      expect(dispatch).toHaveBeenCalledTimes(2);
    } finally {
      supervisor.dispose();
    }
  });

  it('ignores callbacks and explicit audits after disposal', async () => {
    const { dispatch, supervisor } = setup();
    await supervisor.auditNow('b');
    supervisor.dispose();
    await dispatch.mock.calls[0]?.[1]?.onDone?.({ status: 'completed' });
    expect(await supervisor.auditNow('b')).toEqual([]);
    expect(supervisor.getStats().snapshots).toBe(0);
  });
});
