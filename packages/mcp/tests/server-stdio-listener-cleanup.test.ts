import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { MCPServer } from '../src/server-dispatch.js';
import { serveStdio } from '../src/server-stdio.js';

describe('server stdio listener cleanup', () => {
  const server = () =>
    new MCPServer({
      host: { listTools: () => [], callTool: async () => ({ content: '', isError: false }) },
    });
  it.each(['manual', 'end', 'close'] as const)(
    'releases only owned listeners on %s',
    async (mode) => {
      const stdin = new EventEmitter();
      const external = () => {};
      for (const event of ['data', 'end', 'close']) stdin.on(event, external);
      const handle = serveStdio(server(), {
        stdin: stdin as unknown as NodeJS.ReadableStream,
        stdout: new PassThrough(),
      });
      if (mode === 'manual') handle.close();
      else stdin.emit(mode);
      handle.close();
      await handle.done;
      for (const event of ['data', 'end', 'close'])
        expect(stdin.listeners(event)).toEqual([external]);
    },
  );

  it('keeps resource counts stable across repeated attach/manual-close', async () => {
    const stdin = new EventEmitter();
    for (let index = 0; index < 5; index++) {
      const handle = serveStdio(server(), {
        stdin: stdin as unknown as NodeJS.ReadableStream,
        stdout: new PassThrough(),
      });
      handle.close();
      await handle.done;
      for (const event of ['data', 'end', 'close']) expect(stdin.listenerCount(event)).toBe(0);
    }
  });
});
