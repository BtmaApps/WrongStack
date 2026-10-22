import { randomUUID } from 'node:crypto';
import type { ElicitationRequester, ServerRequestResponder } from './elicitation.js';
import { parseElicitationParams } from './elicitation.js';
import { objectRecord } from './modern-protocol.js';

export function interactionAborted(): Error {
  const error = new Error('MCP interaction cancelled');
  error.name = 'AbortError';
  return error;
}

/** Validate the complete server-controlled batch before displaying any form. */
export function validateInteractionInputs(
  requests: Record<string, unknown>,
  responder: ServerRequestResponder,
): void {
  const entries = Object.entries(requests);
  if (entries.length > 8) throw new Error('MCP interaction requests too many inputs');
  if (Buffer.byteLength(JSON.stringify(requests)) > 256 * 1024)
    throw new Error('MCP input requests exceed 256 KiB');
  for (const [key, request] of entries) {
    const input = objectRecord(request);
    if (
      !key ||
      key.length > 256 ||
      /[\x00-\x1f\x7f]/.test(key) ||
      !input ||
      input['method'] !== 'elicitation/create' ||
      !Object.hasOwn(responder.capabilities(), 'elicitation')
    )
      throw new Error('MCP interaction requests an unsupported or unadvertised client capability');
    const parsed = parseElicitationParams(input['params']);
    if (!parsed.ok) throw new Error(`Malformed MCP elicitation: ${parsed.error}`);
  }
}

export async function answerInteractionInputs(
  requests: Record<string, unknown>,
  responder: ServerRequestResponder,
  signal: AbortSignal,
  requester?: ElicitationRequester,
): Promise<{ responses: Record<string, unknown>; declined: boolean }> {
  validateInteractionInputs(requests, responder);
  const responses: Record<string, unknown> = Object.create(null);
  let declined = false;
  for (const [key, request] of Object.entries(requests)) {
    if (signal.aborted) throw interactionAborted();
    const input = objectRecord(request)!;
    const answer = await responder.answer(
      { id: `interaction-${randomUUID()}`, method: 'elicitation/create', params: input['params'] },
      { signal, requester },
    );
    if (signal.aborted) throw interactionAborted();
    if ('error' in answer) throw new Error(`MCP interaction refused: ${answer.error.message}`);
    const value = objectRecord(answer.result);
    if (value?.['action'] === 'cancel') throw interactionAborted();
    if (value?.['action'] === 'decline') declined = true;
    responses[key] = answer.result;
  }
  if (Buffer.byteLength(JSON.stringify(responses)) > 256 * 1024)
    throw new Error('MCP input responses exceed 256 KiB');
  return { responses, declined };
}
