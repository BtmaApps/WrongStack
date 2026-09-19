import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Context } from '@wrongstack/core/agent';
import { claimBoardManagement, finishBoardManagement } from '@wrongstack/kanban';
import {
  addTask,
  createBoard,
  getBoard,
  setTaskChain,
  updateTask,
} from '@wrongstack/kanban/test-support';
import { afterEach, expect, it } from 'vitest';
import { kanbanTool as runtimeKanbanTool } from '../src/kanban.js';

const kanbanTool = {
  execute(input: Parameters<typeof runtimeKanbanTool.execute>[0], ctx: Context) {
    return runtimeKanbanTool.execute(input, ctx, { signal: ctx.signal });
  },
};

const execute = kanbanTool.execute;

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function setup() {
  const root = await mkdtemp(join(tmpdir(), 'kanban-manager-flow-'));
  roots.push(root);
  const board = await createBoard(root, {
    title: 'Leader tasks',
    atomicity: { mode: 'assess', decomposition: 'auto' },
  });
  const created = await addTask(root, board.id, {
    title: 'Implement search',
    description: 'Initial scope',
  });
  await claimBoardManagement(root, board.id, {
    token: 'manager',
    fingerprint: 'v1',
    cooldownMs: 0,
  });
  const ctx = {
    projectRoot: root,
    signal: new AbortController().signal,
    session: { id: 'manager-session' },
    agentId: 'kanban-manager',
    meta: { kanban: { boardId: board.id, managementToken: 'manager' } },
  } as unknown as Context;
  return { root, boardId: board.id, taskId: created!.task.id, ctx };
}

it('records card coverage and passes unresolved decisions to the leader without completing tasks', async () => {
  const { root, boardId, taskId, ctx } = await setup();
  await execute({ action: 'get_board', boardId }, ctx);
  await execute(
    {
      action: 'review_task',
      boardId,
      taskId,
      reviewDisposition: 'needs_leader',
      note: 'Obtain the failing search fixture before implementation.',
    },
    ctx,
  );
  await finishBoardManagement(root, boardId, 'manager', {
    status: 'completed',
    result: 'Review finished.',
  });
  const board = (await getBoard(root, boardId))!;
  expect(board.management?.status).toBe('completed');
  expect(board.management?.reviews?.[taskId]?.disposition).toBe('needs_leader');
  expect(board.management?.summary).toContain('Obtain the failing search fixture');
  expect(board.tasks[0]!.status).toBe('pending');
  expect(
    await claimBoardManagement(root, boardId, {
      token: 'another-host',
      fingerprint: 'v1',
      cooldownMs: 0,
    }),
  ).toBe(false);
});

it('rejects coverage recorded before a leader edit and allows another host to retry', async () => {
  const { root, boardId, taskId, ctx } = await setup();
  await execute({ action: 'get_board', boardId }, ctx);
  await execute(
    {
      action: 'review_task',
      boardId,
      taskId,
      reviewDisposition: 'adequate',
      note: 'Scope is sufficient for this small task.',
    },
    ctx,
  );
  await updateTask(root, boardId, taskId, { description: 'New leader requirements' });
  await finishBoardManagement(root, boardId, 'manager', { status: 'completed' });
  const board = (await getBoard(root, boardId))!;
  expect(board.management?.status).toBe('failed');
  expect(board.management?.pendingTaskIds).toEqual([taskId]);
  expect(board.management?.reviewedFingerprint).toBeUndefined();
  expect(
    await claimBoardManagement(root, boardId, {
      token: 'new-host',
      fingerprint: 'v1',
      cooldownMs: 0,
    }),
  ).toBe(true);
});

it('resumes an incomplete review from still-current receipts instead of starting over', async () => {
  const { root, boardId, taskId, ctx } = await setup();
  const next = (await addTask(root, boardId, { title: 'Second task' }))!.task;
  await execute({ action: 'get_board', boardId }, ctx);
  await execute(
    {
      action: 'review_task',
      boardId,
      taskId,
      reviewDisposition: 'adequate',
      note: 'The first card has sufficient detail.',
    },
    ctx,
  );
  await finishBoardManagement(root, boardId, 'manager', {
    status: 'failed',
    error: 'Provider disconnected.',
  });
  await claimBoardManagement(root, boardId, {
    token: 'replacement',
    fingerprint: 'v2',
    cooldownMs: 0,
  });
  const resumed = (await getBoard(root, boardId))!;
  expect(resumed.management?.lease?.reviews?.[taskId]?.disposition).toBe('adequate');
  expect(resumed.management?.pendingTaskIds).toEqual([next.id]);
  ctx.meta['kanban'] = { boardId, managementToken: 'replacement' };
  await execute({ action: 'get_board', boardId }, ctx);
  await execute(
    {
      action: 'review_task',
      boardId,
      taskId: next.id,
      reviewDisposition: 'needs_leader',
      note: 'Leader must specify the second task deliverable.',
    },
    ctx,
  );
  await finishBoardManagement(root, boardId, 'replacement', { status: 'completed' });
  expect((await getBoard(root, boardId))!.management?.status).toBe('completed');
});

it('requires a live read, carries the fence through real handlers, and refuses stale authoring', async () => {
  const { root, boardId, taskId, ctx } = await setup();
  await expect(
    execute({ action: 'update_task', boardId, taskId, description: 'Blind edit' }, ctx),
  ).rejects.toThrow('has not been read');
  await execute({ action: 'get_board', boardId }, ctx);
  await execute(
    {
      action: 'update_task',
      boardId,
      taskId,
      description: 'Specific outcome and verification plan',
    },
    ctx,
  );
  await execute(
    {
      action: 'add_check',
      boardId,
      taskId,
      checkDescription: 'The fixture is found',
      checkStatus: 'pending',
    },
    ctx,
  );
  await updateTask(root, boardId, taskId, { description: 'New human scope' });
  await expect(
    execute({ action: 'update_task', boardId, taskId, description: 'Outdated scope' }, ctx),
  ).rejects.toThrow('changed');
  expect((await getBoard(root, boardId))!.tasks[0]!.description).toBe('New human scope');
  await execute({ action: 'get_board', boardId }, ctx);
  await execute(
    { action: 'add_note', boardId, taskId, note: 'Needs a failing reproduction.' },
    ctx,
  );
  expect((await getBoard(root, boardId))!.tasks[0]!.notes?.[0]?.author).toBe('kanban-manager');
});

it('keeps a pending assigned card read-only except for proposal notes', async () => {
  const { root, boardId, taskId, ctx } = await setup();
  await updateTask(root, boardId, taskId, { assignee: 'leader' });
  await kanbanTool.execute({ action: 'get_board', boardId }, ctx);
  await expect(
    kanbanTool.execute(
      { action: 'update_task', boardId, taskId, description: 'Changed scope' },
      ctx,
    ),
  ).rejects.toThrow('owned by a worker');
  await kanbanTool.execute(
    { action: 'add_note', boardId, taskId, note: 'Proposed scope clarification for the leader.' },
    ctx,
  );
  expect((await getBoard(root, boardId))!.tasks[0]!.description).toBe('Initial scope');
});

it('a manager proposal does not apply an automatic decomposition through the tool', async () => {
  const { root, boardId, taskId, ctx } = await setup();
  await execute({ action: 'get_board', boardId }, ctx);
  await execute(
    {
      action: 'propose_decomposition',
      boardId,
      taskId,
      subtasks: [{ title: 'Index' }, { title: 'Query' }],
    },
    ctx,
  );
  const board = (await getBoard(root, boardId))!;
  expect(board.tasks).toHaveLength(1);
  expect(board.tasks[0]!.decomposition?.status).toBe('proposed');
});

it('cannot implicitly rewrite a worker-owned member by moving its peer to a new chain', async () => {
  const { root, boardId, taskId, ctx } = await setup();
  const second = (await addTask(root, boardId, { title: 'Second' }))!.task;
  const third = (await addTask(root, boardId, { title: 'Third' }))!.task;
  await setTaskChain(root, boardId, { taskIds: [taskId, second.id] });
  await updateTask(root, boardId, second.id, { status: 'in_progress' });
  await execute({ action: 'get_board', boardId }, ctx);
  const before = (await getBoard(root, boardId))!.tasks.map((task) => task.chain);
  await expect(
    execute({ action: 'set_chain', boardId, taskIds: [taskId, third.id] }, ctx),
  ).rejects.toThrow('worker-owned');
  expect((await getBoard(root, boardId))!.tasks.map((task) => task.chain)).toEqual(before);
});
