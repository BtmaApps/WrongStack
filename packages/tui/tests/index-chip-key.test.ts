import { describe, expect, it } from 'vitest';
import { indexChipKey } from '../src/hooks/use-tui-environment-state.js';

type IndexState = Parameters<typeof indexChipKey>[0];

function snapshot(overrides: { latencyMs?: number; uptimeMs?: number; indexing?: boolean }) {
  return {
    ready: true,
    indexing: overrides.indexing ?? false,
    currentFile: 0,
    totalFiles: 0,
    lastError: null,
    circuit: { state: 'closed', consecutiveFailures: 0, lastFailure: null, cooldownRemainingMs: 0 },
    server: {
      status: 'connected',
      connected: true,
      pid: 42,
      health: {
        status: 'healthy',
        latencyMs: overrides.latencyMs ?? 3,
        missedHeartbeats: 0,
        server: { uptimeMs: overrides.uptimeMs ?? 1000 },
      },
    },
  } as unknown as IndexState;
}

describe('indexChipKey', () => {
  it('ignores heartbeat fields the status chip never draws', () => {
    // A heartbeat that only advanced uptime/memory must not re-render the TUI.
    expect(indexChipKey(snapshot({ uptimeMs: 1000 }))).toBe(
      indexChipKey(snapshot({ uptimeMs: 11_000 })),
    );
  });

  it('changes with everything the chip shows', () => {
    const base = indexChipKey(snapshot({}));
    expect(indexChipKey(snapshot({ latencyMs: 9 }))).not.toBe(base);
    expect(indexChipKey(snapshot({ indexing: true }))).not.toBe(base);
  });
});
