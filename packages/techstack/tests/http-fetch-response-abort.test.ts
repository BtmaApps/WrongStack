import { ClientRequest, IncomingMessage, type RequestOptions } from 'node:http';
import { get as httpsGet, request as httpsRequest } from 'node:https';
import { Socket } from 'node:net';
import { afterEach, expect, it, vi } from 'vitest';
import { clearRegistryCache, lookupRegistry } from '../src/registry/client.js';
import { requestWithRetry } from '../src/registry/http-fetch.js';

vi.mock('node:https', async (importOriginal) => ({
  ...(await importOriginal<typeof import('node:https')>()),
  get: vi.fn(),
  request: vi.fn(),
}));

afterEach(() => {
  vi.mocked(httpsGet).mockReset();
  vi.mocked(httpsRequest).mockReset();
  clearRegistryCache();
});

function completeResponse(
  onEnd: () => void,
  statusCode = 200,
  body = JSON.stringify({ 'dist-tags': { latest: '1.2.3' } }),
): void {
  const implementation = (...args: unknown[]): ClientRequest => {
    const options = args[0] as RequestOptions;
    options.signal?.throwIfAborted();
    const callback = args.find(
      (arg): arg is (response: IncomingMessage) => void => typeof arg === 'function',
    );
    if (!callback) throw new Error('Missing HTTPS response callback');
    const request = Object.create(ClientRequest.prototype) as ClientRequest;
    request.end = vi.fn();
    request.write = vi.fn(() => true);
    request.destroy = vi.fn(() => request);
    const onAbort = () => request.emit('error', new DOMException('Request aborted', 'AbortError'));
    options.signal?.addEventListener('abort', onAbort, { once: true });
    queueMicrotask(() => {
      const response = new IncomingMessage(new Socket());
      response.statusCode = statusCode;
      callback(response);
      response.emit('data', body);
      response.emit('end');
      onEnd();
      options.signal?.removeEventListener('abort', onAbort);
    });
    return request;
  };
  vi.mocked(httpsGet).mockImplementation(implementation);
  vi.mocked(httpsRequest).mockImplementation(implementation);
}

it.each([false, true])(
  'honors cancellation at registry response handoff: abort=%s',
  async (abort) => {
    clearRegistryCache();
    const controller = new AbortController();
    const reason = new Error('cancel before response delivery');
    completeResponse(() => {
      if (abort) controller.abort(reason);
    });
    const pending = lookupRegistry('npm', 'response-handoff', { signal: controller.signal });
    if (abort) {
      const outcome = await pending.then(
        () => 'resolved',
        (error: unknown) => error,
      );
      expect(outcome).toBe(reason);
    } else {
      expect((await pending)?.latestStable).toBe('1.2.3');
    }
    expect(httpsGet).toHaveBeenCalledTimes(1);
  },
);

it.each([200, 404, 429, 503])(
  'rejects an aborted terminal HTTP %s response without retries',
  async (statusCode) => {
    const controller = new AbortController();
    const reason = new Error('cancel completed attempt');
    completeResponse(() => controller.abort(reason), statusCode);
    await expect(
      requestWithRetry({
        hostname: 'registry.example',
        path: '/terminal',
        signal: controller.signal,
        maxAttempts: 1,
      }),
    ).rejects.toBe(reason);
    expect(httpsGet).toHaveBeenCalledTimes(1);
  },
);

it('applies the response cancellation guard to POST requests', async () => {
  const controller = new AbortController();
  completeResponse(() => controller.abort());
  await expect(
    requestWithRetry({
      hostname: 'registry.example',
      path: '/batch',
      method: 'POST',
      body: '{}',
      signal: controller.signal,
      maxAttempts: 1,
    }),
  ).rejects.toMatchObject({ name: 'AbortError' });
  expect(httpsRequest).toHaveBeenCalledTimes(1);
  expect(httpsGet).not.toHaveBeenCalled();
});

it('does not cache a registry response cancelled during handoff', async () => {
  const controller = new AbortController();
  completeResponse(() => controller.abort());
  await lookupRegistry('npm', 'cancelled-cache', { signal: controller.signal }).catch(
    () => undefined,
  );
  completeResponse(() => {}, 200, JSON.stringify({ 'dist-tags': { latest: '2.0.0' } }));
  expect((await lookupRegistry('npm', 'cancelled-cache'))?.latestStable).toBe('2.0.0');
  expect(httpsGet).toHaveBeenCalledTimes(2);
});
