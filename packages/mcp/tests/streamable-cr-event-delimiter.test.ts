import { vi } from 'vitest';
import { StreamableHTTPTransport } from '../src/transport-streamable.js';

async function readFramed(ending: string) {
  const transport = new StreamableHTTPTransport({ name: 'framing', url: 'https://example.test' });
  let reads = 0;
  const cancel = vi.fn(async () => {});
  const releaseLock = vi.fn();
  const reader = {
    read: async () =>
      ++reads === 1
        ? {
            done: false,
            value: new TextEncoder().encode(
              `data: {"jsonrpc":"2.0","id":7,"result":{}}${ending}${ending}`,
            ),
          }
        : { done: true, value: undefined },
    cancel,
    releaseLock,
  };
  const response = {
    headers: new Headers({ 'content-type': 'text/event-stream' }),
    body: { getReader: () => reader },
  } as unknown as Response;
  const raw = transport as unknown as {
    readResponse: (r: Response, id: number) => Promise<{ id: number }>;
  };
  const result = await raw.readResponse(response, 7);
  await transport.close();
  return {
    id: result.id,
    reads,
    cancels: cancel.mock.calls.length,
    releases: releaseLock.mock.calls.length,
  };
}

import { expect, it } from 'vitest';

import { SSEReader } from '../src/sse-reader.js';

it('verifies all line endings, fragmented CRLF, empty input and reset', async () => {
  for (const ending of ['\r', '\n', '\r\n']) {
    const actual = await readFramed(ending);
    expect(actual).toEqual({ id: 7, reads: 1, cancels: 1, releases: 1 });
    const reader = new SSEReader();
    const seen: unknown[] = [];
    reader.onMessage((message) => seen.push(message));
    const text = `data: {"jsonrpc":"2.0","id":7,"result":{}}${ending}${ending}`;
    for (const character of text) reader.feed(character);
    expect(seen).toHaveLength(1);
    reader.feed('');
    expect(seen).toHaveLength(1);
    reader.reset();
    reader.feed(text);
    expect(seen).toHaveLength(1);
  }
});
