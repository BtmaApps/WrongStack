import { EventEmitter } from 'node:events';
import type * as net from 'node:net';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/atomic-write.js', () => ({
  withFileLock: async (_path: string, fn: () => Promise<unknown>) => fn(),
}));

import { _projectEndpointOps, bindProjectEndpoint } from '../src/project-endpoint.js';

const original = { ..._projectEndpointOps };
afterEach(() => {
  Object.assign(_projectEndpointOps, original);
  vi.useRealTimers();
});

describe('endpoint reclaim requires proof of an absent owner', () => {
  for (const code of [
    'EACCES',
    'EPERM',
    'EMFILE',
    'ETIMEDOUT',
    'ECONNRESET',
    'ENOTSOCK',
    'UNKNOWN',
    'TIMEOUT',
    'ECONNREFUSED',
    'ENOENT',
  ]) {
    it(`${code}: uncertain probe failures cannot remove an occupied endpoint`, async () => {
      vi.useFakeTimers();
      _projectEndpointOps.platform = 'linux';
      _projectEndpointOps.mkdir = vi.fn(async () => undefined) as never;
      _projectEndpointOps.chmod = vi.fn(async () => undefined) as never;
      _projectEndpointOps.stat = vi.fn(async () => ({
        uid: typeof process.getuid === 'function' ? process.getuid() : 0,
      })) as never;
      const remove = vi.fn(async () => undefined);
      _projectEndpointOps.rm = remove as never;
      const probe = Object.assign(new EventEmitter(), { destroy: vi.fn() });
      _projectEndpointOps.createConnection = (() => {
        if (code !== 'TIMEOUT')
          queueMicrotask(() => probe.emit('error', Object.assign(new Error(code), { code })));
        return probe;
      }) as never;
      let listens = 0;
      const server = Object.assign(new EventEmitter(), {
        listen: () => {
          queueMicrotask(() =>
            ++listens === 1
              ? server.emit('error', Object.assign(new Error('occupied'), { code: 'EADDRINUSE' }))
              : server.emit('listening'),
          );
        },
      });
      const pending = bindProjectEndpoint({
        server: server as unknown as net.Server,
        endpoint: '/tmp/fixture.sock',
        service: 'fixture',
      });
      await vi.advanceTimersByTimeAsync(5000);
      const result = await pending;
      if (code === 'ECONNREFUSED' || code === 'ENOENT') {
        expect(result).toEqual({ outcome: 'bound', reclaimedStaleEndpoint: true });
        expect(remove).toHaveBeenCalledOnce();
      } else {
        expect(remove).not.toHaveBeenCalled();
        expect(result.outcome).toBe('failed');
      }
      expect(probe.destroy).toHaveBeenCalledOnce();
    });
  }
});
