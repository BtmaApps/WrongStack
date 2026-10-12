import { ClientRequest, IncomingMessage } from 'node:http';
import { get as httpsGet } from 'node:https';
import { Socket } from 'node:net';
import { afterEach, expect, it, vi } from 'vitest';
import { clearRegistryCache, lookupRegistry } from '../src/registry/client.js';

vi.mock('node:https', async (importOriginal) => ({
  ...(await importOriginal<typeof import('node:https')>()),
  get: vi.fn(),
}));

afterEach(() => {
  vi.mocked(httpsGet).mockReset();
  clearRegistryCache();
});

function holdResponses(): Array<() => void> {
  const finish: Array<() => void> = [];
  vi.mocked(httpsGet).mockImplementation((...args: unknown[]) => {
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

it.each([false, true])('drains queued lookups with cache clear=%s', async (clear) => {
  const finish = holdResponses();
  const active = [0, 1, 2].map((n) => lookupRegistry('npm', `active-${n}`));
  const queued = lookupRegistry('npm', 'queued');
  await Promise.resolve();
  expect(finish).toHaveLength(3);
  if (clear) clearRegistryCache();
  for (const complete of finish.slice()) complete();
  await Promise.all(active);
  expect(finish, 'FAIL: cache clear must not orphan the queued lookup').toHaveLength(4);
  finish[3]?.();
  expect((await queued)?.latestStable).toBe('1.2.3');
});

it('preserves the host limit when new lookups arrive after cache clear', async () => {
  const finish = holdResponses();
  const active = [0, 1, 2].map((n) => lookupRegistry('npm', `old-${n}`));
  await Promise.resolve();
  expect(finish).toHaveLength(3);
  clearRegistryCache();
  const next = lookupRegistry('npm', 'new');
  await Promise.resolve();
  const startedBeforeRelease = finish.length;
  for (const complete of finish.slice()) complete();
  await Promise.all(active);
  if (startedBeforeRelease === 3) finish[3]?.();
  await next;
  expect(startedBeforeRelease, 'FAIL: cache clear must preserve the three-request host limit').toBe(
    3,
  );
});

it('still invalidates cached metadata and tolerates repeated idle clears', async () => {
  const finish = holdResponses();
  const first = lookupRegistry('npm', 'cached');
  await Promise.resolve();
  finish[0]?.();
  expect((await first)?.latestStable).toBe('1.2.3');
  expect((await lookupRegistry('npm', 'cached'))?.latestStable).toBe('1.2.3');
  expect(finish).toHaveLength(1);

  clearRegistryCache();
  clearRegistryCache();
  const refreshed = lookupRegistry('npm', 'cached');
  await Promise.resolve();
  expect(finish).toHaveLength(2);
  finish[1]?.();
  expect((await refreshed)?.latestStable).toBe('1.2.3');
});
