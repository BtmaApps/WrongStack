import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { Config, Request } from '@wrongstack/contracts/types';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { bindAcpLeaderHost } from '../../src/acp-leader/acp-leader-host.js';
import { createGracefulShutdown } from '../../src/shutdown-cleanup.js';
import { WrongForgeLeaderProvider } from '../../src/wrongforge-leader/wrongforge-leader-provider.js';

const request: Request = {
  model: 'claude-test',
  messages: [{ role: 'user', content: 'Reply OK' }],
  cache: { sessionId: 'queue-test', threadId: 'queue-test' },
};
const testHomes: string[] = [];

function fixture(cancelDelayMs = 0) {
  const testHome = mkdtempSync(path.join(tmpdir(), 'wrongforge-queue-'));
  testHomes.push(testHome);
  vi.stubEnv('WRONGSTACK_HOME', testHome);
  const bodies: Record<string, unknown>[] = [];
  const cancels: string[] = [];
  let running = false;
  let completed = false;
  let releasePoll: ((response: Response) => void) | undefined;
  const fetchImpl = vi.fn(async (input: string | URL | globalThis.Request, init?: RequestInit) => {
    const url = new URL(String(input));
    const json = (value: unknown) => Promise.resolve(Response.json(value));
    if (url.pathname === '/v1/info') return json({ models: ['claude-test'] });
    if (url.pathname === '/v1/usage') return json({});
    if (url.pathname.includes('/sessions/'))
      return Response.json({ error: { code: 'session_not_found' } }, { status: 404 });
    if (url.pathname === '/v1/tasks') {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      bodies.push(body);
      if (body['wait'] && !running)
        return new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener(
            'abort',
            () => reject(new DOMException('aborted', 'AbortError')),
            { once: true },
          );
        });
      if (body['wait'])
        return json({ task: { id: 'queued-task', status: 'completed', result: { text: 'OK' } } });
      return json({ task: { id: 'queued-task', status: running ? 'running' : 'queued' } });
    }
    if (url.pathname.endsWith('/cancel')) {
      cancels.push(url.pathname);
      if (cancelDelayMs)
        return new Promise<Response>((resolve) =>
          setTimeout(() => resolve(Response.json({ ok: true })), cancelDelayMs),
        );
      return json({ ok: true });
    }
    if (url.pathname.endsWith('/events')) {
      if (completed)
        return json({ status: 'completed', terminal: true, next_after: 1, events: [] });
      if (url.searchParams.get('after') === '0')
        return json({
          status: 'queued',
          terminal: false,
          next_after: 1,
          events: [{ seq: 1, type: 'task.queued', data: { waiting_for: 'capacity', position: 5 } }],
        });
      return new Promise<Response>((resolve, reject) => {
        releasePoll = resolve;
        const signal = init?.signal;
        const abort = () => reject(new DOMException('aborted', 'AbortError'));
        if (signal?.aborted) abort();
        else signal?.addEventListener('abort', abort, { once: true });
      });
    }
    return json({ task: { id: 'queued-task', status: 'completed', result: { text: 'OK' } } });
  }) as unknown as typeof fetch;
  vi.stubEnv('WRONGFORGE_API_KEY', 'test-wrongforge-key-0123456789');
  vi.stubEnv('WRONGFORGE_URL', 'http://wrongforge.test');
  const provider = new WrongForgeLeaderProvider({
    bootConfig: {
      providers: { wrongforge: { type: 'wrongforge', queueTimeoutMs: 100 } },
    } as unknown as Config,
    buildProvider: () => undefined,
    fetchImpl,
  });
  return {
    provider,
    bodies,
    cancels,
    start: () => {
      running = true;
      releasePoll?.(
        Response.json({
          status: 'running',
          terminal: false,
          next_after: 2,
          events: [{ seq: 2, type: 'task.started', data: {} }],
        }),
      );
    },
    finish: () => {
      running = true;
      completed = true;
      releasePoll?.(
        Response.json({ status: 'completed', terminal: true, next_after: 3, events: [] }),
      );
    },
  };
}

async function drain(stream: ReturnType<WrongForgeLeaderProvider['stream']>) {
  for await (const _event of stream) {
    /* consume the production stream */
  }
}

afterEach(() => {
  bindAcpLeaderHost(undefined);
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  for (const testHome of testHomes.splice(0)) rmSync(testHome, { recursive: true, force: true });
});

describe('WrongForge queue lifecycle', () => {
  it('lets remote cancellation drain before the registry forces process exit', async () => {
    vi.useFakeTimers();
    const exit = vi.spyOn(process, 'exit').mockImplementation((() => {}) as never);
    const savedExitCode = process.exitCode;
    const { provider } = fixture(1000);
    const ctrl = new AbortController();
    const pending = provider.complete(request, { signal: ctrl.signal }).catch(() => undefined);
    const shutdown = createGracefulShutdown({ run: async () => {} });
    const abort = () => ctrl.abort();
    shutdown.install();
    process.on('SIGTERM', abort);
    try {
      await vi.advanceTimersByTimeAsync(50);
      process.emit('SIGTERM');
      await vi.advanceTimersByTimeAsync(500);
      expect(exit).not.toHaveBeenCalled();
    } finally {
      ctrl.abort();
      await vi.advanceTimersByTimeAsync(2000);
      await pending;
      shutdown.uninstall();
      process.off('SIGTERM', abort);
      process.exitCode = savedExitCode;
    }
  });

  it.each(['stream', 'complete'] as const)(
    'bounds a queued %s call and awaits cancellation',
    async (method) => {
      vi.useFakeTimers();
      const { provider, cancels } = fixture();
      const signal = new AbortController().signal;
      const pending =
        method === 'stream'
          ? drain(provider.stream(request, { signal }))
          : provider.complete(request, { signal });
      const outcome = pending.catch((error: unknown) => error);
      await vi.advanceTimersByTimeAsync(101);
      // A pending long-poll must be interrupted by the queue deadline.
      expect(cancels).toEqual(['/v1/tasks/queued-task/cancel']);
      expect(await outcome).toMatchObject({ context: { kind: 'queue_timeout' }, retryable: false });
    },
  );

  it('reports queue position on stderr without adding it to model output', async () => {
    const stderr = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    const { provider, cancels } = fixture();
    const ctrl = new AbortController();
    const pending = drain(provider.stream(request, { signal: ctrl.signal })).catch(() => undefined);
    try {
      await vi.waitFor(() =>
        expect(stderr).toHaveBeenCalledWith(expect.stringMatching(/WrongForge.*position 5/)),
      );
    } finally {
      ctrl.abort();
      await pending;
    }
    expect(cancels).toHaveLength(1);
  });

  it.each(['stream', 'complete'] as const)(
    'cancels an aborted %s call before returning',
    async (method) => {
      const { provider, cancels, bodies } = fixture();
      const ctrl = new AbortController();
      const pending = (
        method === 'stream'
          ? drain(provider.stream(request, { signal: ctrl.signal }))
          : provider.complete(request, { signal: ctrl.signal })
      ).catch((error: unknown) => error);
      await vi.waitFor(() => expect(bodies).toHaveLength(1));
      ctrl.abort();
      await pending;
      expect(cancels).toEqual(['/v1/tasks/queued-task/cancel']);
    },
  );

  it('returns a completed task normally (valid-input control)', async () => {
    const { provider, finish, cancels } = fixture();
    finish();
    const result = await provider.complete(request, { signal: new AbortController().signal });
    expect(result.content).toEqual([{ type: 'text', text: 'OK' }]);
    expect(cancels).toEqual([]);
  });

  it('stops the queue deadline when execution starts', async () => {
    vi.useFakeTimers();
    const { provider, start, finish, cancels } = fixture();
    const outcome = provider.complete(request, { signal: new AbortController().signal });
    await vi.advanceTimersByTimeAsync(50);
    start();
    await vi.advanceTimersByTimeAsync(1000);
    expect(cancels).toEqual([]);
    finish();
    expect((await outcome).content).toEqual([{ type: 'text', text: 'OK' }]);
  });
});
