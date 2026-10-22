import { EventEmitter } from 'node:events';
import type { Context } from '@wrongstack/core/agent';
import type { MCPRegistry } from '@wrongstack/mcp';
import { afterEach, expect, it, vi } from 'vitest';
import type { WebSocket } from 'ws';
import { createMcpTaskHandlers } from '../src/server/mcp-task-handlers.js';
import { handleMcpRoute } from '../src/server/mcp-routes.js';

const cleanup: Array<() => void> = [];
afterEach(() => {
  for (const stop of cleanup.splice(0)) stop();
  vi.useRealTimers();
});
function fixture() {
  const frames: Array<{ type: string; payload: Record<string, unknown> }> = [];
  const ws = Object.assign(new EventEmitter(), {
    readyState: 1,
    bufferedAmount: 0,
    send: (data: string) => frames.push(JSON.parse(data)),
  });
  cleanup.push(() => {
    ws.readyState = 3;
    ws.emit('close');
  });
  const context = { session: { id: 'tab-a' }, agentId: 'leader' } as Context;
  let current: Context | undefined = context;
  let changed = () => {},
    closed = () => {};
  const off = vi.fn();
  const rows = [
    {
      id: 'receipt',
      server: 'build',
      tool: 'compile',
      status: 'working',
      createdAt: '2026-10-22T00:00:00Z',
      lastUpdatedAt: '2026-10-22T00:00:00Z',
      delivered: false,
      leaseExpiresAt: Date.now() + 100,
      taskId: 'SECRET-REMOTE',
      binding: 'SECRET-ACCOUNT',
      answeredInputs: { SECRET: 'HASH' },
    },
  ];
  const registry = {
    listTasks: vi.fn(async () => rows),
    subscribeTasks: vi.fn(async (_ctx: Context, change: () => void, close: () => void) => {
      changed = change;
      closed = close;
      return off;
    }),
  };
  const handlers = createMcpTaskHandlers({
    registry: registry as unknown as MCPRegistry,
    context: (id) => (id === 'tab-a' ? current : undefined),
  });
  const route = (type = 'mcp.tasks.subscribe', requestId = 'watch', sessionId = 'tab-a') =>
    handleMcpRoute(
      ws as unknown as WebSocket,
      { type, payload: { sessionId, requestId } },
      handlers as never,
    );
  return {
    frames,
    ws,
    rows,
    context,
    registry,
    off,
    route,
    changed: () => changed(),
    closed: () => closed(),
    swap: (ctx?: Context) => {
      current = ctx;
    },
  };
}
it('pushes scoped safe snapshots, deduplicates invalidations, and cleans up on socket close', async () => {
  const f = fixture();
  await f.route();
  expect(f.frames).toHaveLength(1);
  expect(f.frames[0]).toMatchObject({
    type: 'mcp.tasks.changed',
    payload: {
      requestId: 'watch',
      sessionId: 'tab-a',
      revision: 1,
      tasks: [{ status: 'working', observing: true }],
    },
  });
  expect(JSON.stringify(f.frames)).not.toContain('SECRET');
  expect(JSON.stringify(f.frames)).not.toContain('lease');
  f.changed();
  await vi.waitFor(() => expect(f.registry.listTasks).toHaveBeenCalledTimes(2));
  expect(f.frames).toHaveLength(1);
  f.rows[0]!.status = 'completed';
  f.rows[0]!.delivered = true;
  f.changed();
  await vi.waitFor(() => expect(f.frames).toHaveLength(2));
  expect(f.frames[1]!.payload).toMatchObject({
    revision: 2,
    tasks: [{ status: 'completed', delivered: true, observing: false }],
  });
  f.ws.emit('close');
  expect(f.off).toHaveBeenCalledTimes(1);
  f.changed();
  expect(f.frames).toHaveLength(2);
});
it('rejects unknown owners and drops a snapshot if the captured agent changes during a read', async () => {
  const f = fixture();
  await f.route(undefined, 'foreign', 'tab-b');
  expect(f.registry.subscribeTasks).not.toHaveBeenCalled();
  expect(f.frames[0]!.payload.success).toBe(false);
  f.registry.listTasks.mockImplementationOnce(async () => {
    f.context.agentId = 'other';
    return f.rows;
  });
  await f.route();
  expect(f.frames.every((frame) => frame.type === 'mcp.tasks.result')).toBe(true);
  expect(f.off).toHaveBeenCalledTimes(1);
});
it('keeps a new subscription when a delayed unsubscribe for the old ID arrives', async () => {
  const f = fixture();
  await f.route();
  await f.route(undefined, 'new');
  expect(f.ws.listenerCount('close')).toBe(1);
  expect(f.off).toHaveBeenCalledTimes(1);
  await f.route('mcp.tasks.unsubscribe');
  f.rows[0]!.status = 'failed';
  f.changed();
  await vi.waitFor(() =>
    expect(f.frames.at(-1)!.payload).toMatchObject({ requestId: 'new', revision: 2 }),
  );
  await f.route('mcp.tasks.unsubscribe', 'new');
  expect(f.ws.listenerCount('close')).toBe(0);
  expect(f.off).toHaveBeenCalledTimes(2);
});
it('expires a crashed observer lease without another journal write', async () => {
  vi.useFakeTimers();
  const f = fixture();
  await f.route();
  await vi.advanceTimersByTimeAsync(110);
  expect(f.frames.at(-1)!.payload).toMatchObject({ revision: 2, tasks: [{ observing: false }] });
});
it('releases subscriptions on host shutdown and stops slow consumers', async () => {
  const f = fixture();
  await f.route();
  f.closed();
  expect(f.off).toHaveBeenCalledTimes(1);
  expect(f.frames.at(-1)!.payload.success).toBe(false);
  await f.route(undefined, 'new');
  f.ws.bufferedAmount = 2_000_000;
  f.changed();
  await vi.waitFor(() => expect(f.off).toHaveBeenCalledTimes(2));
  expect(f.ws.listenerCount('close')).toBe(0);
});
