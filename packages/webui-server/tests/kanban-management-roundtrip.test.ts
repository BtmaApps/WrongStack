import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Context } from '@wrongstack/core/agent';
import { addTask, createBoard, getBoard } from '@wrongstack/kanban/test-support';
import { kanbanTool } from '@wrongstack/tools/kanban';
import { expect, it, vi } from 'vitest';
import {
  createKanbanSupervisor,
  type KanbanSupervisorDispatchOptions,
} from '../src/server/kanban-supervisor.js';

it('runs the real board/tool/receipt lifecycle and keeps a completed review across supervisor restart', async () => {
  const root = await mkdtemp(join(tmpdir(), 'kanban-management-roundtrip-'));
  const board = await createBoard(root, { title: 'Leader todo board' });
  await addTask(root, board.id, {
    title: 'Clarify search fixture',
    description: 'The fixture is not available yet.',
  });
  await addTask(root, board.id, {
    title: 'Read the search specification',
    description: 'Read docs/search.md and summarize the accepted behavior.',
  });
  const dispatch = vi.fn(async (_prompt: string, options?: KanbanSupervisorDispatchOptions) => {
    const ctx = {
      projectRoot: root,
      signal: options!.signal!,
      session: { id: 'leader-session' },
      agentId: 'background-manager',
      meta: { kanban: options!.context!.kanban },
    } as unknown as Context;
    const read = await kanbanTool.execute({ action: 'get_board', boardId: board.id }, ctx, {
      signal: ctx.signal,
    });
    for (const task of read.board!.tasks) {
      await kanbanTool.execute(
        {
          action: 'review_task',
          boardId: board.id,
          taskId: task.id,
          reviewDisposition: task.title.includes('fixture') ? 'needs_leader' : 'adequate',
          note: task.title.includes('fixture')
            ? 'Leader must obtain a failing fixture.'
            : 'One explicit reading deliverable; no decomposition required.',
        },
        ctx,
        { signal: ctx.signal },
      );
    }
    await options!.onDone!({ status: 'completed', result: 'Reviewed both cards.' });
    return 'Manager finished.';
  });
  const deps = { projectRoot: root, broadcast: vi.fn(), dispatchTask: dispatch };
  let supervisor = createKanbanSupervisor(deps);
  try {
    const [snapshot] = await supervisor.auditNow(board.id);
    expect(snapshot?.status).toBe('healthy');
    expect(snapshot?.summary).toContain('Leader must obtain a failing fixture');
    const persisted = (await getBoard(root, board.id))!;
    expect(Object.keys(persisted.management?.reviews ?? {})).toHaveLength(2);
    expect(persisted.management?.pendingTaskIds).toEqual([]);
    expect(persisted.tasks.every((task) => task.status === 'pending')).toBe(true);
    supervisor.dispose();
    supervisor = createKanbanSupervisor(deps);
    const [resumed] = await supervisor.auditNow(board.id);
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(resumed?.summary).toContain('Leader must obtain a failing fixture');
  } finally {
    supervisor.dispose();
    await rm(root, { recursive: true, force: true });
  }
});
