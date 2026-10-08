import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MCPClient } from '../src/client.js';
import type { MCPTool } from '../src/contracts.js';
import { SSETransport, StreamableHTTPTransport } from '../src/transport.js';

type Reply = { result?: { tools: MCPTool[] }; error?: { code: number; message: string } };
type Boundary = {
  request: (method: string, params: unknown) => Promise<Reply>;
  refresh: () => Promise<void>;
  state: string;
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

const reply = (name: string): Reply => ({ result: { tools: [{ name, inputSchema: {} }] } });

function fixture(kind: 'stdio' | 'sse' | 'streamable') {
  const target =
    kind === 'stdio'
      ? new MCPClient({ name: 'fixture', transport: 'stdio', command: 'unused' })
      : kind === 'sse'
        ? new SSETransport({ name: 'fixture', url: 'https://example.test' })
        : new StreamableHTTPTransport({ name: 'fixture', url: 'https://example.test' });
  const requestKey = kind === 'stdio' ? 'request' : kind === 'sse' ? 'httpPost' : 'postRaw';
  const refreshKey = kind === 'streamable' ? 'refreshTools' : 'handleToolsListChanged';
  const raw = target as unknown as Record<string, unknown>;
  raw['state'] = 'connected';
  const boundary: Boundary = {
    request: (...args) => (raw[requestKey] as Boundary['request']).apply(target, args),
    refresh: () => (raw[refreshKey] as Boundary['refresh']).call(target),
    state: 'connected',
  };
  const request = vi.spyOn(raw as unknown as Record<string, Boundary['request']>, requestKey);
  const changed = vi.fn();
  if (target instanceof MCPClient) target.addToolsChangedListener(changed);
  else target.onToolsChanged(changed);
  return { target, boundary, request, changed };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('tool refresh lifecycle across transports', () => {
  for (const kind of ['sse', 'streamable'] as const) {
    it(`${kind}: initial discovery cannot overwrite a notification refresh`, async () => {
      const { target, boundary, request } = fixture(kind);
      const old = deferred<Reply>();
      const entered = deferred<void>();
      const metadata = {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: { name: 'fixture', version: '1' },
      };
      vi.stubGlobal(
        'fetch',
        vi.fn(async () =>
          kind === 'sse'
            ? new Response(
                new ReadableStream<Uint8Array>({
                  start(controller) {
                    controller.enqueue(
                      new TextEncoder().encode('event: endpoint\ndata: /messages\n\n'),
                    );
                  },
                }),
              )
            : new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, result: metadata }), {
                headers: { 'content-type': 'application/json' },
              }),
        ),
      );
      let calls = 0;
      request.mockImplementation(async (method) => {
        if (method === 'initialize') return { result: metadata } as never;
        if (method !== 'tools/list') return { result: {} } as never;
        if (++calls === 1) {
          entered.resolve();
          return old.promise;
        }
        return reply('new');
      });
      const connecting = target.connect();
      try {
        await entered.promise;
        await boundary.refresh();
        expect(target.listTools().map((tool) => tool.name)).toEqual(['new']);
        old.resolve(reply('old'));
        await connecting;
        expect(target.listTools().map((tool) => tool.name)).toEqual(['new']);
      } finally {
        old.resolve(reply('old'));
        await connecting.catch(() => undefined);
        await target.close();
      }
    });
  }

  it('stdio: initial discovery cannot overwrite a notification refresh', async () => {
    const script = `
      const readline = require('node:readline');
      const send = (message) => process.stdout.write(JSON.stringify(message) + '\\n');
      const tools = (name) => ({ tools: [{ name, inputSchema: {} }] });
      let first;
      readline.createInterface({ input: process.stdin }).on('line', (line) => {
        const message = JSON.parse(line);
        if (message.method === 'initialize') send({ jsonrpc: '2.0', id: message.id, result: { protocolVersion: '2024-11-05', capabilities: { tools: {} }, serverInfo: { name: 'fixture', version: '1' } } });
        if (message.method === 'tools/list') {
          if (!first) { first = message.id; send({ jsonrpc: '2.0', method: 'notifications/tools/list_changed' }); }
          else { send({ jsonrpc: '2.0', id: message.id, result: tools('new') }); send({ jsonrpc: '2.0', id: first, result: tools('old') }); }
        }
      });
    `;
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mcp-refresh-'));
    const scriptPath = path.join(tempDir, 'server.cjs');
    await fs.writeFile(scriptPath, script, 'utf8');
    const client = new MCPClient({
      name: 'fixture',
      transport: 'stdio',
      command: process.execPath,
      args: [scriptPath],
      startupTimeoutMs: 3000,
      requestTimeoutMs: 3000,
    });
    try {
      await client.connect();
      expect(client.listTools().map((tool) => tool.name)).toEqual(['new']);
    } finally {
      await client.close();
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  it.each(['close', 'replace'] as const)(
    'stdio: stops obsolete catalog callbacks when a listener triggers %s',
    async (mode) => {
      const { target, boundary, request } = fixture('stdio');
      const client = target as MCPClient;
      const old = deferred<Reply>();
      const next = deferred<Reply>();
      request.mockReturnValueOnce(old.promise).mockReturnValueOnce(next.promise);
      let replacement: Promise<void> | undefined;
      let closing: Promise<void> | undefined;
      client.addToolsChangedListener((_name, tools) => {
        if (tools[0]?.name !== 'old') return;
        if (mode === 'close') closing = client.close();
        else replacement = boundary.refresh();
      });
      const tail = vi.fn();
      client.addToolsChangedListener(tail);
      try {
        const pending = boundary.refresh();
        old.resolve(reply('old'));
        await pending;
        expect(tail).not.toHaveBeenCalled();
        if (replacement) {
          next.resolve(reply('new'));
          await replacement;
          expect(tail).toHaveBeenCalledExactlyOnceWith('fixture', reply('new').result!.tools);
          expect(client.listTools().map((tool) => tool.name)).toEqual(['new']);
        }
        await closing;
      } finally {
        old.resolve(reply('old'));
        next.resolve(reply('new'));
        await Promise.allSettled([replacement, closing]);
        await client.close();
      }
    },
  );

  for (const kind of ['stdio', 'sse', 'streamable'] as const) {
    it(`${kind}: an older response cannot overwrite a newer catalog`, async () => {
      const { target, boundary, request, changed } = fixture(kind);
      const old = deferred<Reply>();
      const next = deferred<Reply>();
      request.mockReturnValueOnce(old.promise).mockReturnValueOnce(next.promise);
      const first = boundary.refresh();
      const second = boundary.refresh();
      next.resolve(reply('new'));
      await second;
      old.resolve(reply('old'));
      await first;
      expect(target.listTools().map((tool) => tool.name)).toEqual(['new']);
      expect(changed).toHaveBeenCalledTimes(1);
      await target.close();
    });

    it(`${kind}: close discards a refresh that settles afterward`, async () => {
      const { target, boundary, request, changed } = fixture(kind);
      request.mockResolvedValueOnce(reply('known'));
      await boundary.refresh();
      const late = deferred<Reply>();
      request.mockReturnValueOnce(late.promise);
      const pending = boundary.refresh();
      await target.close();
      late.resolve(reply('late'));
      await pending;
      expect(target.listTools().map((tool) => tool.name)).toEqual(['known']);
      expect(changed).toHaveBeenCalledTimes(1);
    });

    it(`${kind}: a failed latest refresh does not admit an older response`, async () => {
      const { target, boundary, request } = fixture(kind);
      request.mockResolvedValueOnce(reply('known'));
      await boundary.refresh();
      const old = deferred<Reply>();
      request
        .mockReturnValueOnce(old.promise)
        .mockResolvedValueOnce({ error: { code: 1, message: 'fixture failure' } });
      const first = boundary.refresh();
      await boundary.refresh();
      old.resolve(reply('old'));
      await first;
      expect(target.listTools().map((tool) => tool.name)).toEqual(['known']);
      await target.close();
    });

    it(`${kind}: a valid empty catalog clears the previous catalog`, async () => {
      const { target, boundary, request } = fixture(kind);
      request
        .mockResolvedValueOnce(reply('known'))
        .mockResolvedValueOnce({ result: { tools: [] } });
      await boundary.refresh();
      await boundary.refresh();
      expect(target.listTools()).toEqual([]);
      await target.close();
    });

    it(`${kind}: listener failure cannot prevent later listeners`, async () => {
      const { target, boundary, request, changed } = fixture(kind);
      const next = vi.fn();
      const fail = () => {
        throw new Error('listener failed');
      };
      if (target instanceof MCPClient) {
        target.addToolsChangedListener(fail);
        target.addToolsChangedListener(next);
      } else {
        target.onToolsChanged(fail);
        target.onToolsChanged(next);
      }
      request.mockResolvedValue(reply('known'));
      await boundary.refresh();
      expect(changed).toHaveBeenCalledOnce();
      expect(next).toHaveBeenCalledOnce();
      await target.close();
    });
  }
});
