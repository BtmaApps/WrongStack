import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  boards: [] as Array<{
    id: string;
    title?: string;
    kind?: string;
    updatedAt: string;
    columnCount?: number;
  }>,
  matches: [] as Array<{
    board: { id: string };
    task: { id: string; updatedAt: string; status?: string };
  }>,
}));

vi.mock('@wrongstack/kanban', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@wrongstack/kanban')>()),
  listBoards: vi.fn(async () => hoisted.boards),
  searchKanban: vi.fn(async () => hoisted.matches),
}));

import { handleKanbanBoardAction } from '../src/kanban-board-actions.js';

const ctx = { projectRoot: 'C:/p', cwd: 'C:/p' } as never;

async function run(input: Record<string, unknown>) {
  return (await handleKanbanBoardAction('C:/p', input as never, ctx)) as unknown as {
    message: string;
    stats?: Record<string, unknown>;
    boards?: { id: string }[];
    tasks?: { task: { id: string } }[];
  };
}

beforeEach(() => {
  hoisted.boards = [
    { id: 'old', kind: 'project', updatedAt: '2026-01-01T00:00:00Z' },
    { id: 'new', kind: 'project', updatedAt: '2026-10-01T00:00:00Z' },
    { id: 'gone', kind: 'archive', updatedAt: '2026-10-05T00:00:00Z' },
  ];
  hoisted.matches = ['a', 'b', 'c'].map((id, i) => ({
    board: { id: 'new' },
    task: { id, updatedAt: `2026-10-0${i + 1}T00:00:00Z` },
  }));
});

describe('kanban list reads: limit and archived boards', () => {
  it('returns everything in its usual order without a limit', async () => {
    const out = await run({ action: 'list_boards' });
    expect(out.boards!.map((b) => b.id)).toEqual(['old', 'new', 'gone']);
    expect(out.message).toBe('3 board(s).');
    const tasks = await run({ action: 'search_tasks' });
    expect(tasks.tasks!.map((t) => t.task.id)).toEqual(['a', 'b', 'c']);
    expect(tasks.message).toBe('3 task(s) matched.');
  });

  it('bounds boards to the most recently updated and says how many exist', async () => {
    const out = await run({ action: 'list_boards', limit: 2 });
    expect(out.boards!.map((b) => b.id)).toEqual(['gone', 'new']);
    expect(out.message).toBe('2 of 3 board(s), most recently updated first.');
  });

  it('hides archived boards only when asked', async () => {
    const out = await run({ action: 'list_boards', includeArchived: false, limit: 5 });
    expect(out.boards!.map((b) => b.id)).toEqual(['new', 'old']);
    expect(out.message).toBe('2 of 2 board(s), most recently updated first.');
  });

  it('bounds task matches to the most recently updated', async () => {
    const out = await run({ action: 'search_tasks', limit: 2 });
    expect(out.tasks!.map((t) => t.task.id)).toEqual(['c', 'b']);
    expect(out.message).toBe('2 of 3 task(s) matched, most recently updated first.');
  });

  it('ignores a non-positive or non-numeric limit', async () => {
    for (const limit of [0, -1, Number.NaN, '5']) {
      const out = await run({ action: 'search_tasks', limit });
      expect(out.tasks).toHaveLength(3);
    }
  });
});

describe('kanban stats', () => {
  it('returns project totals in one small payload', async () => {
    hoisted.boards = [
      { id: 'p', title: 'Project', kind: 'project', updatedAt: '2026-10-01', columnCount: 5 },
      {
        id: 's',
        title: 'Session',
        kind: 'session_mirror',
        updatedAt: '2026-10-09',
        columnCount: 5,
      },
      { id: 'x', title: 'Legacy', updatedAt: '2026-01-01', columnCount: 3 },
    ];
    hoisted.matches = [
      { board: { id: 'p' }, task: { id: 'a', updatedAt: '1', status: 'done' } },
      { board: { id: 'p' }, task: { id: 'b', updatedAt: '2', status: 'pending' } },
      { board: { id: 's' }, task: { id: 'c', updatedAt: '3', status: 'done' } },
    ];
    const out = await run({ action: 'stats' });
    expect(out.message).toBe('3 board(s), 13 column(s), 3 card(s).');
    expect(out.stats).toEqual({
      boards: 3,
      boardsByKind: { project: 2, session_mirror: 1 },
      columns: 13,
      cards: 3,
      cardsByStatus: { done: 2, pending: 1 },
      mostRecentlyUpdatedBoard: { id: 's', title: 'Session', updatedAt: '2026-10-09' },
    });
    expect(JSON.stringify(out).length).toBeLessThan(600);
  });

  it('narrows to one board and rejects an unknown one', async () => {
    const one = await run({ action: 'stats', boardId: 'old' });
    expect(one.stats).toMatchObject({ boards: 1, boardsByKind: { project: 1 } });
    await expect(run({ action: 'stats', boardId: 'nope' })).rejects.toThrow('Board not found');
  });
});
