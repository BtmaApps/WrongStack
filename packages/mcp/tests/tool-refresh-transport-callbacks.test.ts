import { describe, expect, it } from 'vitest';
import type { JsonRpcResponse } from '../src/contracts.js';
import { SSETransport, StreamableHTTPTransport } from '../src/transport.js';

describe('transport catalog callback ownership', () => {
  for (const kind of ['sse', 'streamable'] as const) {
    it.each(['close', 'replace'] as const)(
      `${kind}: a listener's %s cancels remaining obsolete callbacks`,
      async (mode) => {
        const target =
          kind === 'sse'
            ? new SSETransport({ name: 'fixture', url: 'https://fixture.invalid' })
            : new StreamableHTTPTransport({ name: 'fixture', url: 'https://fixture.invalid' });
        const raw = target as unknown as Record<string, unknown>;
        raw['state'] = 'connected';
        const old = Promise.withResolvers<JsonRpcResponse>();
        const next = Promise.withResolvers<JsonRpcResponse>();
        const reply = (name: string): JsonRpcResponse => ({
          jsonrpc: '2.0',
          id: 1,
          result: { tools: [{ name, inputSchema: {} }] },
        });
        let calls = 0;
        raw[kind === 'sse' ? 'httpPost' : 'postRaw'] = () =>
          ++calls === 1 ? old.promise : next.promise;
        const refresh = () =>
          (
            raw[kind === 'sse' ? 'handleToolsListChanged' : 'refreshTools'] as () => Promise<void>
          ).call(target);
        const seen: string[] = [];
        let replacement: Promise<void> | undefined;
        let closing: Promise<void> | undefined;
        target.onToolsChanged((tools) => {
          const name = tools[0]!.name;
          seen.push(`first:${name}`);
          if (name !== 'old') return;
          if (mode === 'close') closing = target.close();
          else replacement = refresh();
        });
        target.onToolsChanged((tools) => seen.push(`second:${tools[0]!.name}`));
        try {
          const pending = refresh();
          old.resolve(reply('old'));
          await pending;
          expect(seen).toEqual(['first:old']);
          if (replacement) {
            next.resolve(reply('new'));
            await replacement;
            expect(seen).toEqual(['first:old', 'first:new', 'second:new']);
            expect(target.listTools().map((tool) => tool.name)).toEqual(['new']);
          }
          await closing;
        } finally {
          old.resolve(reply('old'));
          next.resolve(reply('new'));
          await Promise.allSettled([replacement, closing]);
          await target.close();
        }
      },
    );
  }
});
