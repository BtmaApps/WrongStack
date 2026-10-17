import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import type { Context, TodoItem } from '@wrongstack/core/agent';
import type { KanbanBoard } from '@wrongstack/kanban';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mailboxMocks = vi.hoisted(() => ({
  send: vi.fn(async (_input: unknown) => ({ id: 'message-id' })),
}));

vi.mock('@wrongstack/core/coordination', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@wrongstack/core/coordination')>()),
  getSharedProjectMailbox: () => ({ send: mailboxMocks.send }),
}));

import { applyManagedKanbanBoardToTodos } from '../src/session-kanban-sync.js';
import { bindTodosToBoard } from '../src/todo-kanban-sync.js';

/** Mirrors sessionIdFromTags in session-kanban.ts — the `session:<id>` tag. */
function sessionOwnerFromTags(tags: readonly string[] | undefined): string | null {
  const tag = tags?.find((candidate) => candidate.startsWith('session:'));
  return tag?.slice('session:'.length) || null;
}

function makeBoard(tags: string[]): KanbanBoard {
  return {
    id: 'board-1',
    title: 'Managed board',
    tags,
    lifecycle: { mode: 'managed' },
    columns: [{ id: 'col-1', title: 'Todo', order: 0 }],
    tasks: [{ id: 'task-1', title: 'Projection task', columnId: 'col-1', status: 'todo' }],
  } as never as KanbanBoard;
}

describe('managed board session-ownership guard', () => {
  let dir: string;
  let replaced: TodoItem[][];

  beforeEach(async () => {
    mailboxMocks.send.mockClear();
    replaced = [];
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'wstack-kanban-guard-'));
  });

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  function makeContext(sessionId: string): Context {
    const todos: TodoItem[] = [];
    return {
      agentId: 'leader',
      projectRoot: dir,
      todos,
      meta: {},
      session: { id: sessionId },
      currentKanbanBoardId: 'board-1',
      state: {
        revision: 3,
        replaceTodos(next: TodoItem[]) {
          replaced.push([...next]);
          todos.splice(0, todos.length, ...next);
        },
      },
    } as never as Context;
  }

  it('blocks projection when the board is tagged as owned by another session', () => {
    const context = makeContext('session-a');
    const result = applyManagedKanbanBoardToTodos(
      context,
      makeBoard(['session:session-b']),
      new WeakSet(),
      { sessionOwnerFromTags },
    );
    // The bleed: a foreign session's board must not project into this
    // session's todo list, even when it is this context's active board.
    expect(result).toEqual([]);
    expect(replaced).toEqual([]);
    expect(context.todos).toEqual([]);
  });

  it('projects a board owned by this session', () => {
    const context = makeContext('session-a');
    applyManagedKanbanBoardToTodos(
      context,
      makeBoard(['session', 'session:session-a']),
      new WeakSet(),
      { sessionOwnerFromTags },
    );
    expect(replaced).toHaveLength(1);
    expect(replaced[0]![0]!.kanbanTaskId).toBe('task-1');
  });

  it('still projects an untagged shared project board', () => {
    const context = makeContext('session-a');
    applyManagedKanbanBoardToTodos(context, makeBoard([]), new WeakSet(), {
      sessionOwnerFromTags,
    });
    expect(replaced).toHaveLength(1);
  });

  it('is inert without an injected extractor — the production wrapper always injects', () => {
    const context = makeContext('session-a');
    applyManagedKanbanBoardToTodos(context, makeBoard(['session:session-b']), new WeakSet());
    expect(replaced).toHaveLength(1);
  });
});

describe('bindTodosToBoard archived and merged task binding guard (F505)', () => {
  it('strips dead bindings to archived tasks and redirects merged tasks', () => {
    const board: KanbanBoard = {
      id: 'board-test',
      title: 'Managed board',
      columns: [{ id: 'col-1', title: 'Todo', order: 0 }],
      tasks: [
        {
          id: 'task-active',
          title: 'Active task',
          columnId: 'col-1',
          status: 'todo',
          order: 0,
          createdAt: '2026-01-01T00:00:00.000Z',
        },
        {
          id: 'task-archived',
          title: 'Archived task',
          columnId: 'col-1',
          status: 'archived',
          order: 1,
          createdAt: '2026-01-01T00:00:00.000Z',
        },
        {
          id: 'task-merged-source',
          title: 'Merged source',
          columnId: 'col-1',
          status: 'todo',
          mergedIntoTaskId: 'task-merged-target',
          order: 2,
          createdAt: '2026-01-01T00:00:00.000Z',
        },
        {
          id: 'task-merged-target',
          title: 'Merged target',
          columnId: 'col-1',
          status: 'todo',
          order: 3,
          createdAt: '2026-01-01T00:00:00.000Z',
        },
      ],
    } as never as KanbanBoard;

    // Active task binding is kept
    const active = bindTodosToBoard(
      [
        {
          id: 't1',
          content: 'Active task',
          status: 'pending',
          kanbanBoardId: 'board-test',
          kanbanTaskId: 'task-active',
        },
      ],
      [],
      board,
    );
    expect(active[0]?.kanbanTaskId).toBe('task-active');

    // Archived task binding is stripped
    const archived = bindTodosToBoard(
      [
        {
          id: 't2',
          content: 'Archived task',
          status: 'pending',
          kanbanBoardId: 'board-test',
          kanbanTaskId: 'task-archived',
        },
      ],
      [],
      board,
    );
    expect(archived[0]?.kanbanTaskId).toBeUndefined();
    expect(archived[0]?.kanbanBoardId).toBeUndefined();

    // Merged task binding redirects to live target
    const merged = bindTodosToBoard(
      [
        {
          id: 't3',
          content: 'Merged task',
          status: 'pending',
          kanbanBoardId: 'board-test',
          kanbanTaskId: 'task-merged-source',
        },
      ],
      [],
      board,
    );
    expect(merged[0]?.kanbanTaskId).toBe('task-merged-target');
  });
});
