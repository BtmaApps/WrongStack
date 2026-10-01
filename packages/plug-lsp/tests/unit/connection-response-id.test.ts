import { PassThrough } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';
import { Connection } from '../../src/server/connection.js';

function frame(value: unknown) {
  const body = JSON.stringify(value);
  return `Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`;
}

describe('LSP response identity', () => {
  for (const reason of [undefined, new Error('operator cancelled'), 'operator cancelled']) {
    it(`does not send an already-aborted request (${String(reason)})`, async () => {
      const stdin = new PassThrough();
      const stdout = new PassThrough();
      const connection = new Connection(stdin, stdout);
      const write = vi.spyOn(stdin, 'write');
      const controller = new AbortController();
      controller.abort(reason);
      try {
        await expect(
          connection.sendRequest('workspace/executeCommand', {}, 1000, controller.signal),
        ).rejects.toBeInstanceOf(Error);
        expect(write).not.toHaveBeenCalled();
      } finally {
        connection.close();
      }
    });
  }

  for (const id of ['1', '01', '1e0', true]) {
    it(`does not coerce response ID ${JSON.stringify(id)} into numeric request ID 1`, async () => {
      const stdin = new PassThrough();
      const stdout = new PassThrough();
      const connection = new Connection(stdin, stdout);
      const pending = connection.sendRequest('fixture', {}, 1000, new AbortController().signal);
      void pending.catch(() => undefined);
      try {
        stdout.write(frame({ jsonrpc: '2.0', id, result: 'wrong' }));
        expect((connection as unknown as { pending: Map<number, unknown> }).pending.size).toBe(1);
        stdout.write(frame({ jsonrpc: '2.0', id: 1, result: 'correct' }));
        await expect(pending).resolves.toBe('correct');
      } finally {
        connection.close();
        await pending.catch(() => undefined);
      }
    });
  }
});
