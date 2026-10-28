import { describe, expect, it } from 'vitest';
import { mcpTaskSnapshot, mcpTaskTerminal } from '../src/mcp-tasks-model';

describe('MCP task session projection', () => {
  const sessionId = '2026-10-27/sess_native';
  const task = {
    id: 'receipt-1',
    server: 'build',
    tool: 'compile',
    status: 'working',
    createdAt: '2026-10-27T00:00:00Z',
    lastUpdatedAt: '2026-10-27T00:00:01Z',
    delivered: false,
    observing: true,
  };
  it('keeps the owning session view and drops remote/account/lease fields from records', () => {
    const result = mcpTaskSnapshot(
      {
        sessionId,
        tasks: [{ ...task, taskId: 'REMOTE-ID', binding: 'ACCOUNT', leaseToken: 'LEASE' }],
      },
      sessionId,
    );
    expect(result).toEqual([task]);
    expect(mcpTaskTerminal(result[0]!)).toBe(false);
    expect(mcpTaskTerminal({ ...result[0]!, status: 'completed' })).toBe(true);
  });
  it('refuses another session and malformed task identities/statuses', () => {
    expect(() => mcpTaskSnapshot({ sessionId: 'other', tasks: [task] }, sessionId)).toThrow(
      'another session',
    );
    expect(() => mcpTaskSnapshot({ sessionId, tasks: [{ ...task, id: '' }] }, sessionId)).toThrow(
      'unrecognized',
    );
    expect(() =>
      mcpTaskSnapshot({ sessionId, tasks: [{ ...task, status: 'done' }] }, sessionId),
    ).toThrow('unrecognized');
  });
});
