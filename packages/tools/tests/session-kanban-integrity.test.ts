import type { Context, TodoItem } from '@wrongstack/core/agent';
import type { KanbanBoard, KanbanTask } from '@wrongstack/kanban';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getBoard: vi.fn(),
  bridge: vi.fn(),
  presence: vi.fn(),
  snapshot: vi.fn(),
}));
vi.mock('@wrongstack/kanban', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@wrongstack/kanban')>()),
  getBoard: mocks.getBoard,
  bridgeKanbanSupervisor: mocks.bridge,
  touchKanbanPresence: mocks.presence,
  getKanbanOrchestrationSnapshot: mocks.snapshot,
  listBoards: vi.fn(async () => []),
}));

import {
  attachSessionKanbanMirror,
  rebindSessionKanbanTask,
  settleSessionKanbanBackgroundWork,
} from '../src/session-kanban.js';
import { applyManagedKanbanBoardToTodos } from '../src/session-kanban-sync.js';

const at = '2026-10-02T00:00:00Z';
function board(id = 'b1'): KanbanBoard {
  return {
    id,
    title: id,
    version: 1,
    createdAt: at,
    updatedAt: at,
    lifecycle: {
      mode: 'managed',
      columns: {
        backlog: 'backlog',
        todo: 'todo',
        running: 'running',
        review: 'review',
        done: 'done',
      },
    },
    columns: ['backlog', 'todo', 'running', 'review', 'done'].map((id, order) => ({
      id,
      title: id,
      order,
    })),
    tasks: [
      {
        id: 't1',
        title: 'Await acceptance',
        status: 'review',
        columnId: 'review',
        order: 0,
        priority: 'medium',
        createdAt: at,
        updatedAt: at,
        assignment: { agentId: 'worker', status: 'completed' },
      },
    ],
  };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
const detaches: Array<() => void> = [];
beforeEach(() => {
  mocks.getBoard.mockReset();
  mocks.bridge.mockReset();
  mocks.presence.mockReset();
  mocks.snapshot.mockReset();
  mocks.bridge.mockReturnValue(() => {});
  mocks.presence.mockResolvedValue(null);
});
afterEach(async () => {
  for (const detach of detaches.splice(0)) detach();
  await settleSessionKanbanBackgroundWork();
});

function context() {
  let todos: TodoItem[] = [];
  let listener: ((change: { kind: string; key?: string }) => void) | undefined;
  const replace = vi.fn((next: TodoItem[]) => {
    todos = next.length && next.every((todo) => todo.status === 'completed') ? [] : next;
  });
  const ctx = {
    projectRoot: 'D:/kanban-integrity-fixture',
    meta: {},
    session: { id: 'session-a' },
    currentKanbanBoardId: 'b1',
    get todos() {
      return todos;
    },
    state: {
      onChange(fn: typeof listener) {
        listener = fn;
        return () => {
          listener = undefined;
        };
      },
      replaceTodos: replace,
    },
    setCurrentKanbanTask: vi.fn(),
  } as unknown as Context;
  return { ctx, replace, change: () => listener?.({ kind: 'meta_set', key: 'kanban' }) };
}

describe('session Kanban integrity', () => {
  it('keeps worker-completed Review open until the card is accepted', () => {
    const { ctx, replace } = context();
    const current = board();
    const suppressed = new WeakSet<Context>();
    const reviewTodos = applyManagedKanbanBoardToTodos(ctx, current, suppressed);
    expect(reviewTodos[0]?.status).toBe('in_progress');
    current.tasks[0]!.status = 'completed';
    const acceptedTodos = applyManagedKanbanBoardToTodos(ctx, current, suppressed);
    expect(replace).toHaveBeenLastCalledWith([expect.objectContaining({ status: 'completed' })]);
    expect(acceptedTodos).toEqual([]);
    expect(ctx.todos).toEqual([]);
  });
  it('does not auto-clear a managed todo merely because the worker finished', () => {
    const { ctx } = context();
    applyManagedKanbanBoardToTodos(ctx, board(), new WeakSet());
    expect(ctx.todos).toHaveLength(1);
    expect(ctx.todos[0]?.status).toBe('in_progress');
  });
  it('cannot create a subscription or publish todos after detach', async () => {
    const read = deferred<KanbanBoard>();
    mocks.getBoard.mockReturnValue(read.promise);
    const { ctx, replace } = context();
    const detach = attachSessionKanbanMirror(ctx);
    detaches.push(detach);
    detach();
    read.resolve(board());
    await settleSessionKanbanBackgroundWork();
    expect(mocks.bridge).not.toHaveBeenCalled();
    expect(mocks.presence).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
  });
  it('drops a board read that belongs to the previous session', async () => {
    const read = deferred<KanbanBoard>();
    mocks.getBoard.mockReturnValue(read.promise);
    const { ctx, replace } = context();
    detaches.push(attachSessionKanbanMirror(ctx));
    (ctx.session as { id: string }).id = 'session-b';
    read.resolve(board());
    await settleSessionKanbanBackgroundWork();
    expect(mocks.bridge).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
  });
  it('does not let a late old board replace the newer subscription', async () => {
    const old = deferred<KanbanBoard>();
    const next = deferred<KanbanBoard>();
    mocks.getBoard.mockImplementation((_root: string, id: string) =>
      id === 'b1' ? old.promise : next.promise,
    );
    const { ctx, change } = context();
    detaches.push(attachSessionKanbanMirror(ctx));
    ctx.currentKanbanBoardId = 'b2';
    change();
    next.resolve(board('b2'));
    await Promise.resolve();
    await Promise.resolve();
    old.resolve(board('b1'));
    await settleSessionKanbanBackgroundWork();
    expect(mocks.bridge).toHaveBeenCalledTimes(1);
    expect(mocks.presence.mock.calls.every((call) => call[1] === 'b2')).toBe(true);
    expect(ctx.todos[0]?.kanbanBoardId).toBe('b2');
  });
  it('does not rebind a task after the session changes during presence discovery', async () => {
    const read = deferred<unknown>();
    mocks.snapshot.mockReturnValue(read.promise);
    const { ctx } = context();
    const task = {
      ...board().tasks[0]!,
      assignment: { status: 'running', leaseExpiresAt: '2099-01-01T00:00:00Z' },
    } as KanbanTask;
    const binding = rebindSessionKanbanTask(ctx);
    (ctx.session as { id: string }).id = 'session-b';
    read.resolve({
      running: [
        {
          task,
          board: {
            ...board(),
            presence: [{ sessionId: 'session-a', taskId: 't1', lastSeenAt: at }],
          },
        },
      ],
    });
    expect(await binding).toBeNull();
    expect(ctx.setCurrentKanbanTask).not.toHaveBeenCalled();
  });
});
