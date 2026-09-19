import { PassThrough } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';
import { createSseLineFoldingTransform, parseSSE } from '../src/sse.js';

describe('SSE line folding reader lifecycle', () => {
  it('releases the source reader after normal completion', async () => {
    const source = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('data: {}\n\n'));
        controller.close();
      },
    });
    const reader = createSseLineFoldingTransform(source).getReader();
    try {
      while (!(await reader.read()).done) {
        /* consume all output */
      }
    } finally {
      reader.releaseLock();
    }
    expect(source.locked).toBe(false);
  });

  it('cancels an outstanding source read and releases its lock', async () => {
    const cancel = vi.fn();
    const source = new ReadableStream<Uint8Array>({ cancel });
    const reader = createSseLineFoldingTransform(source).getReader();
    const pending = reader.read();
    try {
      await reader.cancel('consumer stopped');
      expect(await pending).toMatchObject({ done: true });
      expect(cancel).toHaveBeenCalledWith('consumer stopped');
      expect(source.locked).toBe(false);
    } finally {
      reader.releaseLock();
    }
  });

  it('preserves source read errors and releases the reader', async () => {
    const failure = new Error('upstream read failed');
    const source = new ReadableStream<Uint8Array>({
      start: (controller) => controller.error(failure),
    });
    const reader = createSseLineFoldingTransform(source).getReader();
    try {
      await expect(reader.read()).rejects.toBe(failure);
    } finally {
      reader.releaseLock();
    }
    expect(source.locked).toBe(false);
  });
});

function legacyStream(): PassThrough {
  const body = new PassThrough();
  Object.defineProperty(body, Symbol.asyncIterator, { value: undefined });
  return body;
}

describe('SSE legacy Node stream lifecycle', () => {
  it.each([false, true])(
    'settles streams closed before parsing starts (normal end=%s)',
    async (normalEnd) => {
      const body = legacyStream();
      if (normalEnd) {
        body.resume();
        body.end();
      } else {
        body.destroy();
      }
      await new Promise<void>((resolve) => setImmediate(resolve));
      const outcome = parseSSE(body)
        [Symbol.asyncIterator]()
        .next()
        .then(
          (value) => ({ value }),
          (error: unknown) => ({ error }),
        );
      try {
        await new Promise<void>((resolve) => setImmediate(resolve));
        const result = await Promise.race([outcome, Promise.resolve({ pending: true })]);
        expect(result).toMatchObject(
          normalEnd ? { value: { done: true } } : { error: { code: 'ERR_STREAM_PREMATURE_CLOSE' } },
        );
      } finally {
        body.emit('end');
        await outcome;
      }
    },
  );

  it.each([false, true])(
    'rejects premature close instead of hanging (after event=%s)',
    async (afterEvent) => {
      const body = legacyStream();
      const iterator = parseSSE(body)[Symbol.asyncIterator]();
      if (afterEvent) {
        body.write('data: first\n\n');
        expect((await iterator.next()).value).toEqual({ event: 'message', data: 'first' });
        body.destroy();
        await new Promise<void>((resolve) => setImmediate(resolve));
      }
      const pending = iterator.next();
      const outcome = pending.then(
        (value) => ({ value }),
        (error: unknown) => ({ error }),
      );
      try {
        if (!afterEvent) body.destroy();
        // destroy emits close on the next tick; let the event and its reactions run.
        await new Promise<void>((resolve) => setImmediate(resolve));
        expect(await Promise.race([outcome, Promise.resolve({ pending: true })])).toMatchObject({
          error: { code: 'ERR_STREAM_PREMATURE_CLOSE' },
        });
        for (const event of ['data', 'end', 'error', 'close']) {
          expect(body.listenerCount(event)).toBe(0);
        }
      } finally {
        // Release the old implementation's wait when demonstrating the regression.
        body.emit('end');
        await outcome;
        await iterator.return?.();
      }
    },
  );

  it('preserves an underlying error when close follows it', async () => {
    const body = legacyStream();
    const pending = parseSSE(body)[Symbol.asyncIterator]().next();
    const error = new Error('upstream failed');
    const rejected = expect(pending).rejects.toBe(error);
    body.destroy(error);
    await rejected;
  });

  it('accepts a normal end and removes its listeners', async () => {
    const body = legacyStream();
    body.end('data: complete\n\n');
    const events = [];
    for await (const event of parseSSE(body)) events.push(event);
    expect(events).toEqual([{ event: 'message', data: 'complete' }]);
    for (const event of ['data', 'end', 'error', 'close']) {
      expect(body.listenerCount(event)).toBe(0);
    }
  });
});

describe('SSE web reader lifecycle', () => {
  it('releases the reader without waiting for upstream cancellation to settle', async () => {
    const cancellation = Promise.withResolvers<void>();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('data: first\n\n'));
      },
      cancel: () => cancellation.promise,
    });
    try {
      for await (const event of parseSSE(body)) {
        expect(event.data).toBe('first');
        break;
      }
      expect(body.locked).toBe(false);
    } finally {
      cancellation.resolve();
    }
  }, 1_000);

  it.each([false, true])('releases its reader on completion (early exit=%s)', async (early) => {
    const cancel = vi.fn();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('data: complete\n\n'));
        if (!early) controller.close();
      },
      cancel,
    });
    const events = [];
    for await (const event of parseSSE(body)) {
      events.push(event);
      if (early) break;
    }
    expect(events).toEqual([{ event: 'message', data: 'complete' }]);
    if (early) expect(cancel).toHaveBeenCalledTimes(1);
    expect(body.locked).toBe(false);
    const reader = body.getReader();
    try {
      await expect(reader.read()).resolves.toMatchObject({ done: true });
    } finally {
      reader.releaseLock();
    }
  });
});
