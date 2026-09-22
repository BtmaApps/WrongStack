// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  type ChipStalenessDiagnosis,
  computeTokenFingerprint,
  formatDiagnosis,
  useChipStalenessGuard,
} from '../src/hooks/use-chip-staleness-guard.js';

describe('useChipStalenessGuard', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const baseOpts = {
    agentState: 'idle' as const,
    spinnerPhase: 0,
    tokenFingerprint: '100:50:0.0010',
    contextRatio: 0.42,
    tokenSubscriptionActive: true,
  };

  it('returns initial state with no diagnoses when idle', () => {
    const { result } = renderHook(() => useChipStalenessGuard(baseOpts));
    expect(result.current.renderNonce).toBe(0);
    expect(result.current.diagnoses).toEqual([]);
    expect(result.current.recoveryCount).toBe(0);
  });

  it('does not flag staleness when agent is idle', () => {
    const { result } = renderHook(() => useChipStalenessGuard(baseOpts));

    // Advance past the check interval + staleness threshold
    act(() => {
      vi.advanceTimersByTime(30_000);
    });

    expect(result.current.diagnoses).toEqual([]);
    expect(result.current.renderNonce).toBe(0);
  });

  it('detects animation_frozen when spinner stops advancing while running', () => {
    const { result } = renderHook(() =>
      useChipStalenessGuard({ ...baseOpts, agentState: 'running' }),
    );

    // Advance past the check interval (10s) — spinner hasn't moved
    act(() => {
      vi.advanceTimersByTime(10_000);
    });

    expect(result.current.diagnoses.length).toBeGreaterThan(0);
    expect(result.current.diagnoses[0]?.rootCause).toBe('animation_frozen');
    expect(result.current.diagnoses[0]?.chip).toBe('state');
    expect(result.current.renderNonce).toBe(1);
    expect(result.current.recoveryCount).toBe(1);
  });

  it('does not flag a spinner that is still by design (static style)', () => {
    const { result } = renderHook(() =>
      useChipStalenessGuard({ ...baseOpts, agentState: 'running', spinnerAnimated: false }),
    );
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(result.current.diagnoses.filter((d) => d.chip === 'state')).toEqual([]);
    expect(result.current.renderNonce).toBe(0);
  });

  it('does not count time spent still against a spinner that resumes', () => {
    const { result, rerender } = renderHook(
      (props: { animated: boolean }) =>
        useChipStalenessGuard({
          ...baseOpts,
          agentState: 'running',
          spinnerAnimated: props.animated,
        }),
      { initialProps: { animated: false } },
    );
    act(() => {
      vi.advanceTimersByTime(9_000);
    });
    rerender({ animated: true });
    act(() => {
      vi.advanceTimersByTime(1_000);
    });
    expect(result.current.diagnoses.filter((d) => d.chip === 'state')).toEqual([]);
  });

  it('does not flag animation_frozen when spinner is advancing', () => {
    let phase = 0;
    const { result, rerender } = renderHook(() =>
      useChipStalenessGuard({ ...baseOpts, agentState: 'running', spinnerPhase: phase }),
    );

    // Simulate spinner advancing every 250ms for 10s
    for (let i = 0; i < 40; i++) {
      phase = (phase + 1) % 10;
      act(() => {
        vi.advanceTimersByTime(250);
      });
      rerender();
    }

    // After 10s of advancing, the check fires — spinner is fresh
    act(() => {
      vi.advanceTimersByTime(250);
    });
    rerender();

    expect(result.current.diagnoses).toEqual([]);
    expect(result.current.renderNonce).toBe(0);
  });

  it('detects subscription_dropped when tokens stop arriving while streaming', () => {
    const { result } = renderHook(() =>
      useChipStalenessGuard({
        ...baseOpts,
        agentState: 'streaming',
        tokenSubscriptionActive: true,
      }),
    );

    // Advance past the staleness threshold (15s) + check interval (10s)
    act(() => {
      vi.advanceTimersByTime(20_000);
    });

    const tokenDiagnosis = result.current.diagnoses.find((d) => d.chip === 'tokens');
    expect(tokenDiagnosis).toBeDefined();
    expect(tokenDiagnosis?.rootCause).toBe('subscription_dropped');
  });

  it('does not flag subscription_dropped when tokens are updating', () => {
    let fingerprint = '100:50:0.0010';
    const { result, rerender } = renderHook(() =>
      useChipStalenessGuard({
        ...baseOpts,
        agentState: 'streaming',
        tokenFingerprint: fingerprint,
      }),
    );

    // Simulate token updates every 2s for 20s
    for (let i = 0; i < 10; i++) {
      fingerprint = `${100 + i * 10}:50:0.00${10 + i}`;
      act(() => {
        vi.advanceTimersByTime(2_000);
      });
      rerender();
    }

    expect(result.current.diagnoses.find((d) => d.chip === 'tokens')).toBeUndefined();
  });

  it('detects data_source_stale when context ratio stops changing while running', () => {
    const { result } = renderHook(() =>
      useChipStalenessGuard({
        ...baseOpts,
        agentState: 'running',
        contextRatio: 0.42,
        // Use a short threshold for testing
        stalenessThresholdMs: 5_000,
        checkIntervalMs: 5_000,
      }),
    );

    // Advance past 2× threshold (10s) + check interval
    act(() => {
      vi.advanceTimersByTime(15_000);
    });

    const contextDiagnosis = result.current.diagnoses.find((d) => d.chip === 'context');
    expect(contextDiagnosis).toBeDefined();
    expect(contextDiagnosis?.rootCause).toBe('data_source_stale');
  });

  it('backs off after maxRecoveries to prevent infinite re-render loops', () => {
    const { result } = renderHook(() =>
      useChipStalenessGuard({
        ...baseOpts,
        agentState: 'running',
        maxRecoveries: 2,
        checkIntervalMs: 5_000,
      }),
    );

    // Trigger 2 recoveries
    act(() => {
      vi.advanceTimersByTime(5_000);
    });
    expect(result.current.recoveryCount).toBe(1);

    act(() => {
      vi.advanceTimersByTime(5_000);
    });
    expect(result.current.recoveryCount).toBe(2);

    // Third check should NOT trigger another recovery (maxRecoveries=2)
    act(() => {
      vi.advanceTimersByTime(5_000);
    });
    expect(result.current.recoveryCount).toBe(2);
    // renderNonce should not have bumped again
    expect(result.current.renderNonce).toBe(2);
  });

  it('clears diagnoses when data resumes updating', () => {
    let phase = 0;
    const { result, rerender } = renderHook(() =>
      useChipStalenessGuard({
        ...baseOpts,
        agentState: 'running',
        spinnerPhase: phase,
        checkIntervalMs: 5_000,
      }),
    );

    // Let it detect staleness
    act(() => {
      vi.advanceTimersByTime(5_000);
    });
    expect(result.current.diagnoses.length).toBeGreaterThan(0);

    // Keep the spinner advancing through the next check interval. A single
    // update followed by another 5s pause would correctly be diagnosed as a
    // second freeze.
    for (let i = 0; i < 20; i++) {
      phase += 1;
      act(() => {
        vi.advanceTimersByTime(250);
      });
      rerender();
    }

    expect(result.current.diagnoses).toEqual([]);
  });
});

describe('computeTokenFingerprint', () => {
  it('produces a stable string from token values', () => {
    expect(computeTokenFingerprint(100, 50, 0.001)).toBe('100:50:0.0010');
  });

  it('handles undefined values with defaults', () => {
    expect(computeTokenFingerprint(undefined, undefined, undefined)).toBe('0:0:0');
  });

  it('produces different strings for different values', () => {
    const a = computeTokenFingerprint(100, 50, 0.001);
    const b = computeTokenFingerprint(200, 50, 0.001);
    expect(a).not.toBe(b);
  });
});

describe('formatDiagnosis', () => {
  it('formats animation_frozen diagnosis', () => {
    const d: ChipStalenessDiagnosis = {
      chip: 'state',
      rootCause: 'animation_frozen',
      staleForMs: 5000,
      detectedAt: Date.now(),
    };
    expect(formatDiagnosis(d)).toBe('[state] stale 5s — animation timer stopped');
  });

  it('formats subscription_dropped diagnosis', () => {
    const d: ChipStalenessDiagnosis = {
      chip: 'tokens',
      rootCause: 'subscription_dropped',
      staleForMs: 15000,
      detectedAt: Date.now(),
    };
    expect(formatDiagnosis(d)).toBe('[tokens] stale 15s — event subscription dropped');
  });

  it('formats data_source_stale diagnosis', () => {
    const d: ChipStalenessDiagnosis = {
      chip: 'context',
      rootCause: 'data_source_stale',
      staleForMs: 30000,
      detectedAt: Date.now(),
    };
    expect(formatDiagnosis(d)).toBe('[context] stale 30s — data source not emitting');
  });
});
