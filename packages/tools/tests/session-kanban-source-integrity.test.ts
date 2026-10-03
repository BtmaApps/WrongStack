import type { TodoItem } from '@wrongstack/core/agent';
import { loadPlan, loadTasks, savePlan, saveTasks } from '@wrongstack/core/storage';
import type { KanbanTask } from '@wrongstack/kanban';
import { addTask, createBoard, getBoard } from '@wrongstack/kanban/test-support';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { kanbanTool } from '../src/kanban.js';
import { applySessionKanbanTaskToSource } from '../src/session-kanban.js';
import { mkSandbox, newSignal, type Sandbox } from './fixtures.js';

describe('session Kanban source integrity', () => {
  let sb: Sandbox;
  beforeEach(async () => {
    sb = await mkSandbox();
    process.env.WRONGSTACK_KANBAN_TASK_MIRROR = '0';
  });
  afterEach(async () => {
    delete process.env.WRONGSTACK_KANBAN_TASK_MIRROR;
    await sb.cleanup();
  });
  const card = (source: 'todo' | 'plan' | 'task'): KanbanTask =>
    ({
      id: 'card',
      title: 'Accepted source',
      status: 'completed',
      origin: {
        system: `session-${source}`,
        graphId: `${source === 'task' ? 'session' : source}:test`,
        taskId: 'same',
      },
    }) as KanbanTask;

  it('does not overwrite a promoted source row that shares a local todo ID', async () => {
    const promoted: TodoItem = {
      id: 'same',
      content: 'Unrelated plan work',
      status: 'pending',
      promotedFromPlan: 'plan-parent',
    };
    sb.ctx.state.replaceTodos([promoted]);
    await applySessionKanbanTaskToSource(sb.ctx, card('todo'));
    expect(sb.ctx.todos).toEqual([promoted]);
  });
  it('updates the exact matching row rather than every row with its local ID', async () => {
    const promoted: TodoItem = {
      id: 'same',
      content: 'Unrelated task work',
      status: 'pending',
      promotedFromTask: 'task-parent',
    };
    sb.ctx.state.replaceTodos([
      { id: 'same', content: 'Todo source', status: 'pending' },
      promoted,
    ]);
    await applySessionKanbanTaskToSource(sb.ctx, card('todo'));
    expect(sb.ctx.todos.find((todo) => todo.promotedFromTask)?.status).toBe('pending');
    expect(sb.ctx.todos.find((todo) => !todo.promotedFromTask)?.status).toBe('completed');
  });
  it.each(['plan', 'task'] as const)(
    'updates the durable %s source even when a bound promoted todo exists',
    async (source) => {
      const path = `${sb.dir}/${source}.json`;
      const at = new Date().toISOString();
      sb.ctx.meta[`${source}.path`] = path;
      if (source === 'plan')
        await savePlan(path, {
          version: 1,
          sessionId: 'test',
          updatedAt: at,
          items: [{ id: 'same', title: 'Source', status: 'open', createdAt: at, updatedAt: at }],
        });
      else
        await saveTasks(path, {
          version: 1,
          sessionId: 'test',
          updatedAt: at,
          tasks: [
            {
              id: 'same',
              title: 'Source',
              type: 'feature',
              priority: 'medium',
              status: 'pending',
              createdAt: at,
              updatedAt: at,
            },
          ],
        });
      sb.ctx.state.replaceTodos([
        {
          id: 'projection',
          content: 'Source projection',
          status: 'pending',
          kanbanTaskId: 'card',
          ...(source === 'plan' ? { promotedFromPlan: 'same' } : { promotedFromTask: 'same' }),
        },
      ]);
      const result = await applySessionKanbanTaskToSource(sb.ctx, card(source));
      expect(result.source).toBe(source);
      if (source === 'plan') expect((await loadPlan(path))?.items[0]?.status).toBe('done');
      else expect((await loadTasks(path))?.tasks[0]?.status).toBe('completed');
      expect(sb.ctx.todos.every((todo) => todo.status === 'completed')).toBe(true);
    },
  );
  it('reports source synchronization failure after the board edit instead of claiming full success', async () => {
    const board = await createBoard(sb.dir, { title: 'Source sync' });
    const added = await addTask(sb.dir, board.id, { title: 'Source', origin: card('plan').origin });
    await expect(
      kanbanTool.execute(
        { action: 'update_task', boardId: board.id, taskId: added!.task.id, title: 'Changed' },
        sb.ctx,
        { signal: newSignal() },
      ),
    ).rejects.toThrow(/source|sync|plan.path/);
    expect((await getBoard(sb.dir, board.id))?.tasks[0]?.title).toBe('Changed');
  });
});
