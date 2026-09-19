import { PassThrough } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';
import { Connection } from '../../src/server/connection.js';
import { LSPErrorCode } from '../../src/types.js';

function frame(value: unknown): Buffer {
  const body = JSON.stringify(value);
  return Buffer.from(`Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`);
}

function collectMessages(stream: PassThrough): unknown[] {
  const messages: unknown[] = [];
  let buffer = Buffer.alloc(0);
  stream.on('data', (chunk: Buffer) => {
    buffer = Buffer.concat([buffer, chunk]);
    for (;;) {
      const separator = buffer.indexOf('\r\n\r\n');
      if (separator === -1) return;
      const header = buffer.subarray(0, separator).toString('ascii');
      const match = /Content-Length:\s*(\d+)/i.exec(header);
      if (!match) return;
      const length = Number(match[1]);
      const end = separator + 4 + length;
      if (buffer.length < end) return;
      messages.push(JSON.parse(buffer.subarray(separator + 4, end).toString('utf8')));
      buffer = buffer.subarray(end);
    }
  });
  return messages;
}

describe('Connection protocol completion coverage', () => {
  it('dispatches successful, failed, unknown, and notification messages', async () => {
    const stdin = new PassThrough();
    const stdout = new PassThrough();
    const connection = new Connection(stdin, stdout);
    const notification = vi.fn();
    const unsubscribe = connection.onNotification('server/event', notification);

    const success = connection.sendRequest<{ ok: boolean }>(
      'success',
      { value: 1 },
      1_000,
      new AbortController().signal,
    );
    stdout.write(frame({ jsonrpc: '2.0', id: 999, result: 'ignored' }));
    stdout.write(frame({ jsonrpc: '2.0', id: '1', result: { ok: true } }));
    await expect(success).resolves.toEqual({ ok: true });

    const failure = connection.sendRequest('failure', null, 1_000, new AbortController().signal);
    stdout.write(
      frame({
        jsonrpc: '2.0',
        id: 2,
        error: { code: -32000, message: 'server failed', data: { retry: false } },
      }),
    );
    await expect(failure).rejects.toMatchObject({
      code: LSPErrorCode.ProtocolError,
      message: 'server failed',
    });

    stdout.write(frame({ jsonrpc: '2.0', method: 'server/event', params: { changed: true } }));
    expect(notification).toHaveBeenCalledWith({ changed: true });
    unsubscribe();
    stdout.write(frame({ jsonrpc: '2.0', method: 'server/event', params: 'ignored' }));
    expect(notification).toHaveBeenCalledOnce();
  });

  it('recovers from malformed headers, lengths, JSON, and partial frames', async () => {
    const stdin = new PassThrough();
    const stdout = new PassThrough();
    const connection = new Connection(stdin, stdout);
    const received = vi.fn();
    connection.onNotification('valid', received);

    stdout.write(Buffer.from('Missing: length\r\n\r\njunk'));
    stdout.write(Buffer.from('Content-Length: 99999999\r\n\r\n'));
    stdout.write(Buffer.from('Content-Length: 0\r\n\r\n'));
    stdout.write(Buffer.from('Content-Length: 1\r\n\r\n{'));
    const valid = frame({ jsonrpc: '2.0', method: 'valid', params: 1 });
    stdout.write(valid.subarray(0, 10));
    stdout.write(valid.subarray(10));
    const partialBody = frame({ jsonrpc: '2.0', method: 'valid', params: 2 });
    stdout.write(partialBody.subarray(0, partialBody.length - 2));
    stdout.write(partialBody.subarray(partialBody.length - 2));
    stdout.write(frame({ jsonrpc: '2.0' }));
    expect(received).toHaveBeenCalledWith(1);
    expect(received).toHaveBeenCalledWith(2);
  });

  // Regression for the quadratic receive path: a large message arriving in
  // small reads must be reassembled without per-chunk re-copying, and two
  // messages packed into one chunk must both dispatch. This exercises the
  // header/body phase boundary in every alignment: header split mid-\r\n\r\n,
  // body split across many chunks, and body immediately followed by the next
  // header in the same chunk.
  it('reassembles chunked large bodies and back-to-back frames in one chunk', () => {
    const stdin = new PassThrough();
    const stdout = new PassThrough();
    const connection = new Connection(stdin, stdout);
    const received = vi.fn();
    connection.onNotification('big', received);
    connection.onNotification('small', received);

    const bigParams = 'x'.repeat(2 * 1024 * 1024); // 2 MiB body
    const big = frame({ jsonrpc: '2.0', method: 'big', params: bigParams });
    const small = frame({ jsonrpc: '2.0', method: 'small', params: 7 });

    // Deliver the big frame in 64 KiB slices, with the LAST slice also
    // carrying the entire small frame appended.
    const joined = Buffer.concat([big, small]);
    const CHUNK = 64 * 1024;
    for (let offset = 0; offset < joined.length; offset += CHUNK) {
      stdout.write(joined.subarray(offset, Math.min(offset + CHUNK, joined.length)));
    }

    expect(received).toHaveBeenCalledTimes(2);
    expect(received).toHaveBeenCalledWith(bigParams);
    expect(received).toHaveBeenCalledWith(7);
  });

  it('closes on receive overflow and keeps close and unsubscription idempotent', () => {
    const stdin = new PassThrough();
    const stdout = new PassThrough();
    const connection = new Connection(stdin, stdout);
    const closed = vi.fn();
    const unsubscribe = connection.onClose(closed);
    stdout.write(Buffer.alloc(16 * 1024 * 1024 + 1));
    expect(closed).toHaveBeenCalledOnce();
    const internal = connection as unknown as {
      headerBuffer: Buffer;
      bodyParts: Buffer[];
      bodyReceived: number;
    };
    expect(internal.headerBuffer).toHaveLength(0);
    expect(internal.bodyParts).toHaveLength(0);
    expect(internal.bodyReceived).toBe(0);
    expect(stdout.listenerCount('data')).toBe(0);
    expect(stdout.listenerCount('close')).toBe(0);
    expect(stdout.listenerCount('error')).toBe(0);
    expect(stdin.listenerCount('error')).toBe(0);
    connection.close();
    expect(closed).toHaveBeenCalledOnce();
    unsubscribe();
    expect(() => connection.sendNotification('after/close', null)).toThrow('closed');
  });

  it('cancels pending requests and tolerates cancellation write failures', async () => {
    const stdin = new PassThrough();
    const stdout = new PassThrough();
    const connection = new Connection(stdin, stdout);
    const controller = new AbortController();
    const pending = connection.sendRequest('cancel', null, 1_000, controller.signal);
    vi.spyOn(connection, 'sendNotification').mockImplementationOnce(() => {
      throw new Error('cancel transport failed');
    });
    controller.abort(new Error('operator cancelled'));
    await expect(pending).rejects.toThrow('operator cancelled');
  });

  it('cancels timed-out requests on the server', async () => {
    const stdin = new PassThrough();
    const stdout = new PassThrough();
    const messages = collectMessages(stdin);
    const connection = new Connection(stdin, stdout);

    await expect(
      connection.sendRequest(
        'workspace/symbol',
        { query: 'slow' },
        5,
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({ code: LSPErrorCode.RequestTimeout });

    expect(messages).toEqual([
      { jsonrpc: '2.0', id: 1, method: 'workspace/symbol', params: { query: 'slow' } },
      { jsonrpc: '2.0', method: '$/cancelRequest', params: { id: 1 } },
    ]);
  });

  it('wraps request IDs at the safe integer boundary without reusing pending IDs', async () => {
    const stdin = new PassThrough();
    const stdout = new PassThrough();
    const messages = collectMessages(stdin) as Array<{ id?: number }>;
    const connection = new Connection(stdin, stdout);
    const controller = new AbortController();

    const first = connection.sendRequest('first', null, 1_000, controller.signal);
    (connection as unknown as { nextId: number }).nextId = Number.MAX_SAFE_INTEGER;
    const boundary = connection.sendRequest('boundary', null, 1_000, controller.signal);
    const wrapped = connection.sendRequest('wrapped', null, 1_000, controller.signal);

    expect(messages.map(({ id }) => id)).toEqual([1, Number.MAX_SAFE_INTEGER, 2]);
    controller.abort(new Error('test complete'));
    await Promise.allSettled([first, boundary, wrapped]);
  });

  it('recovers an invalid request ID cursor before writing a request', async () => {
    const stdin = new PassThrough();
    const stdout = new PassThrough();
    const messages = collectMessages(stdin) as Array<{ id?: number }>;
    const connection = new Connection(stdin, stdout);
    const controller = new AbortController();

    (connection as unknown as { nextId: number }).nextId = Number.NaN;
    const pending = connection.sendRequest('recovered', null, 1_000, controller.signal);

    expect(messages.map(({ id }) => id)).toEqual([1]);
    controller.abort(new Error('test complete'));
    await Promise.allSettled([pending]);
  });

  it('fails pending requests for stdout errors and close events, including non-Errors', async () => {
    for (const terminal of ['error', 'close'] as const) {
      const stdin = new PassThrough();
      const stdout = new PassThrough();
      const connection = new Connection(stdin, stdout);
      const pending = connection.sendRequest(terminal, null, 1_000, new AbortController().signal);
      if (terminal === 'error') stdout.emit('error', 'transport text failure' as never);
      else stdout.emit('close');
      await expect(pending).rejects.toBeInstanceOf(Error);
    }
  });
});
