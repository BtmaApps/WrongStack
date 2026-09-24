import { describe, expect, it, vi } from 'vitest';
import type { WebSocket } from 'ws';
import { createConversationOperations } from '../src/server/conversation-operations.js';

/** One page reading "Quarterly revenue grew 12%". */
const PDF_B64 =
  'JVBERi0xLjQKMSAwIG9iago8PCAvVHlwZSAvQ2F0YWxvZyAvUGFnZXMgMiAwIFIgPj4KZW5kb2JqCjIgMCBvYmoKPDwgL1R5cGUgL1BhZ2VzIC9LaWRzIFs0IDAgUl0gL0NvdW50IDEgPj4KZW5kb2JqCjMgMCBvYmoKPDwgL1R5cGUgL0ZvbnQgL1N1YnR5cGUgL1R5cGUxIC9CYXNlRm9udCAvSGVsdmV0aWNhID4+CmVuZG9iago0IDAgb2JqCjw8IC9UeXBlIC9QYWdlIC9QYXJlbnQgMiAwIFIgL01lZGlhQm94IFswIDAgNjEyIDc5Ml0gL1Jlc291cmNlcyA8PCAvRm9udCA8PCAvRjEgMyAwIFIgPj4gPj4gL0NvbnRlbnRzIDUgMCBSID4+CmVuZG9iago1IDAgb2JqCjw8IC9MZW5ndGggNTcgPj4Kc3RyZWFtCkJUIC9GMSAxMiBUZiA3MiA3MjAgVGQgKFF1YXJ0ZXJseSByZXZlbnVlIGdyZXcgMTIlKSBUaiBFVAplbmRzdHJlYW0KZW5kb2JqCnhyZWYKMCA2CjAwMDAwMDAwMDAgNjU1MzUgZiAKMDAwMDAwMDAwOSAwMDAwMCBuIAowMDAwMDAwMDU4IDAwMDAwIG4gCjAwMDAwMDAxMTUgMDAwMDAgbiAKMDAwMDAwMDE4NSAwMDAwMCBuIAowMDAwMDAwMzExIDAwMDAwIG4gCnRyYWlsZXIKPDwgL1NpemUgNiAvUm9vdCAxIDAgUiA+PgpzdGFydHhyZWYKNDE4CiUlRU9GCg==';

function harness(vision = false) {
  const sent: Array<{ type: string; payload: unknown }> = [];
  const run = vi.fn(async () => ({ status: 'completed', iterations: 1, finalText: 'done' }));
  const routes = createConversationOperations({
    getAgent: () =>
      ({
        run,
        ctx: {
          provider: { id: 'p', capabilities: { vision } },
          model: 'm',
          messages: [],
          meta: {},
        },
        tools: { list: () => [] },
      }) as never,
    getSessionId: () => 'session-live',
    runControl: { begin: vi.fn(() => new AbortController()), end: vi.fn(), abort: vi.fn() },
    pendingConfirms: new Map(),
    submitUserInput: vi.fn(),
    send: (_ws, message) => sent.push(message),
    notifyAbort: vi.fn(),
  });
  return { routes, run, sent };
}

describe('user_message with a PDF', () => {
  it('runs the agent with a document block ahead of the text', async () => {
    const h = harness();
    await h.routes.userMessage(
      {} as WebSocket,
      {
        type: 'user_message',
        payload: {
          id: 'm1',
          content: 'summarize',
          images: [{ data: PDF_B64, mediaType: 'application/pdf', name: 'report.pdf' }],
        },
      } as never,
    );
    expect(h.run).toHaveBeenCalledTimes(1);
    const input = (h.run.mock.calls[0] as unknown[])[0] as Array<Record<string, unknown>>;
    expect(input[0]).toMatchObject({
      type: 'document',
      name: 'report.pdf',
      pages: 1,
      text: '--- page 1 ---\nQuarterly revenue grew 12%',
      source: { type: 'base64', media_type: 'application/pdf', data: PDF_B64 },
    });
    expect(input[1]).toEqual({ type: 'text', text: 'summarize' });
  });

  it('refuses a PDF that does not parse without starting a turn', async () => {
    const h = harness();
    await h.routes.userMessage(
      {} as WebSocket,
      {
        type: 'user_message',
        payload: {
          id: 'm2',
          content: 'x',
          images: [
            {
              data: Buffer.from('%PDF-garbage').toString('base64'),
              mediaType: 'application/pdf',
              name: 'bad.pdf',
            },
          ],
        },
      } as never,
    );
    expect(h.run).not.toHaveBeenCalled();
    expect(h.sent.at(-1)).toMatchObject({ type: 'error' });
    expect(JSON.stringify(h.sent.at(-1))).toContain('bad.pdf');
  });
});
