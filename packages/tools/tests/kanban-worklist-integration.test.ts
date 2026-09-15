import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { handleWorklistMessage } from '../../webui-server/src/server/handlers/worklist-handlers.js';
import { createSessionAwareWorklistContext } from '../../webui-server/src/server/worklist-session-context.js';
import { mkSandbox, type Sandbox } from './fixtures.js';

describe('human worklist mutations through the real session adapter', () => {
  let sb: Sandbox;
  beforeEach(async () => {
    sb = await mkSandbox();
    process.env.WRONGSTACK_KANBAN_TASK_MIRROR = '0';
    sb.ctx.state.replaceTodos([
      { id: 'one', content: 'First', status: 'pending' },
      { id: 'two', content: 'Second', status: 'pending' },
    ]);
  });
  afterEach(async () => {
    delete process.env.WRONGSTACK_KANBAN_TASK_MIRROR;
    await sb.cleanup();
  });

  it.each(['todos.clear', 'todos.remove'])('%s really removes unfinished rows', async (type) => {
    const send = vi.fn();
    const broadcast = vi.fn();
    const resolve = createSessionAwareWorklistContext({ rootContext: sb.ctx, send, broadcast });
    const message = { type, payload: { sessionId: 'test', id: 'one' } };
    await handleWorklistMessage(
      resolve(message),
      {} as Parameters<typeof handleWorklistMessage>[1],
      message,
    );
    const expected =
      type === 'todos.clear' ? [] : [{ id: 'two', content: 'Second', status: 'pending' }];
    expect(sb.ctx.todos).toEqual(expected);
    expect(broadcast).toHaveBeenCalledWith({
      type: 'todos.updated',
      payload: { sessionId: 'test', todos: expected },
    });
    expect(send).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ payload: expect.objectContaining({ success: true }) }),
    );
  });

  it('refuses an unknown session instead of modifying the foreground session', () => {
    const resolve = createSessionAwareWorklistContext({
      rootContext: sb.ctx,
      send: vi.fn(),
      broadcast: vi.fn(),
    });
    expect(() => resolve({ type: 'todos.clear', payload: { sessionId: 'missing' } })).toThrow(
      /session/i,
    );
    expect(sb.ctx.todos).toHaveLength(2);
  });
});
