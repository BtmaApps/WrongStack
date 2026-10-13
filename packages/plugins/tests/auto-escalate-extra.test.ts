/**
 * Additional tests for auto-escalate plugin -- covering error paths.
 * Tests: errorText with non-serializable objects, invalid regex patterns.
 */
import { describe, expect, it } from 'vitest';
import { errorText, isRetryable } from '../src/auto-escalate/index.js';

describe('errorText', () => {
  it('handles Error instances', () => {
    expect(errorText(new Error('boom'))).toContain('Error: boom');
  });

  it('handles string errors', () => {
    expect(errorText('just a string')).toBe('just a string');
  });

  it('handles serializable objects', () => {
    expect(errorText({ code: 42 })).toBe('{"code":42}');
  });

  it('handles non-serializable objects (circular)', () => {
    const obj: Record<string, unknown> = { name: 'test' };
    obj.self = obj;
    const result = errorText(obj);
    expect(result).toBeTruthy();
    expect(typeof result).toBe('string');
  });
});

describe('isRetryable', () => {
  it('matches retryable patterns', () => {
    expect(isRetryable('timeout error', [/timeout/i])).toBe(true);
  });

  it('does not match non-retryable patterns', () => {
    expect(isRetryable('success', [/timeout/i])).toBe(false);
  });

  it('returns false for empty patterns array', () => {
    expect(isRetryable('anything', [])).toBe(false);
  });
});

describe('auto-escalate per-run WeakMap isolation and checkpoint state helpers', () => {
  it('tracks escalation ladder position per run object and resets via beforeRun(ctx)', async () => {
    const autoEscalatePlugin = (await import('../src/auto-escalate/index.js')).default;
    let registeredExt: {
      beforeRun: (ctx: unknown) => void;
      onError: (
        ctx: unknown,
        err: unknown,
        phase: unknown,
      ) => { action: string; model: string } | undefined;
    } | null = null;
    const api = {
      tools: { register: () => {} },
      config: {
        extensions: {
          'auto-escalate': { enabled: true, escalation: ['m-1', 'm-2'] },
        },
      },
      log: { info: () => {}, warn: () => {}, error: () => {} },
      metrics: { counter: () => {} },
      extensions: {
        register: (ext: never) => {
          registeredExt = ext;
          return () => {};
        },
      },
    };
    autoEscalatePlugin.setup(api as never);
    const runA = { id: 'run-a' };
    const runB = { id: 'run-b' };

    // Advance runA to rung 1 ('m-1'), then rung 2 ('m-2')
    expect(registeredExt!.onError(runA, new Error('timeout'), 'provider')).toEqual({
      action: 'retry',
      model: 'm-1',
    });
    // Independent runB should still start at rung 1 ('m-1'), proving _ctx WeakMap isolation (S28-M8)
    expect(registeredExt!.onError(runB, new Error('timeout'), 'provider')).toEqual({
      action: 'retry',
      model: 'm-1',
    });
    // Resetting runA via beforeRun(runA) resets runA back to rung 1 ('m-1') (S28-M7)
    registeredExt!.beforeRun(runA);
    expect(registeredExt!.onError(runA, new Error('timeout'), 'provider')).toEqual({
      action: 'retry',
      model: 'm-1',
    });
    await autoEscalatePlugin.teardown?.(api as never);
  });

  it('generates cp- prefixed snapshot IDs and filters endSession by sessionId', async () => {
    const { endSession, hosts, nextSnapshotId, scopeFor } = await import(
      '../src/checkpoint/state.js'
    );
    expect(nextSnapshotId()).toMatch(/^cp-\d+$/);

    const fakeKey = {};
    const host = hosts.reset(fakeKey);
    const s1 = await scopeFor(host, process.cwd(), { sessionId: 'sess-1' });
    const s2 = await scopeFor(host, process.cwd(), { sessionId: 'sess-2' });
    expect(host.scopes.size).toBe(2);

    endSession(host, 'sess-1');
    expect(s1.abort.signal.aborted).toBe(true);
    expect(s2.abort.signal.aborted).toBe(false);
    expect(host.scopes.size).toBe(1);
    hosts.remove(fakeKey as never);
  });
});
