import { describe, expect, it, vi } from 'vitest';
import { readBodyCapped } from '../src/read-body.js';

function streamOf(chunks: Uint8Array[]): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk);
      controller.close();
    },
  });
}

describe('readBodyCapped', () => {
  it('returns the full text when under the cap', async () => {
    const res = {
      body: streamOf([new TextEncoder().encode('hello world')]),
      text: async () => 'unused',
    };
    expect(await readBodyCapped(res, 1024)).toBe('hello world');
  });

  it('throws once the streamed body exceeds the cap (OOM guard)', async () => {
    const chunk = new Uint8Array(100);
    const res = {
      body: streamOf(Array.from({ length: 20 }, () => chunk)), // 2000 bytes
      text: async () => 'unused',
    };
    await expect(readBodyCapped(res, 500)).rejects.toThrow(/exceeded/i);
  });

  it('falls back to res.text() when the body is not a web stream', async () => {
    expect(await readBodyCapped({ body: null, text: async () => 'fallback' })).toBe('fallback');
  });

  it('ignores an empty stream chunk', async () => {
    const reader = {
      read: vi
        .fn()
        .mockResolvedValueOnce({ done: false, value: undefined })
        .mockResolvedValueOnce({ done: true, value: undefined }),
    };
    const response = {
      body: { getReader: () => reader },
      text: async () => 'unused',
    };

    await expect(readBodyCapped(response as never, 10)).resolves.toBe('');
  });

  it('still rejects an oversized body when cancelling the reader fails', async () => {
    const reader = {
      read: vi.fn(async () => ({ done: false, value: new Uint8Array(11) })),
      cancel: vi.fn(async () => {
        throw new Error('cancel failed');
      }),
    };
    const response = {
      body: { getReader: () => reader },
      text: async () => 'unused',
    };

    await expect(readBodyCapped(response as never, 10)).rejects.toThrow(/exceeded/i);
  });

  it('accepts a streamed body whose byte length equals maxBytes exactly and falls back to default cap on non-positive maxBytes', async () => {
    const exact = {
      body: streamOf([new TextEncoder().encode('hello'), new TextEncoder().encode(' world')]),
      text: async () => 'unused',
    };
    expect(await readBodyCapped(exact, 11)).toBe('hello world');

    const negativeCap = {
      body: streamOf([new TextEncoder().encode('hello')]),
      text: async () => 'unused',
    };
    expect(await readBodyCapped(negativeCap, -1)).toBe('hello');
    expect(
      await readBodyCapped(
        { body: streamOf([new TextEncoder().encode('hello')]), text: async () => 'unused' },
        Number.NaN,
      ),
    ).toBe('hello');
  });

  it('rejects a non-stream fallback body when its UTF-8 byte length exceeds maxBytes', async () => {
    await expect(readBodyCapped({ body: null, text: async () => '123456' }, 5)).rejects.toThrow(
      /exceeded 5 bytes/,
    );
    await expect(readBodyCapped({ body: null, text: async () => '12345' }, 5)).resolves.toBe(
      '12345',
    );
  });

  describe('decodes the same text as Response#text()', () => {
    const json = '{"jsonrpc":"2.0","id":1,"result":{"ok":true}}';
    const encode = (text: string) => new TextEncoder().encode(text);

    it('drops a leading UTF-8 BOM, so a BOM-prefixed JSON reply still parses', async () => {
      const bom = new Uint8Array([0xef, 0xbb, 0xbf, ...encode(json)]);
      const expected = await new Response(bom).text();
      const capped = await readBodyCapped(new Response(bom));
      expect(capped).toBe(expected);
      expect(JSON.parse(capped)).toEqual({ jsonrpc: '2.0', id: 1, result: { ok: true } });
    });

    it('joins a multi-byte character split across stream chunks', async () => {
      const bytes = encode('tool: 🧪 ok');
      const split = bytes.indexOf(0xf0) + 2; // inside the 4-byte emoji
      const res = {
        body: streamOf([bytes.slice(0, split), bytes.slice(split)]),
        text: async () => 'unused',
      };
      expect(await readBodyCapped(res)).toBe('tool: 🧪 ok');
    });

    it('replaces malformed UTF-8 exactly as res.text() does', async () => {
      const bytes = new Uint8Array([0x6f, 0x6b, 0xff, 0xc3, 0x28]);
      expect(await readBodyCapped(new Response(bytes))).toBe(await new Response(bytes).text());
    });
  });
});
