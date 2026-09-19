import { afterEach, describe, expect, it, vi } from 'vitest';
import { SageProjectServerConnection } from '../src/project-server-client.js';

interface Pending {
  reject(error: unknown): void;
  timer: ReturnType<typeof setTimeout>;
  onAbort?: () => void;
}
interface Internals {
  socket: object;
  pending: Map<number, Pending>;
  request(message: unknown, options: unknown): Promise<unknown>;
  cleanupPending(entry: Pending): void;
  close(): void;
}

function fixture() {
  const conn = new SageProjectServerConnection('request-cleanup-project') as unknown as Internals;
  const write = vi.fn(() => true);
  conn.socket = { destroyed: false, writableLength: 0, write, destroy() {} };
  const controller = new AbortController();
  const request = (args: unknown = {}) =>
    conn.request(
      { type: 'request', op: 'ping', args, meta: { clientId: 'test-client' } },
      { signal: controller.signal, timeoutMs: 10 },
    );
  return { conn, write, controller, request };
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('SAGE request resource cleanup', () => {
  it.each(['serialization', 'write'])(
    'cleans resources after a synchronous %s failure',
    async (kind) => {
      const { conn, write, controller, request } = fixture();
      const remove = vi.spyOn(controller.signal, 'removeEventListener');
      const failure = new Error('send failed');
      if (kind === 'write')
        write.mockImplementationOnce(() => {
          throw failure;
        });
      try {
        await expect(
          request(
            kind === 'serialization'
              ? {
                  toJSON() {
                    throw failure;
                  },
                }
              : {},
          ),
        ).rejects.toBe(failure);
        expect(conn.pending.size).toBe(0);
        expect(remove).toHaveBeenCalledWith('abort', expect.any(Function));
      } finally {
        conn.close();
      }
    },
  );

  it.each(['abort', 'timeout'])(
    'settles %s even when sending the cancel frame throws',
    async (kind) => {
      vi.useFakeTimers();
      const { conn, write, controller, request } = fixture();
      const remove = vi.spyOn(controller.signal, 'removeEventListener');
      const pending = request();
      const outcome = pending.then(
        () => 'resolved',
        (error: unknown) => error,
      );
      const entry = [...conn.pending.values()][0]!;
      write.mockImplementationOnce(() => {
        throw new Error('cancel write failed');
      });
      try {
        if (kind === 'abort') expect(() => entry.onAbort!()).not.toThrow();
        else await vi.advanceTimersByTimeAsync(10);
        const result = await outcome;
        expect(result).toBeInstanceOf(Error);
        expect((result as Error).message).toContain(kind === 'abort' ? 'cancelled' : 'timeout');
        expect(conn.pending.size).toBe(0);
        expect(remove).toHaveBeenCalledWith('abort', entry.onAbort);
      } finally {
        // The pre-fix cancel path removed this entry without settling or cleaning it.
        conn.cleanupPending(entry);
        entry.reject(new Error('test cleanup'));
        conn.close();
        await outcome;
      }
    },
  );
});
