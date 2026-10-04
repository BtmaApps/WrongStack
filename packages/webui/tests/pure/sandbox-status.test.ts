import { describe, expect, it } from 'vitest';
import {
  formatSandboxStatusLine,
  initialSandboxEventState,
  reduceSandboxEvent,
} from '../../src/lib/sandbox-status.js';

describe('formatSandboxStatusLine', () => {
  it('renders off when the mode is off', () => {
    expect(
      formatSandboxStatusLine({ mode: 'off', tier: 'read-only', backend: 'policy-only' }),
    ).toBe('sandbox: off');
  });

  it('maps enforced tiers to compact labels', () => {
    expect(
      formatSandboxStatusLine({ mode: 'enforced', tier: 'read-only', backend: 'policy-only' }),
    ).toBe('sandbox: enforced (RO)');
    expect(
      formatSandboxStatusLine({
        mode: 'enforced',
        tier: 'workspace-write',
        backend: 'policy-only',
      }),
    ).toBe('sandbox: enforced (RW)');
    expect(
      formatSandboxStatusLine({ mode: 'enforced', tier: 'full-access', backend: 'policy-only' }),
    ).toBe('sandbox: enforced (FULL)');
  });
});

describe('reduceSandboxEvent', () => {
  it('starts with an empty state', () => {
    expect(initialSandboxEventState()).toEqual({ denialCount: 0, expansionCount: 0 });
  });

  it('counts denials and tracks the last event', () => {
    let state = initialSandboxEventState();
    state = reduceSandboxEvent(state, { event: 'sandbox.denied', tool: 'exec' });
    state = reduceSandboxEvent(state, { event: 'sandbox.denied', tool: 'bash' });
    expect(state.denialCount).toBe(2);
    expect(state.lastEvent?.tool).toBe('bash');
  });

  it('counts expansion traffic separately', () => {
    let state = initialSandboxEventState();
    state = reduceSandboxEvent(state, { event: 'sandbox.expansion_requested', tool: 'exec' });
    state = reduceSandboxEvent(state, {
      event: 'sandbox.expansion_outcome',
      tool: 'exec',
      granted: true,
    });
    expect(state.denialCount).toBe(0);
    expect(state.expansionCount).toBe(2);
    expect(state.lastEvent?.granted).toBe(true);
  });

  it('ignores unknown event names', () => {
    const state = initialSandboxEventState();
    expect(reduceSandboxEvent(state, { event: 'sandbox.unknown' })).toEqual(state);
  });
});
