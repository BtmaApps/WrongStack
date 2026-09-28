/**
 * ACP image prompt blocks go through core's shared image ingest. The adapter
 * used to copy the client's `mimeType` and `data` straight into the agent's
 * ImageBlock, so a JPEG labelled image/png (which the Anthropic API rejects,
 * and which then fails every later turn from history), a non-vision type or a
 * non-base64 payload all reached the provider. With an image present, an
 * embedded resource also lost its `[embedded resource: <uri>]` header.
 */
import { describe, expect, it } from 'vitest';
import { ACPProtocolHandler } from '../src/agent/protocol-handler.js';
import { makeACPServerAgentTurn } from '../src/agent/server-agent-turn.js';

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1]).toString(
  'base64',
);

function capture() {
  const inputs: unknown[] = [];
  const turn = makeACPServerAgentTurn({
    agentFor: () =>
      ({
        run: async (input: unknown) => {
          inputs.push(input);
          return { text: 'ok' };
        },
      }) as never,
  });
  const run = (prompt: unknown[]) =>
    turn(
      {
        sessionId: 's',
        prompt: prompt as never,
        modeId: 'code',
        configOptions: [],
        signal: new AbortController().signal,
      },
      () => {},
    );
  return { inputs, run };
}

describe('ACP image prompt blocks', () => {
  it('lets the bytes decide the media type and keeps block order and resource names', async () => {
    const { inputs, run } = capture();
    await run([
      { type: 'text', text: 'review' },
      { type: 'resource', resource: { uri: 'file:///repo/a.ts', text: 'code' } },
      { type: 'image', mimeType: 'image/png', data: JPEG },
    ]);
    expect(inputs[0]).toEqual([
      { type: 'text', text: 'review' },
      { type: 'text', text: '[embedded resource: file:///repo/a.ts]\ncode' },
      { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: JPEG } },
    ]);
  });

  it('refuses non-vision types, non-base64 data and too many images as invalid params', async () => {
    const { inputs, run } = capture();
    const svg = { type: 'image', mimeType: 'image/svg+xml', data: 'PHN2Zy8+' };
    await expect(run([svg])).rejects.toMatchObject({
      code: -32602,
      message: expect.stringContaining('unsupported media type "image/svg+xml"'),
    });
    await expect(
      run([{ type: 'image', mimeType: 'image/png', data: '{"a":1}' }]),
    ).rejects.toMatchObject({ code: -32602, message: expect.stringContaining('not valid base64') });
    const nine = Array.from({ length: 9 }, () => ({
      type: 'image',
      mimeType: 'image/jpeg',
      data: JPEG,
    }));
    await expect(run(nine)).rejects.toMatchObject({
      code: -32602,
      message: expect.stringContaining('Too many images'),
    });
    expect(inputs).toEqual([]);
  });

  it('answers a refused image with a JSON-RPC invalid-params error', async () => {
    const turn = makeACPServerAgentTurn({ agentFor: () => ({ run: async () => ({}) }) as never });
    const sent: Array<Record<string, unknown>> = [];
    const handler = new ACPProtocolHandler({
      transport: {
        send: async (m: unknown) => void sent.push(m as Record<string, unknown>),
      } as never,
      defaultCwd: process.cwd(),
      runTurn: turn,
    });
    await handler.handleMessage({ id: 1, method: 'initialize' });
    await handler.handleMessage({ id: 2, method: 'session/new', params: {} });
    const { sessionId } = (sent.at(-1) as { result: { sessionId: string } }).result;
    await handler.handleMessage({
      id: 3,
      method: 'session/prompt',
      params: { sessionId, prompt: [{ type: 'image', mimeType: 'image/bmp', data: 'Qk0=' }] },
    });
    expect(sent.at(-1)).toMatchObject({
      id: 3,
      error: { code: -32602, message: expect.stringContaining('unsupported media type') },
    });
  });
});
