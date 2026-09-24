import {
  type HostRouteHandlers,
  handleHostRoute,
  handleProcessRoute,
  type ProcessRouteHandlers,
} from '@wrongstack/webui-server';
import { describe, expect, it, vi } from 'vitest';
import type { WebSocket } from 'ws';

const ws = {} as WebSocket;

describe('canonical process and host routes', () => {
  it.each([
    ['process.list', 'list'],
    ['process.output', 'output'],
    ['process.kill', 'kill'],
    ['process.killAll', 'killAll'],
  ] as const)('dispatches %s', async (type, handlerName) => {
    const handlers: ProcessRouteHandlers = {
      list: vi.fn(),
      output: vi.fn(),
      kill: vi.fn(),
      killAll: vi.fn(),
    };
    const msg = { type, payload: {} };

    await expect(handleProcessRoute(ws, msg, handlers)).resolves.toBe(true);
    expect(handlers[handlerName]).toHaveBeenCalledWith(ws, msg);
  });

  it('dispatches webui.shutdown and rejects unrelated messages', async () => {
    const handlers: HostRouteHandlers = { shutdown: vi.fn() };
    const shutdown = { type: 'webui.shutdown' };

    await expect(handleHostRoute(ws, shutdown, handlers)).resolves.toBe(true);
    await expect(handleHostRoute(ws, { type: 'ping' }, handlers)).resolves.toBe(false);
    expect(handlers.shutdown).toHaveBeenCalledWith(ws, shutdown);
  });
});
