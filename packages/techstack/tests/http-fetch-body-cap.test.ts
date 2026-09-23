import type { ClientRequest, IncomingMessage } from 'node:http';
import { afterEach, describe, expect, it, vi } from 'vitest';

// Mock the transport so requestOnce's data/end handling can be driven
// deterministically without real network I/O.
vi.mock('node:https', () => ({ get: vi.fn(), request: vi.fn() }));
vi.mock('node:http', () => ({ get: vi.fn(), request: vi.fn() }));

import { get as httpsGet } from 'node:https';
import { requestWithRetry } from '../src/registry/http-fetch.js';

interface FakeResponse extends IncomingMessage {
  _emit(event: string, arg?: unknown): void;
}

function fakeResponse(): FakeResponse {
  const listeners: Record<string, Array<(arg?: unknown) => void>> = {};
  let destroyed = false;
  return {
    statusCode: 200,
    headers: {},
    setEncoding() {},
    destroy() {
      destroyed = true;
    },
    get destroyed() {
      return destroyed;
    },
    on(event: string, cb: (arg?: unknown) => void) {
      const bucket = listeners[event] ?? [];
      bucket.push(cb);
      listeners[event] = bucket;
      return this;
    },
    _emit(event: string, arg?: unknown) {
      for (const cb of listeners[event] ?? []) cb(arg);
    },
  } as unknown as FakeResponse;
}

describe('requestWithRetry body cap', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('rejects once the streamed body exceeds maxBodyBytes', async () => {
    const res = fakeResponse();
    vi.mocked(httpsGet).mockImplementation(((_opts: unknown, cb: (r: IncomingMessage) => void) => {
      cb(res);
      // Emit two 400-byte chunks: the second crosses the 500-byte cap.
      setTimeout(() => {
        res._emit('data', 'a'.repeat(400));
        res._emit('data', 'b'.repeat(400));
        // A well-behaved server would also emit 'end', but the cap must fire
        // before that; emit it anyway to prove resolve-after-reject is a no-op.
        res._emit('end');
      }, 0);
      const req: Partial<ClientRequest> = {
        on: vi.fn(() => req as ClientRequest),
        end: vi.fn(),
        write: vi.fn(),
      };
      return req as ClientRequest;
    }) as typeof httpsGet);

    await expect(
      requestWithRetry({
        hostname: 'registry.example',
        path: '/big',
        maxAttempts: 1,
        maxBodyBytes: 500,
      }),
    ).rejects.toThrow(/exceeded 500 bytes/);
    expect(res.destroyed).toBe(true);
  });

  it('measures UTF-8 body limits in bytes rather than JavaScript string length', async () => {
    const res = fakeResponse();
    vi.mocked(httpsGet).mockImplementation(((_opts: unknown, cb: (r: IncomingMessage) => void) => {
      cb(res);
      setTimeout(() => {
        // Two emoji occupy four UTF-16 code units but eight UTF-8 bytes.
        res._emit('data', '😀😀');
        res._emit('end');
      }, 0);
      const req: Partial<ClientRequest> = {
        on: vi.fn(() => req as ClientRequest),
        end: vi.fn(),
        write: vi.fn(),
      };
      return req as ClientRequest;
    }) as typeof httpsGet);

    await expect(
      requestWithRetry({
        hostname: 'registry.example',
        path: '/utf8-over-cap',
        maxAttempts: 1,
        maxBodyBytes: 5,
      }),
    ).rejects.toThrow(/exceeded 5 bytes/);
    expect(res.destroyed).toBe(true);
  });

  it('returns the full body when under the cap', async () => {
    const res = fakeResponse();
    vi.mocked(httpsGet).mockImplementation(((_opts: unknown, cb: (r: IncomingMessage) => void) => {
      cb(res);
      setTimeout(() => {
        res._emit('data', 'hello');
        res._emit('end');
      }, 0);
      const req: Partial<ClientRequest> = {
        on: vi.fn(() => req as ClientRequest),
        end: vi.fn(),
        write: vi.fn(),
      };
      return req as ClientRequest;
    }) as typeof httpsGet);

    const out = await requestWithRetry({
      hostname: 'registry.example',
      path: '/small',
      maxAttempts: 1,
      maxBodyBytes: 500,
    });
    expect(out.body).toBe('hello');
    expect(res.destroyed).toBe(false);
  });

  it('rejects on request timeout', async () => {
    let timeoutCb: (() => void) | undefined;
    let destroyed = false;
    vi.mocked(httpsGet).mockImplementation((() => {
      const req: Partial<ClientRequest> = {
        on: vi.fn((event: string, cb: () => void) => {
          if (event === 'timeout') timeoutCb = cb;
          return req as ClientRequest;
        }),
        end: vi.fn(),
        destroy: vi.fn(() => {
          destroyed = true;
          return req as ClientRequest;
        }),
      };
      setTimeout(() => timeoutCb?.(), 0);
      return req as ClientRequest;
    }) as typeof httpsGet);

    await expect(
      requestWithRetry({
        hostname: 'registry.example',
        path: '/timeout',
        maxAttempts: 1,
      }),
    ).rejects.toThrow(/Request timeout for registry.example\/timeout/);
    expect(destroyed).toBe(true);
  });

  it('rejects when delay signal is aborted during delay', async () => {
    const { _delayForTesting } = await import('../src/registry/http-fetch.js');
    const controller = new AbortController();
    const p = _delayForTesting(500, controller.signal);
    setTimeout(() => controller.abort(), 10);
    await expect(p).rejects.toThrow(/Request aborted/);
  });

  function mockRetryResponses(retryAfter: string) {
    let calls = 0;
    let delivered!: () => void;
    const firstDelivered = new Promise<void>((resolve) => {
      delivered = resolve;
    });
    vi.mocked(httpsGet).mockImplementation(((
      _opts: unknown,
      cb: (res: IncomingMessage) => void,
    ) => {
      const attempt = ++calls;
      const response = fakeResponse();
      response.statusCode = attempt === 1 ? 429 : 200;
      response.headers = attempt === 1 ? { 'retry-after': retryAfter } : {};
      queueMicrotask(() => {
        cb(response);
        response._emit('end');
        if (attempt === 1) delivered();
      });
      const request: Partial<ClientRequest> = {
        on: vi.fn(() => request as ClientRequest),
        end: vi.fn(),
      };
      return request as ClientRequest;
    }) as typeof httpsGet);
    return { firstDelivered, calls: () => calls };
  }

  it.each([
    ['short', '0.001', 1],
    ['longer than Node timer maximum', '2147483.648', 2_147_483_648],
  ])('waits the full %s Retry-After before retrying', async (_label, header, waitMs) => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    const http = mockRetryResponses(header);
    const pending = requestWithRetry({
      hostname: 'registry.example',
      path: '/retry',
      maxAttempts: 2,
    });
    await http.firstDelivered;
    await vi.advanceTimersByTimeAsync(waitMs - 1);
    expect(http.calls()).toBe(1);
    await vi.advanceTimersByTimeAsync(1);
    await expect(pending).resolves.toMatchObject({ statusCode: 200 });
    expect(http.calls()).toBe(2);
  });

  it('aborts a long Retry-After without sending another request', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    const http = mockRetryResponses('2147483.648');
    const controller = new AbortController();
    const pending = requestWithRetry({
      hostname: 'registry.example',
      path: '/abort',
      maxAttempts: 2,
      signal: controller.signal,
    });
    await http.firstDelivered;
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    await vi.advanceTimersByTimeAsync(2_147_483_648);
    expect(http.calls()).toBe(1);
  });
});
