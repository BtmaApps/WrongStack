/**
 * Regression test for the session-scoped store's instance cap.
 *
 * The factory keeps at most `max` instances and drops the oldest when a new
 * conversation appears. The conversation IN FRONT must never be that victim:
 * the panel the operator is looking at would silently lose everything it is
 * showing, and the next read would hand it a fresh, EMPTY instance. The
 * unbound pre-session instance is protected for the same reason - the
 * factory's own contract says it "is never the victim".
 *
 * See: packages/webui/src/stores/session-scoped-store.ts
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { disposeLane, ensureLane, setActiveLane } from '../../src/stores/chat-lanes.js';
import { useMemoryInjectorTraceStore } from '../../src/stores/memory-injector-store.js';

const A = 'sess_active';
/** The instance cap of the session-scoped factory. */
const MAX_INSTANCES = 8;

function pushTrace(sessionId: string, runId: string) {
  useMemoryInjectorTraceStore
    .for(sessionId)
    .getState()
    .pushTrace({
      runId,
      at: '2026-01-01T00:00:00.000Z',
      outcome: 'injected',
      trigger: 'tool',
      toolName: 'Read',
      queryPreview: 'q',
      paths: [],
      taskSignals: [],
      contextPressure: 0,
      budget: { maxHints: 3, maxChars: 500 },
      candidates: 1,
      eligible: 1,
      rejected: { duplicate: 0, belowScore: 0, alreadyVisible: 0, cooldown: 0, budget: 0 },
      activated: [],
      injected: [],
      injectedChars: 0,
    });
}

function traceCount(sessionId: string) {
  return useMemoryInjectorTraceStore.for(sessionId).getState().traces.length;
}

/** Fill the instance map with background conversations. */
function applyCapPressure(count: number) {
  for (let i = 0; i < count; i += 1) {
    useMemoryInjectorTraceStore.for(`sess_bg_${i}`);
  }
}

beforeEach(() => {
  for (const id of useMemoryInjectorTraceStore.sessionIds()) {
    useMemoryInjectorTraceStore.dropSession(id);
  }
  ensureLane(A);
  setActiveLane(A);
});

describe('session-scoped store · instance cap', () => {
  it('keeps the conversation in front when the instance cap is reached', () => {
    pushTrace(A, 'run_active');
    applyCapPressure(MAX_INSTANCES);

    expect(traceCount(A)).toBe(1);
    // The foreground still answers from the tab in front.
    expect(useMemoryInjectorTraceStore.getState().traces).toHaveLength(1);
  });

  it('keeps the foreground data when the cap pressure is applied twice', () => {
    pushTrace(A, 'run_active');
    applyCapPressure(MAX_INSTANCES);
    applyCapPressure(MAX_INSTANCES);

    expect(traceCount(A)).toBe(1);
  });

  it('keeps the foreground data at exactly the cap', () => {
    pushTrace(A, 'run_active');
    applyCapPressure(MAX_INSTANCES - 1);

    expect(traceCount(A)).toBe(1);
  });

  it('still forgets a conversation when its tab closes', () => {
    pushTrace(A, 'run_active');
    ensureLane('sess_other');
    pushTrace('sess_other', 'run_other');
    expect(useMemoryInjectorTraceStore.sessionIds()).toContain('sess_other');

    disposeLane('sess_other');

    expect(useMemoryInjectorTraceStore.sessionIds()).not.toContain('sess_other');
  });
});
