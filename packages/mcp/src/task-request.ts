import { setTimeout as delay } from 'node:timers/promises';
import { toErrorMessage } from '@wrongstack/core/utils/error';
import type { MCPRequestOptions } from './client-types.js';
import type { JsonRpcResponse } from './contracts.js';
import type { ServerRequestResponder } from './elicitation.js';
import { answerInteractionInputs, validateInteractionInputs } from './interaction-inputs.js';
import { assertCompleteResult, objectRecord } from './modern-protocol.js';
import { multiRoundRequest } from './multi-round-request.js';
import { taskInputFingerprint, validateAnsweredInputs } from './task-input-state.js';
import {
  type MCPTask,
  MCPTaskError,
  parseTask,
  TASK_METHODS,
  taskWaitMs,
  validateTaskId,
} from './task-protocol.js';

type Send<T extends JsonRpcResponse> = (
  method: string,
  params: unknown,
  timeoutMs: number,
  signal: AbortSignal,
) => Promise<T>;

async function reportStatus(
  task: MCPTask,
  opts: MCPRequestOptions | undefined,
  signal: AbortSignal,
): Promise<void> {
  const callback = opts?.tasks ? opts.tasks.onStatus : undefined;
  if (!callback) return;
  return runTaskCallback(() => callback(structuredClone(task)), signal);
}

async function runTaskCallback(
  callback: () => void | Promise<void>,
  signal: AbortSignal,
): Promise<void> {
  signal.throwIfAborted();
  // A host persistence/progress hook must not keep a cancelled call alive.
  await new Promise<void>((resolve, reject) => {
    const abort = () => reject(signal.reason);
    signal.addEventListener('abort', abort, { once: true });
    Promise.resolve()
      .then(() => {
        signal.throwIfAborted();
        return callback();
      })
      .then(resolve, reject)
      .finally(() => signal.removeEventListener('abort', abort));
  });
}

function complete(response: JsonRpcResponse, taskId: string): Record<string, unknown> {
  assertCompleteResult(response);
  if (response.error)
    throw new MCPTaskError(response.error.message, taskId, 'MCPTaskError', response.error.code);
  return objectRecord(response.result)!;
}

export function taskAcknowledgement(response: JsonRpcResponse, taskId: string): void {
  const result = complete(response, taskId);
  if (Object.keys(result).some((key) => !['resultType', '_meta'].includes(key)))
    throw new MCPTaskError('Malformed task acknowledgement', taskId);
}

/** Poll a known server-owned task, never re-issue the original tools/call. */
export async function waitForTask<T extends JsonRpcResponse>(
  taskId: string,
  send: Send<T>,
  responder: ServerRequestResponder,
  timeoutMs: number,
  connectionSignal: AbortSignal | undefined,
  opts?: MCPRequestOptions,
  seed?: MCPTask,
): Promise<Record<string, unknown>> {
  validateTaskId(taskId);
  const answered = new Map(
    Object.entries(validateAnsweredInputs((opts?.tasks || undefined)?.answeredInputs ?? {})),
  );
  const limit = new AbortController();
  const taskOptions = opts?.tasks || undefined;
  const timer = setTimeout(() => limit.abort(), taskWaitMs(opts?.tasks));
  const signal = AbortSignal.any([
    limit.signal,
    ...(connectionSignal ? [connectionSignal] : []),
    ...(opts?.signal ? [opts.signal] : []),
    ...(taskOptions?.pauseSignal ? [taskOptions.pauseSignal] : []),
  ]);
  const taskSend: Send<T> = async (method, params, budget, requestSignal) => {
    if (taskOptions?.beforeRequest) await runTaskCallback(taskOptions.beforeRequest, requestSignal);
    requestSignal.throwIfAborted();
    return send(method, params, budget, requestSignal);
  };
  let declined = false;
  let current = seed;
  let terminal = false;
  try {
    if (seed) await reportStatus(seed, opts, signal);
    for (;;) {
      signal.throwIfAborted();
      if (current)
        await delay(
          Math.min(2_147_483_647, Math.max(100, current.pollIntervalMs ?? 1000)),
          undefined,
          { signal },
        );
      const response = await taskSend('tasks/get', { taskId }, timeoutMs, signal);
      const task = parseTask(complete(response, taskId), taskId, true);
      if (current && task.createdAt !== current.createdAt)
        throw new MCPTaskError('Task creation identity changed', taskId);
      current = task;
      terminal = ['completed', 'failed', 'cancelled'].includes(task.status);
      await reportStatus(task, opts, signal);
      signal.throwIfAborted();
      if (task.status === 'completed') {
        // Nested result is the original tool result; never allow another task/MRTR envelope.
        if (task.result?.['resultType'] !== undefined && task.result['resultType'] !== 'complete')
          throw new MCPTaskError('Malformed nested task result', taskId);
        return { ...task.result, resultType: 'complete' };
      }
      if (task.status === 'failed')
        throw new MCPTaskError(task.error!.message, taskId, 'MCPTaskError', task.error!.code);
      if (task.status === 'cancelled')
        throw new MCPTaskError('Remote task cancelled', taskId, 'AbortError');
      if (task.status !== 'input_required') continue;
      const requests = task.inputRequests!;
      validateInteractionInputs(requests, responder);
      const fresh: Record<string, unknown> = Object.create(null);
      for (const [key, input] of Object.entries(requests)) {
        if (answered.has(key)) {
          if (answered.get(key) !== taskInputFingerprint(input))
            throw new MCPTaskError(
              'Server reused an answered input key for different input',
              taskId,
            );
        } else fresh[key] = input;
      }
      if (!Object.keys(fresh).length) continue; // The update acknowledgement may precede the visible status change.
      if (declined)
        throw new MCPTaskError('Server requested more task input after the user declined', taskId);
      if (answered.size + Object.keys(fresh).length > 64)
        throw new MCPTaskError('Task exceeded 64 user inputs', taskId);
      const answers = await answerInteractionInputs(fresh, responder, signal, opts?.requester);
      declined ||= answers.declined;
      taskAcknowledgement(
        await taskSend(
          'tasks/update',
          { taskId, inputResponses: answers.responses },
          timeoutMs,
          signal,
        ),
        taskId,
      );
      const hashes = Object.fromEntries(
        Object.entries(fresh).map(([key, input]) => [key, taskInputFingerprint(input)]),
      );
      if (taskOptions?.onInputAcknowledged)
        await runTaskCallback(() => taskOptions.onInputAcknowledged!(hashes), signal);
      for (const [key, hash] of Object.entries(hashes)) answered.set(key, hash);
    }
  } catch (error) {
    const aborted = signal.aborted || (error instanceof Error && error.name === 'AbortError');
    // Cancellation is cooperative. This ack never means the remote work actually stopped.
    if (aborted && !terminal && !connectionSignal?.aborted && !taskOptions?.pauseSignal?.aborted) {
      const cancel = new AbortController();
      const cancelTimer = setTimeout(() => cancel.abort(), Math.min(timeoutMs, 1000));
      try {
        await taskSend('tasks/cancel', { taskId }, Math.min(timeoutMs, 1000), cancel.signal);
      } catch {
        /* best effort; retain task ID */
      } finally {
        clearTimeout(cancelTimer);
      }
    }
    if (aborted)
      throw new MCPTaskError(
        limit.signal.aborted ? 'Task wait timed out' : 'Task wait cancelled',
        taskId,
        limit.signal.aborted ? 'TimeoutError' : 'AbortError',
      );
    if (error instanceof MCPTaskError) throw error;
    throw new MCPTaskError(toErrorMessage(error), taskId);
  } finally {
    clearTimeout(timer);
  }
}

/** Modern logical calls share MRTR and Tasks handling across HTTP and stdio. */
export async function modernRequest<T extends JsonRpcResponse>(
  method: string,
  params: unknown,
  send: Send<T>,
  responder: ServerRequestResponder,
  timeoutMs: number,
  connectionSignal: AbortSignal | undefined,
  opts: MCPRequestOptions | undefined,
  serverSupportsTasks: boolean,
): Promise<T> {
  const tasks = serverSupportsTasks && opts?.tasks !== false;
  if (TASK_METHODS.has(method) && !tasks)
    throw new Error('MCP server has not negotiated Tasks support');
  if (method === 'tools/call' && tasks) taskWaitMs(opts?.tasks); // reject invalid policy before creating work
  const response = await multiRoundRequest(
    method,
    params,
    (next, remaining, signal) => send(method, next, remaining, signal),
    responder,
    timeoutMs,
    connectionSignal,
    opts,
    tasks && method === 'tools/call',
  );
  if (response.error || objectRecord(response.result)?.['resultType'] !== 'task') return response;
  const task = parseTask(response.result);
  const result = await waitForTask(
    task.taskId,
    send,
    responder,
    timeoutMs,
    connectionSignal,
    opts,
    task,
  );
  return { ...response, result };
}
