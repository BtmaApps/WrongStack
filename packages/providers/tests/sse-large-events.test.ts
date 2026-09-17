/**
 * One SSE event can legitimately be large: Gemini sends a `functionCall` with
 * its full `args` in a single `data:` line, and the Codex Responses wire echoes
 * whole outputs in `response.completed`. Both paths must reassemble them.
 */
import { describe, expect, it } from 'vitest';
import { createSseLineFoldingTransform, parseSSE } from '../src/sse.js';

const enc = new TextEncoder();

function body(text: string, chunk = 16_384): ReadableStream<Uint8Array> {
  const bytes = enc.encode(text);
  let i = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (i >= bytes.length) return controller.close();
      controller.enqueue(bytes.subarray(i, (i += chunk)));
    },
  });
}

// ~360 KB of content full of quotes, backslashes and JSON punctuation.
const big = 'x"y\\z,}'.repeat(40_000);
const event = JSON.stringify({
  candidates: [
    { content: { parts: [{ functionCall: { name: 'write', args: { content: big } } }] } },
  ],
});

function contentOf(data: string): unknown {
  return JSON.parse(data).candidates[0].content.parts[0].functionCall.args.content;
}

describe('large SSE events', () => {
  it('parseSSE reassembles a single data line larger than 256 KB', async () => {
    const messages = [];
    for await (const m of parseSSE(body(`data: ${event}\n\n`))) messages.push(m);
    expect(messages).toHaveLength(1);
    expect(contentOf(messages[0]!.data)).toBe(big);
  });

  it('the fold transform keeps a long string value intact across windows', async () => {
    const messages = [];
    for await (const m of parseSSE(
      createSseLineFoldingTransform(body(`data: ${event}\n\n`), 32 * 1024),
    )) {
      messages.push(m);
    }
    expect(messages).toHaveLength(1);
    expect(contentOf(messages[0]!.data)).toBe(big);
  });

  it('still rejects an unframed line beyond the safety cap', async () => {
    const huge = new Uint8Array(33 * 1024 * 1024).fill(0x61);
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(huge);
        controller.close();
      },
    });
    const drain = async () => {
      for await (const _ of parseSSE(stream)) {
        // drain
      }
    };
    await expect(drain()).rejects.toThrow(/pending line exceeds/);
  });
});
