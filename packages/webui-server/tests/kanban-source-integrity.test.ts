import type { Context } from '@wrongstack/core/agent';
import type { KanbanTask } from '@wrongstack/kanban';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const source = vi.hoisted(() => ({ apply: vi.fn() }));
vi.mock('@wrongstack/tools/session-kanban', () => ({
  applySessionKanbanTaskToSource: source.apply,
}));

import { syncSessionSource } from '../src/server/kanban-route-helpers.js';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function context(id = 'session-a') {
  return { session: { id }, projectRoot: 'D:/owned-project' } as unknown as Context;
}
beforeEach(() => source.apply.mockReset());
describe('Kanban source publication ownership', () => {
  it.each(['session', 'context', 'project', 'request-project'] as const)(
    'does not broadcast a previous source update after %s changes during the await',
    async (change) => {
      const pending = deferred<unknown>();
      source.apply.mockReturnValue(pending.promise);
      const ctx = { context: context(), projectRoot: 'D:/owned-project', broadcast: vi.fn() };
      const work = syncSessionSource(ctx, { id: 'card' } as KanbanTask);
      if (change === 'session') (ctx.context.session as { id: string }).id = 'session-b';
      else if (change === 'context') ctx.context = context('session-b');
      else if (change === 'request-project') ctx.projectRoot = 'D:/new-project';
      else ctx.context.projectRoot = 'D:/new-project';
      pending.resolve({
        source: 'plan',
        plan: { sessionId: 'session-a', items: [] },
        todos: [{ id: 'old', status: 'completed' }],
      });
      await work;
      expect(ctx.broadcast).not.toHaveBeenCalled();
    },
  );
  it('publishes both source and todo projection for the unchanged owning session', async () => {
    source.apply.mockResolvedValue({
      source: 'plan',
      plan: { sessionId: 'session-a', items: [] },
      todos: [],
    });
    const ctx = { context: context(), projectRoot: 'D:/owned-project', broadcast: vi.fn() };
    await syncSessionSource(ctx, { id: 'card' } as KanbanTask);
    expect(ctx.broadcast).toHaveBeenCalledWith({
      type: 'todos.updated',
      payload: { sessionId: 'session-a', todos: [] },
    });
    expect(ctx.broadcast).toHaveBeenCalledWith({
      type: 'plan.updated',
      payload: { sessionId: 'session-a', plan: { sessionId: 'session-a', items: [] } },
    });
  });
});
