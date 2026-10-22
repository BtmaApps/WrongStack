import { expect, it, vi } from 'vitest';
import { ServerRequestResponder } from '../src/elicitation.js';
import { modernRequest, waitForTask } from '../src/task-request.js';

const task = {
  taskId: 'input-restart',
  status: 'working',
  createdAt: '2026-10-22T12:00:00Z',
  lastUpdatedAt: '2026-10-22T12:00:00Z',
  ttlMs: null,
  pollIntervalMs: 1,
};
const form = {
  method: 'elicitation/create',
  params: {
    message: 'Branch',
    requestedSchema: { type: 'object', properties: { branch: { type: 'string' } } },
  },
};

it('resumes acknowledged input keys without saving answers or showing a stale form again', async () => {
  let saved: Record<string, string> = {};
  let resumed = false,
    polls = 0;
  const send = vi.fn(async (method: string) => {
    let result: unknown;
    if (method === 'tools/call') result = { resultType: 'task', ...task };
    else if (method === 'tasks/update') result = { resultType: 'complete' };
    else {
      polls++;
      result =
        resumed && polls > 1
          ? {
              resultType: 'complete',
              ...task,
              status: 'completed',
              result: { content: [{ type: 'text', text: 'done' }] },
            }
          : {
              resultType: 'complete',
              ...task,
              status: 'input_required',
              inputRequests: {
                choice: resumed ? { params: form.params, method: form.method } : form,
              },
            };
    }
    return { jsonrpc: '2.0' as const, id: send.mock.calls.length, result };
  });
  const elicitation = vi.fn(async () => ({
    action: 'accept' as const,
    content: { branch: 'SECRET-ANSWER' },
  }));
  await expect(
    modernRequest(
      'tools/call',
      { name: 'build' },
      send,
      new ServerRequestResponder(elicitation),
      1000,
      undefined,
      {
        tasks: {
          onInputAcknowledged: (keys) => {
            saved = keys;
            throw new Error('Host stopped after durable acknowledgement');
          },
        },
      },
      true,
    ),
  ).rejects.toThrow('Host stopped');
  expect(JSON.stringify(saved)).not.toContain('SECRET-ANSWER');
  expect(saved.choice).toMatch(/^[a-f0-9]{64}$/);
  resumed = true;
  polls = 0;
  expect(
    await waitForTask(task.taskId, send, new ServerRequestResponder(elicitation), 1000, undefined, {
      tasks: { answeredInputs: saved },
    }),
  ).toMatchObject({ content: [{ text: 'done' }] });
  expect(elicitation).toHaveBeenCalledTimes(1);
  expect(send.mock.calls.filter(([method]) => method === 'tools/call')).toHaveLength(1);
  expect(send.mock.calls.filter(([method]) => method === 'tasks/update')).toHaveLength(1);
});

it('pauses host observation without sending cancellation to a still-running remote task', async () => {
  const pause = new AbortController();
  const send = vi.fn(async () => ({
    jsonrpc: '2.0' as const,
    id: 1,
    result: { resultType: 'task', ...task },
  }));
  await expect(
    modernRequest(
      'tools/call',
      {},
      send,
      new ServerRequestResponder(),
      1000,
      undefined,
      { tasks: { pauseSignal: pause.signal, onStatus: () => pause.abort() } },
      true,
    ),
  ).rejects.toMatchObject({ name: 'AbortError', taskId: task.taskId });
  expect(send).toHaveBeenCalledTimes(1);
});
