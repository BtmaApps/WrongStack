import { beforeEach, expect, it, vi } from 'vitest';
import type { WebSocket } from 'ws';

const registry = vi.hoisted(() => ({
  kill: vi.fn(),
  bySession: vi.fn(() => []),
  get: vi.fn(() => ({ sessionId: 'owner', protected: true, logFile: 'fixture' })),
}));
vi.mock('@wrongstack/tools', () => ({
  getProcessRegistry: () => registry,
  tailBackgroundLog: () => ['fixture output'],
}));

import {
  handleProcessKill,
  handleProcessList,
  handleProcessOutput,
} from '../src/server/process-handlers.js';
import { handleProcessRoute, type ProcessRouteHandlers } from '../src/server/process-routes.js';

beforeEach(() => {
  vi.clearAllMocks();
  registry.get.mockReturnValue({ sessionId: 'owner', protected: true, logFile: 'fixture' });
});

it.each(['process.list', 'process.output', 'process.kill'] as const)(
  'correlates the actual %s response without changing its owner',
  async (type) => {
    const sent: { type: string; payload: Record<string, unknown> }[] = [];
    const ws = {
      readyState: 1,
      send: (text: string) => sent.push(JSON.parse(text)),
    } as unknown as WebSocket;
    const handlers: ProcessRouteHandlers = {
      list: (ws, msg) => handleProcessList(ws, msg),
      output: (ws, msg) => handleProcessOutput(ws, msg.payload),
      kill: (ws, msg) => handleProcessKill(ws, msg.payload),
      killAll: vi.fn(),
    };
    await handleProcessRoute(ws, { type, payload: { sessionId: 'owner', pid: 17 } }, handlers);
    expect(sent[0]?.type).toBe(type === 'process.kill' ? 'key.operation_result' : type);
    sent.length = 0;
    await handleProcessRoute(
      ws,
      { type, payload: { sessionId: 'owner', pid: 17, requestId: 'owned-request' } },
      handlers,
    );
    expect(sent[0]?.payload['requestId']).toBe('owned-request');
    if (type !== 'process.kill') expect(sent[0]?.payload['sessionId']).toBe('owner');
    else expect(sent[0]?.payload['success']).toBe(false);
  },
);

it('refuses termination when the reviewed PID now identifies a different process', async () => {
  registry.get.mockReturnValue({ sessionId: 'owner', protected: false, startedAt: 1000 } as never);
  registry.kill.mockClear();
  const sent: { payload: Record<string, unknown> }[] = [];
  const ws = {
    readyState: 1,
    send: (text: string) => sent.push(JSON.parse(text)),
  } as unknown as WebSocket;
  await handleProcessKill(ws, { pid: 17, sessionId: 'owner', expectedStartedAt: 2000 });
  expect(registry.kill).not.toHaveBeenCalled();
  expect(sent[0]?.payload['success']).toBe(false);
  expect(sent[0]?.payload['message']).toContain('changed');
  sent.length = 0;
  await handleProcessKill(ws, { pid: 17, sessionId: 'owner', expectedStartedAt: 1000 });
  expect(registry.kill).toHaveBeenCalledWith(17);
  expect(sent[0]?.payload['success']).toBe(true);
});

it('refuses a replaced process output and accepts the same reviewed identity', () => {
  registry.get.mockReturnValue({
    sessionId: 'owner',
    protected: false,
    startedAt: 1000,
    logFile: 'fixture',
  } as never);
  const sent: { payload: Record<string, unknown> }[] = [];
  const ws = {
    readyState: 1,
    send: (text: string) => sent.push(JSON.parse(text)),
  } as unknown as WebSocket;
  handleProcessOutput(ws, { pid: 17, sessionId: 'owner', expectedStartedAt: 2000 });
  expect(sent[0]?.payload['success']).toBe(false);
  expect(sent[0]?.payload['message']).toContain('changed');
  sent.length = 0;
  handleProcessOutput(ws, { pid: 17, sessionId: 'owner', expectedStartedAt: 1000 });
  expect(sent[0]?.payload['lines']).toEqual(['fixture output']);
});
