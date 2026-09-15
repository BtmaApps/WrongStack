import type { TodoItem } from '@wrongstack/core/agent';
import { loadPlan, loadTasks, savePlan, saveTasks } from '@wrongstack/core/storage';
import type { KanbanTask } from '@wrongstack/kanban';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { applySessionKanbanTaskToSource } from '../src/session-kanban.js';
import { todoTool } from '../src/todo.js';
import { mkSandbox, newSignal, type Sandbox } from './fixtures.js';

describe('todo source identity', () => {
  let sb: Sandbox;
  beforeEach(async () => {
    sb = await mkSandbox();
    process.env.WRONGSTACK_KANBAN_TASK_MIRROR = '0';
  });
  afterEach(async () => {
    delete process.env.WRONGSTACK_KANBAN_TASK_MIRROR;
    await sb.cleanup();
  });

  async function seedSources() {
    const now = new Date().toISOString();
    const planPath = `${sb.dir}/plan.json`;
    const taskPath = `${sb.dir}/tasks.json`;
    sb.ctx.meta['plan.path'] = planPath;
    sb.ctx.meta['task.path'] = taskPath;
    await savePlan(planPath, {
      version: 1,
      sessionId: 'test',
      updatedAt: now,
      items: [{ id: 'same', title: 'Plan', status: 'open', createdAt: now, updatedAt: now }],
    });
    await saveTasks(taskPath, {
      version: 1,
      sessionId: 'test',
      updatedAt: now,
      tasks: [
        {
          id: 'same',
          title: 'Task',
          type: 'feature',
          priority: 'medium',
          status: 'pending',
          createdAt: now,
          updatedAt: now,
        },
      ],
    });
    return { planPath, taskPath };
  }

  it.each(['plan', 'task'] as const)(
    'preserves %s promotion when the model sends only schema fields',
    async (source) => {
      const { planPath, taskPath } = await seedSources();
      sb.ctx.state.replaceTodos([
        {
          id: 'row',
          content: 'Work',
          status: 'pending',
          ...(source === 'plan' ? { promotedFromPlan: 'same' } : { promotedFromTask: 'same' }),
        },
      ]);
      const result = await todoTool.execute(
        { todos: [{ id: 'row', content: 'Work', status: 'completed' }] },
        sb.ctx,
        { signal: newSignal() },
      );
      expect(result.count).toBe(1);
      expect(sb.ctx.todos.every((todo) => todo.status === 'completed')).toBe(true);
      if (source === 'plan') expect((await loadPlan(planPath))?.items[0]?.status).toBe('done');
      else expect((await loadTasks(taskPath))?.tasks[0]?.status).toBe('completed');
    },
  );

  it.each(['plan', 'task'] as const)(
    'does not mistake a %s origin for an unrelated todo with the same id',
    async (source) => {
      const { planPath, taskPath } = await seedSources();
      const todo: TodoItem = { id: 'same', content: 'Unrelated todo', status: 'pending' };
      sb.ctx.state.replaceTodos([todo]);
      const card = {
        id: 'card',
        title: 'Updated source',
        status: 'completed',
        origin: {
          system: `session-${source}`,
          taskId: 'same',
          graphId: `${source === 'task' ? 'session' : 'plan'}:test`,
        },
      } as KanbanTask;
      const result = await applySessionKanbanTaskToSource(sb.ctx, card);
      expect(result.source).toBe(source);
      expect(sb.ctx.todos).toEqual([todo]);
      if (source === 'plan') expect((await loadPlan(planPath))?.items[0]?.status).toBe('done');
      else expect((await loadTasks(taskPath))?.tasks[0]?.status).toBe('completed');
    },
  );

  it('does not mutate caller-owned rows while enforcing one active todo', async () => {
    const todos: TodoItem[] = [
      { id: '1', content: 'First', status: 'in_progress' },
      { id: '2', content: 'Second', status: 'in_progress' },
    ];
    const before = structuredClone(todos);
    await todoTool.execute({ todos }, sb.ctx, { signal: newSignal() });
    expect(todos).toEqual(before);
    expect(sb.ctx.todos.filter((todo) => todo.status === 'in_progress')).toHaveLength(1);
  });

  it.each(['todo', 'plan', 'task'] as const)(
    "does not project another session's %s card into this session",
    async (source) => {
      const { planPath, taskPath } = await seedSources();
      sb.ctx.state.replaceTodos([{ id: 'same', content: 'Local todo', status: 'pending' }]);
      const card = {
        id: 'foreign-card',
        title: 'Foreign work',
        status: 'completed',
        origin: {
          system: `session-${source}`,
          taskId: 'same',
          graphId: `${source === 'task' ? 'session' : source}:foreign-session`,
        },
      } as KanbanTask;
      expect(await applySessionKanbanTaskToSource(sb.ctx, card)).toEqual({ source: null });
      expect(sb.ctx.todos).toEqual([{ id: 'same', content: 'Local todo', status: 'pending' }]);
      expect((await loadPlan(planPath))?.items[0]?.status).toBe('open');
      expect((await loadTasks(taskPath))?.tasks[0]?.status).toBe('pending');
    },
  );
});
