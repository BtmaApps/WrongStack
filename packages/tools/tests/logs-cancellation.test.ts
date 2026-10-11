import { getEventListeners } from 'node:events';
import type { ReadStream } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { logsTool } from '../src/logs.js';
import { mkSandbox, type Sandbox } from './fixtures.js';

// Instrument only the real filesystem boundary: abort on a real chunk, not a timer.
const hook = vi.hoisted(() => ({
  onData: undefined as (() => void) | undefined,
  streams: [] as ReadStream[],
}));
vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return {
    ...actual,
    createReadStream(...args: Parameters<typeof actual.createReadStream>) {
      const stream = actual.createReadStream(...args);
      hook.streams.push(stream);
      const onData = hook.onData;
      if (onData) stream.once('data', onData);
      return stream;
    },
  };
});

let sandbox: Sandbox;
beforeEach(async () => {
  sandbox = await mkSandbox();
  hook.streams = [];
  await writeFile(
    join(sandbox.dir, 'input.log'),
    Array.from({ length: 5000 }, (_, i) => `INFO row ${i}`).join('\n'),
  );
});
afterEach(async () => {
  hook.onData = undefined;
  for (const stream of hook.streams) {
    if (!stream.closed) {
      const closed = new Promise<void>((resolve) => stream.once('close', resolve));
      stream.destroy();
      await closed;
    }
  }
  await sandbox.cleanup();
});

async function outcome(signal: AbortSignal) {
  return logsTool.execute({ path: 'input.log', lines: 2 }, sandbox.ctx, { signal }).then(
    (value) => ({ status: 'fulfilled' as const, value }),
    (error: unknown) => ({ status: 'rejected' as const, error }),
  );
}

describe('file logs honor cancellation and release read resources', () => {
  it('keeps the active-signal tail result and removes its abort listener', async () => {
    const signal = new AbortController().signal;
    const result = await logsTool.execute({ path: 'input.log', lines: 2 }, sandbox.ctx, { signal });
    expect(result.entries.map((entry) => entry.message)).toEqual(['row 4998', 'row 4999']);
    expect(result.truncated).toBe(true);
    expect(getEventListeners(signal, 'abort')).toHaveLength(0);
  });

  it('rejects an already-aborted call without opening a stream', async () => {
    const controller = new AbortController();
    controller.abort();
    expect(await outcome(controller.signal)).toMatchObject({
      status: 'rejected',
      error: { name: 'AbortError' },
    });
    expect(hook.streams).toHaveLength(0);
  });

  it('rejects cancellation on the first real read chunk and destroys the stream', async () => {
    const controller = new AbortController();
    let chunks = 0;
    hook.onData = () => {
      chunks++;
      controller.abort();
    };
    const result = await outcome(controller.signal);
    expect(chunks).toBe(1);
    expect(controller.signal.aborted).toBe(true);
    expect(result).toMatchObject({ status: 'rejected', error: { name: 'AbortError' } });
    expect(hook.streams).toHaveLength(1);
    expect(hook.streams[0]?.destroyed).toBe(true);
    expect(hook.streams[0]?.readableEnded).toBe(false);
    expect(getEventListeners(controller.signal, 'abort')).toHaveLength(0);
  });

  it('preserves a caller-supplied abort reason', async () => {
    const controller = new AbortController();
    const reason = new Error('cancel-reading-log');
    hook.onData = () => controller.abort(reason);
    const result = await outcome(controller.signal);
    expect(controller.signal.aborted).toBe(true);
    expect(result.status).toBe('rejected');
    if (result.status === 'rejected') expect(result.error).toBe(reason);
    expect(getEventListeners(controller.signal, 'abort')).toHaveLength(0);
  });
});
