import { beforeEach, describe, expect, it, vi } from 'vitest';

// Same harness as session-event-wiring.test.ts: the bridge is mocked so the
// test observes exactly what reaches the session journal.
let mockBridge = { append: vi.fn().mockResolvedValue(undefined), setAuditLevel: vi.fn() };
const createSessionEventBridge = vi.fn(() => mockBridge);
vi.mock('@wrongstack/core/storage', () => ({
  createSessionEventBridge,
  resolveSessionLoggingConfig: vi.fn().mockReturnValue({ auditLevel: 'full', sampling: {} }),
}));
vi.mock('@wrongstack/core/coordination', () => ({ recordFileAction: vi.fn() }));

const { wireSessionEvents } = await import('../src/session-event-wiring.js');

function makeDeps() {
  const handlers = new Map<string, Array<(...args: unknown[]) => void>>();
  const evOn = vi.fn((event: string, handler: (...args: unknown[]) => void) => {
    if (!handlers.has(event)) handlers.set(event, []);
    handlers.get(event)!.push(handler);
  });
  const emit = (event: string, ...args: unknown[]) => {
    for (const h of handlers.get(event) ?? []) h(...args);
  };
  return {
    deps: {
      evOn,
      config: { context: { auditLevel: 'full' } } as Record<string, unknown>,
      context: { session: { id: 'sess-ctx' } } as Record<string, unknown>,
      session: { id: 'sess-start' },
      sessionRef: { current: { id: 'sess-ref' } },
      wpaths: { globalRoot: '/tmp/root', projectSlug: 'test-proj' },
      projectRoot: '/tmp/project',
    },
    emit,
  };
}

describe('wireSessionEvents — background delegation journal', () => {
  beforeEach(() => {
    mockBridge = { append: vi.fn().mockResolvedValue(undefined), setAuditLevel: vi.fn() };
    createSessionEventBridge.mockReturnValue(mockBridge);
  });

  it('persists delegationId / taskId / mode on delegate_started', () => {
    const { deps, emit } = makeDeps();
    wireSessionEvents(deps as never);
    emit('delegate.started', {
      sessionId: 'sess-ctx',
      target: 'bug-hunter',
      task: 'audit',
      subagentId: 'bug-hunter-1',
      delegationId: 'del-1',
      taskId: 'task-1',
      mode: 'background',
    });
    expect(mockBridge.append).toHaveBeenCalledWith({
      type: 'delegate_started',
      ts: expect.any(String),
      target: 'bug-hunter',
      task: 'audit',
      subagentId: 'bug-hunter-1',
      delegationId: 'del-1',
      taskId: 'task-1',
      mode: 'background',
    });
  });

  it('persists stopReason and the bounded resultExcerpt on delegate_completed', () => {
    const { deps, emit } = makeDeps();
    wireSessionEvents(deps as never);
    emit('delegate.completed', {
      sessionId: 'sess-ctx',
      target: 'bug-hunter',
      task: 'audit',
      ok: true,
      status: 'success',
      summary: '[bug-hunter] done',
      durationMs: 10,
      iterations: 1,
      toolCalls: 2,
      subagentId: 'bug-hunter-1',
      delegationId: 'del-1',
      taskId: 'task-2',
      stopReason: 'end_turn',
      resultExcerpt: 'REPORT',
      mode: 'background',
    });
    expect(mockBridge.append).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'delegate_completed',
        delegationId: 'del-1',
        taskId: 'task-2',
        stopReason: 'end_turn',
        resultExcerpt: 'REPORT',
        mode: 'background',
        ok: true,
      }),
    );
  });

  it('journals delegation.delivered (in-band await_tasks) as delegation_delivered', () => {
    const { deps, emit } = makeDeps();
    wireSessionEvents(deps as never);
    emit('delegation.delivered', {
      sessionId: 'sess-ctx',
      delegationId: 'del-1',
      via: 'await_tasks',
    });
    expect(mockBridge.append).toHaveBeenCalledWith({
      type: 'delegation_delivered',
      ts: expect.any(String),
      delegationId: 'del-1',
      via: 'await_tasks',
    });
  });

  it('ignores delegation lifecycle for a session this process does not own', () => {
    const { deps, emit } = makeDeps();
    wireSessionEvents(deps as never);
    emit('delegation.delivered', {
      sessionId: 'someone-else',
      delegationId: 'del-9',
      via: 'await_tasks',
    });
    expect(mockBridge.append).not.toHaveBeenCalledWith(
      expect.objectContaining({ delegationId: 'del-9' }),
    );
  });
});
