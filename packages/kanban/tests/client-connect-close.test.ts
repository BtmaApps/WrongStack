import { EventEmitter } from 'node:events';
import { afterEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ socket: undefined as unknown, creates: vi.fn(), spawn: vi.fn() }));
vi.mock('node:net', async (original) => ({
  ...(await original<typeof import('node:net')>()),
  createConnection: () => {
    h.creates();
    return h.socket;
  },
}));
vi.mock('node:child_process', async (original) => ({
  ...(await original<typeof import('node:child_process')>()),
  spawn: h.spawn,
}));
vi.mock('../src/server/endpoint.js', () => ({
  kanbanProjectServerEndpoint: () => 'fixture-endpoint',
}));

import { closeKanbanServerConnections, getKanbanServerConnection } from '../src/server/client.js';
import { KANBAN_PROJECT_SERVER_PROTOCOL_VERSION } from '../src/server/protocol.js';

afterEach(() => {
  closeKanbanServerConnections();
  vi.useRealTimers();
  h.creates.mockClear();
  h.spawn.mockReset();
});

describe('Kanban connection shutdown before socket assignment', () => {
  for (const lateHello of [false, true]) {
    it(`destroys a socket that connects after closeAll (lateHello=${lateHello})`, async () => {
      const socket = Object.assign(new EventEmitter(), {
        destroyed: false,
        setEncoding: vi.fn(),
        write: vi.fn(),
        destroy: vi.fn(() => {
          socket.destroyed = true;
          socket.emit('close');
          return socket;
        }),
      });
      h.socket = socket;
      const pending = getKanbanServerConnection(`fixture-${lateHello}`);
      void pending.catch(() => undefined);
      closeKanbanServerConnections();
      socket.emit('connect');
      await new Promise<void>((resolve) => setImmediate(resolve));
      if (lateHello)
        socket.emit(
          'data',
          JSON.stringify({
            type: 'hello',
            protocolVersion: KANBAN_PROJECT_SERVER_PROTOCOL_VERSION,
          }) + '\n',
        );
      await expect(pending).rejects.toThrow();
      expect(socket.destroyed).toBe(true);
      expect(socket.listenerCount('data')).toBe(0);
      expect(h.spawn).not.toHaveBeenCalled();
    });
  }
});
