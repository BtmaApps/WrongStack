import * as storage from '@wrongstack/core/storage';
import { withFileLock } from '@wrongstack/core/utils';
import { createBoard, getBoard } from '@wrongstack/kanban';
import { addTask } from '@wrongstack/kanban/test-support';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { kanbanTool } from '../src/kanban.js';
import { todoTool } from '../src/todo.js';
import { mkSandbox, newSignal, type Sandbox } from './fixtures.js';

describe('todo parent completion persistence', () => {
  let sb: Sandbox;
  beforeEach(async () => {
    sb = await mkSandbox();
    process.env.WRONGSTACK_KANBAN_TASK_MIRROR = '0';
  });
  afterEach(async () => {
    vi.restoreAllMocks();
    delete process.env.WRONGSTACK_KANBAN_TASK_MIRROR;
    await sb.cleanup();
  });

  async function seed(source: 'plan' | 'task') {
    const file = `${sb.dir}/${source}.json`;
    const now = new Date().toISOString();
    sb.ctx.meta[`${source}.path`] = file;
    if (source === 'plan') {
      await storage.savePlan(file, {
        version: 1,
        sessionId: 'test',
        updatedAt: now,
        items: [
          { id: 'parent', title: 'Original', status: 'open', createdAt: now, updatedAt: now },
        ],
      });
    } else {
      await storage.saveTasks(file, {
        version: 1,
        sessionId: 'test',
        updatedAt: now,
        tasks: [
          {
            id: 'parent',
            title: 'Original',
            status: 'pending',
            type: 'feature',
            priority: 'medium',
            createdAt: now,
            updatedAt: now,
          },
        ],
      });
    }
    return file;
  }

  function complete(source: 'plan' | 'task') {
    return todoTool.execute(
      {
        todos: [
          {
            id: 'row',
            content: 'Work',
            status: 'completed',
            ...(source === 'plan'
              ? { promotedFromPlan: 'parent' }
              : { promotedFromTask: 'parent' }),
          },
        ],
      },
      sb.ctx,
      { signal: newSignal() },
    );
  }

  it('completes a numeric plan ID by identity, not by list position', async () => {
    const file = await seed('plan');
    const plan = (await storage.loadPlan(file))!;
    plan.items[0]!.id = '1';
    plan.items.unshift({ ...plan.items[0]!, id: 'unrelated', title: 'Must stay open' });
    await storage.savePlan(file, plan);
    await todoTool.execute(
      { todos: [{ id: 'row', content: 'Work', status: 'completed', promotedFromPlan: '1' }] },
      sb.ctx,
      { signal: newSignal() },
    );
    expect((await storage.loadPlan(file))?.items.map((item) => [item.id, item.status])).toEqual([
      ['unrelated', 'open'],
      ['1', 'done'],
    ]);
  });

  it.each(['plan', 'task'] as const)(
    'serializes %s rollup with another file writer',
    async (source) => {
      const file = await seed(source);
      const entered = Promise.withResolvers<void>();
      const release = Promise.withResolvers<void>();
      const writer = withFileLock(file, async () => {
        const snapshot =
          source === 'plan' ? await storage.loadPlan(file) : await storage.loadTasks(file);
        entered.resolve();
        await release.promise;
        if (snapshot && 'items' in snapshot) {
          snapshot.items[0]!.title = 'Concurrent edit';
          await storage.savePlan(file, snapshot);
        } else if (snapshot) {
          snapshot.tasks[0]!.title = 'Concurrent edit';
          await storage.saveTasks(file, snapshot);
        }
      });
      await entered.promise;
      const completion = complete(source);
      let result: string;
      try {
        result = await Promise.race([
          completion.then(() => 'finished'),
          new Promise<string>((resolve) => setTimeout(() => resolve('waiting'), 150)),
        ]);
      } finally {
        release.resolve();
        await writer;
        await completion;
      }
      expect(result).toBe('waiting');
      const snapshot =
        source === 'plan' ? await storage.loadPlan(file) : await storage.loadTasks(file);
      const parent = snapshot && ('items' in snapshot ? snapshot.items[0] : snapshot.tasks[0]);
      expect(parent?.title).toBe('Concurrent edit');
      expect(parent?.status).toBe(source === 'plan' ? 'done' : 'completed');
    },
  );

  it.each(['plan', 'task'] as const)('reports a failed %s save to the caller', async (source) => {
    const file = await seed(source);
    if (source === 'plan') vi.spyOn(storage, 'savePlan').mockResolvedValueOnce(false);
    else vi.spyOn(storage, 'saveTasks').mockResolvedValueOnce(false);
    const result = await complete(source);
    expect(result.kanban_warnings?.join(' ')).toMatch(/not saved/i);
    const snapshot =
      source === 'plan' ? await storage.loadPlan(file) : await storage.loadTasks(file);
    const parent = snapshot && ('items' in snapshot ? snapshot.items[0] : snapshot.tasks[0]);
    expect(parent?.status).toBe(source === 'plan' ? 'open' : 'pending');
  });

  it.each(['plan', 'task'] as const)(
    'does not complete the parent %s when Kanban refuses completion',
    async (source) => {
      const file = await seed(source);
      const board = await createBoard(sb.dir, {
        title: 'Refused completion',
        lifecycle: {
          mode: 'managed',
          columns: {
            backlog: 'backlog',
            todo: 'todo',
            running: 'in-progress',
            review: 'review',
            done: 'done',
          },
        },
      });
      const added = await addTask(sb.dir, board.id, {
        title: 'Work',
        description: 'Work awaiting approval',
      });
      sb.ctx.currentKanbanBoardId = board.id;
      sb.ctx.setCurrentKanbanTask = (taskId, boardId) => {
        sb.ctx.currentKanbanTaskId = taskId;
        sb.ctx.currentKanbanBoardId = boardId;
      };
      sb.ctx.state.replaceTodos([
        {
          id: 'row',
          content: 'Work',
          status: 'pending',
          kanbanBoardId: board.id,
          kanbanTaskId: added!.task.id,
          ...(source === 'plan' ? { promotedFromPlan: 'parent' } : { promotedFromTask: 'parent' }),
        },
      ]);
      vi.spyOn(kanbanTool, 'execute').mockRejectedValue(new Error('Completion refused'));
      // Mirror ConversationState's all-completed auto-clear: the source
      // metadata must survive even when the optimistic list is now empty.
      const replaceTodos = sb.ctx.state.replaceTodos.bind(sb.ctx.state);
      sb.ctx.state.replaceTodos = (todos) =>
        replaceTodos(todos.every((todo) => todo.status === 'completed') ? [] : todos);
      const result = await complete(source);
      expect(result.kanban_warnings?.join(' ')).toContain('Completion refused');
      expect((await getBoard(sb.dir, board.id))?.tasks[0]?.status).not.toBe('completed');
      const snapshot =
        source === 'plan' ? await storage.loadPlan(file) : await storage.loadTasks(file);
      const parent = snapshot && ('items' in snapshot ? snapshot.items[0] : snapshot.tasks[0]);
      expect(parent?.status).toBe(source === 'plan' ? 'open' : 'pending');
      expect(sb.ctx.todos[0]?.[source === 'plan' ? 'promotedFromPlan' : 'promotedFromTask']).toBe(
        'parent',
      );
    },
  );
});
