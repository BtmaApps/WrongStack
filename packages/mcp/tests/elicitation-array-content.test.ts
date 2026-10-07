import { describe, expect, it } from 'vitest';
import { type ElicitationValue, ServerRequestResponder } from '../src/elicitation.js';

async function answerTags(
  content: Record<string, ElicitationValue>,
  required = true,
  bounds: Record<string, number> = {},
) {
  const responder = new ServerRequestResponder(async () => ({ action: 'accept', content }));
  return responder.answer({
    id: 1,
    method: 'elicitation/create',
    params: {
      message: 'Choose tags',
      requestedSchema: {
        type: 'object',
        properties: {
          tags: { type: 'array', items: { type: 'string', enum: ['a', 'b'] }, ...bounds },
        },
        required: required ? ['tags'] : [],
      },
    },
  });
}

const accepted = (content: Record<string, ElicitationValue>) => ({
  jsonrpc: '2.0',
  id: 1,
  result: { action: 'accept', content },
});

describe('MCP array answer presence and bounds', () => {
  it('accepts a nonempty required array', async () => {
    expect(await answerTags({ tags: ['a'] })).toEqual(accepted({ tags: ['a'] }));
  });

  it.each([true, false])(
    'preserves an empty array with no minimum (required=%s)',
    async (required) => {
      expect(await answerTags({ tags: [] }, required)).toEqual(accepted({ tags: [] }));
    },
  );

  it.each([true, false])('accepts an explicitly zero minimum (required=%s)', async (required) => {
    expect(await answerTags({ tags: [] }, required, { minItems: 0, maxItems: 0 })).toEqual(
      accepted({ tags: [] }),
    );
  });

  it.each([true, false])(
    'enforces a positive minimum on a present empty array (required=%s)',
    async (required) => {
      expect(await answerTags({ tags: [] }, required, { minItems: 1 })).toMatchObject({
        error: { code: -32602, message: expect.stringContaining('at least 1 choices') },
      });
    },
  );

  it('still rejects an omitted required field', async () => {
    expect(await answerTags({})).toMatchObject({
      error: { code: -32602, message: expect.stringContaining('required') },
    });
  });

  it('still permits an omitted optional field', async () => {
    expect(await answerTags({}, false, { minItems: 1 })).toEqual(accepted({}));
  });

  it('still rejects invalid choices and values above the maximum', async () => {
    expect(await answerTags({ tags: ['other'] })).toMatchObject({ error: { code: -32602 } });
    expect(await answerTags({ tags: ['a', 'b'] }, true, { maxItems: 1 })).toMatchObject({
      error: { code: -32602, message: expect.stringContaining('at most 1 choices') },
    });
  });
});
