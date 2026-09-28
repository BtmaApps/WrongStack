/**
 * Text cut at a UTF-16 unit count inside an emoji — the malformed-arguments
 * excerpt (800 units), a hook's deny reason (2_000), tool output caps — leaves
 * one half of a surrogate pair. JSON.stringify emits it as an unpaired
 * `\udXXX` escape, so the request carried ill-formed Unicode. The request body
 * is now repaired where it is serialized.
 */
import { describe, expect, it } from 'vitest';
import { AnthropicProvider } from '../src/anthropic.js';

async function requestBody(toolResultText: string): Promise<string> {
  let raw = '';
  const fetchImpl = (async (_url: unknown, init: { body?: string } = {}) => {
    raw = init.body ?? '';
    return {
      ok: true,
      status: 200,
      json: async () => ({
        content: [{ type: 'text', text: 'ok' }],
        stop_reason: 'end_turn',
        usage: { input_tokens: 1, output_tokens: 1 },
      }),
      text: async () => '',
    };
  }) as never as typeof fetch;
  const provider = new AnthropicProvider({ apiKey: 'k', fetchImpl });
  await provider
    .complete(
      {
        model: 'm',
        maxTokens: 1,
        messages: [
          { role: 'assistant', content: [{ type: 'tool_use', id: 't1', name: 'x', input: {} }] },
          {
            role: 'user',
            content: [
              { type: 'tool_result', tool_use_id: 't1', content: toolResultText, is_error: true },
            ],
          },
        ],
      } as never,
      { signal: new AbortController().signal },
    )
    .catch(() => undefined);
  return raw;
}

const toolResultOf = (raw: string): string => {
  const body = JSON.parse(raw) as {
    messages: Array<{ content: Array<{ type: string; content?: unknown }> }>;
  };
  const block = body.messages[1]?.content.find((b) => b.type === 'tool_result');
  const content = block?.content;
  return typeof content === 'string'
    ? content
    : ((content as Array<{ text?: string }> | undefined)?.map((c) => c.text ?? '').join('') ?? '');
};

describe('request body surrogate repair', () => {
  it('replaces lone high and low halves, including adjacent ones', async () => {
    const raw = await requestBody('cut 🚀'.slice(0, 5) + ' | \uDE80 | \uD83D\uD83D');
    expect(raw).not.toMatch(/(?<!\\)(?:\\\\)*\\ud[89a-f][0-9a-f]{2}/);
    expect(toolResultOf(raw)).toBe('cut � | � | ��');
  });

  it('leaves valid pairs and literal escape text alone', async () => {
    const text = '🚀 ok, and the literal text \\ud83d stays';
    const raw = await requestBody(text);
    expect(toolResultOf(raw)).toBe(text);
  });
});
