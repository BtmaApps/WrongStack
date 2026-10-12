import { ClientRequest, IncomingMessage, type RequestOptions } from 'node:http';
import { get as httpsGet } from 'node:https';
import { Socket } from 'node:net';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { clearRegistryCache, lookupRegistry } from '../src/registry/client.js';

vi.mock('node:https', async (importOriginal) => ({
  ...(await importOriginal<typeof import('node:https')>()),
  get: vi.fn(),
}));

beforeEach(() => {
  clearRegistryCache();
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  vi.mocked(httpsGet).mockReset();
  vi.restoreAllMocks();
  clearRegistryCache();
});

function holdResponses(): Array<() => void> {
  const finish: Array<() => void> = [];
  vi.mocked(httpsGet).mockImplementation((...args: unknown[]) => {
    const options = args[0] as RequestOptions;
    options.signal?.throwIfAborted();
    const callback = args.find(
      (arg): arg is (response: IncomingMessage) => void => typeof arg === 'function',
    );
    if (!callback) throw new Error('Missing HTTPS response callback');
    const response = new IncomingMessage(new Socket());
    response.statusCode = 200;
    callback(response);
    finish.push(() => {
      response.emit('data', JSON.stringify({ 'dist-tags': { latest: '1.2.3' } }));
      response.emit('end');
    });
    const request = Object.create(ClientRequest.prototype) as ClientRequest;
    request.end = vi.fn();
    request.destroy = vi.fn(() => request);
    return request;
  });
  return finish;
}

it('rejects a cancelled queued lookup before active requests finish', async () => {
  const finish = holdResponses();
  const active = [0, 1, 2].map((n) => lookupRegistry('npm', `active-${n}`));
  const controller = new AbortController();
  const reason = new Error('cancel queued lookup');
  let settled = false;
  let failure: unknown;
  const queued = lookupRegistry('npm', 'cancelled', { signal: controller.signal }).then(
    () => {
      settled = true;
    },
    (error: unknown) => {
      settled = true;
      failure = error;
    },
  );
  await Promise.resolve();
  expect(finish).toHaveLength(3);
  controller.abort(reason);
  await vi.advanceTimersByTimeAsync(0);
  const rejectedBeforeRelease = settled && failure === reason;

  // Drain the held controls even on the RED path; no network handles are left.
  for (const complete of finish.slice()) complete();
  await Promise.all(active);
  await queued;
  expect(finish).toHaveLength(3);
  expect(
    rejectedBeforeRelease,
    'FAIL: queued cancellation waited for unrelated active requests',
  ).toBe(true);
});

it('still grants an uncancelled queued lookup after a slot is released', async () => {
  const finish = holdResponses();
  const active = [0, 1, 2].map((n) => lookupRegistry('npm', `control-${n}`));
  const queued = lookupRegistry('npm', 'control-queued');
  await Promise.resolve();
  expect(finish).toHaveLength(3);
  for (const complete of finish.slice()) complete();
  await Promise.all(active);
  expect(finish).toHaveLength(4);
  finish[3]?.();
  expect((await queued)?.latestStable).toBe('1.2.3');
});

it('does not start transport if cancelled just after an immediate slot grant', async () => {
  const finish = holdResponses();
  const controller = new AbortController();
  const reason = new Error('cancel before transport');
  const cancelled = lookupRegistry('npm', 'granted', { signal: controller.signal }).catch(
    (error: unknown) => error,
  );
  controller.abort(reason);
  expect(await cancelled).toBe(reason);
  const callsAfterAbort = vi.mocked(httpsGet).mock.calls.length;

  const controls = [0, 1, 2].map((n) => lookupRegistry('npm', `after-abort-${n}`));
  await Promise.resolve();
  expect(finish).toHaveLength(3);
  for (const complete of finish.slice()) complete();
  await Promise.all(controls);
  expect(callsAfterAbort).toBe(0);
});

it('removes the queued abort listener on grant', async () => {
  const finish = holdResponses();
  const active = [0, 1, 2].map((n) => lookupRegistry('npm', `listener-${n}`));
  const controller = new AbortController();
  const add = vi.spyOn(controller.signal, 'addEventListener');
  const remove = vi.spyOn(controller.signal, 'removeEventListener');
  const queued = lookupRegistry('npm', 'listener-queued', { signal: controller.signal });
  await Promise.resolve();
  for (const complete of finish.slice()) complete();
  await Promise.all(active);
  finish[3]?.();
  await queued;
  const registered = add.mock.calls
    .filter(([type]) => type === 'abort')
    .map(([, listener]) => listener);
  const removed = remove.mock.calls
    .filter(([type]) => type === 'abort')
    .map(([, listener]) => listener);
  expect(removed).toEqual(registered);
});

it('keeps all host slots usable after removing a cancelled waiter', async () => {
  const finish = holdResponses();
  const active = [0, 1, 2].map((n) => lookupRegistry('npm', `capacity-${n}`));
  const controller = new AbortController();
  const cancelled = lookupRegistry('npm', 'capacity-cancelled', {
    signal: controller.signal,
  }).catch((error: unknown) => error);
  await Promise.resolve();
  controller.abort();
  await vi.advanceTimersByTimeAsync(0);
  for (const complete of finish.slice()) complete();
  await Promise.all(active);
  await cancelled;

  const previous = finish.length;
  const controls = [0, 1, 2].map((n) => lookupRegistry('npm', `capacity-after-${n}`));
  await Promise.resolve();
  const started = finish.length - previous;
  for (const complete of finish.slice(previous)) complete();
  await vi.advanceTimersByTimeAsync(0);
  for (const complete of finish.slice(previous + started)) complete();
  await Promise.all(controls);
  expect(started).toBe(3);
});

it('rejects an already-aborted lookup without taking a slot', async () => {
  holdResponses();
  const controller = new AbortController();
  controller.abort();
  await expect(
    lookupRegistry('npm', 'pre-aborted', { signal: controller.signal }),
  ).rejects.toMatchObject({ name: 'AbortError' });
  expect(httpsGet).not.toHaveBeenCalled();
});
