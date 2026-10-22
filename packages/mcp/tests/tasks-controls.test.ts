import { describe, expect, it, vi } from 'vitest';
import { ServerRequestResponder } from '../src/elicitation.js';
import { modernRequestHeaders, validateModernHeaders } from '../src/modern-http-headers.js';
import { modernParams } from '../src/modern-protocol.js';
import { parseTask } from '../src/task-protocol.js';
import { modernRequest } from '../src/task-request.js';

const base = {
  taskId: 'control',
  status: 'working',
  createdAt: '2026-10-22T10:00:00Z',
  lastUpdatedAt: '2026-10-22T10:00:00Z',
  ttlMs: null,
  pollIntervalMs: 0,
};
const form = {
  method: 'elicitation/create',
  params: {
    message: 'Choose',
    requestedSchema: { type: 'object', properties: { branch: { type: 'string' } } },
  },
};

describe('Tasks protocol controls', () => {
  it.each([
    { taskId: '' },
    { status: 'unknown' },
    { ttlMs: -1 },
    { pollIntervalMs: 1.5 },
    { createdAt: 'yesterday' },
    { lastUpdatedAt: null },
    { status: 'completed', result: [] },
    { status: 'failed', error: {} },
    { status: 'input_required', inputRequests: [] },
  ])('rejects a malformed detailed task: %j', (bad) => {
    expect(() => parseTask({ ...base, ...bad }, undefined, true)).toThrow();
  });

  it.each(['tasks/get', 'tasks/update', 'tasks/cancel'])(
    'mirrors and validates a Unicode task routing ID for %s',
    (method) => {
      const params = modernParams({ taskId: 'görev/☃' });
      const headers = new Headers(modernRequestHeaders(method, params));
      expect(headers.get('Mcp-Name')).toMatch(/^=\?base64\?/);
      expect(() => validateModernHeaders(method, params, headers)).not.toThrow();
      headers.set('Mcp-Name', 'different-task');
      expect(() => validateModernHeaders(method, params, headers)).toThrow('Header mismatch');
      expect(() => validateModernHeaders(method, modernParams({}), headers)).toThrow(
        'Missing MCP name',
      );
    },
  );

  it.each(['reuse', 'sampling', 'decline', 'cancel'])(
    'refuses unsafe task input flow: %s',
    async (mode) => {
      let polls = 0;
      const elicitation = vi.fn(async () =>
        mode === 'decline'
          ? { action: 'decline' as const }
          : mode === 'cancel'
            ? { action: 'cancel' as const }
            : { action: 'accept' as const, content: { branch: 'main' } },
      );
      const send = vi.fn(async (method: string) => {
        let result: unknown;
        if (method === 'tools/call') result = { resultType: 'task', ...base };
        else if (method === 'tasks/update' || method === 'tasks/cancel')
          result = { resultType: 'complete' };
        else {
          polls++;
          result = {
            resultType: 'complete',
            ...base,
            status: 'input_required',
            inputRequests:
              mode === 'sampling'
                ? { bad: { method: 'sampling/createMessage', params: {} }, good: form }
                : {
                    [mode === 'decline' && polls > 1 ? 'new' : 'branch']:
                      mode === 'reuse' && polls > 1
                        ? { ...form, params: { ...form.params, message: 'Changed' } }
                        : form,
                  },
          };
        }
        return { jsonrpc: '2.0' as const, id: send.mock.calls.length, result };
      });
      await expect(
        modernRequest(
          'tools/call',
          { name: 'build' },
          send,
          new ServerRequestResponder(elicitation),
          1000,
          undefined,
          { tasks: { timeoutMs: 2000 } },
          true,
        ),
      ).rejects.toThrow();
      expect(elicitation).toHaveBeenCalledTimes(mode === 'sampling' ? 0 : 1);
      expect(send.mock.calls.filter(([m]) => m === 'tools/call')).toHaveLength(1);
      expect(send.mock.calls.filter(([m]) => m === 'tasks/cancel')).toHaveLength(
        mode === 'cancel' ? 1 : 0,
      );
    },
  );
});
