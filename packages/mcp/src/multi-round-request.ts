import type { MCPRequestOptions } from './client-types.js';
import type { JsonRpcResponse } from './contracts.js';
import type { ServerRequestResponder } from './elicitation.js';
import { answerInteractionInputs } from './interaction-inputs.js';
import { assertCompleteResult, objectRecord } from './modern-protocol.js';

const METHODS = new Set(['tools/call', 'resources/read', 'prompts/get']);
const MAX_ROUNDS = 8;
const MAX_BYTES = 256 * 1024;
function aborted(): Error {
  const error = new Error('MCP interaction cancelled');
  error.name = 'AbortError';
  return error;
}

/** One logical call, with private state and a cumulative wire budget. No unrelated call is retried. */
export async function multiRoundRequest<T extends JsonRpcResponse>(
  method: string,
  params: unknown,
  send: (params: unknown, remainingMs: number, signal: AbortSignal) => Promise<T>,
  responder: ServerRequestResponder,
  timeoutMs: number,
  connectionSignal: AbortSignal | undefined,
  opts?: MCPRequestOptions,
  acceptTask = false,
): Promise<T> {
  const original = structuredClone(objectRecord(params) ?? {});
  const limit = new AbortController();
  // Human interaction may pause the wire budget, but never holds a call indefinitely.
  const timer = setTimeout(
    () => limit.abort(aborted()),
    Math.min(2_147_483_647, timeoutMs + 10 * 60_000),
  );
  timer.unref?.();
  const signal = AbortSignal.any([
    limit.signal,
    ...(connectionSignal ? [connectionSignal] : []),
    ...(opts?.signal ? [opts.signal] : []),
  ]);
  let current = original;
  let remaining = timeoutMs;
  let declined = false;
  try {
    for (let round = 0; ; round++) {
      if (signal.aborted) throw aborted();
      if (remaining <= 0) throw new Error('MCP multi-round request timed out');
      const started = performance.now();
      const response = await send(current, Math.max(1, Math.floor(remaining)), signal);
      remaining -= performance.now() - started;
      if (signal.aborted) throw aborted();
      if (remaining < 0) throw new Error('MCP multi-round request timed out');
      const result = objectRecord(response.result);
      if (
        !response.error &&
        result?.['resultType'] === 'task' &&
        acceptTask &&
        method === 'tools/call'
      )
        return response;
      if (response.error || result?.['resultType'] !== 'input_required') {
        assertCompleteResult(response);
        return response;
      }
      if (!METHODS.has(method))
        throw new Error(`MCP input_required is not permitted for ${method}`);
      if (declined) throw new Error('MCP server requested more input after the user declined');
      if (round >= MAX_ROUNDS) throw new Error('MCP multi-round interaction exceeded eight rounds');
      const hasInputs = Object.hasOwn(result, 'inputRequests');
      const hasState = Object.hasOwn(result, 'requestState');
      const requests = objectRecord(result['inputRequests']);
      const state = result['requestState'];
      if (
        (!hasInputs && !hasState) ||
        (hasInputs && !requests) ||
        (hasState && typeof state !== 'string') ||
        Buffer.byteLength(JSON.stringify(result)) > MAX_BYTES
      )
        throw new Error('Malformed or oversized MCP input_required result');
      const answered = await answerInteractionInputs(
        requests ?? {},
        responder,
        signal,
        opts?.requester,
      );
      declined ||= answered.declined;
      current = { ...original };
      delete current['inputResponses'];
      delete current['requestState'];
      if (hasInputs) current['inputResponses'] = answered.responses;
      if (hasState) current['requestState'] = state;
    }
  } finally {
    clearTimeout(timer);
  }
}
